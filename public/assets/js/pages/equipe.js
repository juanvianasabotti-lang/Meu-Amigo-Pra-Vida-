// =============================================================================
// Painel da equipe (/equipe): indicadores agregados para administradores,
// moderadores e integrantes. Integrantes veem só números; nomes, só admin.
// =============================================================================
import { requireAuth, isAdmin, isStaff, observeReveal } from "../app.js";
import sb from "../sb.js";
import { $, $$, esc, L } from "../ui.js";
import { emptyState, errorState } from "../components.js";

const root = $("[data-team]");
const body = $("[data-team-body]");
const NUM = new Intl.NumberFormat("pt-BR");
const DAY = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" });
const DAY_LONG = new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "2-digit", month: "short", timeZone: "UTC" });
const TIME = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });

// Cores por tipo de conta (ordem fixa; validadas para daltonismo e contraste).
const TYPES = [
  { key: "pessoa", label: "Pessoas", color: "#005FFF" },
  { key: "ong", label: "ONGs e protetores", color: "#D64000" },
  { key: "empresa", label: "Empresas", color: "#D11FA0" },
];
const ROLE_LABEL = { admin: "Administrador", moderador: "Moderador", integrante: "Integrante" };
const FUNNEL = ["enviado", "em_analise", "entrevista", "visita", "aprovado", "concluido"];
const PAGE_NAMES = {
  "/": "Página inicial", "/adote": "Adote (lista)", "/adote/*": "Página de um animal", "/doar": "Doe", "/ongs": "ONGs",
  "/parceiros": "Parceiros", "/eventos": "Eventos", "/eventos/*": "Página de um evento", "/blog": "Conscientização",
  "/blog/*": "Artigo", "/sobre": "Sobre", "/contato": "Contato", "/entrar": "Entrar", "/cadastro": "Cadastro",
  "/organizacao/*": "Página de uma organização", "/adotar/*": "Formulário de adoção",
};

let ctx;
let days = 30;

const pct = (a, b) => (b ? Math.round(((a - b) / b) * 100) : null);
const sum = (o) => Object.values(o || {}).reduce((a, b) => a + Number(b || 0), 0);
const dayStr = (d) => DAY.format(new Date(`${d}T00:00:00Z`));
const dayLong = (d) => DAY_LONG.format(new Date(`${d}T00:00:00Z`));
function niceMax(v) {
  if (v <= 4) return 4;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = [1, 2, 2.5, 5, 10].find((m) => m * p >= v);
  return n * p;
}

// ---------------------------------------------------------------------------
async function start() {
  ctx = await requireAuth({ onboarding: false });
  if (!ctx) { body.innerHTML = emptyState({ title: "Painel indisponível", text: "O site ainda não está conectado ao banco de dados." }); observeReveal(body); return; }
  if (!ctx.roles?.length) {
    body.innerHTML = emptyState({ title: "Área só para a equipe", text: "Sua conta ainda não tem acesso a este painel. Peça a um administrador para incluir você na equipe.", cta: `<a class="btn" href="/">Voltar ao site</a>` });
    observeReveal(body);
    return;
  }
  $("[data-team-controls]").classList.remove("hidden");
  if (isStaff(ctx)) $("[data-team-admin]").classList.remove("hidden");
  const roles = ctx.roles.map((r) => ROLE_LABEL[r] || r).join(" · ");
  $("[data-team-sub]").innerHTML = `Olá, ${esc(ctx.profile.display_name || "equipe")}. Seu acesso: <strong>${esc(roles)}</strong>.`;
  $$("input[name=periodo]", root).forEach((r) => r.addEventListener("change", () => { days = Number(r.value); load(); }));
  $("[data-team-refresh]").addEventListener("click", load);
  let rt;
  window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => last && render(last), 200); });
  load();
}

let last = null;
async function load() {
  body.setAttribute("aria-busy", "true");
  try {
    const [d, recent] = await Promise.all([
      sb.rpc("team_dashboard", { p_days: days }),
      isAdmin(ctx) ? sb.rpc("team_recent_signups", { p_limit: 12 }).catch(() => []) : Promise.resolve(null),
    ]);
    last = { d, recent };
    render(last);
  } catch (e) {
    body.innerHTML = errorState(e);
    observeReveal(body);
  }
  body.removeAttribute("aria-busy");
}

// ---------------------------------------------------------------------------
function render({ d, recent }) {
  const s = d.signups, v = d.visits, a = d.animals, ad = d.adoptions, o = d.organizations, pend = d.pending;
  const pendTotal = sum(pend);
  const available = Number(a.by_status?.disponivel || 0) + Number(a.by_status?.em_processo || 0);
  body.innerHTML = `
    <p class="team-updated">Período: ${dayLong(d.from)} a ${dayLong(d.to)} · atualizado às ${TIME.format(new Date(d.generated_at))}</p>

    <div class="team-kpis">
      ${kpi("Cadastros no período", s.period, pct(s.period, s.previous), `${NUM.format(s.total)} contas no total`)}
      ${kpi("Visitas no período", v.sessions, pct(v.sessions, v.previous_sessions), `${NUM.format(v.views)} páginas vistas`)}
      ${kpi("Animais disponíveis", available, null, `${NUM.format(a.published_period)} publicados no período`)}
      ${kpi("Adoções concluídas", ad.concluded_period, null, `${NUM.format(ad.period)} pedidos no período`)}
      ${kpi("Pendências", pendTotal, null, pendTotal ? "esperando a equipe" : "nada esperando", pendTotal ? "warn" : "")}
    </div>

    <div class="team-grid">
      <article class="card card-pad team-card team-wide">
        <header class="team-card-head"><div><h2>Cadastros por dia</h2><p>Novas contas por tipo</p></div>${legend(TYPES)}</header>
        <div class="team-chart" data-chart="signups"></div>
        <details class="team-table"><summary>Ver em tabela</summary>${table(["Dia", ...TYPES.map((t) => t.label), "Total"], s.by_day.map((r) => [dayStr(r.day), ...TYPES.map((t) => r[t.key]), TYPES.reduce((x, t) => x + r[t.key], 0)]))}</details>
      </article>

      <article class="card card-pad team-card">
        <header class="team-card-head"><div><h2>Contas por tipo</h2><p>Total desde o início</p></div></header>
        ${bars(TYPES.map((t) => ({ label: t.label, value: Number(s.by_type_total?.[t.key] || 0), color: t.color })), "Nenhuma conta criada ainda.")}
      </article>

      <article class="card card-pad team-card">
        <header class="team-card-head"><div><h2>Cadastros por estado</h2><p>Os 10 estados com mais contas</p></div></header>
        ${bars((s.by_state || []).map((x) => ({ label: x.uf, value: x.n })), "Ainda não há contas com estado informado.")}
      </article>

      <article class="card card-pad team-card team-wide">
        <header class="team-card-head"><div><h2>Visitas por dia</h2><p>Visitas (sessões) ao site, sem cookies e sem identificar ninguém</p></div><p class="team-note">${v.sessions ? `${Math.round((v.mobile / Math.max(1, v.views)) * 100)}% das páginas vistas no celular` : ""}</p></header>
        <div class="team-chart" data-chart="visits"></div>
        <details class="team-table"><summary>Ver em tabela</summary>${table(["Dia", "Visitas", "Páginas vistas"], v.by_day.map((r) => [dayStr(r.day), r.sessions, r.views]))}</details>
      </article>

      <article class="card card-pad team-card">
        <header class="team-card-head"><div><h2>Páginas mais vistas</h2><p>No período</p></div></header>
        ${bars((v.top_pages || []).map((x) => ({ label: PAGE_NAMES[x.path] || x.path, value: x.views })), "O contador começou agora; as visitas aparecem aqui a partir de hoje.")}
      </article>

      <article class="card card-pad team-card">
        <header class="team-card-head"><div><h2>Funil de adoção</h2><p>Pedidos em cada etapa (todos os tempos)</p></div></header>
        ${bars(FUNNEL.map((k) => ({ label: L.adoption[k], value: Number(ad.by_status?.[k] || 0) })), "Nenhum pedido de adoção ainda.")}
        ${Number(ad.by_status?.recusado || 0) + Number(ad.by_status?.cancelado || 0) ? `<p class="team-note mt-1">Não aprovados: ${NUM.format(ad.by_status?.recusado || 0)} · cancelados: ${NUM.format(ad.by_status?.cancelado || 0)}</p>` : ""}
      </article>

      <article class="card card-pad team-card">
        <header class="team-card-head"><div><h2>Animais</h2><p>Anúncios por situação</p></div></header>
        ${bars(["em_analise", "disponivel", "em_processo", "adotado", "rejeitado"].map((k) => ({ label: L.animalStatus[k], value: Number(a.by_status?.[k] || 0) })), "Nenhum anúncio criado ainda.")}
        ${available ? `<p class="team-note mt-1">Disponíveis agora: ${NUM.format(a.by_species?.cao || 0)} cães e ${NUM.format(a.by_species?.gato || 0)} gatos</p>` : ""}
      </article>

      <article class="card card-pad team-card">
        <header class="team-card-head"><div><h2>Organizações</h2><p>ONGs, protetores e empresas</p></div></header>
        ${bars([["pendente", "Esperando verificação"], ["aprovada", "Aprovadas"], ["rejeitada", "Recusadas"], ["suspensa", "Suspensas"]].map(([k, l]) => ({ label: l, value: Number(o.by_status?.[k] || 0) })), "Nenhuma organização cadastrada ainda.")}
        ${sum(o.by_kind) ? `<p class="team-note mt-1">${Object.entries(o.by_kind).map(([k, n]) => `${esc(L.orgKind[k] || k)}: ${NUM.format(n)}`).join(" · ")}</p>` : ""}
      </article>

      <article class="card card-pad team-card">
        <header class="team-card-head"><div><h2>Pendências</h2><p>O que está esperando a equipe agora</p></div></header>
        <ul class="team-pend">
          ${pendRow("Organizações para verificar", pend.organizations, "#organizacoes")}
          ${pendRow("Anúncios para revisar", pend.animals, "#animais")}
          ${pendRow("Eventos para revisar", pend.events, "#eventos")}
          ${pendRow("Mensagens novas", pend.contacts, "#contatos")}
          ${pendRow("Pedidos LGPD em aberto", pend.lgpd, "#lgpd")}
        </ul>
      </article>

      ${recent ? `<article class="card card-pad team-card team-wide">
        <header class="team-card-head"><div><h2>Últimos cadastros</h2><p>Visível só para administradores</p></div></header>
        ${recent.length ? table(["Nome", "Tipo", "Cidade", "Data"], recent.map((r) => [r.full_name || "—", ({ pessoa: "Pessoa", ong: "ONG ou protetor", empresa: "Empresa" })[r.account_type] || r.account_type, r.city ? `${r.city} - ${r.state || ""}` : "—", new Date(r.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })]), true) : `<p class="muted mb-0">Nenhum cadastro ainda.</p>`}
      </article>` : `<p class="team-privacy">Você vê apenas números agregados. Nomes e contatos ficam restritos aos administradores, conforme a LGPD.</p>`}
    </div>`;

  stacked($("[data-chart=signups]", body), s.by_day, TYPES);
  area($("[data-chart=visits]", body), v.by_day);
}

function kpi(label, value, delta, foot, tone = "") {
  const d = delta === null || !Number.isFinite(delta) ? "" :
    `<span class="team-delta ${delta >= 0 ? "up" : "down"}">${delta >= 0 ? "▲" : "▼"} ${Math.abs(delta)}%<span class="sr-only"> em relação ao período anterior</span></span>`;
  return `<div class="team-kpi ${tone}"><p class="team-kpi-label">${esc(label)}</p><p class="team-kpi-num">${NUM.format(value || 0)} ${d}</p><p class="team-kpi-foot">${esc(foot)}</p></div>`;
}
function legend(items) {
  return `<ul class="team-legend">${items.map((t) => `<li><i style="background:${t.color}"></i>${esc(t.label)}</li>`).join("")}</ul>`;
}
function bars(rows, emptyText) {
  const max = Math.max(0, ...rows.map((r) => r.value));
  if (!max) return `<p class="team-empty">${esc(emptyText)}</p>`;
  return `<ul class="team-bars">${rows.map((r) => `<li><span class="lbl">${esc(r.label)}</span><span class="bar"><i style="width:${r.value ? Math.max(2, (r.value / max) * 100) : 0}%;${r.color ? `background:${r.color}` : ""}"></i></span><span class="val">${NUM.format(r.value)}</span></li>`).join("")}</ul>`;
}
function pendRow(label, n, hash) {
  const link = isStaff(ctx) && n ? `<a class="link" href="/admin${hash}">Abrir</a>` : "";
  return `<li class="${n ? "has" : ""}"><span>${esc(label)}</span><strong>${NUM.format(n || 0)}</strong>${link}</li>`;
}
function table(head, rows, left = false) {
  return `<div class="table-wrap"><table class="team-tbl ${left ? "left" : ""}"><thead><tr>${head.map((h) => `<th scope="col">${esc(h)}</th>`).join("")}</tr></thead>
    <tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${esc(typeof c === "number" ? NUM.format(c) : c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}

// ---------------------------------------------------------------------------
// Gráficos em SVG (sem bibliotecas externas, por causa da política de segurança)
const H = 230, PAD = { t: 12, r: 8, b: 26, l: 36 };
function frame(el) {
  const W = Math.max(280, el.clientWidth);
  return { W, iw: W - PAD.l - PAD.r, ih: H - PAD.t - PAD.b };
}
function axes(W, iw, ih, max, labels) {
  const ticks = [0, max / 2, max];
  const grid = ticks.map((t) => {
    const y = PAD.t + ih - (t / max) * ih;
    return `<line x1="${PAD.l}" x2="${W - PAD.r}" y1="${y}" y2="${y}" class="g"/><text x="${PAD.l - 8}" y="${y + 4}" class="ax" text-anchor="end">${NUM.format(Math.round(t))}</text>`;
  }).join("");
  return grid + labels.map(([x, t]) => `<text x="${x}" y="${H - 6}" class="ax" text-anchor="middle">${t}</text>`).join("");
}
function tickEvery(n, iw) { return Math.max(1, Math.ceil(n / Math.max(2, Math.floor(iw / 70)))); }
function tooltip(el) {
  let tip = $(".team-tip", el);
  if (!tip) { tip = document.createElement("div"); tip.className = "team-tip"; tip.hidden = true; el.appendChild(tip); }
  return tip;
}
function place(el, tip, x, html) {
  tip.innerHTML = html; tip.hidden = false;
  const w = tip.offsetWidth;
  tip.style.left = `${Math.min(Math.max(0, x - w / 2), el.clientWidth - w)}px`;
}

function stacked(el, rows, series) {
  const { W, iw, ih } = frame(el);
  const totals = rows.map((r) => series.reduce((a, s) => a + Number(r[s.key] || 0), 0));
  const max = niceMax(Math.max(...totals, 0));
  const bw = iw / rows.length, gap = Math.min(6, bw * 0.28), w = Math.max(2, bw - gap);
  const every = tickEvery(rows.length, iw);
  let marks = "";
  rows.forEach((r, i) => {
    let y = PAD.t + ih;
    const x = PAD.l + i * bw + gap / 2;
    series.forEach((s, k) => {
      const v = Number(r[s.key] || 0);
      if (!v) return;
      const h = Math.max(1, (v / max) * ih - (k ? 2 : 0));
      y -= h + (k ? 2 : 0);
      marks += `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${Math.min(3, w / 3)}" fill="${s.color}"/>`;
    });
  });
  const labels = rows.map((r, i) => (i % every === 0 ? [PAD.l + i * bw + bw / 2, dayStr(r.day)] : null)).filter(Boolean);
  const hits = rows.map((r, i) => `<rect class="hit" x="${PAD.l + i * bw}" y="${PAD.t}" width="${bw}" height="${ih}" data-i="${i}"/>`).join("");
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Cadastros por dia, por tipo de conta">${axes(W, iw, ih, max, labels)}${marks}${hits}</svg>
    ${totals.some(Boolean) ? "" : `<p class="team-chart-empty">Nenhum cadastro no período.</p>`}`;
  const tip = tooltip(el);
  $$(".hit", el).forEach((h) => {
    const show = () => {
      const r = rows[h.dataset.i];
      $$(".hit", el).forEach((o) => o.classList.toggle("on", o === h));
      place(el, tip, PAD.l + (Number(h.dataset.i) + 0.5) * bw, `<strong>${dayLong(r.day)}</strong>${series.map((s) => `<span><i style="background:${s.color}"></i>${esc(s.label)} <b>${NUM.format(r[s.key] || 0)}</b></span>`).join("")}<span>Total <b>${NUM.format(totals[h.dataset.i])}</b></span>`);
    };
    h.addEventListener("pointerenter", show);
    h.addEventListener("click", show);
  });
  el.addEventListener("pointerleave", () => { tip.hidden = true; $$(".hit", el).forEach((o) => o.classList.remove("on")); });
}

function area(el, rows) {
  const { W, iw, ih } = frame(el);
  const vals = rows.map((r) => Number(r.sessions || 0));
  const max = niceMax(Math.max(...vals, 0));
  const step = rows.length > 1 ? iw / (rows.length - 1) : iw;
  const pts = vals.map((v, i) => [PAD.l + i * step, PAD.t + ih - (v / max) * ih]);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join("");
  const fill = `${line}L${pts.at(-1)[0]},${PAD.t + ih}L${pts[0][0]},${PAD.t + ih}Z`;
  const every = tickEvery(rows.length, iw);
  const labels = rows.map((r, i) => (i % every === 0 ? [PAD.l + i * step, dayStr(r.day)] : null)).filter(Boolean);
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Visitas por dia">${axes(W, iw, ih, max, labels)}
    <path d="${fill}" class="area"/><path d="${line}" class="line"/>
    <line class="xh" y1="${PAD.t}" y2="${PAD.t + ih}" x1="0" x2="0" visibility="hidden"/><circle class="dot" r="5" visibility="hidden"/>
    <rect class="hit-all" x="${PAD.l}" y="${PAD.t}" width="${iw}" height="${ih}"/></svg>
    ${vals.some(Boolean) ? "" : `<p class="team-chart-empty">O contador de visitas começou agora. Os números aparecem a partir de hoje.</p>`}`;
  const tip = tooltip(el), xh = $(".xh", el), dot = $(".dot", el), svg = $("svg", el);
  const move = (e) => {
    const rect = svg.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * W;
    const i = Math.max(0, Math.min(rows.length - 1, Math.round((x - PAD.l) / step)));
    const [px, py] = pts[i];
    xh.setAttribute("x1", px); xh.setAttribute("x2", px); xh.setAttribute("visibility", "visible");
    dot.setAttribute("cx", px); dot.setAttribute("cy", py); dot.setAttribute("visibility", "visible");
    place(el, tip, (px / W) * rect.width, `<strong>${dayLong(rows[i].day)}</strong><span>Visitas <b>${NUM.format(rows[i].sessions)}</b></span><span>Páginas vistas <b>${NUM.format(rows[i].views)}</b></span>`);
  };
  $(".hit-all", el).addEventListener("pointermove", move);
  el.addEventListener("pointerleave", () => { tip.hidden = true; xh.setAttribute("visibility", "hidden"); dot.setAttribute("visibility", "hidden"); });
}

start();
