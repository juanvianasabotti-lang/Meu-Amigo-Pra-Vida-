import { requireAuth, isStaff, isAdmin, observeReveal } from "../app.js";
import sb from "../sb.js";
import {
  $, $$, esc, icons, L, toast, withLoading, setFieldError, clearErrors, fmtDate, fmtDateTime, timeAgo, statusPill,
  confirmDialog, promptDialog, modal, masks, markdown, isValidEmail,
} from "../ui.js";
import { emptyState, errorState, photoUrl } from "../components.js";
import { processImage } from "../image.js";

const view = $("[data-view]");
let ctx;
let admin = false;

const routes = { fila, organizacoes, animais, eventos, blog, contatos, lgpd, equipe, auditoria };
async function route() {
  const name = routes[location.hash.slice(1)] ? location.hash.slice(1) : "fila";
  if (["blog", "equipe", "auditoria"].includes(name) && !admin) { location.hash = "#fila"; return; }
  $$("[data-dash-nav] a").forEach((a) => (a.getAttribute("href") === `#${name}` ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current")));
  view.innerHTML = `<div class="loading-page"><span class="spinner" aria-label="Carregando"></span></div>`;
  try { await routes[name](); } catch (e) { console.error(e); view.innerHTML = errorState(e); }
  observeReveal(view);
}
async function refreshQueue() {
  try {
    const q = await sb.rpc("moderation_queue");
    $$("[data-q]").forEach((el) => { const n = q?.[el.dataset.q] || 0; el.textContent = n; el.classList.toggle("hidden", !n); });
    return q;
  } catch { return {}; }
}

// ---------------------------------------------------------------------------
async function fila() {
  const q = await refreshQueue();
  const card = (k, t, href, cls) => `<a class="step ${cls}" style="min-height:0;text-decoration:none" href="${href}"><span class="step-num" style="font-size:3rem">${q?.[k] || 0}</span><h3 class="mt-1">${t}</h3></a>`;
  view.innerHTML = `<div class="dash-title"><h1>Painel da equipe</h1></div>
    <div class="grid grid-3">${card("organizacoes", "organizações para verificar", "#organizacoes", "step-laranja")}${card("animais", "anúncios em análise", "#animais", "step-azul")}${card("eventos", "eventos em análise", "#eventos", "step-rosa")}
    ${card("contatos", "mensagens novas", "#contatos", "step-amarelo")}${card("lgpd", "solicitações LGPD abertas", "#lgpd", "step-laranja")}</div>
    <div class="notice info mt-3">${icons.info}<p>Boas práticas: verifique o CNPJ na Receita Federal, confira se as fotos são reais e recuse anúncios com indício de venda ou maus-tratos. Toda ação fica registrada na auditoria.</p></div>`;
}

// ---------------------------------------------------------------------------
async function organizacoes() {
  const filter = new URLSearchParams(location.search).get("status") || "pendente";
  const { data } = await sb.from("organizations").select("*,organization_private(*),profiles!organizations_owner_id_fkey(full_name,email,phone)")
    .eq("status", filter).order("submitted_at").limit(100);
  view.innerHTML = `<div class="dash-title"><h1>Organizações</h1>
    <div class="tabs" style="width:auto">${["pendente", "aprovada", "rejeitada", "suspensa"].map((s) => `<button class="tab" type="button" aria-selected="${s === filter}" data-filter="${s}">${esc(L.orgStatus[s])}</button>`).join("")}</div></div>
    ${data?.length ? `<div class="list">${data.map((o) => {
      const p = o.organization_private || {};
      const owner = o.profiles || {};
      return `<article class="card card-pad" data-org="${esc(o.id)}">
        <div class="flex justify-between wrap gap-1"><div class="flex items-center gap-2"><div class="org-logo">${o.logo_url ? `<img src="${esc(o.logo_url)}" alt="">` : esc(o.trade_name[0])}</div>
          <div><h2 class="h3 mb-0">${esc(o.trade_name)}</h2><p class="muted mb-0">${esc(L.orgKind[o.kind])} · enviado ${esc(timeAgo(o.submitted_at))}</p></div></div>${statusPill(o.status, L.orgStatus)}</div>
        <div class="grid grid-2 mt-2 small">
          <dl>${[["Documento", p.document ? `${p.document_type?.toUpperCase()} ${p.document_type === "cpf" ? masks.cpf(p.document) : masks.cnpj(p.document)}` : "— não informado —"], ["Razão social / nome", p.legal_name], ["Responsável", `${p.responsible_name || ""}${p.responsible_role ? ` (${p.responsible_role})` : ""}`], ["CPF do responsável", p.responsible_cpf ? masks.cpf(p.responsible_cpf) : "—"], ["Endereço", p.street ? `${p.street}, ${p.number}${p.complement ? ` - ${p.complement}` : ""}, ${p.district}, ${p.city} - ${p.state}, CEP ${masks.cep(p.cep)}` : "—"]].map(([k, v]) => `<dt class="bold mt-1">${esc(k)}</dt><dd style="margin:0">${esc(v || "—")}</dd>`).join("")}</dl>
          <dl>${[["Conta", `${owner.full_name || ""} · ${owner.email || ""}`], ["Telefone da conta", owner.phone ? masks.phone(owner.phone) : "—"], ["Instagram", o.instagram ? `@${o.instagram}` : "—"], ["Site", o.website || "—"], ["Pix", o.pix_key ? `${L.pix[o.pix_key_type]}: ${o.pix_key}` : "—"], ["Descrição", o.description || "—"]].map(([k, v]) => `<dt class="bold mt-1">${esc(k)}</dt><dd style="margin:0">${esc(v)}</dd>`).join("")}</dl>
        </div>
        ${p.document_type === "cnpj" ? `<a class="link small" href="https://solucoes.receita.fazenda.gov.br/servicos/cnpjreva/cnpjreva_solicitacao.asp" target="_blank" rel="noopener noreferrer">Consultar CNPJ na Receita Federal ↗</a>` : ""}
        ${o.review_note ? `<p class="small mt-1"><strong>Nota da moderação:</strong> ${esc(o.review_note)}</p>` : ""}
        <div class="flex gap-1 wrap mt-2">
          ${o.status !== "aprovada" ? `<button class="btn btn-sm btn-azul" type="button" data-act="aprovada" ${p.document ? "" : "disabled title='Documento não enviado'"}>${icons.check} Aprovar</button>` : ""}
          ${o.status === "pendente" ? `<button class="btn btn-sm btn-branco" type="button" data-act="rejeitada">Pedir ajustes</button>` : ""}
          ${o.status === "aprovada" ? `<button class="btn btn-sm btn-ghost" type="button" data-act="suspensa">Suspender</button>` : ""}
        </div></article>`;
    }).join("")}</div>` : emptyState({ title: "Nada por aqui", text: "Nenhuma organização com este status.", art: icons.check })}`;
  $$("[data-filter]", view).forEach((b) => b.addEventListener("click", () => { history.replaceState(null, "", `?status=${b.dataset.filter}#organizacoes`); organizacoes(); }));
  $$("[data-org]", view).forEach((card) => $$("[data-act]", card).forEach((b) => b.addEventListener("click", async () => {
    const st = b.dataset.act;
    let note = null;
    if (st !== "aprovada") { note = await promptDialog({ title: st === "rejeitada" ? "O que precisa ser ajustado?" : "Motivo da suspensão", label: "Mensagem para o titular" }); if (!note) return; }
    else if (!(await confirmDialog({ title: "Aprovar organização?", message: "Ela ficará pública e poderá publicar anúncios e eventos.", confirmText: "Aprovar" }))) return;
    try { await sb.rpc("moderate_organization", { p_org: card.dataset.org, p_status: st, p_note: note }); toast("Feito!", "ok"); refreshQueue(); organizacoes(); }
    catch (er) { toast(er.message, "bad"); }
  })));
}

// ---------------------------------------------------------------------------
async function animais() {
  const { data } = await sb.from("animals").select("*,animal_photos(storage_path,is_cover,position),organizations(trade_name,status)")
    .eq("status", "em_analise").order("submitted_at").limit(60);
  view.innerHTML = `<div class="dash-title"><h1>Anúncios em análise</h1></div>
  ${data?.length ? data.map((a) => {
    const photos = (a.animal_photos || []).sort((x, y) => (y.is_cover - x.is_cover) || (x.position - y.position));
    return `<article class="card card-pad mb-3" data-animal="${esc(a.id)}">
      <div class="flex justify-between wrap gap-1"><div><h2 class="h3 mb-0">${esc(a.name)} · ${esc(L.species[a.species])}</h2>
        <p class="muted mb-0">${esc(a.publisher_name)}${a.organizations ? ` (${esc(L.orgStatus[a.organizations.status])})` : ""} · ${esc(a.city)} - ${esc(a.state)} · enviado ${esc(timeAgo(a.submitted_at || a.created_at))}</p></div></div>
      <div class="photo-grid mt-2">${photos.map((p) => `<a class="photo-tile" href="${esc(photoUrl(p.storage_path))}" target="_blank" rel="noopener"><img src="${esc(photoUrl(p.storage_path))}" alt="" loading="lazy"></a>`).join("") || `<p class="muted">Sem fotos</p>`}</div>
      <p class="mt-2 mb-1"><strong>${esc(L.sex[a.sex])} · ${esc(L.age[a.age_group])} · ${esc(L.size[a.size])} · ${esc(a.breed)}</strong></p>
      <div class="prose small">${markdown(a.description)}</div>
      ${a.health_notes ? `<p class="small"><strong>Saúde:</strong> ${esc(a.health_notes)}</p>` : ""}
      ${a.adoption_requirements ? `<p class="small"><strong>Requisitos:</strong> ${esc(a.adoption_requirements)}</p>` : ""}
      <div class="flex gap-1 wrap mt-2"><button class="btn btn-sm btn-azul" type="button" data-ok>${icons.check} Aprovar e publicar</button><button class="btn btn-sm btn-branco" type="button" data-no>Pedir ajustes</button></div>
    </article>`;
  }).join("") : emptyState({ title: "Fila vazia 🎉", text: "Nenhum anúncio aguardando análise.", art: icons.check })}`;
  $$("[data-animal]", view).forEach((card) => {
    const id = card.dataset.animal;
    $("[data-ok]", card).addEventListener("click", async () => {
      try { await sb.rpc("moderate_animal", { p_animal: id, p_approve: true, p_note: null }); toast("Publicado!", "ok"); refreshQueue(); animais(); } catch (er) { toast(er.message, "bad"); }
    });
    $("[data-no]", card).addEventListener("click", async () => {
      const note = await promptDialog({ title: "O que precisa ser ajustado?", label: "Mensagem para quem anunciou", placeholder: "Ex.: as fotos estão escuras; informe se é castrado…" });
      if (!note) return;
      try { await sb.rpc("moderate_animal", { p_animal: id, p_approve: false, p_note: note }); toast("Devolvido para ajustes.", "ok"); refreshQueue(); animais(); } catch (er) { toast(er.message, "bad"); }
    });
  });
}

// ---------------------------------------------------------------------------
async function eventos() {
  const { data } = await sb.from("events").select("*,organizations(trade_name)").eq("status", "em_analise").order("starts_at").limit(60);
  view.innerHTML = `<div class="dash-title"><h1>Eventos em análise</h1></div>
  ${data?.length ? data.map((e) => `<article class="card card-pad mb-3" data-ev="${esc(e.id)}">
    ${e.cover_url ? `<img src="${esc(e.cover_url)}" alt="" style="border-radius:16px;border:2px solid var(--preto);max-height:220px;width:100%;object-fit:cover">` : ""}
    <h2 class="h3 mt-2 mb-0">${esc(e.title)}</h2><p class="muted">${esc(L.eventKind[e.kind])} · ${esc(e.organizations?.trade_name || "")} · ${esc(fmtDateTime(e.starts_at))} · ${e.is_online ? "Online" : `${esc(e.city || "")} - ${esc(e.state || "")}`}</p>
    <p><strong>${esc(e.summary)}</strong></p>${e.description ? `<p class="small">${esc(e.description)}</p>` : ""}${e.external_url ? `<p class="small">Link: ${esc(e.external_url)}</p>` : ""}
    <div class="flex gap-1 wrap"><button class="btn btn-sm btn-azul" type="button" data-ok>Publicar</button><button class="btn btn-sm btn-branco" type="button" data-no>Pedir ajustes</button></div></article>`).join("")
    : emptyState({ title: "Fila vazia 🎉", text: "Nenhum evento aguardando análise.", art: icons.check })}`;
  $$("[data-ev]", view).forEach((card) => {
    $("[data-ok]", card).addEventListener("click", async () => { try { await sb.rpc("moderate_event", { p_event: card.dataset.ev, p_approve: true, p_note: null }); refreshQueue(); eventos(); } catch (er) { toast(er.message, "bad"); } });
    $("[data-no]", card).addEventListener("click", async () => {
      const note = await promptDialog({ title: "O que ajustar?", label: "Mensagem para a organização" });
      if (note) try { await sb.rpc("moderate_event", { p_event: card.dataset.ev, p_approve: false, p_note: note }); refreshQueue(); eventos(); } catch (er) { toast(er.message, "bad"); }
    });
  });
}

// ---------------------------------------------------------------------------
// Blog (somente administradores)
// ---------------------------------------------------------------------------
async function blog() {
  const [{ data: posts }, { data: cats }] = await Promise.all([
    sb.from("blog_posts").select("id,title,slug,status,featured,published_at,updated_at,blog_categories(name)").order("updated_at", { ascending: false }),
    sb.from("blog_categories").select("*").order("position"),
  ]);
  view.innerHTML = `<div class="dash-title"><h1>Blog de conscientização</h1><button class="btn btn-laranja btn-sm" type="button" data-new>${icons.plus} Novo artigo</button></div>
    <div class="list">${(posts || []).map((p) => `<div class="list-item" data-post="${esc(p.id)}"><div class="thumb">${icons.book}</div>
      <div><h3>${esc(p.title)} ${p.featured ? "⭐" : ""}</h3><p>${esc(p.blog_categories?.name || "Sem categoria")} · atualizado ${esc(timeAgo(p.updated_at))}</p></div>
      <div class="actions">${statusPill(p.status === "publicado" ? "publicado" : "rascunho", L.contentStatus)}${p.status === "publicado" ? `<a class="btn btn-sm btn-ghost" href="/blog/${esc(p.slug)}" target="_blank">Ver</a>` : ""}<button class="btn btn-sm btn-branco" type="button" data-edit>${icons.edit} Editar</button><button class="btn btn-sm btn-ghost" type="button" data-del aria-label="Excluir">${icons.trash}</button></div></div>`).join("")}</div>`;
  $("[data-new]", view).addEventListener("click", () => postEditor(null, cats));
  $$("[data-post]", view).forEach((row) => {
    $("[data-edit]", row).addEventListener("click", async () => {
      const { data } = await sb.from("blog_posts").select("*").eq("id", row.dataset.post).single();
      postEditor(data, cats);
    });
    $("[data-del]", row).addEventListener("click", async () => {
      if (!(await confirmDialog({ title: "Excluir artigo?", message: "Essa ação não pode ser desfeita.", confirmText: "Excluir", danger: true }))) return;
      try { await sb.from("blog_posts").delete().eq("id", row.dataset.post); blog(); } catch (er) { toast(er.message, "bad"); }
    });
  });
}

function postEditor(p, cats) {
  const x = p || { status: "rascunho", tags: [] };
  view.innerHTML = `<a class="link small" href="#blog" data-back>← Artigos</a>
  <div class="dash-title mt-2"><h1>${p ? "Editar artigo" : "Novo artigo"}</h1></div>
  <form class="form" novalidate data-post-form>
    <div class="card card-pad form">
      <div class="field"><label for="pt">Título <span class="req">*</span></label><input class="input" id="pt" name="title" maxlength="140" value="${esc(x.title || "")}"></div>
      <div class="form-row"><div class="field"><label for="ps">Endereço (slug)</label><input class="input" id="ps" name="slug" maxlength="120" value="${esc(x.slug || "")}" placeholder="gerado a partir do título"></div>
        <div class="field"><label for="pc">Categoria</label><select class="select" id="pc" name="category_id"><option value="">Sem categoria</option>${(cats || []).map((c) => `<option value="${esc(c.id)}" ${x.category_id === c.id ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select></div></div>
      <div class="field"><label for="pe">Resumo <span class="req">*</span></label><textarea class="textarea" id="pe" name="excerpt" maxlength="300" style="min-height:80px">${esc(x.excerpt || "")}</textarea></div>
      <div class="field"><span class="label">Capa (16:10)</span><div class="flex gap-1 items-center wrap"><label class="btn btn-sm btn-branco">${icons.camera} Escolher imagem<input type="file" accept="image/*" class="sr-only" data-cover></label><span data-cover-prev class="small muted">${x.cover_url ? "Capa definida ✔" : "Sem capa (usa a arte da categoria)"}</span></div></div>
      <div class="field"><label for="pa">Texto alternativo da capa</label><input class="input" id="pa" name="cover_alt" maxlength="200" value="${esc(x.cover_alt || "")}"></div>
      <div class="field"><label for="ptags">Tags (separadas por vírgula)</label><input class="input" id="ptags" name="tags" value="${esc((x.tags || []).join(", "))}"></div>
    </div>
    <div class="grid grid-2 mt-3" style="align-items:start">
      <div class="card card-pad form"><label for="pm" class="bold">Conteúdo (Markdown) <span class="req">*</span></label>
        <p class="small muted mb-0">Use ## para subtítulos, **negrito**, - listas, &gt; destaque, [texto](https://link).</p>
        <textarea class="textarea" id="pm" name="content_md" style="min-height:460px;font-family:ui-monospace,monospace;font-size:.92rem">${esc(x.content_md || "")}</textarea></div>
      <div class="card card-pad"><p class="bold">Pré-visualização</p><div class="prose" data-preview></div></div>
    </div>
    <div class="card card-pad mt-3 flex gap-2 wrap items-center">
      <label class="check"><input type="checkbox" name="featured" ${x.featured ? "checked" : ""}> Destaque na página inicial</label>
      <select class="select" name="status" style="width:auto"><option value="rascunho" ${x.status === "rascunho" ? "selected" : ""}>Rascunho</option><option value="publicado" ${x.status === "publicado" ? "selected" : ""}>Publicado</option></select>
      <button class="btn btn-laranja" type="submit">Salvar</button>
    </div>
  </form>`;
  const form = $("[data-post-form]", view);
  const prev = $("[data-preview]", view);
  const upd = () => { prev.innerHTML = markdown(form.content_md.value); };
  form.content_md.addEventListener("input", upd); upd();
  let cover = null;
  $("[data-cover]", view).addEventListener("change", async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try { cover = await processImage(f, { aspect: 16 / 10, width: 1600, title: "Capa do artigo" }); if (cover) $("[data-cover-prev]", view).textContent = "Nova capa pronta ✔"; } catch (er) { toast(er.message, "bad"); }
  });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearErrors(form);
    const v = Object.fromEntries(new FormData(form).entries());
    let ok = true;
    if ((v.title || "").trim().length < 5) { ok = false; setFieldError(form.title, "Título muito curto."); }
    if ((v.excerpt || "").trim().length < 20) { ok = false; setFieldError(form.excerpt, "Resumo com pelo menos 20 caracteres."); }
    if ((v.content_md || "").trim().length < 50) { ok = false; setFieldError(form.content_md, "Conteúdo muito curto."); }
    const slug = (v.slug || "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    if (!ok) return;
    await withLoading($('button[type="submit"]', form), async () => {
      try {
        const row = {
          title: v.title.trim(), slug: slug || null, category_id: v.category_id || null, excerpt: v.excerpt.trim(), content_md: v.content_md,
          cover_alt: v.cover_alt?.trim() || null, tags: (v.tags || "").split(",").map((t) => t.trim()).filter(Boolean).slice(0, 10),
          featured: form.featured.checked, status: v.status,
        };
        if (cover) {
          const path = `${ctx.profile.id}/blog-${Date.now()}.webp`;
          await sb.storage.upload("blog-media", path, cover, { contentType: cover.type });
          row.cover_url = sb.storage.publicUrl("blog-media", path);
        }
        if (p) await sb.from("blog_posts").update(row, { returning: false }).eq("id", p.id);
        else await sb.from("blog_posts").insert(row, { returning: false });
        toast("Artigo salvo!", "ok");
        location.hash = "#blog"; blog();
      } catch (er) { toast(er.message, "bad", 6000); }
    });
  });
}

// ---------------------------------------------------------------------------
async function contatos() {
  const { data } = await sb.from("contact_messages").select("*").in("status", ["novo", "em_atendimento"]).order("created_at", { ascending: false }).limit(100);
  const topic = { duvida: "Dúvida", parceria: "Parceria", imprensa: "Imprensa", privacidade: "Privacidade", denuncia_anuncio: "Denúncia de anúncio", outro: "Outro" };
  view.innerHTML = `<div class="dash-title"><h1>Mensagens de contato</h1></div>
  ${data?.length ? data.map((c) => `<article class="card card-pad mb-2" data-c="${esc(c.id)}"><div class="flex justify-between wrap gap-1"><div><strong>${esc(c.name)}</strong> · <a class="link" href="mailto:${esc(c.email)}">${esc(c.email)}</a></div><span class="chip ${c.topic === "denuncia_anuncio" ? "chip-laranja" : "chip-soft"}">${esc(topic[c.topic])}</span></div>
    <p class="mt-1" style="white-space:pre-wrap">${esc(c.message)}</p><p class="small muted">${esc(fmtDateTime(c.created_at))}</p>
    <div class="flex gap-1 wrap">${c.status === "novo" ? `<button class="btn btn-sm btn-branco" type="button" data-st="em_atendimento">Em atendimento</button>` : ""}<button class="btn btn-sm btn-azul" type="button" data-st="resolvido">Resolvido</button><button class="btn btn-sm btn-ghost" type="button" data-st="arquivado">Arquivar</button></div></article>`).join("")
    : emptyState({ title: "Caixa vazia", text: "Nenhuma mensagem pendente.", art: icons.check })}`;
  $$("[data-c]", view).forEach((card) => $$("[data-st]", card).forEach((b) => b.addEventListener("click", async () => {
    try { await sb.from("contact_messages").update({ status: b.dataset.st }, { returning: false }).eq("id", card.dataset.c); refreshQueue(); contatos(); } catch (er) { toast(er.message, "bad"); }
  })));
}

async function lgpd() {
  const { data } = await sb.from("data_subject_requests").select("*").order("created_at", { ascending: false }).limit(100);
  view.innerHTML = `<div class="dash-title"><h1>Solicitações LGPD</h1></div>
  <div class="notice info mb-3">${icons.shield}<p>Prazo de resposta: até 15 dias. Para exportação, o titular pode baixar os dados sozinho em Minha conta → Privacidade.</p></div>
  ${data?.length ? data.map((r) => {
    const late = !["concluida", "negada"].includes(r.status) && new Date(r.due_at) < new Date();
    return `<article class="card card-pad mb-2" data-r="${esc(r.id)}"><div class="flex justify-between wrap gap-1"><div><strong>${esc(L.dsr[r.request_type])}</strong> · ${esc(r.contact_email)}</div>${statusPill(r.status, L.dsrStatus)}</div>
      ${r.details ? `<p class="mt-1">${esc(r.details)}</p>` : ""}<p class="small ${late ? "" : "muted"}" style="${late ? "color:var(--vermelho);font-weight:700" : ""}">Aberta em ${esc(fmtDate(r.created_at))} · prazo ${esc(fmtDate(r.due_at))}${late ? " · ATRASADA" : ""}</p>
      ${r.response ? `<p class="small"><strong>Resposta:</strong> ${esc(r.response)}</p>` : ""}
      ${["aberta", "em_andamento"].includes(r.status) ? `<div class="flex gap-1 wrap"><button class="btn btn-sm btn-branco" type="button" data-st="em_andamento">Em andamento</button><button class="btn btn-sm btn-azul" type="button" data-st="concluida">Concluir com resposta</button><button class="btn btn-sm btn-ghost" type="button" data-st="negada">Negar (justificar)</button></div>` : ""}</article>`;
  }).join("") : emptyState({ title: "Nenhuma solicitação", text: "Quando titulares exercerem seus direitos, os pedidos aparecem aqui.", art: icons.shield })}`;
  $$("[data-r]", view).forEach((card) => $$("[data-st]", card).forEach((b) => b.addEventListener("click", async () => {
    const st = b.dataset.st;
    let response;
    if (st !== "em_andamento") { response = await promptDialog({ title: "Resposta ao titular", label: "Descreva o que foi feito (ou o motivo legal da negativa)" }); if (!response) return; }
    try { await sb.from("data_subject_requests").update(response ? { status: st, response } : { status: st }, { returning: false }).eq("id", card.dataset.r); refreshQueue(); lgpd(); } catch (er) { toast(er.message, "bad"); }
  })));
}

async function equipe() {
  const { data } = await sb.from("user_roles").select("role,created_at,profiles!user_roles_user_id_fkey(full_name,email)").order("created_at");
  view.innerHTML = `<div class="dash-title"><h1>Equipe</h1></div>
    <div class="list mb-3">${(data || []).map((r) => `<div class="list-item"><div class="thumb">${icons.user}</div><div><h3>${esc(r.profiles?.full_name || "")}</h3><p>${esc(r.profiles?.email || "")} · desde ${esc(fmtDate(r.created_at))}</p></div>
      <div class="actions"><span class="chip ${r.role === "admin" ? "chip-laranja" : "chip-azul"}">${r.role === "admin" ? "Administrador" : "Moderador"}</span>${r.profiles?.email !== ctx.profile.email ? `<button class="btn btn-sm btn-ghost" type="button" data-rm="${esc(r.profiles?.email || "")}" data-role="${esc(r.role)}">Remover</button>` : ""}</div></div>`).join("")}</div>
    <form class="card card-pad form" data-role-form novalidate><h2 class="h3">Adicionar pessoa à equipe</h2><p class="small muted mb-0">A pessoa precisa ter uma conta criada no site.</p>
      <div class="form-row"><div class="field"><label for="re">E-mail</label><input class="input" id="re" name="email" type="email"></div>
      <div class="field"><label for="rr">Papel</label><select class="select" id="rr" name="role"><option value="moderador">Moderador (modera anúncios, ONGs e eventos)</option><option value="admin">Administrador (tudo, inclusive blog e equipe)</option></select></div></div>
      <button class="btn btn-azul" type="submit">Conceder acesso</button></form>`;
  const form = $("[data-role-form]", view);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!isValidEmail(form.email.value)) { setFieldError(form.email, "E-mail inválido."); return; }
    try { await sb.rpc("set_user_role", { p_email: form.email.value.trim().toLowerCase(), p_role: form.role.value, p_grant: true }); toast("Acesso concedido.", "ok"); equipe(); } catch (er) { toast(er.message, "bad"); }
  });
  $$("[data-rm]", view).forEach((b) => b.addEventListener("click", async () => {
    if (!(await confirmDialog({ title: "Remover acesso?", message: b.dataset.rm, confirmText: "Remover", danger: true }))) return;
    try { await sb.rpc("set_user_role", { p_email: b.dataset.rm, p_role: b.dataset.role, p_grant: false }); equipe(); } catch (er) { toast(er.message, "bad"); }
  }));
}

async function auditoria() {
  const { data } = await sb.from("audit_log").select("*").order("created_at", { ascending: false }).limit(200);
  view.innerHTML = `<div class="dash-title"><h1>Auditoria</h1></div><p class="muted">Últimos 200 registros de operações sensíveis (moderação, acessos a CPF, exportações e exclusões).</p>
    <div class="card card-pad" style="overflow-x:auto"><table class="prose" style="font-size:.85rem;display:table"><thead><tr><th>Quando</th><th>Ação</th><th>Entidade</th><th>Detalhes</th></tr></thead><tbody>
    ${(data || []).map((r) => `<tr><td>${esc(fmtDateTime(r.created_at))}</td><td>${esc(r.action)}</td><td>${esc(r.entity)}</td><td><code>${esc(JSON.stringify(r.metadata))}</code></td></tr>`).join("")}</tbody></table></div>`;
}

(async () => {
  ctx = await requireAuth();
  if (!ctx) { view.innerHTML = errorState({ code: "not_configured" }); return; }
  if (!isStaff(ctx)) { view.innerHTML = emptyState({ title: "Acesso restrito", text: "Esta área é exclusiva da equipe do Meu Amigo Pra Vida.", cta: `<a class="btn" href="/">Voltar ao início</a>`, art: icons.shield }); $("[data-dash-nav]").remove(); return; }
  admin = isAdmin(ctx);
  if (!admin) $$("[data-admin-only]").forEach((a) => a.remove());
  window.addEventListener("hashchange", route);
  refreshQueue();
  route();
})();
void modal;
