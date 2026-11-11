
import argparse
import csv
import hashlib
import json
import math
import platform
import time
from datetime import datetime, timezone
from pathlib import Path
from protocol import GRAPHS, Session, bad_edges, colouring_for


def wilson(successes, total):
    z = 1.96; p = successes / total; denom = 1 + z*z/total
    centre = (p + z*z/(2*total)) / denom
    half = z * math.sqrt(p*(1-p)/total + z*z/(4*total*total)) / denom
    return max(0, centre-half), min(1, centre+half)


def encoded_bytes(value):
    return len(json.dumps(value, separators=(',', ':')).encode('utf-8'))


def run(trials, rounds_list):
    rows = []
    for name, graph_id, mode in [('honest', 'puzzle', 'honest'),
                                 ('bad_solution', 'puzzle', 'cheat'),
                                 ('false_claim_k4', 'impossible', 'cheat')]:
        graph = GRAPHS[graph_id]
        bad = len(bad_edges(graph, colouring_for(graph, mode)))
        for rounds in rounds_list:
            successes = total_bytes = total_rounds = 0
            started = time.perf_counter()
            for _ in range(trials):
                session = Session(graph_id, mode)
                accepted = True
                for _ in range(rounds):
                    session.seal(); session.challenge(); session.open()
                    total_bytes += encoded_bytes({'commitments': session.commitments})
                    total_bytes += encoded_bytes({'edge': session.edge})
                    total_bytes += encoded_bytes({'openings': session.openings})
                    total_rounds += 1
                    if not session.verdict['accepted']:
                        accepted = False
                        break
                    session.next_round()
                successes += accepted
            elapsed = time.perf_counter()-started
            lo, hi = wilson(successes, trials)
            rows.append(dict(scenario=name, vertices=len(graph.vertices), edges=len(graph.edges),
                             bad_edges=bad, rounds=rounds, trials=trials, accepted=successes,
                             observed_acceptance=successes/trials,
                             theory_acceptance=(1-bad/len(graph.edges))**rounds,
                             wilson95_low=lo, wilson95_high=hi,
                             elapsed_seconds=elapsed, mean_ms_per_run=1000*elapsed/trials,
                             mean_transcript_bytes=total_bytes/trials,
                             executed_rounds=total_rounds))
    return rows


def plot(rows, path):
    width, height = 760, 420
    left, top, pw, ph = 70, 45, 650, 300
    max_rounds = max(r['rounds'] for r in rows)
    x = lambda r: left + r/max_rounds*pw
    y = lambda p: top + (1-p)*ph
    parts = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}" role="img" aria-label="Measured and theoretical acceptance probability by number of rounds">',
             '<rect width="100%" height="100%" fill="#faf8f1"/>',
             '<g font-family="sans-serif" font-size="12" fill="#233a31">',
             '<text x="70" y="24" font-size="16">Acceptance probability across independent proof runs</text>']
    for p in [0, .25, .5, .75, 1]:
        parts += [f'<line x1="{left}" x2="{left+pw}" y1="{y(p)}" y2="{y(p)}" stroke="#d9d8cf"/>', f'<text x="58" y="{y(p)+4}" text-anchor="end">{p:.2f}</text>']
    for r in sorted({v['rounds'] for v in rows}):
        parts.append(f'<text x="{x(r)}" y="365" text-anchor="middle">{r}</text>')
    for index, (name, colour, label) in enumerate([('honest','#326351','Honest'),('bad_solution','#b85b37','Bad solution'),('false_claim_k4','#386780','False claim (K4)')]):
        data=[r for r in rows if r['scenario']==name]
        coords=' '.join(f'{x(r["rounds"])},{y(r["theory_acceptance"])}' for r in data)
        parts.append(f'<polyline points="{coords}" fill="none" stroke="{colour}" stroke-width="2"/>')
        for r in data:
            px=x(r['rounds']); py=y(r['observed_acceptance'])
            parts.append(f'<line x1="{px}" x2="{px}" y1="{y(r["wilson95_low"])}" y2="{y(r["wilson95_high"])}" stroke="{colour}"/>')
            parts.append(f'<circle cx="{px}" cy="{py}" r="4" fill="{colour}"/>')
        lx=70+index*205
        parts.append(f'<circle cx="{lx}" cy="400" r="4" fill="{colour}"/><text x="{lx+10}" y="404">{label}</text>')
    parts += ['<text x="395" y="385" text-anchor="middle">Maximum rounds per run</text>', '<text x="17" y="200" text-anchor="middle" transform="rotate(-90 17 200)">Acceptance probability</text>', '</g></svg>']
    path.write_text('\n'.join(parts))


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--trials', type=int, default=1000)
    parser.add_argument('--rounds', type=int, nargs='+', default=[1,2,5,10,20])
    parser.add_argument('--out', type=Path, default=Path('results'))
    args=parser.parse_args()
    if not 1 <= args.trials <= 100000 or any(not 1 <= r <= 1000 for r in args.rounds):
        parser.error('Trials must be 1–100000 and rounds 1–1000')
    args.out.mkdir(parents=True, exist_ok=True)
    rows=run(args.trials, sorted(set(args.rounds)))
    with (args.out/'experiments.csv').open('w', newline='') as f:
        writer=csv.DictWriter(f, fieldnames=list(rows[0]));writer.writeheader();writer.writerows(rows)
    meta={'generated_utc':datetime.now(timezone.utc).isoformat(), 'python':platform.python_version(),
          'platform':platform.platform(),
          'source_sha256':{name:hashlib.sha256((Path(__file__).resolve().parent/name).read_bytes()).hexdigest()
                           for name in ('protocol.py','experiments.py')}, 'trials_per_configuration':args.trials,
          'randomness':'OS-backed secrets; fresh independent proof runs',
          'measurement':'Wall time includes protocol, verification, public-evidence recording, and JSON serialisation. Bytes count compact application transcripts, not HTTP overhead. Runs stop at first rejection.',
          'intervals':'95% Wilson intervals for observed acceptance; lines are exact probabilities for the fixed strategies, not a proof for all adversaries.',
          'results':rows}
    (args.out/'experiments.json').write_text(json.dumps(meta, indent=2))
    plot(rows,args.out/'acceptance.svg')
    print(f'{len(rows)} configurations measured; results saved to {args.out.resolve()}')


if __name__=='__main__': main()
