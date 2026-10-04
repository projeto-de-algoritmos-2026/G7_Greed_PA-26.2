"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
    getOrderById,
    calculateRouteAPI,
    calculateBreakpointsAPI,
    SelectingBreakpointsResult
} from "../../../../api/api";
import { buildRoadGraph, geocodeCEP, findNearestNode, OSMGraph, RouteResult } from "../../../../utils/osmGraph";
import { FiArrowLeft, FiMapPin, FiClock, FiSearch, FiPackage, FiZap, FiCompass, FiRefreshCw } from "react-icons/fi";
import { FaWalking, FaBicycle, FaMotorcycle, FaCar } from "react-icons/fa";
import dynamic from "next/dynamic";
import { toast } from "react-toastify";

// Leaflet deve ser importado via SSR falso pois usa window
const DeliveryMap = dynamic(() => import("../../../../components/DeliveryMap"), { ssr: false });

const TRANSPORT_CONFIG = {
    walk: {
        speedKmh: 5,
        capacityMeters: null
    },
    bike: {
        speedKmh: 15,
        capacityMeters: 5000
    },
    moto: {
        speedKmh: 40,
        capacityMeters: 12000
    },
    car: {
        speedKmh: 30,
        capacityMeters: 20000
    }
};

export default function DeliveryRoutePage() {
    const params = useParams();
    const router = useRouter();
    const orderId = params.id as string;

    const [order, setOrder] = useState<any>(null);
    const [loadingMsg, setLoadingMsg] = useState<string>("Buscando pedido...");
    const [graphData, setGraphData] = useState<{ graph: OSMGraph, start: number, end: number } | null>(null);
    const [routeResult, setRouteResult] = useState<RouteResult | null>(null);
    const [breakpointsResult, setBreakpointsResult] = useState<SelectingBreakpointsResult | null>(null);
    const [algorithm, setAlgorithm] = useState<"bellman" | "dijkstra">("bellman");
    const [transport, setTransport] = useState<"walk" | "bike" | "moto" | "car">("bike");

    // Novo estado para o CEP de origem
    const [originCep, setOriginCep] = useState("");
    const [destCoords, setDestCoords] = useState<{ lat: number, lon: number } | null>(null);

    useEffect(() => {
        async function fetchOrderInfo() {
            try {
                setLoadingMsg("Carregando detalhes do pedido...");
                const orderData = await getOrderById(orderId);
                if (!orderData) {
                    toast.error("Pedido não encontrado");
                    setLoadingMsg("");
                    return;
                }
                setOrder(orderData);

                setLoadingMsg("Localizando destino...");
                const geoResult = await geocodeCEP(orderData.cep);
                const safeDest = geoResult || { lat: -23.550520, lon: -46.633308 };
                setDestCoords(safeDest);

                setLoadingMsg("");
            } catch (err: any) {
                console.error(err);
                toast.error(err.message || "Erro inesperado");
                setLoadingMsg("");
            }
        }

        if (orderId) fetchOrderInfo();
    }, [orderId]);

    const handleCalculateRoute = async () => {
        const cleanCep = originCep.replace(/\D/g, '');
        if (!cleanCep || cleanCep.length < 8) {
            toast.warning("Digite um CEP de origem válido com 8 dígitos.");
            return;
        }
        if (!destCoords) {
            toast.error("Destino não foi carregado corretamente.");
            return;
        }

        try {
            setLoadingMsg("Buscando localização da origem...");
            // Espaçamento para respeitar o limite de 1 req/s do Nominatim
            await new Promise(r => setTimeout(r, 1100));
            const originGeo = await geocodeCEP(originCep);
            const safeOrigin = originGeo || { lat: -23.552520, lon: -46.635308 };

            setLoadingMsg("Extraindo malha viária real do OpenStreetMap (pode levar alguns segundos)...");
            const graph = await buildRoadGraph(safeOrigin.lat, safeOrigin.lon, destCoords.lat, destCoords.lon);
            if (!graph) {
                toast.error("Falha ao construir o grafo de ruas");
                setLoadingMsg("");
                return;
            }

            setLoadingMsg("Mapeando nós do grafo...");
            const sNode = findNearestNode(graph, safeOrigin.lat, safeOrigin.lon);
            const eNode = findNearestNode(graph, destCoords.lat, destCoords.lon);

            if (sNode === null || eNode === null) {
                toast.error("Não foi possível encontrar ruas próximas");
                setLoadingMsg("");
                return;
            }

            setGraphData({ graph, start: sNode, end: eNode });

            setLoadingMsg(`Calculando menor caminho com ${algorithm === "dijkstra" ? "Dijkstra" : "Bellman-Ford"}...`);
//------------------------------------------------------------------------------------------------------
            const result = await calculateRouteAPI(graph, sNode, eNode, algorithm);

            if (!result) {
                toast.warning("Não foi possível traçar uma rota conexa entre os pontos.");
                setBreakpointsResult(null);
                setLoadingMsg("");
                return;
            }

            setRouteResult(result);

            if (capacityMeters !== null) {
                setLoadingMsg("Calculando pontos de recarga...");

                const breakpointResult = await calculateBreakpointsAPI({
                    graph,
                    path: result.path,
                    capacityMeters
                });

                setBreakpointsResult(breakpointResult);

                if (breakpointResult && !breakpointResult.possible) {
                    toast.warning(
                        "A autonomia selecionada não permite concluir esta rota."
                    );
                }
            } else {
                setBreakpointsResult(null);
            }

            setLoadingMsg("");

//-----------------------------------------------------------------------------------------------------

        } catch (err: any) {
            console.error(err);
            toast.error("Erro ao calcular a rota");
            setLoadingMsg("");
        }
    };

    const handleAlgorithmChange = (alg: "bellman" | "dijkstra") => {
        setAlgorithm(alg);
    };

    // Remover tela inteira de carregamento para não desmontar o mapa
    // if (loadingMsg) {
    //     return (
    //         <div className="min-h-screen bg-[#F6F3E4] flex flex-col items-center justify-center p-6 text-center">
    //             <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-[#6032F6] mb-6"></div>
    //             <h2 className="text-2xl font-black text-[#17181A] uppercase tracking-wider mb-2">Processando</h2>
    //             <p className="text-[#17181A]/60 font-medium max-w-md">{loadingMsg}</p>
    //         </div>
    //     );
    // }

    // Calcular tempo estimado baseado no transporte
const transportConfig = TRANSPORT_CONFIG[transport];
const speedKmh = transportConfig.speedKmh;
const capacityMeters = transportConfig.capacityMeters;

    const distKm = routeResult ? routeResult.totalDistance / 1000 : 0;
    const timeMins = routeResult ? Math.ceil((distKm / speedKmh) * 60) : 0;

    return (
        <div className="min-h-screen bg-[#F5F2EB] font-sans flex flex-col text-[#17181A]">

            {/* Header Superior com Identidade Visual (Grafos) */}
            <header className="bg-[#17181A] text-white px-6 py-4 border-b border-black/10 sticky top-0 z-30 shadow-md">
                <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="flex items-center gap-4 w-full sm:w-auto">
                        <Link
                            href="/delivery/orders"
                            className="w-10 h-10 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-white transition-all cursor-pointer shrink-0"
                            title="Voltar para Pedidos"
                        >
                            <FiArrowLeft size={18} />
                        </Link>
                        <div>
                            <div className="flex items-center gap-2">
                                <span className="bg-[#6032F6] text-white px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider">
                                    Grafos • Menor Caminho
                                </span>
                                <span className="text-zinc-400 text-xs font-semibold hidden md:inline">
                                    Projeto de Algoritmos 2026.2
                                </span>
                            </div>
                            <h1 className="text-lg sm:text-xl font-black uppercase tracking-wide flex items-center gap-2">
                                <FiMapPin className="text-[#6032F6]" />
                                Entrega Individual • Pedido #{orderId}
                            </h1>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
                        <Link
                            href="/delivery/orders"
                            className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-bold uppercase tracking-wider transition-colors flex items-center gap-2"
                        >
                            <FiPackage />
                            Lista de Pedidos
                        </Link>
                        <button
                            onClick={handleCalculateRoute}
                            disabled={!!loadingMsg}
                            className="px-5 py-2.5 rounded-xl bg-[#6032F6] hover:bg-[#5227DF] active:scale-95 disabled:opacity-50 text-white text-xs font-black uppercase tracking-wider transition-all shadow-lg hover:shadow-[#6032F6]/40 cursor-pointer flex items-center gap-2"
                        >
                            {loadingMsg ? (
                                <>
                                    <div className="animate-spin h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full" />
                                    <span>Calculando...</span>
                                </>
                            ) : (
                                <>
                                    <FiZap size={14} />
                                    <span>Calcular Rota</span>
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </header>

            {/* Banner de Status quando executando */}
            {loadingMsg && (
                <div className="bg-[#6032F6] text-white px-6 py-2.5 text-center text-xs font-bold animate-pulse flex items-center justify-center gap-2">
                    <FiRefreshCw className="animate-spin" />
                    <span>{loadingMsg}</span>
                </div>
            )}

            {/* Conteúdo Principal */}
            <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 flex flex-col">
                <div className="w-full flex-1 bg-white shadow-xl overflow-hidden flex flex-col lg:flex-row relative min-h-[620px] rounded-3xl border border-black/5">

                    {/* Coluna Esquerda: Controles */}
                    <div className="w-full lg:w-[420px] flex flex-col bg-white z-10 flex-shrink-0 relative border-r border-[#F5F2EB]">

                        {/* Header e Inputs */}
                        <div className="px-6 pt-6 pb-4 flex-1 overflow-y-auto">
                            <div className="flex items-center justify-between mb-6">
                                <div>
                                    <h2 className="text-sm font-black uppercase tracking-wider text-[#17181A] flex items-center gap-2">
                                        <FiCompass className="text-[#6032F6]" />
                                        Parâmetros da Rota
                                    </h2>
                                    <p className="text-[11px] font-bold text-[#17181A]/40">
                                        Pedido #{orderId} • {order?.customerName || `CEP ${order?.cep}`}
                                    </p>
                                </div>
                                <span className="text-[10px] font-black uppercase text-[#6032F6] bg-[#6032F6]/10 px-2 py-0.5 rounded-full">
                                    Individual
                                </span>
                            </div>

                            <div className="space-y-3 mb-8 relative">
                                <div className="absolute left-5 top-5 bottom-5 w-0.5 bg-gray-200 z-0"></div>

                                <div className="relative z-10 bg-[#F5F2EB] rounded-2xl px-4 py-2.5 flex items-center gap-3 border border-transparent focus-within:border-[#6032F6] transition-colors shadow-sm">
                                    <div className="w-3 h-3 rounded-full bg-blue shadow-md border-2 border-white shrink-0"></div>
                                    <input
                                        type="text"
                                        placeholder="Digite o CEP de Origem"
                                        value={originCep}
                                        onChange={(e) => {
                                            const clean = e.target.value.replace(/\D/g, '');
                                            if (clean.length > 5) {
                                                setOriginCep(`${clean.slice(0, 5)}-${clean.slice(5, 8)}`);
                                            } else {
                                                setOriginCep(clean);
                                            }
                                        }}
                                        maxLength={9}
                                        className="bg-transparent font-medium text-sm text-[#17181A] outline-none w-full"
                                    />
                                    <button
                                        onClick={handleCalculateRoute}
                                        disabled={!!loadingMsg}
                                        className="bg-[#6032F6] text-white p-2 rounded-xl hover:bg-[#5227DF] transition-colors cursor-pointer shrink-0 shadow-md disabled:opacity-50 flex items-center justify-center"
                                        title="Buscar Rota"
                                    >
                                        {loadingMsg ? <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" /> : <FiSearch />}
                                    </button>
                                </div>

                                <div className="relative z-10 bg-[#F5F2EB] rounded-2xl px-4 py-3 flex items-center gap-3 shadow-sm">
                                    <div className="w-3 h-3 rounded-full bg-red-500 shadow-md border-2 border-white shrink-0"></div>
                                    <input type="text" value={`Destino: CEP ${order?.cep}`} readOnly className="bg-transparent font-medium text-sm text-[#17181A] outline-none w-full cursor-default" />
                                </div>
                            </div>

                            <div className="mb-4">
                                <h3 className="text-xs font-bold text-[#17181A]/40 uppercase tracking-wider mb-4">Meio de Transporte</h3>
                                <div className="grid grid-cols-4 gap-2">
                                    {[
                                        { id: 'walk', icon: FaWalking, label: 'A pé' },
                                        { id: 'bike', icon: FaBicycle, label: 'Bike' },
                                        { id: 'moto', icon: FaMotorcycle, label: 'Moto' },
                                        { id: 'car', icon: FaCar, label: 'Carro' }
                                    ].map(t => (
                                        <button
                                            key={t.id}
                                            onClick={() => setTransport(t.id as any)}
                                            className={`flex flex-col items-center justify-center gap-2 py-4 rounded-2xl transition-all cursor-pointer ${transport === t.id ? 'bg-[#17181A] text-white shadow-lg scale-105' : 'bg-[#F5F2EB] text-[#17181A]/60 hover:bg-[#EBE7DD]'}`}
                                        >
                                            <t.icon size={20} />
                                            <span className="text-[9px] font-bold uppercase truncate w-full text-center px-1">{t.label}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Rodapé de Informações e Ações (Fixo na parte inferior da coluna esquerda) */}
                        <div className="p-6 bg-white shadow-[0_-10px_40px_rgba(0,0,0,0.03)] z-20 shrink-0">
                            <div className="flex items-center justify-between mb-6">
                                <div className="flex items-center gap-3">
                                    <div className="w-12 h-12 bg-[#F5F2EB] rounded-2xl flex items-center justify-center text-[#6032F6] shrink-0">
                                        <FiMapPin size={24} />
                                    </div>
                                    <div>
                                        <h4 className="font-black text-[#17181A] uppercase tracking-wide text-sm mb-0.5">Destino Final</h4>
                                        <p className="text-xs font-medium text-[#17181A]/50">{routeResult ? `Distância: ${distKm.toFixed(2)} km` : 'Não calculada'}</p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="flex items-center justify-end gap-1 font-black text-[#17181A] text-xl">
                                        <FiClock className="text-[#6032F6] text-lg" />
                                        {routeResult ? timeMins : '--'} <span className="text-sm">min</span>
                                    </div>
                                    <p className="text-[10px] font-bold text-[#17181A]/40 uppercase tracking-wider">{speedKmh} km/h</p>
                                </div>
                            </div>

                            {breakpointsResult && (
                            <div className="mb-6 p-4 bg-[#F5F2EB] rounded-2xl">
                                <p className="text-xs font-black uppercase tracking-wider text-[#17181A]">
                                    Paradas para recarga
                                </p>

                                <p className="text-sm font-bold text-[#6032F6] mt-1">
                                    {breakpointsResult.numberOfStops}
                                </p>
                            </div>
                        )}

                            <div className="flex gap-2 mb-6 p-1 bg-[#F5F2EB] rounded-full">
                                <button
                                    onClick={() => handleAlgorithmChange('bellman')}
                                    className={`flex-1 py-2.5 rounded-full text-[10px] sm:text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${algorithm === 'bellman' ? 'bg-white shadow-sm text-[#6032F6]' : 'text-[#17181A]/50 hover:bg-white/50'}`}
                                >
                                    Bellman-Ford
                                </button>
                                <button
                                    onClick={() => handleAlgorithmChange('dijkstra')}
                                    className={`flex-1 py-2.5 rounded-full text-[10px] sm:text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${algorithm === 'dijkstra' ? 'bg-white shadow-sm text-[#6032F6]' : 'text-[#17181A]/50 hover:bg-white/50'}`}
                                >
                                    Dijkstra
                                </button>
                            </div>


                        </div>

                    </div>

                    {/* Coluna Direita: Mapa */}
                    <div className="flex-1 relative bg-[#EBE7DD] flex flex-col min-h-[400px] lg:min-h-0">
                        {loadingMsg && (
                            <div className="absolute inset-0 z-50 bg-white/70 backdrop-blur-sm flex flex-col items-center justify-center">
                                <div className="animate-spin rounded-full h-12 w-12 border-t-4 border-b-4 border-[#6032F6] mb-4"></div>
                                <h2 className="text-lg font-black text-[#17181A] uppercase tracking-wider mb-1">Processando</h2>
                                <p className="text-[#17181A]/80 font-medium text-sm text-center px-4">{loadingMsg}</p>
                            </div>
                        )}

                        {graphData ? (
                            <DeliveryMap
                                graph={graphData.graph}
                                startNode={graphData.start}
                                endNode={graphData.end}
                                path={routeResult?.path || []}
                                visitedEdges={routeResult?.visitedEdges || []}
                            />
                        ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center p-8 text-center bg-[#EBE7DD] absolute inset-0">
                                <div className="w-24 h-24 bg-white rounded-full shadow-sm flex items-center justify-center mb-6 animate-pulse">
                                    <FiSearch className="text-4xl text-[#6032F6]" />
                                </div>
                                <h3 className="text-[#17181A]/80 font-black uppercase tracking-widest text-base sm:text-lg mb-2">Esperando CEP de Origem</h3>
                                <p className="text-[#17181A]/50 text-xs sm:text-sm max-w-xs leading-relaxed font-medium">
                                    Por favor, digite o CEP de origem no painel lateral e faça a busca para visualizar o trajeto no mapa.
                                </p>
                            </div>
                        )}
                    </div>

                </div>
            </main>
        </div>
    );
}
