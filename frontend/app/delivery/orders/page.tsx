"use client";

import { useEffect, useState } from "react";
import { getAllOrders } from "../../../api/api";
import { FiPackage, FiCalendar, FiBox, FiTruck, FiMapPin, FiClock, FiZap, FiCheckSquare } from "react-icons/fi";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "react-toastify";

export default function OrdersPage() {
  const [orders, setOrders] = useState<any[]>([]);
  const [selectedOrderIds, setSelectedOrderIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [addresses, setAddresses] = useState<Record<string, string>>({});

  useEffect(() => {
    async function fetchOrders() {
      try {
        const data = await getAllOrders();

        // Assegura que todos os pedidos têm um deadline formatado para o dia de hoje
        const now = new Date();
        const pad = (n: number) => String(n).padStart(2, '0');
        const enriched = data.map((o: any, idx: number) => {
          let dl = o.deadline ? new Date(o.deadline) : null;
          if (!dl || isNaN(dl.getTime())) {
            dl = new Date(now.getTime() + (45 + idx * 30) * 60000);
          }
          const todayWithTime = new Date();
          todayWithTime.setHours(dl.getHours(), dl.getMinutes(), 0, 0);
          const localISO = `${todayWithTime.getFullYear()}-${pad(todayWithTime.getMonth() + 1)}-${pad(todayWithTime.getDate())}T${pad(todayWithTime.getHours())}:${pad(todayWithTime.getMinutes())}:00`;

          return { ...o, deadline: localISO };
        });

        setOrders(enriched);

        // Fetch addresses for each unique CEP
        const uniqueCeps = [...new Set(enriched.map((o: any) => o.cep).filter(Boolean))];
        const addressData: Record<string, string> = {};

        await Promise.all(uniqueCeps.map(async (cep) => {
          try {
            const cleanCep = (cep as string).replace(/\D/g, '');
            if (cleanCep.length === 8) {
              const res = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
              const json = await res.json();
              if (!json.erro) {
                addressData[cep as string] = `${json.logradouro}, ${json.bairro} - ${json.localidade}/${json.uf}`;
              } else {
                addressData[cep as string] = "Endereço não encontrado";
              }
            }
          } catch (e) {
            console.error("Erro ao buscar CEP:", e);
            addressData[cep as string] = "Erro ao carregar endereço";
          }
        }));

        setAddresses(addressData);

      } catch (error) {
        console.error("Failed to fetch orders:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchOrders();
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = sessionStorage.getItem("stockio_selected_order_ids");
      if (saved) {
        try {
          const ids = JSON.parse(saved);
          if (Array.isArray(ids)) {
            setSelectedOrderIds(ids);
          }
        } catch (e) { }
      }
    }
  }, []);

  const router = useRouter();

  const handleDelivery = (orderId: number) => {
    toast.success(`Iniciando entrega individual do pedido #${orderId}!`);
    router.push(`/delivery/order/${orderId}`);
  };

  const toggleSelectOrder = (orderId: number) => {
    setSelectedOrderIds(prev => {
      const next = prev.includes(orderId) ? prev.filter(id => id !== orderId) : [...prev, orderId];
      if (typeof window !== "undefined") {
        if (next.length > 0) {
          sessionStorage.setItem("stockio_selected_order_ids", JSON.stringify(next));
        } else {
          sessionStorage.removeItem("stockio_selected_order_ids");
        }
      }
      return next;
    });
  };

  const handleGoToCalendar = () => {
    if (selectedOrderIds.length > 0) {
      if (typeof window !== "undefined") {
        sessionStorage.setItem("stockio_selected_order_ids", JSON.stringify(selectedOrderIds));
      }
      router.push(`/delivery/batchOrder?orders=${selectedOrderIds.join(',')}`);
    } else {
      if (typeof window !== "undefined") {
        sessionStorage.removeItem("stockio_selected_order_ids");
      }
      router.push('/delivery/batchOrder');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F5F2EB] flex flex-col">
        <div className="flex-1 flex items-center justify-center pt-20">
          <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-[#6032F6]"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F2EB] flex flex-col font-sans transition-colors duration-300 pb-24">

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-8 pt-10">
        {/* Título da Página e Navegação */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4">
          <h1 className="text-[#17181A] text-2xl sm:text-3xl font-black tracking-wide uppercase leading-tight flex items-center gap-3">
            <FiPackage className="text-[#6032F6]" />
            Painel de Pedidos
          </h1>
          <div className="flex items-center gap-3">
            <button
              onClick={handleGoToCalendar}
              className="px-4 py-2.5 rounded-full bg-white text-[#6032F6] border border-[#6032F6]/30 hover:bg-[#6032F6]/5 font-black text-xs tracking-wider uppercase transition-transform hover:scale-[1.02] shadow-sm flex items-center gap-2 cursor-pointer"
            >
              <FiCalendar />
              Ver Calendário {selectedOrderIds.length > 0 && `(${selectedOrderIds.length})`}
            </button>
            <Link
              href="/"
              className="px-5 py-2.5 rounded-full bg-[#17181A] text-[#F6F3E4] font-bold text-xs tracking-wider uppercase transition-transform hover:scale-[1.02] shadow-md flex items-center gap-2"
            >
              Voltar
            </Link>
          </div>
        </div>

        {orders.length === 0 ? (
          <div className="bg-white rounded-3xl shadow-md p-10 text-center flex flex-col items-center">
            <div className="w-16 h-16 bg-[#F5F2EB] rounded-full flex items-center justify-center mb-4">
              <FiBox className="text-[#17181A]/40 text-3xl" />
            </div>
            <h3 className="text-lg font-black text-[#17181A] uppercase tracking-wide mb-2">Nenhum pedido encontrado</h3>
            <p className="text-[#17181A]/60 font-medium text-sm max-w-sm">
              Ainda não existem pedidos registrados no sistema. Os pedidos aparecerão aqui quando as compras forem finalizadas.
            </p>
          </div>
        ) : (
          <div className="grid gap-6">
            {orders.map((order) => {
              const isSelected = selectedOrderIds.includes(order.id);
              const deadlineDate = new Date(order.deadline);
              const deadlineFormatted = isNaN(deadlineDate.getTime())
                ? "--:--"
                : deadlineDate.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

              return (
                <div
                  key={order.id}
                  className={`bg-white rounded-3xl shadow-sm hover:shadow-lg transition-all duration-300 overflow-hidden border-2 ${isSelected ? "border-[#6032F6]" : "border-transparent"
                    }`}
                >
                  <div className="p-5 sm:p-6">
                    {/* Cabeçalho do Card */}
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-5 pb-5 border-b border-[#F5F2EB]">
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectOrder(order.id)}
                          className="w-5 h-5 rounded text-[#6032F6] cursor-pointer"
                          title="Selecionar para lote"
                        />
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-black text-[#17181A] uppercase tracking-wider">
                              Pedido #{order.id}
                            </span>
                            {isSelected && (
                              <span className="bg-[#6032F6]/10 text-[#6032F6] text-[10px] font-black uppercase px-2 py-0.5 rounded-full">
                                No Lote
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-[#17181A]/60 font-medium text-xs">
                            <span className="flex items-center gap-1">
                              <FiCalendar className="text-[#17181A]/40" />
                              {new Date(order.createdAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center md:items-end justify-between md:justify-start gap-4">
                        {/* Prazo Limite (Deadline) */}
                        <div className="bg-[#F5F2EB] px-3.5 py-1.5 rounded-2xl flex items-center gap-2">
                          <FiClock className="text-[#6032F6]" />
                          <div>
                            <span className="text-[9px] font-black uppercase tracking-wider text-[#17181A]/50 block leading-none">
                              Deadline
                            </span>
                            <span className="text-xs font-black text-[#17181A]">
                              {deadlineFormatted}
                            </span>
                          </div>
                        </div>

                        <div className="flex flex-col md:items-end">
                          <p className="text-[10px] font-bold text-[#17181A]/50 uppercase tracking-wider mb-0.5">Total</p>
                          <div className="flex items-center gap-1 text-xl font-black text-[#17181A]">
                            <span className="text-[#6032F6] text-sm">R$</span>
                            {order.totalPrice.toFixed(2).replace('.', ',')}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Lista de Itens */}
                    <div className="mb-5">
                      <h4 className="text-xs font-black text-[#17181A]/70 mb-3 uppercase tracking-wider">Itens</h4>
                      <div className="space-y-2">
                        {order.items?.map((item: any) => (
                          <div key={item.id} className="flex items-center justify-between p-3 rounded-xl bg-[#F5F2EB] hover:bg-[#EBE7DD] transition-colors gap-3">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center text-[#6032F6] font-black text-sm shadow-sm shrink-0">
                                {item.quantity}x
                              </div>
                              <div>
                                <p className="font-bold text-[#17181A] text-sm truncate max-w-[150px] sm:max-w-[200px]">
                                  {item.product?.name || `Produto #${item.productId}`}
                                </p>
                                <p className="text-xs font-medium text-[#17181A]/60">
                                  R$ {item.price.toFixed(2).replace('.', ',')}
                                </p>
                              </div>
                            </div>
                            <div className="font-black text-[#17181A] text-sm shrink-0">
                              R$ {(item.quantity * item.price).toFixed(2).replace('.', ',')}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Rodapé do Card (Endereço e Botões) */}
                    <div className="flex flex-col md:flex-row items-center justify-between gap-4 pt-4 border-t border-[#F5F2EB]">
                      {order.cep ? (
                        <div className="flex flex-col w-full md:w-auto overflow-hidden">
                          <span className="text-[10px] font-bold text-[#17181A]/50 uppercase tracking-wider mb-1">Endereço de Entrega</span>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-[#17181A] bg-[#F5F2EB] px-3 py-2 rounded-lg text-xs shrink-0">{order.cep}</span>
                            {addresses[order.cep] && (
                              <div className="flex items-center gap-2 text-[#17181A]/80 bg-[#F5F2EB]/50 px-3 py-2 rounded-lg text-xs font-medium border border-[#F5F2EB]">
                                <FiMapPin className="text-[#6032F6] shrink-0" />
                                <span className="truncate max-w-[150px] sm:max-w-[300px] md:max-w-[400px]">{addresses[order.cep]}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="w-full sm:w-auto"></div>
                      )}

                      <div className="flex items-center gap-3 w-full md:w-auto">
                        <button
                          onClick={() => toggleSelectOrder(order.id)}
                          className={`flex-1 md:flex-initial px-4 py-3 rounded-full text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${isSelected
                            ? "bg-[#6032F6]/10 text-[#6032F6] border border-[#6032F6]"
                            : "bg-[#F5F2EB] text-[#17181A] hover:bg-[#EBE7DD]"
                            }`}
                        >
                          {isSelected ? "✓ Selecionado" : "+ Lote"}
                        </button>
                        <button
                          onClick={() => handleDelivery(order.id)}
                          className="flex-1 md:flex-initial px-6 py-3 rounded-full bg-[#17181A] hover:bg-[#2A2B2E] active:scale-[0.98] text-white font-black text-xs tracking-wider uppercase transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer shrink-0"
                        >
                          <FiTruck className="text-base" />
                          Entrega Individual
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Barra Flutuante de Ação Quando Houver Pedidos Selecionados */}
      {selectedOrderIds.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-[#17181A] text-white px-6 py-4 rounded-full shadow-2xl flex items-center gap-4 sm:gap-6 border-2 border-[#6032F6] animate-in fade-in slide-in-from-bottom duration-300">
          <div className="flex items-center gap-2 text-xs sm:text-sm font-black">
            <span className="w-6 h-6 rounded-full bg-[#6032F6] flex items-center justify-center text-xs">
              {selectedOrderIds.length}
            </span>
            <span>{selectedOrderIds.length === 1 ? "pedido selecionado" : "pedidos selecionados"}</span>
          </div>
          <button
            onClick={handleGoToCalendar}
            className="px-6 py-2.5 rounded-full bg-[#6032F6] hover:bg-[#5227DF] text-white font-black text-xs uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer shadow-md"
          >
            <FiZap />
            <span>Montar Agenda no Calendário ({selectedOrderIds.length})</span>
          </button>
          <button
            onClick={() => {
              setSelectedOrderIds([]);
              if (typeof window !== "undefined") {
                sessionStorage.removeItem("stockio_selected_order_ids");
              }
            }}
            className="text-xs text-zinc-400 hover:text-white uppercase font-bold transition-colors cursor-pointer px-2 py-1"
          >
            Limpar
          </button>
        </div>
      )}
    </div>
  );
}

