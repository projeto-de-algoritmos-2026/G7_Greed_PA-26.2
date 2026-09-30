"""
Módulo de Algoritmos Ambiciosos (Greed) - Minimize Lateness
Disciplina: Projeto de Algoritmos (PA)

Implementação do algoritmo guloso clássico de 'Scheduling to Minimize Lateness'
(Kleinberg & Tardos, Algorithm Design - Capítulo 4).

Problema:
Dado um conjunto de pedidos com prazos de entrega (deadlines d_i) e tempos de
atendimento/viagem (t_i), agendar os pedidos de forma a minimizar o atraso máximo:
    L_max = max(0, f_i - d_i)

Estratégia Gulosa Ótima:
    Earliest Deadline First (EDF) - Ordenar os pedidos em ordem crescente de prazo limite:
    d_1 <= d_2 <= ... <= d_n
"""

from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional

def parse_iso_datetime(dt_str: str) -> datetime:
    """Converte string ISO para datetime com suporte a diferentes formatos."""
    try:
        # Suporta com ou sem Z / timezone
        cleaned = dt_str.replace("Z", "+00:00")
        return datetime.fromisoformat(cleaned)
    except Exception:
        # Se for apenas hora HH:MM ou formato simples
        now = datetime.now()
        try:
            parts = dt_str.split(":")
            if len(parts) >= 2:
                return now.replace(hour=int(parts[0]), minute=int(parts[1]), second=0, microsecond=0)
        except Exception:
            pass
        return now

def format_time_hhmm(dt: datetime) -> str:
    return dt.strftime("%H:%M")

def sort_by_earliest_deadline(orders: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Regra Gulosa (Greedy Rule): Earliest Deadline First (EDF).
    Ordena a lista de pedidos com base no prazo limite (deadline) mais próximo.
    O pedido que vence antes é feito primeiro, independentemente da duração da viagem.
    """
    def get_deadline_key(order: Dict[str, Any]):
        dl = order.get("deadline")
        if isinstance(dl, datetime):
            dt = dl
        elif isinstance(dl, str):
            dt = parse_iso_datetime(dl)
        elif isinstance(dl, (int, float)):
            dt = datetime.fromtimestamp(dl)
        else:
            created = order.get("createdAt") or order.get("created_at")
            if created:
                c_dt = parse_iso_datetime(created) if isinstance(created, str) else created
                dt = c_dt + timedelta(minutes=60)
            else:
                return (23, 59, 59)
        if dt.tzinfo is not None:
            dt = dt.replace(tzinfo=None)
        # Ordena prioritariamente pelo horário limite do dia (hour, minute, second)
        return (dt.hour, dt.minute, dt.second)

    return sorted(orders, key=get_deadline_key)

def calculate_schedule_lateness(
    ordered_orders: List[Dict[str, Any]],
    start_time: datetime,
    segment_durations_minutes: List[float],
    service_time_minutes: float = 5.0
) -> Dict[str, Any]:
    """
    Calcula o cronograma completo para a fila ordenada de entregas:
    - Para cada parada i:
      - Horário de saída da etapa anterior: s_i
      - Duração da viagem (custo retornado pelo algoritmo de rota): t_viagem_i
      - Horário de chegada ao cliente
      - Tempo de atendimento/entrega no local: service_time_minutes
      - Horário de conclusão da entrega: f_i
      - Prazo limite: d_i
      - Atraso individual: l_i = max(0, f_i - d_i)
    - Atraso Máximo do Lote: L_max = max(l_i)
    """
    if start_time.tzinfo is not None:
        start_time = start_time.replace(tzinfo=None)

    current_time = start_time
    schedule_items = []
    max_lateness_minutes = 0.0
    total_travel_minutes = 0.0
    total_service_minutes = 0.0
    orders_on_time = 0
    orders_delayed = 0

    for idx, order in enumerate(ordered_orders):
        # Duração de viagem para este trecho (Origem -> 1, ou i-1 -> i)
        travel_duration = segment_durations_minutes[idx] if idx < len(segment_durations_minutes) else 15.0
        total_travel_minutes += travel_duration

        departure_time = current_time
        arrival_time = departure_time + timedelta(minutes=travel_duration)
        finish_time = arrival_time + timedelta(minutes=service_time_minutes)
        total_service_minutes += service_time_minutes
        current_time = finish_time

        # Deadline
        dl_raw = order.get("deadline")
        if isinstance(dl_raw, datetime):
            deadline_dt = dl_raw
        elif isinstance(dl_raw, str):
            deadline_dt = parse_iso_datetime(dl_raw)
        else:
            # Fallback relativo a start_time
            deadline_dt = start_time + timedelta(minutes=45 + idx * 30)

        # Normaliza tzinfo para comparação consistente (naive)
        if deadline_dt.tzinfo is not None:
            deadline_dt = deadline_dt.replace(tzinfo=None)

        # Se a data do deadline for anterior à data do turno de entrega,
        # alinha o deadline para a data do turno mantendo o horário prometido (HH:MM),
        # pois o lote de entregas está sendo executado no dia de start_time.
        if deadline_dt.date() < start_time.date():
            deadline_dt = deadline_dt.replace(
                year=start_time.year,
                month=start_time.month,
                day=start_time.day
            )

        # Cálculo do Atraso (Lateness em minutos):
        # L_i = max(0, f_i - d_i)
        lateness_seconds = (finish_time - deadline_dt).total_seconds()
        lateness_minutes = max(0.0, round(lateness_seconds / 60.0, 1))

        if lateness_minutes > 0:
            orders_delayed += 1
        else:
            orders_on_time += 1

        if lateness_minutes > max_lateness_minutes:
            max_lateness_minutes = lateness_minutes

        slack_minutes = max(0.0, round((deadline_dt - finish_time).total_seconds() / 60.0, 1))

        schedule_items.append({
            "stopIndex": idx + 1,
            "orderId": order.get("id"),
            "customerName": order.get("customerName") or order.get("user", {}).get("fullName") or f"Cliente #{order.get('id')}",
            "cep": order.get("cep"),
            "address": order.get("address") or f"CEP {order.get('cep')}",
            "departureTime": departure_time.isoformat(),
            "departureFormatted": format_time_hhmm(departure_time),
            "travelDurationMinutes": round(travel_duration, 1),
            "arrivalTime": arrival_time.isoformat(),
            "arrivalFormatted": format_time_hhmm(arrival_time),
            "serviceTimeMinutes": service_time_minutes,
            "finishTime": finish_time.isoformat(),
            "finishFormatted": format_time_hhmm(finish_time),
            "deadlineTime": deadline_dt.isoformat(),
            "deadlineFormatted": format_time_hhmm(deadline_dt),
            "latenessMinutes": lateness_minutes,
            "slackMinutes": slack_minutes,
            "isDelayed": lateness_minutes > 0,
            "order": order
        })

    return {
        "startTime": start_time.isoformat(),
        "startTimeFormatted": format_time_hhmm(start_time),
        "endTime": current_time.isoformat(),
        "endTimeFormatted": format_time_hhmm(current_time),
        "totalOrders": len(ordered_orders),
        "ordersOnTime": orders_on_time,
        "ordersDelayed": orders_delayed,
        "maxLatenessMinutes": max_lateness_minutes,
        "totalTravelMinutes": round(total_travel_minutes, 1),
        "totalServiceMinutes": round(total_service_minutes, 1),
        "totalJourneyMinutes": round(total_travel_minutes + total_service_minutes, 1),
        "schedule": schedule_items
    }

def run_minimize_lateness(
    orders: List[Dict[str, Any]],
    start_time_iso: Optional[str] = None,
    segment_durations_minutes: Optional[List[float]] = None,
    service_time_minutes: float = 5.0
) -> Dict[str, Any]:
    """
    Executa a resolução completa do problema Minimize Lateness:
    1. Ordena os pedidos usando a regra gulosa EDF (Earliest Deadline First).
    2. Calcula os horários da agenda e atrasos para cada entrega.
    """
    if not orders:
        return {
            "schedule": [],
            "maxLatenessMinutes": 0,
            "ordersOnTime": 0,
            "ordersDelayed": 0,
            "totalOrders": 0
        }

    start_time = parse_iso_datetime(start_time_iso) if start_time_iso else datetime.now()

    # 1. Regra Gulosa: ordenar por prazo limite mais próximo
    ordered = sort_by_earliest_deadline(orders)

    # 2. Se as durações de cada trecho não foram fornecidas ainda, estimar baseado na posição
    durations = segment_durations_minutes or [15.0] * len(ordered)

    # 3. Calcular o cronograma
    result = calculate_schedule_lateness(
        ordered_orders=ordered,
        start_time=start_time,
        segment_durations_minutes=durations,
        service_time_minutes=service_time_minutes
    )

    result["algorithm"] = "Minimize Lateness (Greed - Earliest Deadline First)"
    result["optimal"] = True
    return result

def compare_scheduling_strategies(
    orders: List[Dict[str, Any]],
    start_time_iso: Optional[str] = None,
    durations_map: Optional[Dict[int, float]] = None,
    service_time_minutes: float = 5.0
) -> Dict[str, Any]:
    """
    Função didática para o trabalho de PA (Projeto de Algoritmos):
    Compara o resultado ótimo obtido pelo algoritmo guloso (Earliest Deadline First)
    contra outras duas estratégias heurísticas comuns:
      - FIFO (First-In, First-Out / Ordem de chegada dos pedidos)
      - SPT (Shortest Processing Time / Menor tempo de deslocamento primeiro)
    Isso ilustra empiricamente por que a escolha gulosa pelo prazo é a única ótima.
    """
    if not orders:
        return {}

    start_time = parse_iso_datetime(start_time_iso) if start_time_iso else datetime.now()

    # 1. Estratégia Gulosa Ótima: Earliest Deadline First (EDF)
    edf_ordered = sort_by_earliest_deadline(orders)
    edf_durations = [durations_map.get(o.get("id"), 15.0) if durations_map else 15.0 for o in edf_ordered]
    edf_result = calculate_schedule_lateness(edf_ordered, start_time, edf_durations, service_time_minutes)

    # 2. Estratégia FIFO (ordem original / por ID / createdAt)
    fifo_ordered = sorted(orders, key=lambda x: str(x.get("createdAt") or x.get("id", "")))
    fifo_durations = [durations_map.get(o.get("id"), 15.0) if durations_map else 15.0 for o in fifo_ordered]
    fifo_result = calculate_schedule_lateness(fifo_ordered, start_time, fifo_durations, service_time_minutes)

    # 3. Estratégia SPT (Menor Duração Primeiro)
    spt_ordered = sorted(orders, key=lambda x: durations_map.get(x.get("id"), 15.0) if durations_map else 15.0)
    spt_durations = [durations_map.get(o.get("id"), 15.0) if durations_map else 15.0 for o in spt_ordered]
    spt_result = calculate_schedule_lateness(spt_ordered, start_time, spt_durations, service_time_minutes)

    return {
        "edf": {
            "name": "Minimize Lateness (Gulosa por Deadline - Ótima)",
            "maxLateness": edf_result["maxLatenessMinutes"],
            "ordersDelayed": edf_result["ordersDelayed"],
            "ordersOnTime": edf_result["ordersOnTime"],
            "totalJourney": edf_result["totalJourneyMinutes"]
        },
        "fifo": {
            "name": "Ordem de Criação (FIFO)",
            "maxLateness": fifo_result["maxLatenessMinutes"],
            "ordersDelayed": fifo_result["ordersDelayed"],
            "ordersOnTime": fifo_result["ordersOnTime"],
            "totalJourney": fifo_result["totalJourneyMinutes"]
        },
        "spt": {
            "name": "Menor Duração Primeiro (SPT)",
            "maxLateness": spt_result["maxLatenessMinutes"],
            "ordersDelayed": spt_result["ordersDelayed"],
            "ordersOnTime": spt_result["ordersOnTime"],
            "totalJourney": spt_result["totalJourneyMinutes"]
        },
        "explanation": (
            "A heurística Earliest Deadline First (EDF) garante o menor atraso máximo possível (L_max), "
            "conforme provado pelo Teorema de Kleinberg & Tardos com o argumento da troca de inversões. "
            "Enquanto FIFO ou SPT podem atender pedidos rápidos primeiro, eles sacrificam pedidos críticos "
            "com prazos iminentes, gerando atrasos extremos para os clientes finais."
        )
    }
