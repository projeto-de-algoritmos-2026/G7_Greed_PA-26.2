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