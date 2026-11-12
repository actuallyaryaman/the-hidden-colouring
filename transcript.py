import argparse
import json
import sys
from pathlib import Path
from protocol import Graph, commit, encode_commitment, valid_colour, verify

FORMAT = 'hidden-colouring-transcript-v1'
LIMITATION = ('Checks validate recorded openings only. This file cannot establish '
              'that challenges were unpredictable, or prove the graph is colourable.')


def public_graph(data):
    if not isinstance(data, dict) or set(data) != {'vertices', 'edges'}:
        raise ValueError('Graph must contain only public vertices and edges')
    vertices, edges = data['vertices'], data['edges']
    if (not isinstance(vertices, list) or not 1 <= len(vertices) <= 200
            or any(not isinstance(v, str) or not v or len(v) > 100 for v in vertices)
            or len(set(vertices)) != len(vertices)):
        raise ValueError('Invalid vertex labels')
    if not isinstance(edges, list) or not 1 <= len(edges) <= 20000:
        raise ValueError('Invalid edge list')
    normalised = []
    for edge in edges:
        if (not isinstance(edge, (list, tuple)) or len(edge) != 2
                or any(type(v) is not int or not 0 <= v < len(vertices) for v in edge)
                or edge[0] == edge[1]):
            raise ValueError('Invalid edge endpoints')
        normalised.append(tuple(sorted(edge)))
    if len(set(normalised)) != len(normalised):
        raise ValueError('Duplicate edges')
    return Graph('Imported public graph', tuple(vertices), tuple(tuple(e) for e in edges), None)


def inspect_round(graph, record):
    if not isinstance(record, dict):
        return {'accepted': False, 'checks': [], 'error': 'Round must be an object'}
    hashes, edge, openings = record.get('commitments'), record.get('edge'), record.get('openings')
    verdict = verify(graph, hashes, edge, openings)
    checks, details = [], []
    valid_edge = type(edge) is int and 0 <= edge < len(graph.edges)
    checks.append({'name': 'Challenge names an existing edge', 'passed': valid_edge})
    valid_hashes = (isinstance(hashes, list) and len(hashes) == len(graph.vertices)
                    and all(isinstance(h, str) and len(h) == 64
                            and all(c in '0123456789abcdef' for c in h) for h in hashes))
    checks.append({'name': 'One SHA-256 commitment for every room', 'passed': valid_hashes})
    valid_endpoints = (valid_edge and isinstance(openings, list) and len(openings) == 2
                       and all(isinstance(o, dict) for o in openings)
                       and [o.get('vertex') for o in openings] == list(graph.edges[edge]))
    checks.append({'name': 'Only the challenged endpoints are opened', 'passed': valid_endpoints})
    if valid_endpoints and valid_hashes:
        for opening in openings:
            vertex = opening['vertex']
            try:
                encoded = encode_commitment(vertex, opening['colour'], opening['salt'])
                computed = commit(vertex, opening['colour'], opening['salt'])
                matches = computed == hashes[vertex]
                details.append({'vertex': vertex, 'room': graph.vertices[vertex],
                                'encoding': encoded.decode('ascii'), 'input_bytes': len(encoded),
                                'recomputed': computed, 'original': hashes[vertex], 'matches': matches})
            except (ValueError, TypeError, KeyError, IndexError):
                matches = False
            checks.append({'name': f'Opening for room {graph.vertices[vertex]} matches its commitment', 'passed': matches})
    colours_available = valid_endpoints and all(valid_colour(o.get('colour')) for o in openings)
    different = openings[0]['colour'] != openings[1]['colour'] if colours_available else None
    checks.append({'name': 'Endpoint colours differ', 'passed': different})
    return {**verdict, 'different_colours': different is True,
            'accepted': verdict['accepted'] and all(c['passed'] is True for c in checks),
            'checks': checks, 'openings': details}


def verify_transcript(document):
    try:
        if not isinstance(document, dict) or set(document) != {'format', 'graph', 'rounds'}:
            raise ValueError('Expected format, public graph, and rounds only')
        if document['format'] != FORMAT:
            raise ValueError('Unsupported transcript format')
        graph = public_graph(document['graph'])
        rounds = document['rounds']
        if not isinstance(rounds, list) or not 1 <= len(rounds) <= 1000:
            raise ValueError('Complete at least one round; maximum 1000 rounds')
        results = []
        allowed = {'round', 'commitments', 'edge', 'openings', 'challenge_kind'}
        for index, record in enumerate(rounds, 1):
            if not isinstance(record, dict) or set(record) != allowed or type(record['round']) is not int or record['round'] != index:
                raise ValueError('Rounds must be sequential and contain only public protocol fields')
            if record['challenge_kind'] not in ('manual', 'random'):
                raise ValueError('Unknown challenge annotation')
            if (not isinstance(record['openings'], list)
                    or any(not isinstance(o, dict) or set(o) != {'vertex', 'colour', 'salt'} for o in record['openings'])):
                raise ValueError('Openings may contain only vertex, colour and salt')
            results.append({'round': index, **inspect_round(graph, record)})
        return {'accepted': all(r['accepted'] for r in results), 'rounds': results,
                'limitation': LIMITATION}
    except (ValueError, TypeError, KeyError) as error:
        return {'accepted': False, 'rounds': [], 'error': str(error), 'limitation': LIMITATION}


def main():
    parser = argparse.ArgumentParser(description="Verify public transcripts without a prover, stored witness, or running server.")
    parser.add_argument('file', type=Path, help='Public transcript JSON')
    args = parser.parse_args()
    try:
        if args.file.stat().st_size > 4 * 1024 * 1024:
            raise ValueError('Transcript exceeds 4 MiB')
        result = verify_transcript(json.loads(args.file.read_text()))
    except (OSError, ValueError) as error:
        result = {'accepted': False, 'error': str(error), 'limitation': LIMITATION}
    print(json.dumps(result, indent=2))
    return 0 if result['accepted'] else 1


if __name__ == '__main__':
    sys.exit(main())
