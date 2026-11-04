#!/usr/bin/env python3
"""Monta as páginas HTML de public/ a partir de src/pages + src/partials.

Cada página em src/pages começa com um comentário de metadados:
  <!--meta title="..." description="..." script="home" body_class="..." robots="index,follow" -->

Uso:  python3 tools/build.py
"""
import hashlib
import html
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "src"
OUT = ROOT / "public"
SITE = "Meu Amigo pra Vida"

META_RE = re.compile(r"<!--meta\s+(.*?)-->", re.S)
ATTR_RE = re.compile(r'(\w+)="(.*?)"', re.S)
# <!--foto nome class="ratio-45" sizes="50vw" tag="Na rua" sub="calçadas e praças" pos="50% 30%" eager-->
FOTO_RE = re.compile(r"<!--foto\s+([a-z0-9-]+)(.*?)-->", re.S)
FOTOS_FILE = SRC / "data" / "fotos.json"


def load_fotos() -> dict:
    if not FOTOS_FILE.exists():
        return {}
    return json.loads(FOTOS_FILE.read_text(encoding="utf-8"))["fotos"]


def foto_html(name: str, fotos: dict, attrs: dict, eager: bool) -> str:
    """Figura com foto real, srcset, texto alternativo e crédito do autor."""
    f = fotos.get(name)
    if not f:
        raise KeyError(f"foto '{name}' não existe em src/data/fotos.json")
    esc = lambda s: html.escape(str(s), quote=True)  # noqa: E731
    base = f"/assets/img/fotos/{name}"
    cls = " ".join(filter(None, ["foto", attrs.get("class", "")]))
    sizes = attrs.get("sizes", "(max-width: 860px) 100vw, 50vw")
    pos = f' style="--pos: {esc(attrs["pos"])}"' if attrs.get("pos") else ""
    load = 'fetchpriority="high"' if eager else 'loading="lazy"'
    tag = ""
    if attrs.get("tag"):
        sub = f'<small>{esc(attrs["sub"])}</small>' if attrs.get("sub") else ""
        tag = f'\n  <p class="foto-tag" aria-hidden="true">{esc(attrs["tag"])}{sub}</p>'
    if attrs.get("variant") == "band":
        # item da faixa de fotos que corre: a altura é fixa, então a largura acompanha o formato
        wide = f["w"] >= f["h"]
        band_sizes = "(max-width: 760px) 330px, 500px" if wide else "(max-width: 760px) 140px, 230px"
        return (f'<figure class="pb-item{"" if wide else " is-tall"}">\n'
                f'  <img src="{base}-sm.webp" srcset="{base}-sm.webp {f["sw"]}w, {base}.webp {f["w"]}w" sizes="{band_sizes}" '
                f'width="{f["sw"]}" height="{f["sh"]}" alt="{esc(f["alt"])}" loading="lazy" decoding="async">{tag}\n'
                f'  <figcaption class="foto-credito">Foto: <a href="{esc(f["url"])}" target="_blank" rel="noopener noreferrer">{esc(f["autor"])}</a> / Unsplash</figcaption>\n'
                f'</figure>')
    return (f'<figure class="{esc(cls)}" data-photo>\n'
            f'  <img src="{base}.webp" srcset="{base}-sm.webp {f["sw"]}w, {base}.webp {f["w"]}w" sizes="{esc(sizes)}" '
            f'width="{f["w"]}" height="{f["h"]}" alt="{esc(f["alt"])}" {load} decoding="async"{pos}>{tag}\n'
            f'  <figcaption class="foto-credito">Foto: <a href="{esc(f["url"])}" target="_blank" rel="noopener noreferrer">{esc(f["autor"])}</a> / Unsplash</figcaption>\n'
            f'</figure>')


def creditos_html(fotos: dict) -> str:
    esc = lambda s: html.escape(str(s), quote=True)  # noqa: E731
    items = "\n".join(
        f'  <li><img src="/assets/img/fotos/{n}-sm.webp" alt="" width="56" height="56" loading="lazy" decoding="async">'
        f'<span>{esc(f["alt"])}. Foto: <a href="{esc(f["url"])}" target="_blank" rel="noopener noreferrer">{esc(f["autor"])}</a> / Unsplash</span></li>'
        for n, f in fotos.items())
    return f'<ul class="credits">\n{items}\n</ul>'


def expand_fotos(text: str, fotos: dict) -> str:
    def repl(m):
        rest = m.group(2)
        attrs = dict(ATTR_RE.findall(rest))
        eager = bool(re.search(r"\beager\b", re.sub(r'"[^"]*"', "", rest)))
        return foto_html(m.group(1), fotos, attrs, eager)
    text = FOTO_RE.sub(repl, text)
    return text.replace("<!--creditos-->", creditos_html(fotos))


def write_fotos_module(fotos: dict) -> None:
    """Gera assets/js/fotos.js com os mesmos dados, para as fotos montadas pelo JavaScript."""
    data = json.dumps(fotos, ensure_ascii=False, indent=1)
    js = ("// Gerado por tools/build.py a partir de src/data/fotos.json — não edite à mão.\n"
          f"export const FOTOS = {data};\n")
    target = OUT / "assets" / "js" / "fotos.js"
    if not target.exists() or target.read_text(encoding="utf-8") != js:
        target.write_text(js, encoding="utf-8")


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
    fotos = load_fotos()
    write_fotos_module(fotos)
    version = asset_version()
    count = 0
    for page in sorted((SRC / "pages").glob("*.html")):
        raw = page.read_text(encoding="utf-8")
        m = META_RE.search(raw)
        if not m:
            print(f"ERRO: {page.name} sem <!--meta -->", file=sys.stderr)
            return 1
        meta = dict(ATTR_RE.findall(m.group(1)))
        try:
            body = expand_fotos(raw[m.end():].strip("\n"), fotos)
        except KeyError as e:
            print(f"ERRO: {page.name}: {e}", file=sys.stderr)
            return 1
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
