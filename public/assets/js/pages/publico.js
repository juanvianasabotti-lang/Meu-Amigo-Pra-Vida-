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
  document.title = `${title} · Meu Amigo pra Vida`;
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
    <div class="poster poster-solo ${isOng ? "azul" : "rosa"}">
      <div class="poster-bg" aria-hidden="true"><span class="poster-word">${isOng ? "resgate" : "parceira"}</span></div>
      <div class="poster-copy">
      <div class="flex items-center gap-2 wrap" data-reveal="up">
        <div class="org-logo" style="width:110px;height:110px;border-radius:30px;font-size:2.4rem;background:var(--amarelo)">${orgLogo(o)}</div>
        <div><span class="eyebrow" style="margin-bottom:.5rem">${esc(L.orgKind[o.kind])} · verificada</span>
          <h1 class="mb-0">${esc(o.trade_name)}</h1>${o.city ? `<p class="lead mb-0">${esc(o.city)} - ${esc(o.state)}${o.founded_year ? ` · desde ${esc(o.founded_year)}` : ""}</p>` : ""}</div>
      </div>
      ${o.tagline ? `<p class="lead mt-2" data-reveal="up">${esc(o.tagline)}</p>` : ""}
      </div>
    </div>
    <div class="grid grid-2 section" style="align-items:start;padding-block:40px">
      <div class="card card-pad" data-reveal="up"><h2 class="h3">Sobre</h2><div class="prose">${o.description ? markdown(o.description) : "<p class='muted'>Em breve mais informações.</p>"}</div>
        ${o.services?.length ? `<div class="chips mt-2">${o.services.map((s) => `<span class="chip chip-amarelo">${esc(s)}</span>`).join("")}</div>` : ""}</div>
      <div class="card card-pad" data-reveal="up" style="--delay:.1s"><h2 class="h3">Contato</h2>
        <div class="flex gap-1 wrap">
          ${o.whatsapp ? `<a class="btn btn-sm btn-branco" href="https://wa.me/55${esc(o.whatsapp.replace(/^55/, ""))}" target="_blank" rel="noopener noreferrer">${icons.whatsapp} WhatsApp</a>` : ""}
          ${o.instagram ? `<a class="btn btn-sm btn-branco" href="https://instagram.com/${esc(o.instagram)}" target="_blank" rel="noopener noreferrer">${icons.instagram} @${esc(o.instagram)}</a>` : ""}
          ${o.website ? `<a class="btn btn-sm btn-branco" href="${esc(o.website)}" target="_blank" rel="noopener noreferrer">${icons.globe} Site</a>` : ""}
          ${o.email ? `<a class="btn btn-sm btn-branco" href="mailto:${esc(o.email)}"> E-mail</a>` : ""}
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
      ${e.cover_url ? `<img src="${esc(e.cover_url)}" alt="" class="mt-2" style="width:100%;border-radius:var(--radius-lg);aspect-ratio:16/9;object-fit:cover" data-reveal="up">` : ""}
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

const ART_PETS = ["boiadeiro", "chihuahua", "gato-himalaio", "gato-laranja", "gato-preto-branco", "gato-rajado", "golden", "labrador"];
const artPet = (seed = "", n = 0) => ART_PETS[([...seed].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) + n) % ART_PETS.length];
const CAPTIONS = ["Quem espera por você tem pressa de ser feliz.", "Um lar é uma decisão que dura anos.", "Adotar é mudar duas vidas de uma vez."];

// Barra de leitura no topo: mostra o quanto do texto já foi lido.
function readProgress() {
  const bar = $(".read-progress");
  const main = $(".art-main");
  if (!bar || !main) return;
  const on = () => {
    const r = main.getBoundingClientRect();
    const total = r.height - window.innerHeight * 0.5;
    const done = Math.min(1, Math.max(0, -r.top / Math.max(1, total)));
    bar.style.transform = `scaleX(${done})`;
  };
  window.addEventListener("scroll", on, { passive: true });
  on();
}

// Insere fotos de animais entre as seções do texto (a cada 2 subtítulos).
function interleaveImages(main, seed) {
  const h2s = [...main.querySelectorAll("h2")];
  h2s.forEach((h, i) => {
    if (i === 0 || i % 2 !== 0) return;
    const k = Math.floor(i / 2) - 1;
    const fig = document.createElement("figure");
    fig.className = "art-inline";
    fig.innerHTML = `<img src="/assets/img/animais/${artPet(seed, k + 1)}.webp" alt="" loading="lazy"><figcaption>${esc(CAPTIONS[k % CAPTIONS.length])}</figcaption>`;
    h.before(fig);
  });
}

async function postPage() {
  const box = $("[data-post]");
  const slug = slugFromPath("blog");
  try {
    const { data: p } = await sb.from("blog_posts").select("*,blog_categories(name,slug,color)").eq("slug", slug).maybeSingle();
    if (!p) { box.innerHTML = emptyState({ title: "Artigo não encontrado", text: "Veja os outros conteúdos.", cta: `<a class="btn" href="/blog">Ver artigos</a>` }); return; }
    setMeta(p.title, p.excerpt);
    const color = p.blog_categories?.color || "laranja";
    const seed = p.slug || "x";
    const hero = p.cover_url || `/assets/img/animais/${artPet(seed)}.webp`;
    box.innerHTML = `
      <div class="read-progress" aria-hidden="true"></div>
      <header class="art-hero cat-${esc(color)}" data-reveal="up">
        <div class="art-hero-copy">
          <a class="link small" href="/blog">← Conscientização</a>
          ${p.blog_categories ? `<p class="art-kicker"><a href="/blog?categoria=${esc(p.blog_categories.slug)}">${esc(p.blog_categories.name)}</a></p>` : ""}
          <h1>${esc(p.title)}</h1>
          <p class="art-deck">${esc(p.excerpt)}</p>
          <p class="art-byline"><span>${esc(fmtDateLong(p.published_at))}</span><span>${esc(p.reading_minutes)} min de leitura</span></p>
        </div>
        <figure class="art-hero-media"><img src="${esc(hero)}" alt="${esc(p.cover_alt || "")}"></figure>
      </header>
      <div class="art-layout">
        <article class="art-main prose article-body">${markdown(p.content_md, { allowExternal: true })}</article>
        <aside class="art-side">
          <div class="art-cta-card">
            <img src="/assets/img/animais/${artPet(seed, 3)}.webp" alt="">
            <h2>Um amigo está esperando por você</h2>
            <p>Veja quem está pronto para ir para casa e envie seu pedido de adoção em poucos minutos.</p>
            <a class="btn btn-laranja btn-block" href="/adote">Quero adotar <span class="arrow">→</span></a>
            <a class="link small" href="/doar">Ou doe um animal ou ajude uma ONG</a>
          </div>
        </aside>
      </div>
      ${p.tags?.length ? `<div class="chips art-tags">${p.tags.map((t) => `<span class="chip chip-soft">#${esc(t)}</span>`).join("")}</div>` : ""}
      <section class="art-final">
        <div class="art-final-copy"><p class="art-kicker">Próximo passo</p><h2>Transforme esta leitura em um lar</h2>
          <p>Cada adoção muda duas vidas: a do animal e a de quem o recebe.</p>
          <a class="btn btn-branco" href="/adote">Ver animais para adoção <span class="arrow">→</span></a></div>
        <img src="/assets/img/animais/${artPet(seed, 5)}.webp" alt="">
      </section>`;
    const main = $(".art-main", box);
    interleaveImages(main, seed);
    readProgress();
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
        form.innerHTML = `<div class="notice ok">${icons.check}<p>Mensagem enviada! Responderemos no seu e-mail em breve.</p></div>`;
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
