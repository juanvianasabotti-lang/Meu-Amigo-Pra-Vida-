#!/usr/bin/env python3
"""Monta as páginas HTML de public/ a partir de src/pages + src/partials.

Cada página em src/pages começa com um comentário de metadados:
  <!--meta title="..." description="..." script="home" body_class="..." robots="index,follow" -->

Uso:  python3 tools/build.py
"""
import hashlib
import html
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "src"
OUT = ROOT / "public"
SITE = "Meu Amigo pra Vida"

META_RE = re.compile(r"<!--meta\s+(.*?)-->", re.S)
ATTR_RE = re.compile(r'(\w+)="(.*?)"', re.S)


def asset_version() -> str:
    h = hashlib.sha1()
    for p in sorted((OUT / "assets").rglob("*")):
        if p.is_file() and p.suffix in {".css", ".js"}:
            h.update(p.read_bytes())
    return h.hexdigest()[:10]


def build() -> int:
    head = (SRC / "partials" / "head.html").read_text(encoding="utf-8")
    header = (SRC / "partials" / "header.html").read_text(encoding="utf-8")
    footer = (SRC / "partials" / "footer.html").read_text(encoding="utf-8")
    version = asset_version()
    count = 0
    for page in sorted((SRC / "pages").glob("*.html")):
        raw = page.read_text(encoding="utf-8")
        m = META_RE.search(raw)
        if not m:
            print(f"ERRO: {page.name} sem <!--meta -->", file=sys.stderr)
            return 1
        meta = dict(ATTR_RE.findall(m.group(1)))
        body = raw[m.end():].strip("\n")
        title = meta.get("title", SITE)
        full_title = title if SITE in title else f"{title} · {SITE}"
        script = meta.get("script")
        # Módulos JS sem ?v= (os imports internos não têm versão; o cache é revalidado via cabeçalhos)
        script_tag = (f'<script type="module" src="/assets/js/pages/{script}.js"></script>'
                      if script else '<script type="module" src="/assets/js/app.js"></script>')
        values = {
            "title": html.escape(full_title, quote=True),
            "description": html.escape(meta.get("description", "Adoção, doação e conscientização de cães e gatos."), quote=True),
            "robots": meta.get("robots", "index,follow"),
            "body_class": meta.get("body_class", ""),
            "script_tag": script_tag,
            "version": version,
        }
        out = head
        for k, v in values.items():
            out = out.replace("{{" + k + "}}", v)
        bare = meta.get("layout") == "bare"
        out += ("" if bare else header) + body + "\n" + (footer if not bare else "</main>\n</body>\n</html>\n")
        if "{{" in out:
            left = re.findall(r"\{\{\w+\}\}", out)
            print(f"ERRO: {page.name} com marcadores não substituídos: {left}", file=sys.stderr)
            return 1
        (OUT / page.name).write_text(out, encoding="utf-8")
        count += 1
    print(f"{count} páginas geradas em public/ (versão dos assets {version})")
    return 0


if __name__ == "__main__":
    sys.exit(build())
