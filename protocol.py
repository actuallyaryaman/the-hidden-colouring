




from __future__ import annotations

import hashlib
import hmac
import itertools
import json
import secrets
from dataclasses import dataclass

SALT_BYTES = 32


@dataclass(frozen=True)
class Graph:
    name: str
    vertices: tuple[str, ...]
    edges: tuple[tuple[int, int], ...]
    witness: tuple[int, ...] | None


GRAPHS = {
    "puzzle": Graph("The six-room puzzle", tuple("ABCDEF"),
                    ((0, 1), (1, 2), (2, 3), (3, 4), (4, 5), (5, 0),
                     (0, 2), (2, 4), (4, 0)), (0, 1, 2, 0, 1, 2)),
    "impossible": Graph("Four mutually connected rooms", tuple("ABCD"),
                        tuple(itertools.combinations(range(4), 2)), None),
}


def valid_colour(value):
    return type(value) is int and value in (0, 1, 2)


def commit(vertex: int, colour: int, salt: str) -> str:
    if not valid_colour(colour) or type(vertex) is not int or vertex < 0:
        raise ValueError("Invalid vertex or colour")
    if not isinstance(salt, str) or len(salt) != SALT_BYTES * 2:
        raise ValueError("Invalid salt")
    try:
        bytes.fromhex(salt)
    except ValueError as error:
        raise ValueError("Invalid salt") from error
    payload = json.dumps(["zk-colouring-v1", vertex, colour, salt], separators=(",", ":"))
    return hashlib.sha256(payload.encode("ascii")).hexdigest()


def bad_edges(graph: Graph, colouring) -> list[int]:
    if len(colouring) != len(graph.vertices) or not all(map(valid_colour, colouring)):
        raise ValueError("One of three colours is required for every vertex")
    return [i for i, (a, b) in enumerate(graph.edges) if colouring[a] == colouring[b]]


def colouring_for(graph: Graph, mode: str) -> tuple[int, ...]:
    if graph.witness is None:
        
        return (0, 1, 2, 0)
    colours = list(graph.witness)
    if mode == "cheat":
        colours[0] = 1  
    return tuple(colours)


def verify(graph: Graph, commitments, edge_index, openings) -> dict:

    failure = {"accepted": False, "commitments_valid": False,
               "different_colours": False}
    if type(edge_index) is not int or not 0 <= edge_index < len(graph.edges):
        return failure
    if not isinstance(commitments, (list, tuple)) or len(commitments) != len(graph.vertices) or not isinstance(openings, list):
        return failure
    if len(openings) != 2 or any(not isinstance(o, dict) for o in openings):
        return failure
    a, b = graph.edges[edge_index]
    if [o.get("vertex") for o in openings] != [a, b]:
        return failure
    try:
        matches = all(hmac.compare_digest(
            commit(o["vertex"], o["colour"], o["salt"]), commitments[o["vertex"]])
            for o in openings)
    except (KeyError, TypeError, ValueError, IndexError):
        return failure
    different = openings[0].get("colour") != openings[1].get("colour")
    return {"accepted": matches and different,
            "commitments_valid": matches, "different_colours": different}


class Session:


    def __init__(self, graph="puzzle", mode="honest"):
        if graph not in GRAPHS or mode not in ("honest", "cheat", "reuse"):
            raise ValueError("Unknown graph or mode")
        if graph == "impossible" and mode != "cheat":
            raise ValueError("The impossible graph has no honest prover")
        self.graph_id, self.graph, self.mode = graph, GRAPHS[graph], mode
        self.phase, self.round = "ready", 1
        self.colours, self.salts, self.commitments = [], [], []
        self.edge, self.openings, self.verdict = None, [], None
        self.visible, self.history = {}, []
        self.random_challenge = True

    def seal(self):
        if self.phase != "ready":
            raise ValueError("Start a new round before sealing again")
        if self.mode != "reuse" or not self.commitments:
            permutation = list(range(3))
            secrets.SystemRandom().shuffle(permutation)
            self.colours = [permutation[c] for c in colouring_for(self.graph, self.mode)]
            self.salts = [secrets.token_hex(SALT_BYTES) for _ in self.colours]
            self.commitments = [commit(i, c, self.salts[i]) for i, c in enumerate(self.colours)]
        self.phase = "sealed"

    def challenge(self, edge=None):
        if self.phase != "sealed":
            raise ValueError("Seal all answers before choosing one edge")
        if edge is not None and (type(edge) is not int or not 0 <= edge < len(self.graph.edges)):
            raise ValueError("Choose an existing edge")
        self.random_challenge = edge is None
        self.edge = secrets.randbelow(len(self.graph.edges)) if edge is None else edge
        self.phase = "challenged"

    def open(self):
        if self.phase != "challenged":
            raise ValueError("Choose a challenge before opening")
        self.openings = [{"vertex": v, "colour": self.colours[v], "salt": self.salts[v]}
                         for v in self.graph.edges[self.edge]]
        self.verdict = verify(self.graph, self.commitments, self.edge, self.openings)
        self.visible.update({str(o["vertex"]): o["colour"] for o in self.openings})
        self.history.append({"round": self.round, "edge": self.edge,
                             "random": self.random_challenge, **self.verdict})
        self.phase = "opened"

    def next_round(self):
        if self.phase != "opened":
            raise ValueError("Finish the check before starting a new round")
        self.round += 1
        self.phase, self.edge, self.openings, self.verdict = "ready", None, [], None
        if self.mode != "reuse":
            self.visible = {}
            self.commitments, self.colours, self.salts = [], [], []

    def public(self):
        
        graph = self.graph
        return {"graph": self.graph_id, "name": graph.name, "mode": self.mode,
                "vertices": list(graph.vertices), "edges": graph.edges,
                "phase": self.phase, "round": self.round,
                "commitments": list(self.commitments), "edge": self.edge,
                "openings": list(self.openings), "visible": dict(self.visible),
                "verdict": self.verdict, "history": list(self.history),
                "bad_count": len(bad_edges(graph, colouring_for(graph, self.mode)))}


def simulate_honest_verifier(graph: Graph):







    edge = secrets.randbelow(len(graph.edges))
    a, b = graph.edges[edge]
    pair = secrets.SystemRandom().sample(range(3), 2)
    colours = [0] * len(graph.vertices)
    colours[a], colours[b] = pair
    salts = [secrets.token_hex(SALT_BYTES) for _ in colours]
    commitments = [commit(i, c, salts[i]) for i, c in enumerate(colours)]
    openings = [{"vertex": v, "colour": colours[v], "salt": salts[v]} for v in (a, b)]
    return {"edge": edge, "commitments": commitments, "openings": openings,
            "verdict": verify(graph, commitments, edge, openings)}
