"""
Módulo de Rota em Cadeia (Chain Routing)
Calcula a rota contínua ligando múltiplos pontos sequenciais (Origem -> Parada 1 -> Parada 2 -> ... -> Parada N)
utilizando os algoritmos de menor caminho existentes (Dijkstra ou Bellman-Ford).
"""

from typing import Dict, List, Optional, Any
from .dijkstra import run_dijkstra
from .bellman_ford import run_bellman_ford, RouteResult

def calculate_chain_route(
    graph_nodes: Dict[int, dict],
    graph_edges: Dict[int, List[dict]],
    stop_node_ids: List[int],
    algorithm: str = "dijkstra",
    speed_kmh: float = 30.0
) -> Dict[str, Any]:
    """
    Traça a rota em cadeia ligando os pontos na ordem exata da fila:
    Ponto 0 (Origem) -> Ponto 1 -> Ponto 2 -> ... -> Ponto K.
    
    Para cada trecho:
      - Executa Dijkstra ou Bellman-Ford para achar o menor caminho entre paradas consecutivas.
      - Retorna a distância, o tempo do trecho (custo da entrega), e o caminho de nós.
      - Concatena o caminho completo para traçar uma rota contínua no mapa.
    """
    if len(stop_node_ids) < 2:
        return {
            "segments": [],
            "fullPath": stop_node_ids,
            "totalDistanceMeters": 0.0,
            "totalTravelMinutes": 0.0
        }

    segments = []
    full_path: List[int] = []
    total_distance_meters = 0.0
    total_travel_minutes = 0.0
    all_visited_edges = []

    for i in range(len(stop_node_ids) - 1):
        u_node = stop_node_ids[i]
        v_node = stop_node_ids[i + 1]

        # Executa o algoritmo escolhido para este segmento
        if algorithm == "bellman":
            seg_result: Optional[RouteResult] = run_bellman_ford(graph_nodes, graph_edges, u_node, v_node)
        else:
            seg_result: Optional[RouteResult] = run_dijkstra(graph_nodes, graph_edges, u_node, v_node)

        if seg_result is None or not seg_result.path:
            # Fallback se não houver caminho conexo estrito no grafo viário
            # Calcula distância euclidiana/haversine direta entre os nós
            u_coord = graph_nodes.get(u_node, {"lat": 0, "lon": 0})
            v_coord = graph_nodes.get(v_node, {"lat": 0, "lon": 0})
            
            # Estimativa de 1000m ou distância euclidiana aproximada
            dx = (u_coord.get("lon", 0) - v_coord.get("lon", 0)) * 111320
            dy = (u_coord.get("lat", 0) - v_coord.get("lat", 0)) * 110574
            approx_dist = max(500.0, (dx*dx + dy*dy)**0.5)
            
            seg_path = [u_node, v_node]
            seg_dist = approx_dist
            visited = []
        else:
            seg_path = seg_result.path
            seg_dist = seg_result.totalDistance
            visited = seg_result.visitedEdges

        # Evita duplicar o nó de conexão na rota contínua
        if not full_path:
            full_path.extend(seg_path)
        else:
            full_path.extend(seg_path[1:] if len(seg_path) > 1 else seg_path)

        seg_dist_km = seg_dist / 1000.0
        seg_duration_mins = round((seg_dist_km / max(1.0, speed_kmh)) * 60.0, 1)

        total_distance_meters += seg_dist
        total_travel_minutes += seg_duration_mins
        all_visited_edges.extend(visited[:1000])

        segments.append({
            "segmentIndex": i + 1,
            "fromNode": u_node,
            "toNode": v_node,
            "distanceMeters": round(seg_dist, 1),
            "distanceKm": round(seg_dist_km, 2),
            "durationMinutes": seg_duration_mins,
            "path": seg_path
        })

    return {
        "segments": segments,
        "fullPath": full_path,
        "totalDistanceMeters": round(total_distance_meters, 1),
        "totalDistanceKm": round(total_distance_meters / 1000.0, 2),
        "totalTravelMinutes": round(total_travel_minutes, 1),
        "visitedEdges": all_visited_edges
    }
