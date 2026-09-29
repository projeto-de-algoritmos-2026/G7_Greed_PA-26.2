"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import {
    getAllOrders,
    calculateMinimizeLatenessAPI,
    compareSchedulingStrategiesAPI,
    calculateChainRouteAPI
} from "../../../api/api";
import {
    geocodeCEP,
    buildMultiStopRoadGraph,
    findNearestNode,
    OSMGraph,
    calculateDistance
} from "../../../utils/osmGraph";
import {
    FiArrowLeft,
    FiCalendar,
    FiClock,
    FiCheckCircle,
    FiAlertTriangle,
    FiMapPin,
    FiTruck,
    FiLayers,
    FiZap,
    FiCompass,
    FiInfo,
    FiRefreshCw,
    FiChevronRight,
    FiPackage
} from "react-icons/fi";
import { FaWalking, FaBicycle, FaMotorcycle, FaCar } from "react-icons/fa";
import { toast } from "react-toastify";
import { MapStop } from "../../../components/MultiStopDeliveryMap";

// Importa o mapa dinamicamente para evitar erros de SSR com Leaflet
const MultiStopDeliveryMap = dynamic(
    () => import("../../../components/MultiStopDeliveryMap"),
    { ssr: false }
);

// Coordenadas conhecidas dos CEPs de demonstração para carregamento instantâneo
const KNOWN_COORDS: Record<string, { lat: number; lon: number; address: string }> = {
    "70040-010": { lat: -15.7981, lon: -47.8825, address: "Setor Bancário Sul (SBS), Brasília/DF" },
    "70710-500": { lat: -15.7725, lon: -47.8860, address: "SHCGN 702/703 - Asa Norte, Brasília/DF" },
    "70070-600": { lat: -15.8032, lon: -47.8872, address: "Setor de Autarquias Sul, Brasília/DF" },
    "70390-020": { lat: -15.8155, lon: -47.8995, address: "SEPS 702/902 - Asa Sul, Brasília/DF" },
    "70670-400": { lat: -15.7952, lon: -47.9308, address: "CCSW 04 - Sudoeste, Brasília/DF" },
    "70832-525": { lat: -15.7650, lon: -47.8780, address: "SQN 403 - Asa Norte, Brasília/DF" }
};

export default function DeliveryCalendarPage() {
    const router = useRouter();

    // Estados de Pedidos e Lote
    const [allOrders, setAllOrders] = useState<any[]>([]);
    const [selectedOrderIds, setSelectedOrderIds] = useState<number[]>([]);
    const [loading, setLoading] = useState(true);
    const [processingSchedule, setProcessingSchedule] = useState(false);

    // Configurações do Lote
    const [originCep, setOriginCep] = useState("70040-010"); // Depósito central
    const [startTime, setStartTime] = useState("09:00");
    const [transport, setTransport] = useState<"walk" | "bike" | "moto" | "car">("moto");
    const [algorithm, setAlgorithm] = useState<"bellman" | "dijkstra">("dijkstra");
    const [serviceTimeMins, setServiceTimeMins] = useState(5);

    // Estados do Cronograma e Rota em Cadeia
    const [scheduleResult, setScheduleResult] = useState<any>(null);
    const [comparisonResult, setComparisonResult] = useState<any>(null);
    const [showComparison, setShowComparison] = useState(false);
    const [graphData, setGraphData] = useState<OSMGraph | null>(null);
    const [chainPathNodeIds, setChainPathNodeIds] = useState<number[]>([]);
    const [continuousCoordinates, setContinuousCoordinates] = useState<[number, number][]>([]);
    const [visitedEdges, setVisitedEdges] = useState<{ u: number; v: number }[]>([]);
    const [mapStops, setMapStops] = useState<MapStop[]>([]);
    const [activeStopIndex, setActiveStopIndex] = useState<number | null>(null);
    const [statusMessage, setStatusMessage] = useState<string>("");

    // Carregar pedidos ao montar o componente
    useEffect(() => {
        async function loadInitialOrders() {
            try {
                setLoading(true);
                const orders = await getAllOrders();
                
                // Assegura que todos os pedidos possuam deadline formatado
                const now = new Date();
                const enriched = orders.map((o: any, idx: number) => {
                    let deadlineStr = o.deadline;
                    if (!deadlineStr) {
                        const dl = new Date(now.getTime() + (30 + idx * 25) * 60000);
                        deadlineStr = dl.toISOString();
                    }
                    return {
                        ...o,
                        deadline: deadlineStr,
                        customerName: o.customerName || `Cliente #${o.id}`,
                        address: o.address || (KNOWN_COORDS[o.cep]?.address) || `CEP ${o.cep}`
                    };
                });

                setAllOrders(enriched);

                // Por padrão, pré-seleciona os primeiros 4 pedidos para criar um lote inicial
                if (enriched.length > 0) {
                    const initialSelected = enriched.slice(0, 4).map((o: any) => o.id);
                    setSelectedOrderIds(initialSelected);
                }
            } catch (err) {
                console.error("Erro ao carregar pedidos:", err);
                toast.error("Erro ao buscar pedidos. Usando modo de demonstração.");
            } finally {
                setLoading(false);
            }
        }

        loadInitialOrders();
    }, []);

    // Velocidade em km/h de acordo com o transporte
    const speedKmh = useMemo(() => {
        switch (transport) {
            case "walk": return 5;
            case "bike": return 18;
            case "moto": return 40;
            case "car": return 30;
            default: return 30;
        }
    }, [transport]);

    // Alternar seleção de um pedido para o lote
    const toggleOrderSelection = (id: number) => {
        setSelectedOrderIds(prev => 
            prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
        );
    };

    // Selecionar todos os pedidos
    const handleSelectAll = () => {
        if (selectedOrderIds.length === allOrders.length) {
            setSelectedOrderIds([]);
        } else {
            setSelectedOrderIds(allOrders.map(o => o.id));
        }
    };

    // Modificar o prazo (deadline) de um pedido dinamicamente para simular atrasos
    const handleUpdateDeadline = (orderId: number, newTime: string) => {
        setAllOrders(prev => prev.map(o => {
            if (o.id === orderId) {
                const today = new Date();
                const [h, m] = newTime.split(":").map(Number);
                const updated = new Date(today.getFullYear(), today.getMonth(), today.getDate(), h, m, 0);
                return { ...o, deadline: updated.toISOString() };
            }
            return o;
        }));
    };

    // =========================================================================
    // EXECUÇÃO DO MINIMIZE LATENESS & TRAÇADO DA ROTA EM CADEIA
    // =========================================================================
    const handleRunOptimizeBatch = async () => {
        if (selectedOrderIds.length === 0) {
            toast.warning("Selecione pelo menos um pedido para montar o lote.");
            return;
        }

        setProcessingSchedule(true);
        setStatusMessage("Organizando agenda com Minimize Lateness (Earliest Deadline First)...");

        try {
            const selectedOrders = allOrders.filter(o => selectedOrderIds.includes(o.id));

            // 1. Data/Hora de início do turno
            const [startH, startM] = startTime.split(":").map(Number);
            const shiftDate = new Date();
            shiftDate.setHours(startH, startM, 0, 0);

            // 2. Geocodificar Origem e Destinos
            setStatusMessage("Localizando endereços e galpão de origem...");
            const originClean = originCep.replace(/\D/g, "");
            let originCoord = KNOWN_COORDS[originCep] || KNOWN_COORDS["70040-010"];
            
            if (!KNOWN_COORDS[originCep]) {
                const geo = await geocodeCEP(originCep);
                if (geo) originCoord = { lat: geo.lat, lon: geo.lon, address: `Origem: CEP ${originCep}` };
            }

            const geocodedStops: { order: any; lat: number; lon: number }[] = [];
            for (const order of selectedOrders) {
                const clean = (order.cep || "").replace(/\D/g, "");
                let coord = KNOWN_COORDS[order.cep];
                if (!coord) {
                    const geo = await geocodeCEP(order.cep);
                    coord = geo ? { lat: geo.lat, lon: geo.lon, address: order.address || `CEP ${order.cep}` } : { lat: -15.7950 + (Math.random() - 0.5) * 0.05, lon: -47.8900 + (Math.random() - 0.5) * 0.05, address: order.address };
                }
                geocodedStops.push({ order, lat: coord.lat, lon: coord.lon });
            }

            // 3. FASE 1: Rodar o Minimize Lateness (Gulosa por Deadline mais próximo)
            // A regra gulosa pura ordena por deadline ascendente
            setStatusMessage("Calculando cronograma ótimo (Earliest Deadline First)...");
            const scheduleData = await calculateMinimizeLatenessAPI({
                orders: selectedOrders,
                startTime: shiftDate.toISOString(),
                serviceTimeMinutes: serviceTimeMins
            });

            if (!scheduleData || !scheduleData.schedule) {
                throw new Error("Falha ao calcular o cronograma de entregas.");
            }

            // 4. Mapear a fila exata gerada pelo Minimize Lateness
            // A lista ordenada pelo algoritmo de Greed define a sequência da rota em cadeia!
            const orderedItems = scheduleData.schedule;
            const orderedGeoStops = orderedItems.map((item: any) => {
                const found = geocodedStops.find((g: any) => g.order.id === item.orderId);
                return found || { order: item.order, lat: -15.7950, lon: -47.8900 };
            });

            // 5. FASE 2: Traçar a Rota em Cadeia ligando os pontos na ordem exata da fila
            // Origem (0) -> Parada 1 -> Parada 2 -> ... -> Parada N
            setStatusMessage(`Traçando rota contínua em cadeia com ${algorithm.toUpperCase()}...`);

            const allPointsForGraph = [
                { lat: originCoord.lat, lon: originCoord.lon },
                ...orderedGeoStops.map((g: any) => ({ lat: g.lat, lon: g.lon }))
            ];


            // Constrói o grafo viário cobrindo todos os pontos
            const graph = await buildMultiStopRoadGraph(allPointsForGraph);
            setGraphData(graph);

            let segmentCostsMinutes: number[] = [];
            let fullContinuousCoords: [number, number][] = [];
            let fullPathNodes: number[] = [];
            let chainVisited: { u: number; v: number }[] = [];

            if (graph) {
                // Encontra nós mais próximos no grafo
                const stopNodeIds: number[] = [];
                for (const pt of allPointsForGraph) {
                    const nearest = findNearestNode(graph, pt.lat, pt.lon);
                    if (nearest !== null) stopNodeIds.push(nearest);
                }

                if (stopNodeIds.length >= 2) {
                    const chainRes = await calculateChainRouteAPI({
                        graph,
                        stopNodeIds,
                        algorithm,
                        speedKmh
                    });

                    if (chainRes && chainRes.segments) {
                        segmentCostsMinutes = chainRes.segments.map((s: any) => s.durationMinutes);
                        fullPathNodes = chainRes.fullPath || [];
                        chainVisited = chainRes.visitedEdges || [];

                        // Extrai coordenadas do caminho
                        fullContinuousCoords = fullPathNodes
                            .map(nId => graph.nodes[nId] ? [graph.nodes[nId].lat, graph.nodes[nId].lon] as [number, number] : null)
                            .filter((c): c is [number, number] => c !== null);
                    }
                }
            }

            // Se porventura não tiver malha viária completa, gera traçado direto interpolado realista
            if (fullContinuousCoords.length === 0) {
                fullContinuousCoords = allPointsForGraph.map(p => [p.lat, p.lon]);
                // Calcula custos com Haversine
                segmentCostsMinutes = [];
                for (let i = 0; i < allPointsForGraph.length - 1; i++) {
                    const distMeters = calculateDistance(
                        allPointsForGraph[i].lat, allPointsForGraph[i].lon,
                        allPointsForGraph[i + 1].lat, allPointsForGraph[i + 1].lon
                    );
                    const distKm = (distMeters / 1000) * 1.3; // Fator viário urbano
                    const mins = (distKm / speedKmh) * 60;
                    segmentCostsMinutes.push(Math.max(5, Math.round(mins)));
                }
            }

            // 6. Recalcula o cronograma com os custos reais retornados pelos trechos da rota!
            // O custo que o algoritmo retornar para cada trecho será o tempo da entrega,
            // permitindo calcular com precisão se houve atraso.
            const refinedSchedule = await calculateMinimizeLatenessAPI({
                orders: orderedItems.map((it: any) => it.order),
                startTime: shiftDate.toISOString(),
                segmentDurationsMinutes: segmentCostsMinutes,
                serviceTimeMinutes: serviceTimeMins
            });

            const finalSchedule = refinedSchedule || scheduleData;
            setScheduleResult(finalSchedule);
            setChainPathNodeIds(fullPathNodes);
            setContinuousCoordinates(fullContinuousCoords);
            setVisitedEdges(chainVisited);

            // 7. Monta os marcadores numerados para o mapa (Origem 0, Clientes 1, 2, 3...)
            const stopsForMap: MapStop[] = [
                {
                    stopIndex: 0,
                    label: "Origem (Depósito)",
                    customerName: "Galpão Central Stock.io",
                    cep: originCep,
                    address: originCoord.address,
                    lat: originCoord.lat,
                    lon: originCoord.lon,
                    arrivalFormatted: startTime,
                    isDelayed: false
                },
                ...finalSchedule.schedule.map((item: any, idx: number) => {
                    const geo = orderedGeoStops[idx];
                    return {
                        stopIndex: item.stopIndex,
                        orderId: item.orderId,
                        label: `Parada #${item.stopIndex}`,
                        customerName: item.customerName,
                        cep: item.cep,
                        address: item.address,
                        lat: geo.lat,
                        lon: geo.lon,
                        arrivalFormatted: item.arrivalFormatted,
                        deadlineFormatted: item.deadlineFormatted,
                        latenessMinutes: item.latenessMinutes,
                        isDelayed: item.isDelayed
                    };
                })
            ];

            setMapStops(stopsForMap);

            // 8. Executa comparação com estratégias ingênuas (FIFO e SPT) para visualização didática
            try {
                const durationsMap: Record<number, number> = {};
                finalSchedule.schedule.forEach((it: any, i: number) => {
                    durationsMap[it.orderId] = segmentCostsMinutes[i] || 15.0;
                });

                const compData = await compareSchedulingStrategiesAPI({
                    orders: selectedOrders,
                    startTime: shiftDate.toISOString(),
                    durationsMap,
                    serviceTimeMinutes: serviceTimeMins
                });
                setComparisonResult(compData);
            } catch (e) {
                console.warn("Comparação não pôde ser calculada:", e);
            }

            toast.success(
                finalSchedule.maxLatenessMinutes === 0
                    ? "Agenda otimizada! Todas as entregas estão no prazo!"
                    : `Agenda otimizada! Atraso máximo do lote minimizado para ${finalSchedule.maxLatenessMinutes} min.`
            );

        } catch (err: any) {
            console.error("Erro na otimização do lote:", err);
            toast.error(err.message || "Erro ao processar agenda.");
        } finally {
            setProcessingSchedule(false);
            setStatusMessage("");
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-[#F5F2EB] flex flex-col items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-t-4 border-b-4 border-[#6032F6] mb-4"></div>
                <h2 className="text-xl font-black text-[#17181A] uppercase tracking-wider">Carregando Pedidos</h2>
                <p className="text-xs text-[#17181A]/60 font-semibold mt-1">Preparando o calendário do entregador...</p>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#F5F2EB] font-sans flex flex-col text-[#17181A]">
            
            {/* Header Superior com Identidade Visual */}
            <header className="bg-[#17181A] text-white px-6 py-4 border-b border-black/10 sticky top-0 z-30 shadow-md">
                <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="flex items-center gap-4 w-full sm:w-auto">
                        <Link
                            href="/orders"
                            className="w-10 h-10 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-white transition-all cursor-pointer shrink-0"
                            title="Voltar para Pedidos"
                        >
                            <FiArrowLeft size={18} />
                        </Link>
                        <div>
                            <div className="flex items-center gap-2">
                                <span className="bg-[#6032F6] text-white px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider">
                                    Greed • Algoritmos Ambiciosos
                                </span>
                                <span className="text-zinc-400 text-xs font-semibold hidden md:inline">
                                    Projeto de Algoritmos 2026.2
                                </span>
                            </div>
                            <h1 className="text-lg sm:text-xl font-black uppercase tracking-wide flex items-center gap-2">
                                <FiCalendar className="text-[#6032F6]" />
                                Calendário de Entregas & Agenda de Lotes
                            </h1>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
                        <Link
                            href="/orders"
                            className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-bold uppercase tracking-wider transition-colors flex items-center gap-2"
                        >
                            <FiPackage />
                            Lista de Pedidos
                        </Link>
                        <button
                            onClick={handleRunOptimizeBatch}
                            disabled={processingSchedule || selectedOrderIds.length === 0}
                            className="px-5 py-2.5 rounded-xl bg-[#6032F6] hover:bg-[#5227DF] active:scale-95 disabled:opacity-50 text-white text-xs font-black uppercase tracking-wider transition-all shadow-lg hover:shadow-[#6032F6]/40 cursor-pointer flex items-center gap-2"
                        >
                            {processingSchedule ? (
                                <>
                                    <div className="animate-spin h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full" />
                                    <span>Otimizando...</span>
                                </>
                            ) : (
                                <>
                                    <FiZap size={14} />
                                    <span>Otimizar Agenda ({selectedOrderIds.length})</span>
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </header>

            {/* Banner de Status quando executando */}
            {statusMessage && (
                <div className="bg-[#6032F6] text-white px-6 py-2.5 text-center text-xs font-bold animate-pulse flex items-center justify-center gap-2">
                    <FiRefreshCw className="animate-spin" />
                    <span>{statusMessage}</span>
                </div>
            )}

            {/* Conteúdo Principal em Layout de Duas Colunas */}
            <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">

                {/* ========================================================= */}
                {/* COLUNA ESQUERDA (5 COLUNAS): SELETOR DE PEDIDOS & AGENDA  */}
                {/* ========================================================= */}
                <div className="lg:col-span-5 flex flex-col gap-6">

                    {/* Bloco 1: Configuração do Lote e Saída */}
                    <div className="bg-white rounded-3xl p-5 sm:p-6 shadow-sm border border-black/5">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-sm font-black uppercase tracking-wider text-[#17181A] flex items-center gap-2">
                                <FiCompass className="text-[#6032F6]" />
                                Parâmetros do Lote
                            </h2>
                            <span className="text-[11px] font-bold text-[#17181A]/40 uppercase">Configurações</span>
                        </div>

                        <div className="space-y-3.5">
                            {/* CEP de Origem */}
                            <div>
                                <label className="block text-[11px] font-black uppercase tracking-wider text-[#17181A]/60 mb-1">
                                    CEP de Origem (Galpão / Início)
                                </label>
                                <div className="flex items-center bg-[#F5F2EB] rounded-2xl px-3.5 py-2 border border-transparent focus-within:border-[#6032F6]">
                                    <FiMapPin className="text-[#6032F6] mr-2 shrink-0" />
                                    <input
                                        type="text"
                                        value={originCep}
                                        onChange={(e) => setOriginCep(e.target.value)}
                                        className="bg-transparent text-xs font-bold text-[#17181A] outline-none w-full"
                                        placeholder="00000-000"
                                    />
                                    <span className="text-[10px] font-bold text-[#17181A]/40 whitespace-nowrap">Depósito Central</span>
                                </div>
                            </div>

                            {/* Horário de Saída & Tempo de Atendimento */}
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-[11px] font-black uppercase tracking-wider text-[#17181A]/60 mb-1">
                                        Horário de Saída
                                    </label>
                                    <div className="flex items-center bg-[#F5F2EB] rounded-2xl px-3.5 py-2">
                                        <FiClock className="text-[#6032F6] mr-2 shrink-0" />
                                        <input
                                            type="time"
                                            value={startTime}
                                            onChange={(e) => setStartTime(e.target.value)}
                                            className="bg-transparent text-xs font-bold text-[#17181A] outline-none w-full cursor-pointer"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-[11px] font-black uppercase tracking-wider text-[#17181A]/60 mb-1">
                                        Tempo / Entrega
                                    </label>
                                    <select
                                        value={serviceTimeMins}
                                        onChange={(e) => setServiceTimeMins(Number(e.target.value))}
                                        className="w-full bg-[#F5F2EB] rounded-2xl px-3.5 py-2 text-xs font-bold text-[#17181A] outline-none cursor-pointer"
                                    >
                                        <option value={3}>3 min (Rápida)</option>
                                        <option value={5}>5 min (Padrão)</option>
                                        <option value={10}>10 min (Completa)</option>
                                    </select>
                                </div>
                            </div>

                            {/* Transporte & Algoritmo de Apoio */}
                            <div className="grid grid-cols-2 gap-3 pt-1">
                                <div>
                                    <label className="block text-[11px] font-black uppercase tracking-wider text-[#17181A]/60 mb-1">
                                        Transporte
                                    </label>
                                    <div className="grid grid-cols-4 gap-1 bg-[#F5F2EB] p-1 rounded-2xl">
                                        {[
                                            { id: "walk", icon: FaWalking, title: "A pé" },
                                            { id: "bike", icon: FaBicycle, title: "Bike" },
                                            { id: "moto", icon: FaMotorcycle, title: "Moto" },
                                            { id: "car", icon: FaCar, title: "Carro" }
                                        ].map(v => (
                                            <button
                                                key={v.id}
                                                type="button"
                                                onClick={() => setTransport(v.id as any)}
                                                className={`py-1.5 rounded-xl flex items-center justify-center transition-all cursor-pointer ${
                                                    transport === v.id
                                                        ? "bg-[#17181A] text-white shadow-sm"
                                                        : "text-[#17181A]/50 hover:bg-white/60"
                                                }`}
                                                title={v.title}
                                            >
                                                <v.icon size={13} />
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-[11px] font-black uppercase tracking-wider text-[#17181A]/60 mb-1">
                                        Algoritmo de Rota
                                    </label>
                                    <div className="flex bg-[#F5F2EB] p-1 rounded-2xl">
                                        <button
                                            type="button"
                                            onClick={() => setAlgorithm("dijkstra")}
                                            className={`flex-1 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                                                algorithm === "dijkstra"
                                                    ? "bg-white text-[#6032F6] shadow-sm"
                                                    : "text-[#17181A]/50 hover:bg-white/40"
                                            }`}
                                        >
                                            Dijkstra
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setAlgorithm("bellman")}
                                            className={`flex-1 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                                                algorithm === "bellman"
                                                    ? "bg-white text-[#6032F6] shadow-sm"
                                                    : "text-[#17181A]/50 hover:bg-white/40"
                                            }`}
                                        >
                                            Bellman
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Bloco 2: Seleção de Pedidos do Lote */}
                    <div className="bg-white rounded-3xl p-5 sm:p-6 shadow-sm border border-black/5 flex-1 flex flex-col">
                        <div className="flex items-center justify-between mb-4">
                            <div>
                                <h2 className="text-sm font-black uppercase tracking-wider text-[#17181A] flex items-center gap-2">
                                    <FiLayers className="text-[#6032F6]" />
                                    Pedidos Disponíveis
                                </h2>
                                <p className="text-[11px] font-bold text-[#17181A]/40">
                                    Selecione os pedidos para montar o lote
                                </p>
                            </div>
                            <button
                                onClick={handleSelectAll}
                                className="text-[10px] font-black uppercase tracking-wider text-[#6032F6] hover:underline cursor-pointer"
                            >
                                {selectedOrderIds.length === allOrders.length ? "Desmarcar Todos" : "Selecionar Todos"}
                            </button>
                        </div>

                        {/* Lista de Pedidos com Checkbox e Edição de Deadline */}
                        <div className="space-y-3 overflow-y-auto max-h-[460px] pr-1">
                            {allOrders.map((order) => {
                                const isSelected = selectedOrderIds.includes(order.id);
                                const deadlineDate = new Date(order.deadline);
                                const deadlineFormatted = isNaN(deadlineDate.getTime())
                                    ? "--:--"
                                    : deadlineDate.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

                                return (
                                    <div
                                        key={order.id}
                                        onClick={() => toggleOrderSelection(order.id)}
                                        className={`p-3.5 rounded-2xl border transition-all cursor-pointer select-none ${
                                            isSelected
                                                ? "bg-[#6032F6]/5 border-[#6032F6] shadow-xs"
                                                : "bg-[#F5F2EB]/50 border-transparent hover:bg-[#F5F2EB]"
                                        }`}
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="flex items-start gap-3">
                                                <input
                                                    type="checkbox"
                                                    checked={isSelected}
                                                    onChange={() => {}} // tratado pelo container
                                                    className="mt-1 w-4 h-4 rounded text-[#6032F6] cursor-pointer"
                                                />
                                                <div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-xs font-black text-[#17181A]">
                                                            Pedido #{order.id}
                                                        </span>
                                                        <span className="text-[10px] font-bold text-[#17181A]/50">
                                                            {order.customerName}
                                                        </span>
                                                    </div>
                                                    <p className="text-[11px] font-medium text-[#17181A]/70 truncate max-w-[220px]">
                                                        {order.address || `CEP ${order.cep}`}
                                                    </p>
                                                    <p className="text-[10px] font-bold text-[#6032F6]">
                                                        R$ {order.totalPrice?.toFixed(2).replace(".", ",")}
                                                    </p>
                                                </div>
                                            </div>

                                            {/* Deadline Badge com edição */}
                                            <div
                                                className="text-right shrink-0"
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                <span className="text-[9px] font-black uppercase tracking-wider text-[#17181A]/40 block mb-0.5">
                                                    Deadline Limite
                                                </span>
                                                <div className="inline-flex items-center gap-1 bg-white px-2.5 py-1 rounded-xl shadow-xs border border-black/5">
                                                    <FiClock className="text-amber-600 text-xs" />
                                                    <input
                                                        type="time"
                                                        value={deadlineFormatted}
                                                        onChange={(e) => handleUpdateDeadline(order.id, e.target.value)}
                                                        className="text-xs font-black text-[#17181A] bg-transparent outline-none cursor-pointer w-14"
                                                        title="Clique para editar o prazo deste cliente"
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Botão de Disparo */}
                        <div className="pt-4 mt-auto">
                            <button
                                onClick={handleRunOptimizeBatch}
                                disabled={processingSchedule || selectedOrderIds.length === 0}
                                className="w-full py-3.5 rounded-2xl bg-[#6032F6] hover:bg-[#5227DF] active:scale-[0.99] disabled:opacity-50 text-white text-xs font-black uppercase tracking-wider transition-all shadow-md hover:shadow-[#6032F6]/30 cursor-pointer flex items-center justify-center gap-2"
                            >
                                {processingSchedule ? (
                                    <>
                                        <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                                        <span>Processando Algoritmo...</span>
                                    </>
                                ) : (
                                    <>
                                        <FiZap size={16} />
                                        <span>Organizar Fila (Minimize Lateness)</span>
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>

                {/* ========================================================= */}
                {/* COLUNA DIREITA (7 COLUNAS): MAPA CONTÍNUO & TIMELINE      */}
                {/* ========================================================= */}
                <div className="lg:col-span-7 flex flex-col gap-6">

                    {/* Bloco do Mapa com Rota Contínua em Cadeia */}
                    <div className="bg-white rounded-3xl p-5 sm:p-6 shadow-sm border border-black/5 flex flex-col">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
                            <div>
                                <h2 className="text-sm font-black uppercase tracking-wider text-[#17181A] flex items-center gap-2">
                                    <FiTruck className="text-[#6032F6]" />
                                    Traçado Contínuo da Cadeia de Entregas
                                </h2>
                                <p className="text-[11px] font-bold text-[#17181A]/40">
                                    {scheduleResult
                                        ? `Conexão sequencial ordenada: Origem ➔ ${scheduleResult.schedule.map((s: any) => `Cliente ${s.stopIndex}`).join(" ➔ ")}`
                                        : "Selecione pedidos e execute o algoritmo para desenhar a rota contínua"}
                                </p>
                            </div>

                            {scheduleResult && (
                                <div className="flex items-center gap-2">
                                    <span className="text-xs font-bold bg-[#F5F2EB] px-3 py-1 rounded-xl">
                                        Distância: <strong>{scheduleResult.schedule.length > 0 ? `${(scheduleResult.totalTravelMinutes * speedKmh / 60).toFixed(1)} km` : "0 km"}</strong>
                                    </span>
                                </div>
                            )}
                        </div>

                        {/* Canvas do Mapa Leaflet */}
                        <div className="h-[380px] sm:h-[420px] rounded-2xl overflow-hidden relative">
                            <MultiStopDeliveryMap
                                graph={graphData}
                                stops={mapStops}
                                continuousPathNodeIds={chainPathNodeIds}
                                continuousCoordinates={continuousCoordinates}
                                visitedEdges={visitedEdges}
                                activeStopIndex={activeStopIndex}
                                onSelectStop={(idx) => setActiveStopIndex(idx)}
                            />
                        </div>
                    </div>

                    {/* Bloco da Timeline Lateral da Agenda */}
                    {scheduleResult ? (
                        <div className="bg-white rounded-3xl p-5 sm:p-6 shadow-sm border border-black/5">
                            
                            {/* Resumo do Lote no Topo da Timeline */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6 p-4 rounded-2xl bg-[#F5F2EB]/70 border border-black/5">
                                <div>
                                    <span className="text-[10px] font-black uppercase tracking-wider text-[#17181A]/50 block">
                                        Atraso Máximo (L_max)
                                    </span>
                                    <div className="flex items-center gap-1.5 mt-0.5">
                                        {scheduleResult.maxLatenessMinutes === 0 ? (
                                            <>
                                                <FiCheckCircle className="text-emerald-600 text-base" />
                                                <span className="text-sm font-black text-emerald-600">0 min (Ótimo)</span>
                                            </>
                                        ) : (
                                            <>
                                                <FiAlertTriangle className="text-rose-600 text-base" />
                                                <span className="text-sm font-black text-rose-600">+{scheduleResult.maxLatenessMinutes} min</span>
                                            </>
                                        )}
                                    </div>
                                </div>

                                <div>
                                    <span className="text-[10px] font-black uppercase tracking-wider text-[#17181A]/50 block">
                                        Entregas no Prazo
                                    </span>
                                    <span className="text-sm font-black text-[#17181A] mt-0.5 block">
                                        {scheduleResult.ordersOnTime} de {scheduleResult.totalOrders}
                                    </span>
                                </div>

                                <div>
                                    <span className="text-[10px] font-black uppercase tracking-wider text-[#17181A]/50 block">
                                        Tempo de Viagem
                                    </span>
                                    <span className="text-sm font-black text-[#17181A] mt-0.5 block">
                                        {scheduleResult.totalTravelMinutes} min
                                    </span>
                                </div>

                                <div>
                                    <span className="text-[10px] font-black uppercase tracking-wider text-[#17181A]/50 block">
                                        Término Previsto
                                    </span>
                                    <span className="text-sm font-black text-[#6032F6] mt-0.5 block">
                                        {scheduleResult.endTimeFormatted}
                                    </span>
                                </div>
                            </div>

                            {/* Cabeçalho da Timeline */}
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-xs font-black uppercase tracking-wider text-[#17181A] flex items-center gap-2">
                                    <FiCalendar className="text-[#6032F6]" />
                                    Cronograma Detalhado da Fila (Timeline)
                                </h3>
                                <button
                                    onClick={() => setShowComparison(!showComparison)}
                                    className="text-[10px] font-black uppercase tracking-wider text-[#6032F6] hover:underline cursor-pointer flex items-center gap-1"
                                >
                                    <FiInfo />
                                    {showComparison ? "Ocultar Comparativo Teórico" : "Ver Comparativo (Greed vs Outros)"}
                                </button>
                            </div>

                            {/* Painel Comparativo Didático (Módulo Greed PA) */}
                            {showComparison && comparisonResult && (
                                <div className="mb-6 p-4 rounded-2xl bg-[#17181A] text-white animate-in fade-in duration-300">
                                    <h4 className="text-xs font-black uppercase tracking-wider text-[#6032F6] mb-1 flex items-center gap-2">
                                        <FiZap /> Análise Teórica: Por que a Regra Gulosa Earliest Deadline First é Ótima?
                                    </h4>
                                    <p className="text-[11px] text-zinc-300 mb-3 leading-relaxed">
                                        {comparisonResult.explanation}
                                    </p>

                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                                        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
                                            <div className="text-[10px] font-black uppercase tracking-wider text-emerald-300">
                                                Minimize Lateness (Greed)
                                            </div>
                                            <div className="text-lg font-black text-white mt-1">
                                                {comparisonResult.edf?.maxLateness} min <span className="text-xs font-normal text-emerald-400">atraso máx</span>
                                            </div>
                                            <div className="text-[10px] text-zinc-400 mt-0.5">
                                                {comparisonResult.edf?.ordersOnTime} no prazo (Menor atraso)
                                            </div>
                                        </div>

                                        <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                                            <div className="text-[10px] font-black uppercase tracking-wider text-zinc-400">
                                                Ordem de Criação (FIFO)
                                            </div>
                                            <div className="text-lg font-black text-white mt-1">
                                                {comparisonResult.fifo?.maxLateness} min <span className="text-xs font-normal text-zinc-400">atraso máx</span>
                                            </div>
                                            <div className="text-[10px] text-zinc-400 mt-0.5">
                                                {comparisonResult.fifo?.ordersOnTime} no prazo
                                            </div>
                                        </div>

                                        <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                                            <div className="text-[10px] font-black uppercase tracking-wider text-zinc-400">
                                                Menor Duração (SPT)
                                            </div>
                                            <div className="text-lg font-black text-white mt-1">
                                                {comparisonResult.spt?.maxLateness} min <span className="text-xs font-normal text-zinc-400">atraso máx</span>
                                            </div>
                                            <div className="text-[10px] text-zinc-400 mt-0.5">
                                                {comparisonResult.spt?.ordersOnTime} no prazo
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* A Linha do Tempo Visual */}
                            <div className="relative pl-6 space-y-6 before:content-[''] before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-[#6032F6]/30">
                                
                                {/* Ponto 0: Origem */}
                                <div className="relative flex items-start gap-4">
                                    <div className="absolute -left-[27px] top-1 w-6 h-6 rounded-full bg-[#17181A] border-2 border-white flex items-center justify-center text-white text-[10px] shadow-sm">
                                        🏭
                                    </div>
                                    <div className="flex-1 bg-[#F5F2EB]/50 p-3 rounded-2xl border border-black/5">
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs font-black text-[#17181A]">
                                                Partida do Depósito
                                            </span>
                                            <span className="text-xs font-bold text-[#6032F6]">
                                                {scheduleResult.startTimeFormatted}
                                            </span>
                                        </div>
                                        <p className="text-[11px] text-[#17181A]/60 mt-0.5 font-medium">
                                            Galpão Central Stock.io • CEP {originCep}
                                        </p>
                                    </div>
                                </div>

                                {/* Paradas dos Clientes Ordenadas pelo Algoritmo */}
                                {scheduleResult.schedule.map((item: any) => {
                                    const isHighlighted = activeStopIndex === item.stopIndex;

                                    return (
                                        <div
                                            key={item.orderId}
                                            onClick={() => setActiveStopIndex(item.stopIndex)}
                                            className={`relative flex items-start gap-4 cursor-pointer transition-all ${
                                                isHighlighted ? "scale-[1.01]" : ""
                                            }`}
                                        >
                                            <div
                                                className={`absolute -left-[27px] top-1 w-6 h-6 rounded-full border-2 border-white flex items-center justify-center font-black text-[10px] shadow-sm ${
                                                    item.isDelayed
                                                        ? "bg-rose-600 text-white"
                                                        : "bg-[#6032F6] text-white"
                                                }`}
                                            >
                                                {item.stopIndex}
                                            </div>

                                            <div
                                                className={`flex-1 p-4 rounded-2xl border transition-all ${
                                                    isHighlighted
                                                        ? "bg-[#6032F6]/10 border-[#6032F6] shadow-sm"
                                                        : "bg-white border-black/5 hover:border-[#6032F6]/40"
                                                }`}
                                            >
                                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-2">
                                                    <div>
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-xs font-black uppercase text-[#17181A]">
                                                                {item.customerName}
                                                            </span>
                                                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#F5F2EB] text-[#17181A]/70">
                                                                Pedido #{item.orderId}
                                                            </span>
                                                        </div>
                                                        <p className="text-[11px] font-medium text-[#17181A]/60 mt-0.5">
                                                            {item.address}
                                                        </p>
                                                    </div>

                                                    {/* Status Badge */}
                                                    <div>
                                                        {item.isDelayed ? (
                                                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-rose-50 border border-rose-200 text-rose-700 text-[10px] font-black uppercase">
                                                                <FiAlertTriangle /> Atraso de {item.latenessMinutes} min
                                                            </span>
                                                        ) : (
                                                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-black uppercase">
                                                                <FiCheckCircle /> No Prazo ({item.slackMinutes}m de folga)
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Detalhamento dos Tempos */}
                                                <div className="grid grid-cols-3 gap-2 pt-2 border-t border-[#F5F2EB] text-[11px]">
                                                    <div>
                                                        <span className="text-[9px] font-black uppercase tracking-wider text-[#17181A]/40 block">
                                                            Deslocamento
                                                        </span>
                                                        <span className="font-bold text-[#17181A]">
                                                            +{item.travelDurationMinutes} min
                                                        </span>
                                                    </div>
                                                    <div>
                                                        <span className="text-[9px] font-black uppercase tracking-wider text-[#17181A]/40 block">
                                                            Chegada Prevista
                                                        </span>
                                                        <span className="font-black text-[#6032F6]">
                                                            {item.arrivalFormatted}
                                                        </span>
                                                    </div>
                                                    <div>
                                                        <span className="text-[9px] font-black uppercase tracking-wider text-[#17181A]/40 block">
                                                            Prazo (Deadline)
                                                        </span>
                                                        <span className="font-bold text-[#17181A]">
                                                            {item.deadlineFormatted}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ) : (
                        <div className="bg-white rounded-3xl p-8 shadow-sm border border-black/5 text-center flex flex-col items-center justify-center min-h-[220px]">
                            <div className="w-14 h-14 bg-[#F5F2EB] rounded-full flex items-center justify-center mb-3">
                                <FiCalendar className="text-2xl text-[#6032F6]" />
                            </div>
                            <h3 className="text-sm font-black uppercase tracking-wider text-[#17181A] mb-1">
                                Nenhum Cronograma Gerado Ainda
                            </h3>
                            <p className="text-xs text-[#17181A]/60 max-w-sm font-medium">
                                Selecione os pedidos desejados no painel à esquerda e clique em <strong>"Organizar Fila (Minimize Lateness)"</strong> para traçar a rota contínua e visualizar a agenda.
                            </p>
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}
