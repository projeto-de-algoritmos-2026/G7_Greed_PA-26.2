#Algoritmo do Caminhoneiro

from typing import Dict, List, Optional


def find_edge_distance(
    graph_edges: Dict[int, List[dict]],
    source: int,
    target: int
) -> Optional[float]:
    edges = graph_edges.get(source, [])

    for edge in edges:
        if int(edge["target"]) == target:
            return float(edge["distance"])

    return None

def run_selecting_breakpoints(
    graph_edges: Dict[int, List[dict]],
    path: List[int],
    capacity_meters: float
) -> dict:
    breakpoints = []

    distance_since_last_stop = 0.0
    total_distance = 0.0

    for i in range(len(path) - 1):
        current_node = path[i]
        next_node = path[i + 1]

        edge_distance = find_edge_distance(
            graph_edges,
            current_node,
            next_node
        )

        if edge_distance is None:
            return {
                "possible": False,
                "message": "No solution"
            }

        if edge_distance > capacity_meters:
            return {
                "possible": False,
                "message": "No solution"
            }

        if distance_since_last_stop + edge_distance > capacity_meters:
            breakpoints.append(current_node)
            distance_since_last_stop = 0.0

        distance_since_last_stop += edge_distance
        total_distance += edge_distance

    return {
        "possible": True,
        "breakpoints": breakpoints,
        "numberOfStops": len(breakpoints),
        "totalDistanceMeters": total_distance
    }