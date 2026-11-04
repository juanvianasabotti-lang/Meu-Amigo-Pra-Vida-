#!/usr/bin/env python3
"""Servidor local que imita o Vercel (cleanUrls + rewrites do vercel.json).

Uso:  python3 tools/devserver.py [porta]     → http://localhost:8080
"""
import http.server
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public"
CONFIG = json.loads((ROOT / "vercel.json").read_text(encoding="utf-8"))


def compile_rule(src: str):
    pattern = re.sub(r":(\w+)\*", r"(?P<\1>.*)", src)
    pattern = re.sub(r":(\w+)", r"(?P<\1>[^/]+)", pattern)
    return re.compile(f"^{pattern}$")


REWRITES = [(compile_rule(r["source"]), r["destination"]) for r in CONFIG.get("rewrites", [])]


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(PUBLIC), **kw)

    def translate(self):
        path, _, query = self.path.partition("?")
        for rx, dest in REWRITES:
            if rx.match(path):
                path = dest  # como no Vercel: o destino também passa pelas URLs limpas
                break
        if path != "/" and not pathlib.Path(path).suffix and (PUBLIC / f"{path.lstrip('/')}.html").exists():
            return f"{path}.html"
        if path == "/":
            return "/index.html"
        return path

    def do_GET(self):
        original = self.path
        target = self.translate()
        if not (PUBLIC / target.lstrip("/")).exists():
            self.path = "/404.html"
            self.send_response(404)
        else:
            self.path = target
        super().do_GET() if self.path != "/404.html" else self._send_404()
        self.path = original

    def _send_404(self):
        body = (PUBLIC / "404.html").read_bytes()
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    print(f"Meu Amigo pra Vida rodando em http://localhost:{port}")
    http.server.ThreadingHTTPServer(("", port), Handler).serve_forever()
