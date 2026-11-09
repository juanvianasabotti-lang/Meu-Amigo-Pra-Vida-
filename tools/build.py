#!/usr/bin/env python3
"""Monta as páginas HTML de public/ a partir de src/pages + src/partials.

Cada página em src/pages começa com um comentário de metadados:
  <!--meta title="..." description="..." script="home" body_class="..." robots="index,follow" -->

Além das páginas, gera para buscadores e assistentes de IA:
- dados estruturados (WebSite e Organization em todas as páginas; Article e BreadcrumbList nos artigos);
- link canônico e og:url nas páginas públicas;
- uma página estática por artigo do blog (/blog/<slug>), com o texto já no HTML inicial,
  e a lista de artigos dentro de /blog (lidos do Supabase; se a leitura falhar, o build segue
  e os artigos ficam só na versão dinâmica);
- sitemap.xml.
Teste offline dos artigos:  BLOG_JSON_FILE=/caminho/posts.json python3 tools/build.py

Uso:  python3 tools/build.py      (Python 3.9 ou mais novo)
"""
import hashlib
import html
import json
import os
import pathlib
import re
import sys
import urllib.parse
import urllib.request
from xml.sax.saxutils import escape as xml_escape

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "src"
OUT = ROOT / "public"
SITE = "Meu Amigo pra Vida"

META_RE = re.compile(r"<!--meta\s+(.*?)-->", re.S)
ATTR_RE = re.compile(r'(\w+)="(.*?)"', re.S)

# ---- SEO --------------------------------------------------------------------
SITE_URL = "https://www.meuamigopravida.com.br"  # domínio oficial: altere só aqui
ALT_NAMES = ["Meu Amigo Pra Vida", "Meu Amigo para Vida", "Amigo pra Vida"]
SOCIAL = ["https://www.instagram.com/meuamigopravida"]
DESCRIPTION = ("Plataforma de adoção e doação de cães e gatos que conecta pessoas a ONGs e protetores "
               "verificados e a empresas do setor pet.")
# Páginas públicas: recebem link canônico e entram no sitemap
PUBLIC_PAGES = {"index", "adote", "doar", "ongs", "parceiros", "eventos", "blog", "sobre", "contato",
                "privacidade", "termos", "links"}
# Páginas de entrada que tocam a abertura animada do logo (uma vez por sessão; veja intro-gate.js).
# Artigos, animais, ONGs e eventos ficam de fora: são os links que chegam pelos buscadores.
INTRO_PAGES = {"index", "adote", "doar", "ongs", "parceiros", "eventos", "blog", "sobre", "links"}
PETS = ["boiadeiro", "chihuahua", "gato-himalaio", "gato-laranja", "gato-preto-branco", "gato-rajado", "golden", "labrador"]
COVER_PETS = ["golden", "gato-rajado", "boiadeiro", "gato-laranja", "labrador", "gato-himalaio", "chihuahua", "gato-preto-branco"]
CATEGORY_COLORS = {"laranja", "azul", "rosa", "amarelo"}
MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto",
         "setembro", "outubro", "novembro", "dezembro"]
MESES_CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"]
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


def esc(v) -> str:
    return html.escape("" if v is None else str(v), quote=True)


def page_path(name: str) -> str:
    return "/" if name == "index" else "/" + name


def json_ld(obj) -> str:
    # "<", ">" e "&" viram < etc.: o texto nunca abre nem fecha tags dentro do <script>
    return (json.dumps(obj, ensure_ascii=False)
            .replace("<", "\\u003c").replace(">", "\\u003e").replace("&", "\\u0026"))


def global_jsonld() -> str:
    org = {
        "@context": "https://schema.org", "@type": "Organization", "@id": SITE_URL + "/#organizacao",
        "name": SITE, "alternateName": ALT_NAMES, "url": SITE_URL + "/",
        "logo": SITE_URL + "/assets/img/logo-512.png", "image": SITE_URL + "/assets/img/og-image.jpg",
        "description": DESCRIPTION, "sameAs": SOCIAL,
    }
    site = {
        "@context": "https://schema.org", "@type": "WebSite", "@id": SITE_URL + "/#site",
        "name": SITE, "alternateName": ALT_NAMES, "url": SITE_URL + "/", "inLanguage": "pt-BR",
        "description": DESCRIPTION, "publisher": {"@id": SITE_URL + "/#organizacao"},
    }
    return json_ld([org, site])


def fill(template: str, values: dict) -> str:
    out = template
    for k, v in values.items():
        out = out.replace("{{" + k + "}}", v)
    return out


def seed_pick(seed: str, items: list, start: int, n: int = 0) -> str:
    """Mesma escolha determinística do JavaScript ([...seed].reduce((h, c) => (h * 31 + c) >>> 0, start))."""
    h = start
    for ch in seed or "":
        h = (h * 31 + ord(ch)) & 0xFFFFFFFF
    return items[(h + n) % len(items)]


def load_config() -> dict:
    text = (OUT / "assets" / "js" / "config.js").read_text(encoding="utf-8")
    return dict(re.findall(r'(SUPABASE_URL|SUPABASE_ANON_KEY):\s*"([^"]+)"', text))


def supabase_get(table: str, params: dict):
    """Leitura pública do Supabase (só o que as regras RLS liberam para visitantes)."""
    cfg = load_config()
    req = urllib.request.Request(cfg["SUPABASE_URL"] + "/rest/v1/" + table + "?" + urllib.parse.urlencode(params), headers={
        "apikey": cfg["SUPABASE_ANON_KEY"],  # chave publicável: vai só no apikey (não é um JWT)
        "Accept": "application/json",
        "User-Agent": "meu-amigo-pra-vida-build/1.0",
    })
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read().decode("utf-8"))


def load_posts():
    """Artigos publicados (status publicado). Se a leitura falhar, devolve None e o build segue."""
    local = os.environ.get("BLOG_JSON_FILE")
    try:
        if local:
            data = json.loads(pathlib.Path(local).read_text(encoding="utf-8"))
        else:
            data = supabase_get("blog_posts", {
                "select": "slug,title,excerpt,content_md,cover_url,cover_alt,published_at,updated_at,"
                          "reading_minutes,tags,blog_categories(name,slug,color)",
                "status": "eq.publicado",
                "order": "published_at.desc",
            })
        return [p for p in data if p.get("slug") and p.get("title") and p.get("published_at")
                and re.match(r"^[a-z0-9-]+$", p["slug"])]
    except Exception as e:  # os artigos ficam só na versão dinâmica (/blog/:slug -> artigo.html)
        print("AVISO: artigos NÃO lidos do Supabase (%s): /blog/<slug> fica sem versão estática neste deploy" % e, file=sys.stderr)
        return None


def load_legal():
    """Versão publicada mais recente de cada documento legal: {kind: {...}}."""
    local = os.environ.get("LEGAL_JSON_FILE")
    try:
        if local:
            data = json.loads(pathlib.Path(local).read_text(encoding="utf-8"))
        else:
            data = supabase_get("legal_documents", {
                "select": "kind,title,version,content_md,published_at",
                "published_at": "not.is.null",
                "order": "published_at.desc",
            })
        docs = {}
        for d in data:
            if d.get("kind") and d.get("content_md") and d["kind"] not in docs:
                docs[d["kind"]] = d
        return docs
    except Exception as e:
        print("AVISO: documentos legais NÃO lidos (%s): /privacidade e /termos seguem dinâmicos" % e, file=sys.stderr)
        return {}


# ---- Markdown -> HTML: mesmas regras de public/assets/js/ui.js (markdown e inline) ----
SAFE_MEDIA = re.compile(r"^/assets/[\w\-./]+$")


def md_media(path: str) -> str:
    return path if path and SAFE_MEDIA.match(path) and ".." not in path else ""


def cover_src(u: str) -> str:
    """Capa de artigo aceita: arquivo do site (/assets/...) ou o bucket público blog-media do projeto."""
    u = (u or "").strip()
    if md_media(u):
        return u
    try:
        base = re.escape(load_config()["SUPABASE_URL"]) + r"/storage/v1/object/public/blog-media/[\w\-./%]+"
    except Exception:
        return ""
    return u if re.match("^" + base + "$", u) and ".." not in u else ""


def abs_url(u: str) -> str:
    return u if u.startswith("http") else SITE_URL + u


def cut_words(text: str, limit: int = 160) -> str:
    text = re.sub(r"\s+", " ", (text or "").strip())
    if len(text) <= limit:
        return text
    return text[: limit - 1].rsplit(" ", 1)[0].rstrip(",.;:") + "…"


def md_safe_url(u: str) -> str:
    u = (u or "").strip()
    if re.match(r"^https?://", u, re.I) or u.startswith("#") or u.startswith("mailto:") or u.startswith("tel:"):
        return u
    if u.startswith("/") and not u.startswith("//") and not u.startswith("/\\"):
        return u
    return "#"


def md_inline(md: str) -> str:
    s = esc(md)
    s = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", s)
    s = re.sub(r"(^|[^*])\*(?!\s)(.+?)\*(?!\*)", r"\1<em>\2</em>", s)
    s = re.sub(r"`([^`]+)`", r"<code>\1</code>", s)

    def link(m):
        u = md_safe_url(m.group(2).replace("&amp;", "&"))
        ext = bool(re.match(r"^https?:", u, re.I))
        extra = ' target="_blank" rel="noopener noreferrer"' if ext else ""
        return '<a href="%s"%s>%s</a>' % (esc(u), extra, m.group(1))
    return re.sub(r"\[([^\]]+)\]\(([^)\s]+)\)", link, s)


def md_to_html(md: str) -> str:
    lines = (md or "").replace("\r\n", "\n").replace("\r", "\n").split("\n")
    out, i = [], 0
    while i < len(lines):
        line = lines[i]
        if not line.strip():
            i += 1
            continue
        m = re.match(r"^(#{2,4})\s+(.*)$", line)
        if m:
            n = len(m.group(1))
            out.append("<h%d>%s</h%d>" % (n, md_inline(m.group(2)), n))
            i += 1
            continue
        if re.match(r"^---+\s*$", line):
            out.append("<hr>")
            i += 1
            continue
        m = re.match(r"^!video\[([^\]]*)\]\(([^)\s|]+)(?:\|([^)\s]+))?\)\s*$", line)
        if m:
            src, poster = md_media(m.group(2)), md_media(m.group(3) or "")
            if src.lower().endswith(".mp4"):
                cap = esc(m.group(1))
                p_attr = ' poster="%s"' % esc(poster) if poster else ""
                out.append('<figure class="prose-fig prose-video"><video muted loop playsinline controls preload="none"%s aria-label="%s">'
                           '<source src="%s" type="video/mp4"><source src="%s" type="video/webm"></video><figcaption>%s</figcaption></figure>'
                           % (p_attr, cap, esc(src), esc(src[:-4] + ".webm"), cap))
            i += 1
            continue
        m = re.match(r"^!\[([^\]]*)\]\(([^)\s]+)\)\s*$", line)
        if m:
            src = md_media(m.group(2))
            if src:
                cap = esc(m.group(1))
                out.append('<figure class="prose-fig"><img src="%s" alt="%s" loading="lazy" decoding="async"><figcaption>%s</figcaption></figure>'
                           % (esc(src), cap, cap))
            i += 1
            continue
        if re.match(r"^>\s?", line):
            buf = []
            while i < len(lines) and re.match(r"^>\s?", lines[i]):
                buf.append(re.sub(r"^>\s?", "", lines[i]))
                i += 1
            out.append("<blockquote><p>%s</p></blockquote>" % md_inline(" ".join(buf)))
            continue
        if re.match(r"^\s*[-*]\s+", line):
            items = []
            while i < len(lines) and re.match(r"^\s*[-*]\s+", lines[i]):
                items.append("<li>%s</li>" % md_inline(re.sub(r"^\s*[-*]\s+", "", lines[i])))
                i += 1
            out.append("<ul>%s</ul>" % "".join(items))
            continue
        if re.match(r"^\s*\d+[.)]\s+", line):
            items = []
            while i < len(lines) and re.match(r"^\s*\d+[.)]\s+", lines[i]):
                items.append("<li>%s</li>" % md_inline(re.sub(r"^\s*\d+[.)]\s+", "", lines[i])))
                i += 1
            out.append("<ol>%s</ol>" % "".join(items))
            continue
        if re.match(r"^\|.*\|\s*$", line):
            rows = []
            while i < len(lines) and re.match(r"^\|.*\|\s*$", lines[i]):
                rows.append(lines[i])
                i += 1

            def cells(r):
                return [c.strip() for c in re.sub(r"^\||\|$", "", r.strip()).split("|")]
            body = rows[2:] if len(rows) > 1 and re.match(r"^[\s|:-]+$", rows[1]) else rows[1:]
            out.append("<table><thead><tr>%s</tr></thead><tbody>%s</tbody></table>" % (
                "".join("<th>%s</th>" % md_inline(c) for c in cells(rows[0])),
                "".join("<tr>%s</tr>" % "".join("<td>%s</td>" % md_inline(c) for c in cells(r)) for r in body)))
            continue
        buf = []
        while i < len(lines) and lines[i].strip() and not re.match(r"^(#{2,4}\s|>|\s*[-*]\s|\s*\d+[.)]\s|\||---)", lines[i]):
            buf.append(lines[i])
            i += 1
        if buf:
            out.append("<p>%s</p>" % md_inline(" ".join(buf)))
        else:
            i += 1
    return "\n".join(out)


def iso_day(iso: str) -> tuple:
    """Dia no fuso de Brasília a partir de um timestamp ISO (ex.: 2026-11-03T01:30:00+00:00)."""
    import datetime as dt
    m = re.match(r"(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?", iso or "")
    if not m:
        raise ValueError("data inválida: %r" % iso)
    y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
    if m.group(4) is None:
        return y, mo, d
    t = dt.datetime(y, mo, d, int(m.group(4)), int(m.group(5)))
    off = m.group(6) or "Z"
    if off != "Z":
        sign = 1 if off[0] == "+" else -1
        hh, mm = int(off[1:3]), int(off[-2:])
        t -= sign * dt.timedelta(hours=hh, minutes=mm)
    t -= dt.timedelta(hours=3)
    return t.year, t.month, t.day


def fmt_long(iso: str) -> str:
    y, m, d = iso_day(iso)
    return "%d de %s de %d" % (d, MESES[m - 1], y)


def fmt_short(iso: str) -> str:
    y, m, d = iso_day(iso)
    return "%02d %s %d" % (d, MESES_CURTOS[m - 1], y)


def article_page(p: dict, head: str, header: str, footer: str, base_values: dict) -> str:
    """Versão estática de /blog/<slug>: o mesmo desenho que publico.js monta, com o texto no HTML inicial."""
    slug = p["slug"]
    url = SITE_URL + "/blog/" + slug
    cat = p.get("blog_categories") or {}
    color = cat.get("color") if cat.get("color") in CATEGORY_COLORS else "laranja"
    cover = cover_src(p.get("cover_url") or "")
    hero = cover or "/assets/img/animais/%s.webp" % seed_pick(slug, PETS, 7)
    share_img = abs_url(cover or "/assets/img/og-image.jpg")
    article = {
        "@context": "https://schema.org", "@type": "Article",
        "headline": p["title"], "description": p.get("excerpt") or "", "image": [share_img],
        "datePublished": p["published_at"], "dateModified": p.get("updated_at") or p["published_at"],
        "author": {"@type": "Organization", "name": SITE, "url": SITE_URL + "/"},
        "publisher": {"@id": SITE_URL + "/#organizacao"},
        "mainEntityOfPage": url, "inLanguage": "pt-BR",
    }
    if p.get("tags"):
        article["keywords"] = ", ".join(p["tags"])
    if cat.get("name"):
        article["articleSection"] = cat["name"]
    crumbs = {
        "@context": "https://schema.org", "@type": "BreadcrumbList",
        "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "Início", "item": SITE_URL + "/"},
            {"@type": "ListItem", "position": 2, "name": "Conscientização", "item": SITE_URL + "/blog"},
            {"@type": "ListItem", "position": 3, "name": p["title"], "item": url},
        ],
    }
    values = dict(base_values)
    values.update({
        "title": esc("%s · %s" % (p["title"], SITE)),
        "description": esc(cut_words(p.get("excerpt") or "")),
        "robots": "index,follow", "body_class": "",
        "script_tag": '<script type="module" src="/assets/js/pages/publico.js"></script>',
        "canonical_tag": '<link rel="canonical" href="%s">' % esc(url),
        "og_url_tag": '<meta property="og:url" content="%s">' % esc(url),
        "og_type": "article", "og_image": esc(share_img),
        "extra_head": ('<meta property="article:published_time" content="%s">\n'
                       '  <script type="application/ld+json">%s</script>\n'
                       '  <script type="application/ld+json">%s</script>') % (esc(p["published_at"]), json_ld(article), json_ld(crumbs)),
        "intro_gate": '<script src="/assets/js/intro-gate.js"></script>',
    })
    kicker = ('<p class="art-kicker"><a href="/blog?categoria=%s">%s</a></p>' % (esc(cat.get("slug")), esc(cat.get("name")))) if cat.get("name") else ""
    tags = "".join('<span class="chip chip-soft">#%s</span>' % esc(t) for t in (p.get("tags") or []))
    body = ('<article class="container-narrow section" data-page="artigo" style="padding-top:24px"><div data-post>\n'
            '<header class="art-hero cat-%(color)s">\n<div class="art-hero-copy">\n<a class="link small" href="/blog">← Conscientização</a>\n%(kicker)s\n'
            '<h1>%(title)s</h1>\n<p class="art-deck">%(deck)s</p>\n<p class="art-byline"><span>%(date)s</span><span>%(min)s min de leitura</span></p>\n</div>\n'
            '<figure class="art-hero-media"><img src="%(hero)s" alt="%(alt)s"></figure>\n</header>\n'
            '<div class="art-layout">\n<article class="art-main prose article-body">\n%(content)s\n</article>\n'
            '<aside class="art-side"><div class="art-cta-card"><img src="/assets/img/animais/%(pet)s.webp" alt="">'
            '<h2>Um amigo está esperando por você</h2><p>Veja quem está pronto para ir para casa e envie seu pedido de adoção em poucos minutos.</p>'
            '<a class="btn btn-laranja btn-block" href="/adote">Quero adotar <span class="arrow">→</span></a>'
            '<a class="link small" href="/doar">Ou doe um animal ou ajude uma ONG</a></div></aside>\n</div>\n'
            '%(tags)s\n</div></article>\n'
            '<section class="container section hidden" data-more-wrap style="padding-top:0"><h2 class="h2 mb-3">Continue lendo</h2>'
            '<div class="grid grid-3" data-more></div></section>\n') % {
        "color": color, "kicker": kicker, "title": esc(p["title"]), "deck": esc(p.get("excerpt")),
        "date": fmt_long(p["published_at"]), "min": esc(p.get("reading_minutes") or ""),
        "hero": esc(hero), "alt": esc(p.get("cover_alt")) if cover else "",
        "content": md_to_html(p.get("content_md") or ""), "pet": seed_pick(slug, PETS, 7, 3),
        "tags": ('<div class="chips art-tags">%s</div>' % tags) if tags else "",
    }
    top = fill(head, values)
    left = re.findall(r"\{\{\w+\}\}", top)
    if left:
        raise ValueError("marcadores não substituídos: %s" % left)
    return top + header + body + "\n" + footer


def blog_cards(posts: list) -> str:
    """Lista de artigos no HTML inicial de /blog (o mesmo cartão de components.js)."""
    cards = []
    for p in posts:
        cat = p.get("blog_categories") or {}
        color = cat.get("color") if cat.get("color") in CATEGORY_COLORS else "laranja"
        cover = cover_src(p.get("cover_url") or "")
        img = ('<img src="%s" alt="%s" loading="lazy">' % (esc(cover), esc(p.get("cover_alt"))) if cover else
               '<img class="post-pet" src="/assets/img/animais/%s.webp" alt="" loading="lazy">' % seed_pick(p["slug"], COVER_PETS, 7))
        chip = ('<span class="chip chip-soft" style="align-self:flex-start">%s</span>' % esc(cat.get("name"))) if cat.get("name") else ""
        cards.append('<a class="post-card cat-%s" href="/blog/%s"><div class="post-cover">%s</div><div class="post-body">%s'
                     '<h3>%s</h3><p>%s</p><div class="post-foot"><span>%s</span><span>·</span><span>%s min de leitura</span></div></div></a>'
                     % (color, esc(p["slug"]), img, chip, esc(p["title"]), esc(p.get("excerpt")), fmt_short(p["published_at"]),
                        esc(p.get("reading_minutes") or "")))
    return "\n".join(cards)


def build_robots() -> None:
    (OUT / "robots.txt").write_text(
        "# Meu Amigo pra Vida\n"
        "# Buscadores e assistentes de IA podem ler todo o site. Páginas de conta, painel,\n"
        "# login e cadastro ficam fora dos resultados com a meta robots noindex (por isso não\n"
        "# são bloqueadas aqui: o buscador precisa abri-las para ler o noindex).\n"
        "User-agent: *\nAllow: /\n\nSitemap: %s/sitemap.xml\n" % SITE_URL, encoding="utf-8")


def build_llms(posts) -> None:
    """llms.txt (https://llmstxt.org) a partir de src/static/llms.txt, com o domínio e a lista de artigos."""
    tpl = (SRC / "static" / "llms.txt").read_text(encoding="utf-8")
    if posts:
        items = "\n".join("- [%s](%s/blog/%s): %s" % (p["title"], SITE_URL, p["slug"], cut_words(p.get("excerpt") or "", 140))
                           for p in posts)
    else:
        items = "- [Conscientização](%s/blog): todos os artigos do blog." % SITE_URL
    (OUT / "llms.txt").write_text(tpl.replace("{{site_url}}", SITE_URL).replace("{{artigos}}", items), encoding="utf-8")


def legal_html(d: dict) -> str:
    return ('<span class="eyebrow">Versão %s</span><h1 class="h1">%s</h1><div class="prose mt-3">%s</div>'
            % (esc(d.get("version")), esc(d.get("title")), md_to_html(d.get("content_md") or "")))


def build_sitemap(static_names: list, posts) -> None:
    urls = ["  <url><loc>%s</loc></url>" % xml_escape(SITE_URL + page_path(n)) for n in sorted(static_names)]
    for p in posts or []:
        lastmod = (p.get("updated_at") or p["published_at"])[:10]
        urls.append("  <url><loc>%s</loc><lastmod>%s</lastmod></url>" % (xml_escape(SITE_URL + "/blog/" + p["slug"]), lastmod))
    xml = ('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
           + "\n".join(urls) + "\n</urlset>\n")
    (OUT / "sitemap.xml").write_text(xml, encoding="utf-8")


def build() -> int:
    head = (SRC / "partials" / "head.html").read_text(encoding="utf-8")
    header = (SRC / "partials" / "header.html").read_text(encoding="utf-8")
    footer = (SRC / "partials" / "footer.html").read_text(encoding="utf-8")
    intro_html = (SRC / "partials" / "intro.html").read_text(encoding="utf-8")
    fotos = load_fotos()
    write_fotos_module(fotos)
    version = asset_version()
    count = 0
    static_names = []
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
        name = page.stem
        robots = meta.get("robots", "index,follow")
        indexable = robots.startswith("index") and name in PUBLIC_PAGES
        if indexable:
            static_names.append(name)
        url = SITE_URL + page_path(name)
        intro = name in INTRO_PAGES
        body_class = meta.get("body_class", "")
        if intro and "lt-has-intro" not in body_class.split():
            body_class = (body_class + " lt-has-intro").strip()
        values = {
            "title": html.escape(full_title, quote=True),
            "description": html.escape(meta.get("description", "Adoção, doação e conscientização de cães e gatos."), quote=True),
            "robots": robots,
            "body_class": body_class,
            "script_tag": script_tag,
            "version": version,
            "canonical_tag": '<link rel="canonical" href="%s">' % url if indexable else "",
            "og_url_tag": '<meta property="og:url" content="%s">' % url if indexable else "",
            "og_type": "website",
            "og_image": SITE_URL + "/assets/img/og-image.jpg",
            "extra_head": "",
            "jsonld": global_jsonld(),
            # o portão roda em todas as páginas: marca a sessão e só libera a abertura nas páginas de entrada
            "intro_gate": ('<script src="/assets/js/intro-gate.js" data-intro></script>' if intro
                           else '<script src="/assets/js/intro-gate.js"></script>'),
        }
        out = fill(head, values)
        bare = meta.get("layout") == "bare"
        # páginas "bare" (como /links) trazem a própria abertura no corpo
        opening = intro_html if (intro and not bare) else ""
        out += opening + ("" if bare else header) + body + "\n" + (footer if not bare else "</main>\n</body>\n</html>\n")
        if "{{" in out:
            left = re.findall(r"\{\{\w+\}\}", out)
            print(f"ERRO: {page.name} com marcadores não substituídos: {left}", file=sys.stderr)
            return 1
        (OUT / page.name).write_text(out, encoding="utf-8")
        count += 1

    legal = load_legal()
    for page_name, kind in (("privacidade", "politica_privacidade"), ("termos", "termos_uso")):
        d = legal.get(kind)
        target = OUT / (page_name + ".html")
        loader = '<div data-legal><div class="loading-page"><span class="spinner" aria-label="Carregando"></span></div></div>'
        text = target.read_text(encoding="utf-8")
        if d and loader in text:
            target.write_text(text.replace(loader, "<div data-legal>%s</div>" % legal_html(d), 1), encoding="utf-8")

    posts = load_posts()
    blog_dir = OUT / "blog"
    if posts is not None:
        base_values = {"version": version, "jsonld": global_jsonld()}
        made = []
        blog_dir.mkdir(exist_ok=True)
        for old in blog_dir.glob("*.html"):  # artigo despublicado não pode sobrar de um build anterior
            old.unlink()
        for p in posts:
            try:
                (blog_dir / (p["slug"] + ".html")).write_text(article_page(p, head, header, footer, base_values), encoding="utf-8")
                made.append(p)
            except Exception as e:  # um artigo com problema não derruba o build
                print("AVISO: artigo %s sem versão estática (%s)" % (p.get("slug"), e), file=sys.stderr)
        marker = '<div class="grid grid-3" data-list="blog"></div>'
        blog_path = OUT / "blog.html"
        blog_html = blog_path.read_text(encoding="utf-8")
        if made and marker in blog_html:
            blog_path.write_text(blog_html.replace(marker, '<div class="grid grid-3" data-list="blog">\n%s\n</div>' % blog_cards(made), 1),
                                 encoding="utf-8")
        posts = made
        print(f"{len(made)} artigos com versão estática em public/blog/")
    build_sitemap(static_names, posts)
    build_robots()
    build_llms(posts)
    print(f"{count} páginas geradas em public/ (versão dos assets {version})")
    return 0


if __name__ == "__main__":
    sys.exit(build())
