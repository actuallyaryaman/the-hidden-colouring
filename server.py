
import argparse
import json
import secrets
import threading
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from protocol import Session

ROOT = Path(__file__).resolve().parent / "web"
SESSIONS = {}
LOCK = threading.Lock()
TTL = 3600


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def translate_path(self, path):
        allowed = {"/evidence/acceptance.svg", "/evidence/experiments.csv", "/evidence/experiments.json"}
        if path in allowed:
            return str(ROOT.parent / "results" / path.rsplit("/", 1)[1])
        return super().translate_path(path)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'")
        super().end_headers()

    def respond(self, code, value):
        encoded = json.dumps(value).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def do_POST(self):
        if self.path != "/api/protocol":
            self.respond(404, {"error": "Unknown endpoint"})
            return
        
        if self.headers.get("Sec-Fetch-Site") == "cross-site":
            self.respond(403, {"error": "Use the local lesson page"})
            return
        try:
            length = int(self.headers.get("Content-Length", 0))
            if not 0 < length <= 8192:
                raise ValueError("Invalid request size")
            data = json.loads(self.rfile.read(length))
            if not isinstance(data, dict):
                raise ValueError("Expected an object")
            with LOCK:
                now = time.monotonic()
                for key in list(SESSIONS):
                    if now - SESSIONS[key][1] > TTL:
                        del SESSIONS[key]
                if data.get("action") == "create":
                    if len(SESSIONS) >= 128:
                        raise ValueError("Too many sessions; restart the local server")
                    token = secrets.token_urlsafe(24)
                    session = Session(data.get("graph", "puzzle"), data.get("mode", "honest"))
                else:
                    token = data.get("session")
                    if not isinstance(token, str) or token not in SESSIONS:
                        raise ValueError("Session expired. Restart this lesson.")
                    session = SESSIONS[token][0]
                    action = data.get("action")
                    if action == "seal": session.seal()
                    elif action == "challenge": session.challenge(data.get("edge"))
                    elif action == "open": session.open()
                    elif action == "next": session.next_round()
                    else: raise ValueError("Unknown action")
                SESSIONS[token] = (session, now)
                payload = {"session": token, **session.public()}
            self.respond(200, payload)
        except (ValueError, TypeError) as error:
            self.respond(400, {"error": str(error)})

    def log_message(self, fmt, *args):
        pass


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8767)
    args = parser.parse_args()
    server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    print(f"The Hidden Colouring · http://127.0.0.1:{args.port}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
