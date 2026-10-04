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
    if capacity_meters <= 0:
        return {
            "possible": False,
            "message": "Invalid capacity",
            "capacityMeters": capacity_meters
        }

    if len(path) <= 1:
        return {
            "possible": True,
            "breakpoints": [],
            "numberOfStops": 0,
            "totalDistanceMeters": 0.0,
            "capacityMeters": capacity_meters
        }

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
                "message": "No solution",
                "capacityMeters": capacity_meters
            }

        if edge_distance > capacity_meters:
            return {
                "possible": False,
                "message": "No solution",
                "capacityMeters": capacity_meters
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
        "totalDistanceMeters": round(total_distance, 2),
        "capacityMeters": capacity_meters
    }