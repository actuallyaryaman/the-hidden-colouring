# The Hidden Colouring

A guided, interactive implementation of the classical zero-knowledge protocol
for graph three-colourability. Built for a nontechnical visitor and for a
SE6003 implementation project. The lesson is powered by Python, not a simulated
browser-only crypto engine.

## Start

Requirements: Python 3.10 or later. No third-party Python packages, Node packages,
accounts, internet access, or API keys are needed to run the application.

```sh
cd zero-knowledge-lab
python3 server.py
```

Open **http://127.0.0.1:8767**. Stop the server with Ctrl+C. To use another port:
`python3 server.py --port 8768`.

The browser files must be served by the Python application; opening index.html
as a file will not connect to the protocol. The server binds only to your own
computer. This is a teaching application, not a remotely hosted secure service.

## The six chapters

1. **The puzzle:** change colours and learn the constraint. A solution button
   prevents the lesson from becoming a puzzle-solving exercise.
2. **Seal the answers:** receive actual SHA-256 commitments; unopened values
   stay in the Python process.
3. **Ask a question:** pick one edge after commitment. Use uniform random
   selection when discussing probability guarantees.
4. **Open two answers:** check both commitments and unequal colours. Inspect
   full hashes and salts in the optional receipt.
5. **Repeat the test:** fresh permutations and commitments, a round transcript,
   and a carefully labelled false-acceptance bound.
6. **Break the rules:** compare an invalid colouring, a non-three-colourable
   graph (K4), and the privacy failure caused by reused commitments.

Use the chapter rail (or compact chapter selector on small screens) to revisit
an explanation. Direct chapter navigation starts a fresh illustrative session.
Following Next through chapters 2–5 preserves the same round.

## Verify

```sh
python3 -m unittest discover -s tests -v
python3 -m compileall -q protocol.py server.py experiments.py
```

Or `make check`, which also uses Node to syntax-check the browser JavaScript.
Node is only needed for this optional developer check, not for running the app.

## Experiments

```sh
python3 experiments.py --trials 1000 --rounds 1 2 5 10 20
```

Each configuration uses fresh independent runs. A run rejects at its first bad
round. Outputs in `results/`:

- `experiments.csv`: observations, exact strategy probabilities, 95% Wilson
  intervals, timings, transcript byte counts.
- `experiments.json`: the same results with runtime environment, time, and
  measurement definitions.
- `acceptance.svg`: observations with intervals and theoretical reference lines.

These are actual measurements, not invented UI statistics. Results will vary
with randomness and hardware. The SVG lines join theory values at the measured
round counts; they are not a fit to the observations. Timing includes JSON
serialisation; transcript bytes exclude HTTP and the teaching interface.

## Source map

- `protocol.py`: commitments, prover state machine, public verifier, graphs,
  and an honest-verifier transcript simulator.
- `server.py`: standard-library local server and session API.
- `web/`: responsive lesson, design tokens, and local fonts.
- `experiments.py`: experiment runner and export generation.
- `tests/`: protocol and local API checks.
- `package_submission.py`: source ZIP generation, excluding caches and binaries.

## What this project claims

The mathematical protocol illustrates completeness, soundness, and zero
knowledge. The concrete hash commitment is an educational instantiation with
explicit assumptions. Tests and empirical detection rates do not prove zero
knowledge. The simulator included here covers a uniformly random honest
verifier; the report must distinguish this from the full malicious-verifier
argument.

The graph and its small teaching witness are intentionally known. Zero knowledge
restricts what the interaction discloses; it does not prevent solving the public
puzzle independently. A local computer owner can inspect both parties.

Original course PDFs and the user-provided video remain in the parent directory.
No interpretation of the video is claimed; it was not used as an authoritative
protocol source.

## Protocol Lab

Open **http://127.0.0.1:8767/lab.html**, or select Protocol Lab from the lesson.

- Run `Session.seal`, `Session.challenge`, and `Session.open` one step at a time.
- Inspect actual public messages, compact UTF-8 byte counts, and the exact
  Python function source loaded from the implementation.
- Check the encoded opening input, recomputed SHA-256 digest and original seal.
- Alter a copy of a colour, salt, vertex identifier or commitment and invoke the
  same verifier. The original session and public record remain unchanged.
- Download a public transcript or import one to check it locally.

Verify a downloaded transcript without the server or a prover:

```sh
python3 transcript.py transcript.json
```

Exit code 0 means every recorded opening/check passed; exit code 1 means rejection
or invalid input. The output details individual checks. The file includes public
graph structure and completed rounds only, with no session credential, witness,
or unopened values. In-progress rounds are not exported.

**Transcript verification is not proof of challenge randomness.** A file can
contain valid arranged openings, including a simulator-produced record. The
checker cannot establish how a live verifier selected challenges. The lab can
continue independent checks after rejection for teaching; a real proof attempt
would reject immediately.

The old browser-only demonstration remains separate from this Python project.
All primary references are collected on the Sources page.

## Render hosting

`render.yaml` configures one Free Python web service in Singapore. Connect this
repository through **New > Blueprint** in Render, review the Free service, and
deploy. No database, API key, or third-party package is required.

The server remains local-only by default. Deployment explicitly uses
`python server.py --host 0.0.0.0` and reads Render's `PORT` environment variable.
`/healthz` is a lightweight deployment health check. Hosted sessions are cleared
on restart; the free service sleeps when idle. The hosted demo URL is public;
the GitHub repository can stay private.
