// Páginas públicas de conteúdo: Doe, ONGs, Parceiros, Organização, Eventos, Blog, Artigo, Legais e Contato
import { observeReveal } from "../app.js";
import sb from "../sb.js";
import {
  $, $$, esc, icons, L, ufOptions, slugFromPath, markdown, fmtDateLong, fmtDateTime, toast, withLoading,
  setFieldError, clearErrors, focusFirstError, isValidEmail, masks, qs,
} from "../ui.js";
import {
  orgCard, bindCopy, pixBox, orgLogo, eventCard, postCard, petCard, bindFavorites, ANIMAL_CARD_COLS,
  emptyState, errorState, skeletons, ORG_PUBLIC_COLS, EVENT_PUBLIC_COLS,
} from "../components.js";

const root = $("[data-page]");
const page = root?.dataset.page;
const ONG = "(ong,protetor_independente)";
const setMeta = (title, desc) => {
  document.title = `${title} · Meu Amigo Pra Vida`;
  if (desc) document.querySelector('meta[name="description"]')?.setAttribute("content", desc.slice(0, 160));
};
const done = (el) => observeReveal(el || document);

// ---------------------------------------------------------------------------
async function listOrgs(box, { ong, q = "", uf = "", pixOnly = false }) {
  box.innerHTML = skeletons(3, 260);
  try {
    let query = sb.from("organizations").select("slug,trade_name,kind,city,state,tagline,logo_url,services,pix_key,pix_key_type")
      .eq("status", "aprovada");
    query = ong ? query.in("kind", ["ong", "protetor_independente"]) : query.not("kind", "in", ONG);
    if (uf) query = query.eq("state", uf);
    if (q) query = query.ilike("trade_name", `*${q.replace(/[*%,()]/g, "")}*`);
    if (pixOnly) query = query.not("pix_key", "is", "null");
    const { data } = await query.order("trade_name").limit(120);
    box.style.display = data?.length ? "" : "block";
    box.innerHTML = data?.length ? data.map((o) => orgCard(o)).join("")
      : emptyState({
        title: ong ? "As primeiras ONGs estão em verificação" : "Seja a primeira empresa parceira!",
        text: ong ? "Em breve você poderá conhecer e apoiar ONGs e protetores verificados aqui." : "Pet shops, clínicas e marcas que apoiam a adoção aparecem aqui.",
        cta: `<a class="btn btn-laranja" href="/cadastro?tipo=${ong ? "ong" : "empresa"}">${ong ? "Cadastrar minha ONG" : "Quero ser parceiro"}</a>`,
      });
    bindCopy(box);
  } catch (e) { box.style.display = "block"; box.innerHTML = errorState(e); }
  done(box);
}

function setupOrgList(ong) {
  const box = $(`[data-list="${ong ? "ongs" : "parceiros"}"]`);
  const ufSel = $("[data-filter-uf]");
  const qIn = $("[data-filter-q]");
  ufSel.innerHTML = ufOptions().replace('<option value="">UF</option>', '<option value="">Todo o Brasil</option>');
  let t;
  const run = () => listOrgs(box, { ong, q: qIn.value.trim(), uf: ufSel.value });
  ufSel.addEventListener("change", run);
  qIn.addEventListener("input", () => { clearTimeout(t); t = setTimeout(run, 350); });
  run();
}

// ---------------------------------------------------------------------------
async function orgPage() {
  const box = $("[data-org]");
  const slug = slugFromPath("organizacao");
  try {
    const { data: o } = await sb.from("organizations").select(ORG_PUBLIC_COLS).eq("slug", slug).eq("status", "aprovada").maybeSingle();
    if (!o) { box.innerHTML = emptyState({ title: "Organização não encontrada", text: "Ela pode não estar mais ativa.", cta: `<a class="btn" href="/ongs">Ver ONGs</a>` }); return; }
    const isOng = ["ong", "protetor_independente"].includes(o.kind);
    setMeta(o.trade_name, o.tagline || o.description || "");
    const [{ data: animals }, { data: events }] = await Promise.all([
      isOng ? sb.from("animals").select(ANIMAL_CARD_COLS).eq("organization_id", o.id).in("status", ["disponivel", "em_processo"]).order("approved_at", { ascending: false }).limit(24) : Promise.resolve({ data: [] }),
      sb.from("events").select("slug,title,summary,kind,starts_at,is_online,location_name,city,state").eq("organization_id", o.id).eq("status", "publicado").gte("starts_at", new Date(Date.now() - 86400000).toISOString()).order("starts_at").limit(6),
    ]);
    box.innerHTML = `
    <div class="page-hero ${isOng ? "azul" : "rosa"}">
      <div class="flex items-center gap-2 wrap" data-reveal="up">
        <div class="org-logo" style="width:110px;height:110px;border-radius:30px;font-size:2.4rem;background:var(--amarelo)">${orgLogo(o)}</div>
        <div><span class="eyebrow" style="background:var(--branco);color:var(--preto);margin-bottom:.5rem">${esc(L.orgKind[o.kind])} · verificada ✔</span>
          <h1 class="mb-0">${esc(o.trade_name)}</h1>${o.city ? `<p class="lead mb-0">${esc(o.city)} - ${esc(o.state)}${o.founded_year ? ` · desde ${esc(o.founded_year)}` : ""}</p>` : ""}</div>
      </div>
      ${o.tagline ? `<p class="lead mt-2" data-reveal="up">${esc(o.tagline)}</p>` : ""}
    </div>
    <div class="grid grid-2 section" style="align-items:start;padding-block:40px">
      <div class="card card-pad" data-reveal="up"><h2 class="h3">Sobre</h2><div class="prose">${o.description ? markdown(o.description) : "<p class='muted'>Em breve mais informações.</p>"}</div>
        ${o.services?.length ? `<div class="chips mt-2">${o.services.map((s) => `<span class="chip chip-amarelo">${esc(s)}</span>`).join("")}</div>` : ""}</div>
      <div class="card card-pad" data-reveal="up" style="--delay:.1s"><h2 class="h3">Contato</h2>
        <div class="flex gap-1 wrap">
          ${o.whatsapp ? `<a class="btn btn-sm btn-branco" href="https://wa.me/55${esc(o.whatsapp.replace(/^55/, ""))}" target="_blank" rel="noopener noreferrer">${icons.whatsapp} WhatsApp</a>` : ""}
          ${o.instagram ? `<a class="btn btn-sm btn-branco" href="https://instagram.com/${esc(o.instagram)}" target="_blank" rel="noopener noreferrer">${icons.instagram} @${esc(o.instagram)}</a>` : ""}
          ${o.website ? `<a class="btn btn-sm btn-branco" href="${esc(o.website)}" target="_blank" rel="noopener noreferrer">${icons.globe} Site</a>` : ""}
          ${o.email ? `<a class="btn btn-sm btn-branco" href="mailto:${esc(o.email)}">✉ E-mail</a>` : ""}
        </div>
        ${o.public_address ? `<p class="mt-2 mb-0" style="display:flex;gap:6px">${icons.pin} ${esc(o.public_address)}</p>` : ""}
        ${o.accepts_volunteers ? `<div class="notice ok mt-2">${icons.heart}<p>Aceita voluntários e lares temporários!</p></div>` : ""}
        ${isOng && o.pix_key ? `<h3 class="mt-3" style="font-size:1.1rem">Doe via Pix</h3>${pixBox(o)}<p class="small muted mt-1">O valor vai direto para a organização.</p>` : ""}
      </div>
    </div>
    ${isOng ? `<h2 class="h2 mb-3">Esperando um lar em <span class="hl hl-amarelo">${esc(o.trade_name)}</span></h2>
      ${animals?.length ? `<div class="pets-grid" data-pets>${animals.map((a) => petCard(a)).join("")}</div>` : `<p class="muted">Nenhum animal disponível agora. Volte em breve!</p>`}` : ""}
    ${events?.length ? `<h2 class="h2 mt-4 mb-3">Próximos eventos</h2><div class="grid grid-3">${events.map(eventCard).join("")}</div>` : ""}`;
    bindCopy(box);
    if (animals?.length) bindFavorites($("[data-pets]", box), animals.map((a) => a.id));
  } catch (e) { box.innerHTML = errorState(e); }
  done(box);
}

// ---------------------------------------------------------------------------
async function eventsPage() {
  const up = $('[data-list="eventos"]');
  const past = $('[data-list="eventos-passados"]');
  up.innerHTML = skeletons(3, 180);
  const cols = "slug,title,summary,kind,starts_at,is_online,location_name,city,state,organizations(trade_name)";
  const now = new Date(Date.now() - 86400000).toISOString();
  try {
    const [{ data: a }, { data: b }] = await Promise.all([
      sb.from("events").select(cols).eq("status", "publicado").gte("starts_at", now).order("starts_at").limit(60),
      sb.from("events").select(cols).in("status", ["publicado", "encerrado"]).lt("starts_at", now).order("starts_at", { ascending: false }).limit(12),
    ]);
    up.style.display = a?.length ? "" : "block";
    up.innerHTML = a?.length ? a.map(eventCard).join("") : emptyState({ title: "Nenhum evento agendado", text: "ONGs e empresas parceiras divulgam aqui feiras de adoção, castrações e campanhas.", art: icons.calendar });
    past.innerHTML = b?.length ? b.map(eventCard).join("") : `<p class="muted">Nenhum evento anterior.</p>`;
  } catch (e) { up.style.display = "block"; up.innerHTML = errorState(e); }
  done();
}

async function eventPage() {
  const box = $("[data-event]");
  const slug = slugFromPath("eventos");
  try {
    const { data: e } = await sb.from("events").select(`${EVENT_PUBLIC_COLS},organizations(slug,trade_name,logo_url,kind)`).eq("slug", slug).maybeSingle();
    if (!e || !["publicado", "encerrado"].includes(e.status)) { box.innerHTML = emptyState({ title: "Evento não encontrado", text: "Confira a agenda completa.", cta: `<a class="btn" href="/eventos">Ver eventos</a>` }); return; }
    setMeta(e.title, e.summary);
    const where = e.is_online ? "Online" : [e.location_name, e.address, e.city && `${e.city} - ${e.state}`].filter(Boolean).join(" · ");
    box.innerHTML = `<a class="link small" href="/eventos">← Agenda</a>
      ${e.cover_url ? `<img src="${esc(e.cover_url)}" alt="" class="mt-2" style="width:100%;border-radius:var(--radius-lg);border:3px solid var(--preto);aspect-ratio:16/9;object-fit:cover" data-reveal="up">` : ""}
      <span class="chip chip-amarelo mt-3" style="display:inline-flex">${esc(L.eventKind[e.kind])}</span>
      <h1 class="h1 mt-1">${esc(e.title)}</h1><p class="lead">${esc(e.summary)}</p>
      <div class="card card-pad mb-3"><p class="mb-1" style="display:flex;gap:8px">${icons.calendar} <strong>${esc(fmtDateTime(e.starts_at))}${e.ends_at ? ` até ${esc(fmtDateTime(e.ends_at))}` : ""}</strong></p>
        <p class="mb-0" style="display:flex;gap:8px">${icons.pin} ${esc(where)}</p>
        ${e.organizations ? `<p class="mt-2 mb-0">Organizado por <a class="link" href="/organizacao/${esc(e.organizations.slug)}">${esc(e.organizations.trade_name)}</a></p>` : ""}
        ${e.external_url ? `<a class="btn btn-laranja mt-2" href="${esc(e.external_url)}" target="_blank" rel="noopener noreferrer">Inscrever-se / saber mais ↗</a>` : ""}</div>
      ${e.description ? `<div class="prose">${markdown(e.description)}</div>` : ""}`;
  } catch (er) { box.innerHTML = errorState(er); }
  done(box);
}

// ---------------------------------------------------------------------------
async function blogPage() {
  const box = $('[data-list="blog"]');
  const tabs = $("[data-cats]");
  box.innerHTML = skeletons(6, 380);
  try {
    const [{ data: cats }, { data: posts }] = await Promise.all([
      sb.from("blog_categories").select("id,name,slug,color").order("position"),
      sb.from("blog_posts").select("slug,title,excerpt,cover_url,cover_alt,published_at,reading_minutes,category_id,blog_categories(name,color)")
        .eq("status", "publicado").order("published_at", { ascending: false }).limit(60),
    ]);
    let cur = qs("categoria") || "";
    tabs.innerHTML = `<button class="tab" type="button" data-c="">Todos</button>${(cats || []).map((c) => `<button class="tab" type="button" data-c="${esc(c.slug)}">${esc(c.name)}</button>`).join("")}`;
    const render = () => {
      $$("[data-c]", tabs).forEach((b) => b.setAttribute("aria-selected", String(b.dataset.c === cur)));
      const cat = (cats || []).find((c) => c.slug === cur);
      const list = (posts || []).filter((p) => !cat || p.category_id === cat.id);
      box.style.display = list.length ? "" : "block";
      box.innerHTML = list.length ? list.map(postCard).join("") : emptyState({ title: "Em breve", text: "Novos artigos chegando nesta categoria.", art: icons.book });
      done(box);
    };
    $$("[data-c]", tabs).forEach((b) => b.addEventListener("click", () => { cur = b.dataset.c; history.replaceState(null, "", cur ? `?categoria=${cur}` : location.pathname); render(); }));
    render();
  } catch (e) { box.style.display = "block"; box.innerHTML = errorState(e); }
}

// Índice "Neste artigo" a partir dos subtítulos (h2) do texto
function slugHeading(t) {
  return String(t).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "secao";
}
function decorateArticle(box) {
  const prose = box.querySelector(".prose");
  if (!prose) return;
  const heads = [...prose.querySelectorAll("h2")];
  heads.forEach((h, k) => { h.id = `${slugHeading(h.textContent)}-${k + 1}`; });
  const toc = box.querySelector("[data-toc]");
  if (toc && heads.length >= 2) {
    const items = heads.map((h) => `<li><a href="#${h.id}">${esc(h.textContent)}</a></li>`).join("");
    toc.innerHTML = `<details class="post-toc-box" open><summary>Neste artigo</summary><nav aria-label="Neste artigo"><ol>${items}</ol></nav></details>`;
    const det = toc.querySelector("details");
    det.open = matchMedia("(min-width: 1100px)").matches;
  } else if (toc) toc.remove();
  // Barra de progresso de leitura
  const bar = box.querySelector(".read-progress span");
  if (bar && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
    let ticking = false;
    const update = () => {
      ticking = false;
      const r = prose.getBoundingClientRect();
      const total = r.height - window.innerHeight * 0.4;
      const done = Math.min(Math.max(-r.top + window.innerHeight * 0.3, 0), Math.max(total, 1));
      bar.style.width = `${Math.round((done / Math.max(total, 1)) * 100)}%`;
    };
    window.addEventListener("scroll", () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
    update();
  }
  // Vídeos tocam só quando estão na tela, e não tocam com movimento reduzido
  const vids = [...prose.querySelectorAll("video")];
  if (vids.length && "IntersectionObserver" in window && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
    const io = new IntersectionObserver((entries) => entries.forEach((en) => {
      const v = en.target;
      if (en.isIntersecting && en.intersectionRatio >= 0.5) v.play().catch(() => {});
      else v.pause();
    }), { threshold: [0, 0.5] });
    vids.forEach((v) => io.observe(v));
  }
}

async function postPage() {
  const box = $("[data-post]");
  const slug = slugFromPath("blog");
  try {
    const { data: p } = await sb.from("blog_posts").select("*,blog_categories(name,slug,color)").eq("slug", slug).maybeSingle();
    if (!p) { box.innerHTML = emptyState({ title: "Artigo não encontrado", text: "Veja os outros conteúdos.", cta: `<a class="btn" href="/blog">Ver artigos</a>` }); return; }
    setMeta(p.title, p.excerpt);
    const color = p.blog_categories?.color || "laranja";
    box.innerHTML = `<div class="read-progress" aria-hidden="true"><span></span></div>
      <header class="post-hero cat-${esc(color)}" data-reveal="up">
        <a class="link small post-back" href="/blog">← Conscientização</a>
        ${p.blog_categories ? `<a class="chip post-cat" href="/blog?categoria=${esc(p.blog_categories.slug)}">${esc(p.blog_categories.name)}</a>` : ""}
        <h1 class="h1">${esc(p.title)}</h1>
        <p class="lead">${esc(p.excerpt)}</p>
        <p class="post-meta">${esc(fmtDateLong(p.published_at))} · ${esc(p.reading_minutes)} min de leitura</p>
      </header>
      ${p.cover_url ? `<figure class="post-cover-fig" data-reveal="up"><img src="${esc(p.cover_url)}" alt="${esc(p.cover_alt || "")}" width="1200" height="800" decoding="async"></figure>` : ""}
      <div class="post-layout">
        <aside class="post-toc" data-toc></aside>
        <div class="prose post-body">${markdown(p.content_md, { allowExternal: true })}</div>
      </div>
      ${p.tags?.length ? `<div class="chips mt-3">${p.tags.map((t) => `<span class="chip chip-soft">#${esc(t)}</span>`).join("")}</div>` : ""}
      <div class="card card-pad mt-4 flex justify-between items-center wrap gap-2" style="background:var(--amarelo)"><div><h2 class="h3 mb-0">Pronto para mudar uma vida?</h2><p class="mb-0">Conheça os amigos que esperam por um lar.</p></div><a class="btn" href="/adote">Ver animais <span class="arrow">→</span></a></div>`;
    decorateArticle(box);
    const { data: more } = await sb.from("blog_posts").select("slug,title,excerpt,cover_url,cover_alt,published_at,reading_minutes,blog_categories(name,color)")
      .eq("status", "publicado").neq("id", p.id).order("published_at", { ascending: false }).limit(3);
    if (more?.length) { $("[data-more]").innerHTML = more.map(postCard).join(""); $("[data-more-wrap]").classList.remove("hidden"); }
  } catch (e) { box.innerHTML = errorState(e); }
  done();
}

// ---------------------------------------------------------------------------
async function legalPage() {
  const box = $("[data-legal]");
  const kind = root.dataset.kind;
  try {
    const { data } = await sb.from("legal_documents").select("title,version,content_md,published_at").eq("kind", kind)
      .not("published_at", "is", "null").order("published_at", { ascending: false }).limit(1);
    const d = data?.[0];
    if (!d) throw new Error("Documento indisponível no momento.");
    box.innerHTML = `<span class="eyebrow">Versão ${esc(d.version)}</span><h1 class="h1">${esc(d.title)}</h1><div class="prose mt-3">${markdown(d.content_md, { allowExternal: true })}</div>`;
  } catch (e) { box.innerHTML = errorState(e); }
  done(box);
}

function contactPage() {
  const form = $("[data-contact]");
  const topic = qs("assunto");
  if (topic && form.topic.querySelector(`option[value="${CSS.escape(topic)}"]`)) form.topic.value = topic;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearErrors(form);
    if (form.website.value) return; // armadilha anti-robô
    let ok = true;
    if (form.name.value.trim().length < 2) { ok = false; setFieldError(form.name, "Informe seu nome."); }
    if (!isValidEmail(form.email.value)) { ok = false; setFieldError(form.email, "E-mail inválido."); }
    if (form.message.value.trim().length < 10) { ok = false; setFieldError(form.message, "Escreva pelo menos 10 caracteres."); }
    if (!form.consent.checked) { ok = false; setFieldError(form.consent, "É preciso autorizar para respondermos."); }
    if (!ok) { focusFirstError(form); return; }
    await withLoading($('button[type="submit"]', form), async () => {
      try {
        await sb.from("contact_messages").insert({ name: form.name.value.trim(), email: form.email.value.trim().toLowerCase(), topic: form.topic.value, message: form.message.value.trim(), consent: true }, { returning: false });
        form.innerHTML = `<div class="notice ok">${icons.check}<p>Mensagem enviada! Responderemos no seu e-mail em breve. 💛</p></div>`;
      } catch (er) { toast(er.message, "bad"); }
    });
  });
}

// ---------------------------------------------------------------------------
switch (page) {
  case "doar": listOrgs($('[data-list="ongs-pix"]'), { ong: true, pixOnly: true }); break;
  case "ongs": setupOrgList(true); break;
  case "parceiros": setupOrgList(false); break;
  case "organizacao": orgPage(); break;
  case "eventos": eventsPage(); break;
  case "evento": eventPage(); break;
  case "blog": blogPage(); break;
  case "artigo": postPage(); break;
  case "legal": legalPage(); break;
  case "contato": contactPage(); break;
  default: break;
}
void masks;
