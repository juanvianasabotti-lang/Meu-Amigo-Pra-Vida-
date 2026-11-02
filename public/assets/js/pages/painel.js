import { requireAuth, getContext, observeReveal } from "../app.js";
import sb from "../sb.js";
import {
  $, $$, esc, icons, L, toast, bindMasks, ufOptions, withLoading, setFieldError, clearErrors, focusFirstError,
  isValidCPF, isValidCNPJ, isValidPhone, isValidEmail, digits, masks, lookupCEP, fmtDate, fmtDateTime, timeAgo,
  statusPill, confirmDialog, modal, initials,
} from "../ui.js";
import { emptyState, errorState, photoUrl, coverPath } from "../components.js";
import { processImage } from "../image.js";
import { setupChatFor, stopChat } from "../chat.js";

const view = $("[data-view]");
let ctx;
const isOrgAccount = () => ["ong", "empresa"].includes(ctx.profile.account_type);
const canPostAnimals = () => ctx.profile.account_type !== "empresa";

const routes = { inicio: renderInicio, organizacao: renderOrganizacao, animais: renderAnimais, pedidos: renderPedidos, eventos: renderEventos };
function current() {
  const m = location.pathname.match(/^\/painel\/pedidos\/([0-9a-f-]{36})/i);
  if (m) return ["pedido", m[1]];
  const sub = location.pathname.match(/^\/painel\/(organizacao|animais|eventos|pedidos)\/?$/);
  if (sub) { history.replaceState(null, "", `/painel#${sub[1]}`); return [sub[1]]; }
  let h = location.hash.replace("#", "");
  if (h === "novo-animal") return ["animais", "novo"];
  return [routes[h] ? h : "inicio"];
}
async function route() {
  stopChat();
  const [name, arg] = current();
  $$("[data-dash-nav] a").forEach((a) => {
    const on = a.getAttribute("href") === `#${name === "pedido" ? "pedidos" : name}`;
    if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  });
  view.innerHTML = `<div class="loading-page"><span class="spinner" aria-label="Carregando"></span></div>`;
  try {
    if (name === "pedido") await renderPedido(arg);
    else await routes[name](arg);
  } catch (e) { console.error(e); view.innerHTML = errorState(e); }
  observeReveal(view);
}
async function reloadCtx() { ctx = await getContext({ force: true }); }

// ---------------------------------------------------------------------------
// Visão geral
// ---------------------------------------------------------------------------
async function renderInicio() {
  const p = ctx.profile;
  const org = ctx.org;
  let stats = { animais: 0, pedidos: 0, adotados: 0 };
  if (canPostAnimals()) {
    const [a, ap, ad] = await Promise.all([
      sb.from("animals").select("id", { count: true }).eq("owner_id", p.id).in("status", ["disponivel", "em_processo", "em_analise"]).limit(1),
      sb.from("adoption_applications").select("id", { count: true }).eq("manager_id", p.id).in("status", ["enviado", "em_analise", "entrevista", "visita", "aprovado"]).limit(1),
      sb.from("animals").select("id", { count: true }).eq("owner_id", p.id).eq("status", "adotado").limit(1),
    ]);
    stats = { animais: a.count || 0, pedidos: ap.count || 0, adotados: ad.count || 0 };
  }
  const orgBanner = isOrgAccount() ? orgStatusBanner(org) : "";
  view.innerHTML = `
    <div class="dash-title"><h1>Olá, ${esc(p.display_name || "amigo(a)")}!</h1></div>
    ${orgBanner}
    ${canPostAnimals() ? `<div class="grid grid-3 mb-3">
      <div class="step step-laranja" style="min-height:0"><span class="step-num" style="font-size:3rem">${stats.animais}</span><h3 class="mt-1">anúncios ativos</h3><a class="link" href="#animais">Gerenciar →</a></div>
      <div class="step step-azul" style="min-height:0"><span class="step-num" style="font-size:3rem">${stats.pedidos}</span><h3 class="mt-1">pedidos em andamento</h3><a class="link" href="#pedidos">Responder →</a></div>
      <div class="step step-rosa" style="min-height:0"><span class="step-num" style="font-size:3rem">${stats.adotados}</span><h3 class="mt-1">adoções concluídas</h3><span class="link">Que orgulho!</span></div>
    </div>
    <div class="card card-pad flex justify-between items-center wrap gap-2"><div><h2 class="h3 mb-0">Tem um amigo procurando um lar?</h2><p class="muted mb-0">Cadastre com fotos bonitas e informações honestas. Nossa equipe revisa rapidinho.</p></div>
      <a class="btn btn-laranja" href="#novo-animal">${icons.plus} Anunciar um animal</a></div>`
    : `<div class="card card-pad"><h2 class="h3">Sua vitrine de parceiro</h2><p class="muted">Mantenha os dados da empresa completos e divulgue campanhas e eventos para a comunidade.</p>
       <div class="flex gap-1 wrap"><a class="btn btn-azul" href="#organizacao">Editar vitrine</a><a class="btn btn-branco" href="#eventos">Criar campanha ou evento</a>${org?.status === "aprovada" ? `<a class="btn btn-ghost" href="/organizacao/${esc(org.slug)}">Ver página pública</a>` : ""}</div></div>`}`;
}

function orgStatusBanner(org) {
  if (!org) return `<div class="notice mb-3">${icons.info}<p><strong>Falta a etapa 2:</strong> cadastre os dados da sua ${ctx.profile.account_type === "ong" ? "ONG" : "empresa"} para que nossa equipe verifique. <a class="link" href="#organizacao">Completar agora</a></p></div>`;
  const map = {
    pendente: ["notice", "Seu cadastro está em análise pela nossa equipe. Você será avisado por aqui assim que for aprovado."],
    aprovada: ["notice ok", "Organização verificada. Sua página está pública."],
    rejeitada: ["notice bad", `O cadastro precisa de ajustes: ${org.review_note || "confira os dados"}. Corrija e reenvie para análise.`],
    suspensa: ["notice bad", `Organização suspensa: ${org.review_note || "fale com o suporte"}.`],
  };
  const [cls, txt] = map[org.status];
  return `<div class="${cls} mb-3">${org.status === "aprovada" ? icons.check : icons.info}<p>${esc(txt)}</p></div>`;
}

// ---------------------------------------------------------------------------
// Organização (ONG / protetor / empresa) — etapa 2 do cadastro
// ---------------------------------------------------------------------------
const ONG_KINDS = ["ong", "protetor_independente"];
const EMP_KINDS = ["petshop", "clinica_veterinaria", "banho_e_tosa", "hotel_creche", "adestramento", "outro"];
const SERVICES = ["Banho", "Tosa", "Veterinário", "Vacinação", "Castração", "Hotel", "Creche", "Adestramento", "Ração e acessórios", "Farmácia", "Táxi pet", "Fotografia pet"];

async function renderOrganizacao() {
  if (!isOrgAccount()) { location.hash = "#inicio"; return; }
  const org = ctx.org;
  const priv = org ? (await sb.from("organization_private").select("*").eq("organization_id", org.id).maybeSingle()).data : null;
  const isOng = ctx.profile.account_type === "ong";
  const kinds = isOng ? ONG_KINDS : EMP_KINDS;
  const kind = org?.kind || kinds[0];
  const docLocked = org?.status === "aprovada";
  const o = org || {};
  const pv = priv || {};
  view.innerHTML = `
  <div class="dash-title"><h1>${org ? (isOng ? "Minha ONG" : "Minha empresa") : `Cadastro da ${isOng ? "ONG" : "empresa"} · etapa 2 de 2`}</h1>
    ${org?.status === "aprovada" ? `<a class="btn btn-sm btn-ghost" href="/organizacao/${esc(org.slug)}">Ver página pública</a>` : ""}</div>
  ${orgStatusBanner(org)}
  ${org?.status === "aprovada" ? `<div class="notice info mb-3">${icons.shield}<p>Por segurança, alterar <strong>nome, tipo, chave Pix, logo, site ou WhatsApp</strong> envia a organização para uma nova verificação rápida pela nossa equipe.</p></div>` : ""}
  <form class="form" novalidate data-org-form>
    <div class="card card-pad form">
      <h2 class="h3">Informações públicas</h2>
      <fieldset class="field"><legend class="label">Tipo <span class="req">*</span></legend>
        <div class="choice-grid">${kinds.map((k) => `<div class="choice"><input type="radio" name="kind" id="k-${k}" value="${k}" ${k === kind ? "checked" : ""}><label for="k-${k}">${esc(L.orgKind[k])}</label></div>`).join("")}</div></fieldset>
      <div class="flex gap-2 wrap items-center">
        <div class="org-logo" style="width:96px;height:96px" data-logo>${o.logo_url ? `<img src="${esc(o.logo_url)}" alt="">` : esc(initials(o.trade_name || "?"))}</div>
        <label class="btn btn-sm btn-branco">${icons.camera} Enviar logo<input type="file" accept="image/*" class="sr-only" data-logo-input></label>
        <span class="hint">Quadrada, de preferência com fundo.</span>
      </div>
      <div class="form-row">
        <div class="field"><label for="trade_name">Nome ${isOng ? "da ONG / do protetor" : "fantasia"} <span class="req">*</span></label><input class="input" id="trade_name" name="trade_name" maxlength="120" value="${esc(o.trade_name || "")}"></div>
        <div class="field"><label for="founded_year">Ano de fundação</label><input class="input" id="founded_year" name="founded_year" type="number" min="1900" max="${new Date().getFullYear()}" value="${esc(o.founded_year || "")}"></div>
      </div>
      <div class="field"><label for="tagline">Frase de apresentação</label><input class="input" id="tagline" name="tagline" maxlength="140" value="${esc(o.tagline || "")}" placeholder="${isOng ? "Ex.: Resgatamos e cuidamos de cães e gatos desde 2015" : "Ex.: Banho e tosa com carinho no centro de Campinas"}"></div>
      <div class="field"><label for="description">Sobre ${isOng ? "o trabalho" : "a empresa"}</label><textarea class="textarea" id="description" name="description" maxlength="4000">${esc(o.description || "")}</textarea></div>
      ${!isOng ? `<fieldset class="field"><legend class="label">Serviços</legend><div class="chips">${SERVICES.map((s) => `<label class="check" style="margin-right:10px"><input type="checkbox" name="services" value="${esc(s)}" ${(o.services || []).includes(s) ? "checked" : ""}> ${esc(s)}</label>`).join("")}</div></fieldset>` : ""}
      <div class="form-row">
        <div class="field"><label for="org_email">E-mail público</label><input class="input" id="org_email" name="email" type="email" value="${esc(o.email || "")}"></div>
        <div class="field"><label for="whatsapp">WhatsApp público</label><input class="input" id="whatsapp" name="whatsapp" data-mask="phone" value="${esc(o.whatsapp ? masks.phone(o.whatsapp) : "")}"></div>
      </div>
      <div class="form-row">
        <div class="field"><label for="website">Site (https://)</label><input class="input" id="website" name="website" type="url" value="${esc(o.website || "")}" placeholder="https://"></div>
        <div class="field"><label for="instagram">Instagram</label><input class="input" id="instagram" name="instagram" value="${esc(o.instagram ? `@${o.instagram}` : "")}" placeholder="@seuperfil"></div>
      </div>
      ${isOng ? `<h3 class="mt-2" style="font-size:1.1rem">Doações via Pix <span class="muted small">(opcional, exibido na sua página)</span></h3>
      <div class="form-row"><div class="field"><label for="pix_key_type">Tipo de chave</label><select class="select" id="pix_key_type" name="pix_key_type"><option value="">Sem Pix</option>${Object.entries(L.pix).map(([k, v]) => `<option value="${k}" ${o.pix_key_type === k ? "selected" : ""}>${v}</option>`).join("")}</select></div>
        <div class="field"><label for="pix_key">Chave Pix</label><input class="input" id="pix_key" name="pix_key" maxlength="140" value="${esc(o.pix_key || "")}"></div></div>
      <p class="small muted">${icons.info} A chave fica visível para todos. Para proteger seus dados, prefira chave <strong>aleatória</strong> ou <strong>e-mail</strong> em vez de CPF ou telefone pessoal.</p>
      <label class="check"><input type="checkbox" name="accepts_volunteers" ${o.accepts_volunteers ? "checked" : ""}> Aceitamos voluntários e lares temporários</label>` : ""}
      <label class="check"><input type="checkbox" name="show_address" ${o.show_address ? "checked" : ""}> Mostrar o endereço completo na página pública (se não marcar, mostramos só cidade e UF)</label>
    </div>

    <div class="card card-pad form mt-3">
      <h2 class="h3">Dados para verificação ${icons.shield}</h2>
      <p class="muted small">Visíveis apenas para você e para a equipe de moderação. ${docLocked ? "Documento e razão social estão travados após a aprovação." : ""}</p>
      <div class="form-row">
        <div class="field"><label for="document" data-doc-label>${kind === "protetor_independente" ? "CPF do protetor" : "CNPJ"} <span class="req">*</span></label>
          <input class="input" id="document" name="document" ${docLocked ? "readonly" : ""} data-mask="${kind === "protetor_independente" ? "cpf" : "cnpj"}" value="${esc(pv.document ? (pv.document_type === "cpf" ? masks.cpf(pv.document) : masks.cnpj(pv.document)) : "")}"></div>
        <div class="field"><label for="legal_name" data-legal-label>${kind === "protetor_independente" ? "Nome completo" : "Razão social"} <span class="req">*</span></label><input class="input" id="legal_name" name="legal_name" ${docLocked ? "readonly" : ""} maxlength="160" value="${esc(pv.legal_name || "")}"></div>
      </div>
      <div class="form-row form-row-3">
        <div class="field"><label for="responsible_name">Responsável legal <span class="req">*</span></label><input class="input" id="responsible_name" name="responsible_name" maxlength="120" value="${esc(pv.responsible_name || ctx.profile.full_name || "")}"></div>
        <div class="field"><label for="responsible_role">Cargo</label><input class="input" id="responsible_role" name="responsible_role" maxlength="80" value="${esc(pv.responsible_role || "")}" placeholder="Presidente, sócio…"></div>
        <div class="field"><label for="responsible_cpf">CPF do responsável</label><input class="input" id="responsible_cpf" name="responsible_cpf" data-mask="cpf" value="${esc(pv.responsible_cpf ? masks.cpf(pv.responsible_cpf) : "")}"></div>
      </div>
      <div class="form-row form-row-3">
        <div class="field"><label for="cep">CEP <span class="req">*</span></label><input class="input" id="cep" name="cep" data-mask="cep" inputmode="numeric" value="${esc(pv.cep ? masks.cep(pv.cep) : "")}"></div>
        <div class="field" style="grid-column:span 2"><label for="street">Rua <span class="req">*</span></label><input class="input" id="street" name="street" maxlength="160" value="${esc(pv.street || "")}"></div>
      </div>
      <div class="form-row form-row-3">
        <div class="field"><label for="number">Número <span class="req">*</span></label><input class="input" id="number" name="number" maxlength="20" value="${esc(pv.number || "")}"></div>
        <div class="field"><label for="complement">Complemento</label><input class="input" id="complement" name="complement" maxlength="80" value="${esc(pv.complement || "")}"></div>
        <div class="field"><label for="district">Bairro <span class="req">*</span></label><input class="input" id="district" name="district" maxlength="80" value="${esc(pv.district || "")}"></div>
      </div>
      <div class="form-row" style="grid-template-columns:2fr 1fr">
        <div class="field"><label for="org_city">Cidade <span class="req">*</span></label><input class="input" id="org_city" name="city" maxlength="80" value="${esc(pv.city || ctx.profile.city || "")}"></div>
        <div class="field"><label for="org_state">UF <span class="req">*</span></label><select class="select" id="org_state" name="state">${ufOptions(pv.state || ctx.profile.state || "")}</select></div>
      </div>
      <label class="check"><input type="checkbox" name="declaration" ${org ? "checked" : ""}> Declaro que as informações são verdadeiras e que tenho autorização para representar esta organização. <span class="req">*</span></label>
    </div>
    <div class="flex gap-1 wrap mt-3">
      <button class="btn btn-laranja" type="submit">${org ? "Salvar alterações" : "Enviar para verificação"}</button>
      ${org?.status === "rejeitada" ? `<button class="btn btn-azul" type="button" data-resubmit>Reenviar para análise</button>` : ""}
    </div>
  </form>`;
  bindMasks(view);
  const form = $("[data-org-form]", view);
  let logoBlob = null;

  // tipo de documento muda com o tipo de organização
  form.addEventListener("change", (e) => {
    if (e.target.name !== "kind" || docLocked) return;
    const cpf = e.target.value === "protetor_independente";
    const doc = $("#document", form);
    doc.dataset.mask = cpf ? "cpf" : "cnpj";
    doc.value = "";
    $("[data-doc-label]", form).innerHTML = `${cpf ? "CPF do protetor" : "CNPJ"} <span class="req">*</span>`;
    $("[data-legal-label]", form).innerHTML = `${cpf ? "Nome completo" : "Razão social"} <span class="req">*</span>`;
    bindMasks(form);
  });
  $("#cep", form).addEventListener("blur", async () => {
    const r = await lookupCEP($("#cep", form).value);
    if (!r) return;
    if (r.street && !form.street.value) form.street.value = r.street;
    if (r.district && !form.district.value) form.district.value = r.district;
    if (r.city) form.city.value = r.city;
    if (r.state) form.state.value = r.state;
    form.number.focus();
  });
  $("[data-logo-input]", view).addEventListener("change", async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      logoBlob = await processImage(f, { aspect: 1, width: 600, title: "Ajuste a logo" });
      if (logoBlob) $("[data-logo]", view).innerHTML = `<img src="${URL.createObjectURL(logoBlob)}" alt="">`;
    } catch (er) { toast(er.message, "bad"); }
  });
  $("[data-resubmit]", view)?.addEventListener("click", async () => {
    try { await sb.from("organizations").update({ status: "pendente" }, { returning: false }).eq("id", org.id); toast("Reenviado para análise!", "ok"); await reloadCtx(); renderOrganizacao(); }
    catch (er) { toast(er.message, "bad"); }
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearErrors(form);
    const fd = new FormData(form);
    const v = Object.fromEntries(fd.entries());
    const selKind = v.kind;
    const docIsCpf = selKind === "protetor_independente";
    let ok = true;
    const err = (n, m) => { ok = false; setFieldError(form.querySelector(`[name=${n}]`), m); };
    if ((v.trade_name || "").trim().length < 2) err("trade_name", "Informe o nome.");
    if (v.email && !isValidEmail(v.email)) err("email", "E-mail inválido.");
    if (v.whatsapp && !isValidPhone(v.whatsapp)) err("whatsapp", "WhatsApp com DDD inválido.");
    if (v.website && !/^https:\/\/[^\s.]+\.[^\s]{2,}/i.test(v.website)) err("website", "Use um endereço começando com https://");
    if (v.instagram && !/^@?[A-Za-z0-9._]{1,30}$/.test(v.instagram.trim())) err("instagram", "Usuário do Instagram inválido.");
    if (v.pix_key_type && !(v.pix_key || "").trim()) err("pix_key", "Informe a chave Pix ou escolha 'Sem Pix'.");
    if (!docLocked) {
      if (docIsCpf ? !isValidCPF(v.document) : !isValidCNPJ(v.document)) err("document", docIsCpf ? "CPF inválido." : "CNPJ inválido.");
      if ((v.legal_name || "").trim().length < 2) err("legal_name", "Campo obrigatório.");
    }
    if ((v.responsible_name || "").trim().length < 3) err("responsible_name", "Informe o responsável.");
    if (v.responsible_cpf && !isValidCPF(v.responsible_cpf)) err("responsible_cpf", "CPF inválido.");
    if (digits(v.cep).length !== 8) err("cep", "CEP inválido.");
    for (const n of ["street", "number", "district", "city"]) if (!(v[n] || "").trim()) err(n, "Campo obrigatório.");
    if (!v.state) err("state", "Selecione a UF.");
    if (!form.declaration.checked) err("declaration", "Confirme a declaração.");
    if (!ok) { focusFirstError(form); return; }

    await withLoading($('button[type="submit"]', form), async () => {
      try {
        const pub = {
          kind: selKind, trade_name: v.trade_name.trim(), tagline: v.tagline?.trim() || null, description: v.description?.trim() || null,
          services: fd.getAll("services"), email: v.email?.trim() || null, whatsapp: v.whatsapp ? digits(v.whatsapp) : null,
          website: v.website?.trim() || null, instagram: v.instagram ? v.instagram.trim().replace(/^@/, "") : null,
          founded_year: v.founded_year ? Number(v.founded_year) : null, show_address: form.show_address.checked,
          accepts_volunteers: Boolean(form.accepts_volunteers?.checked),
          pix_key_type: isOng && v.pix_key_type ? v.pix_key_type : null, pix_key: isOng && v.pix_key_type ? v.pix_key.trim() : null,
        };
        let orgId = org?.id;
        if (orgId) await sb.from("organizations").update(pub, { returning: false }).eq("id", orgId);
        else {
          const { data } = await sb.from("organizations").insert({ ...pub, owner_id: ctx.profile.id }).select("id");
          orgId = data[0].id;
        }
        if (logoBlob) {
          const path = `${ctx.profile.id}/logo-${Date.now()}.webp`;
          await sb.storage.upload("org-media", path, logoBlob, { contentType: logoBlob.type });
          await sb.from("organizations").update({ logo_url: sb.storage.publicUrl("org-media", path) }, { returning: false }).eq("id", orgId);
        }
        const pr = {
          organization_id: orgId, responsible_name: v.responsible_name.trim(), responsible_role: v.responsible_role?.trim() || null,
          responsible_cpf: v.responsible_cpf ? digits(v.responsible_cpf) : null, cep: digits(v.cep), street: v.street.trim(), number: v.number.trim(),
          complement: v.complement?.trim() || null, district: v.district.trim(), city: v.city.trim(), state: v.state,
        };
        if (!docLocked) Object.assign(pr, { document_type: docIsCpf ? "cpf" : "cnpj", document: docIsCpf ? digits(v.document) : v.document, legal_name: v.legal_name.trim() });
        else Object.assign(pr, { document_type: priv.document_type, document: priv.document, legal_name: priv.legal_name });
        await sb.from("organization_private").upsert(pr, { onConflict: "organization_id", returning: false });
        await reloadCtx();
        const reReview = org?.status === "aprovada" && ctx.org?.status === "pendente";
        toast(!org ? "Cadastro enviado! Nossa equipe vai verificar e avisar você."
          : reReview ? "Dados salvos e enviados para nova verificação (por causa da mudança de nome, Pix ou contato)."
          : "Dados salvos!", "ok", 7000);
        applyNav();
        renderOrganizacao();
      } catch (er) { toast(er.message, "bad", 7000); }
    });
  });
}

// ---------------------------------------------------------------------------
// Anúncios de animais
// ---------------------------------------------------------------------------
const TRAITS = ["Brincalhão", "Carinhoso", "Calmo", "Tímido", "Sociável", "Protetor", "Independente", "Curioso", "Dorminhoco", "Agitado", "Obediente", "Companheiro"];

async function renderAnimais(mode) {
  if (!canPostAnimals()) { location.hash = "#inicio"; return; }
  if (ctx.profile.account_type === "ong" && !ctx.org) {
    view.innerHTML = emptyState({ title: "Primeiro, cadastre sua ONG", text: "Para anunciar animais como ONG ou protetor, complete a etapa 2 do cadastro.", cta: `<a class="btn btn-laranja" href="#organizacao">Cadastrar organização</a>` });
    return;
  }
  if (mode === "novo") return animalForm(null);
  const { data } = await sb.from("animals").select("id,slug,name,species,status,review_note,created_at,approved_at,animal_photos(storage_path,is_cover,position)")
    .eq("owner_id", ctx.profile.id).order("created_at", { ascending: false });
  view.innerHTML = `<div class="dash-title"><h1>Meus anúncios</h1><a class="btn btn-laranja btn-sm" href="#novo-animal">${icons.plus} Novo anúncio</a></div>
  ${ctx.profile.account_type === "ong" && ctx.org?.status !== "aprovada" ? `<div class="notice mb-3">${icons.info}<p>Seus anúncios só ficam públicos depois que a organização for aprovada.</p></div>` : ""}
  ${data?.length ? `<div class="list">${data.map((a) => {
    const c = coverPath(a);
    return `<div class="list-item" data-id="${esc(a.id)}">
      <div class="thumb">${c ? `<img src="${esc(photoUrl(c))}" alt="">` : ""}</div>
      <div><h3>${esc(a.name)}</h3><p>${statusPill(a.status, L.animalStatus)} · criado ${esc(timeAgo(a.created_at))}</p>
        ${a.status === "rejeitado" && a.review_note ? `<p class="small" style="color:var(--vermelho)">Moderação: ${esc(a.review_note)}</p>` : ""}
        ${!(a.animal_photos || []).length ? `<p class="small" style="color:var(--laranja-escuro)">Adicione pelo menos 1 foto para enviar à análise.</p>` : ""}</div>
      <div class="actions">
        <button class="btn btn-sm btn-branco" type="button" data-edit>${icons.edit} Editar</button>
        ${a.status === "disponivel" ? `<button class="btn btn-sm btn-rosa" type="button" data-status="adotado">Foi adotado!</button>` : ""}
        ${["rascunho", "rejeitado"].includes(a.status) ? `<button class="btn btn-sm btn-azul" type="button" data-status="em_analise">Enviar para análise</button>` : ""}
        ${["disponivel", "em_processo"].includes(a.status) ? `<a class="btn btn-sm btn-ghost" href="/adote/${esc(a.slug)}">Ver</a>` : ""}
        ${a.status !== "arquivado" ? `<button class="btn btn-sm btn-ghost" type="button" data-status="arquivado">Arquivar</button>` : ""}
        <button class="btn btn-sm btn-ghost" type="button" data-del aria-label="Excluir ${esc(a.name)}">${icons.trash}</button>
      </div></div>`;
  }).join("")}</div>` : emptyState({ title: "Nenhum anúncio ainda", text: "Que tal começar? Anuncie um animal com fotos e uma descrição honesta.", cta: `<a class="btn btn-laranja" href="#novo-animal">Anunciar um animal</a>` })}`;

  $$("[data-id]", view).forEach((row) => {
    const id = row.dataset.id;
    const a = data.find((x) => x.id === id);
    $("[data-edit]", row).addEventListener("click", () => animalForm(id));
    $$("[data-status]", row).forEach((b) => b.addEventListener("click", async () => {
      const st = b.dataset.status;
      if (st === "em_analise" && !(a.animal_photos || []).length) { toast("Adicione ao menos uma foto antes de enviar.", "bad"); animalForm(id); return; }
      if (st === "adotado" && !(await confirmDialog({ title: `${a.name} foi adotado?`, message: "O anúncio sai da lista de adoção e entra para as nossas histórias felizes.", confirmText: "Sim, foi adotado!" }))) return;
      if (st === "arquivado" && !(await confirmDialog({ title: "Arquivar anúncio?", message: "Ele deixa de aparecer no site. Você pode reenviar depois.", confirmText: "Arquivar" }))) return;
      try { await sb.from("animals").update({ status: st }, { returning: false }).eq("id", id); toast("Atualizado!", "ok"); renderAnimais(); }
      catch (er) { toast(er.message, "bad"); }
    }));
    $("[data-del]", row).addEventListener("click", async () => {
      if (!(await confirmDialog({ title: `Excluir ${a.name}?`, message: "O anúncio, as fotos e os pedidos ligados a ele serão apagados.", confirmText: "Excluir", danger: true }))) return;
      try {
        const paths = (a.animal_photos || []).map((p) => p.storage_path);
        if (paths.length) await sb.storage.remove("animal-photos", paths).catch(() => {});
        await sb.from("animals").delete().eq("id", id);
        toast("Anúncio excluído.", "ok"); renderAnimais();
      } catch (er) { toast(er.message, "bad"); }
    });
  });
}

async function animalForm(id) {
  const a = id ? (await sb.from("animals").select("*,animal_photos(id,storage_path,is_cover,position)").eq("id", id).single()).data : {};
  let photos = (a.animal_photos || []).sort((x, y) => (y.is_cover - x.is_cover) || (x.position - y.position));
  const ufDefault = a.state || ctx.org?.state || ctx.profile.state || "";
  const radio = (name, opts, val) => opts.map(([v, t]) => `<div class="choice"><input type="radio" name="${name}" id="${name}-${v}" value="${v}" ${val === v ? "checked" : ""}><label for="${name}-${v}">${t}</label></div>`).join("");
  const tri = (name, label, val) => `<div class="field"><span class="label">${label}</span><select class="select" name="${name}"><option value="">Não sei</option><option value="true" ${val === true ? "selected" : ""}>Sim</option><option value="false" ${val === false ? "selected" : ""}>Não</option></select></div>`;
  view.innerHTML = `
  <a class="link small" href="#animais">← Meus anúncios</a>
  <div class="dash-title mt-2"><h1>${id ? `Editar ${esc(a.name)}` : "Novo anúncio"}</h1></div>
  ${a.status === "rejeitado" && a.review_note ? `<div class="notice bad mb-3">${icons.alert}<p><strong>Ajuste pedido pela moderação:</strong> ${esc(a.review_note)}</p></div>` : ""}
  <form class="form" novalidate data-animal-form>
    <div class="card card-pad form">
      <h2 class="h3">Fotos <span class="muted small">(até 8, a primeira é a capa)</span></h2>
      <p class="small muted">Dicas: luz natural, na altura dos olhos do animal, fundo limpo. Você ajusta o enquadramento antes de enviar e todas ficam no mesmo padrão.${a.approved_at ? " Novas fotos passam por uma revisão rápida antes de aparecer." : ""}</p>
      <div class="photo-grid" data-photos></div>
    </div>
    <div class="card card-pad form mt-3">
      <h2 class="h3">Quem é</h2>
      <div class="form-row">
        <div class="field"><label for="a-name">Nome <span class="req">*</span></label><input class="input" id="a-name" name="name" maxlength="60" value="${esc(a.name || "")}"></div>
        <div class="field"><label for="a-breed">Raça</label><input class="input" id="a-breed" name="breed" maxlength="60" value="${esc(a.breed || "SRD (vira-lata)")}"></div>
      </div>
      <fieldset class="field"><legend class="label">Espécie <span class="req">*</span></legend><div class="choice-grid">${radio("species", [["cao", "Cão"], ["gato", "Gato"]], a.species)}</div></fieldset>
      <fieldset class="field"><legend class="label">Sexo <span class="req">*</span></legend><div class="choice-grid">${radio("sex", [["macho", "Macho"], ["femea", "Fêmea"]], a.sex)}</div></fieldset>
      <fieldset class="field"><legend class="label">Porte <span class="req">*</span></legend><div class="choice-grid">${radio("size", [["pequeno", "Pequeno"], ["medio", "Médio"], ["grande", "Grande"]], a.size)}</div></fieldset>
      <fieldset class="field"><legend class="label">Idade <span class="req">*</span></legend><div class="choice-grid">${radio("age_group", [["filhote", "Filhote"], ["adulto", "Adulto"], ["idoso", "Idoso"]], a.age_group)}</div></fieldset>
      <div class="form-row">
        <div class="field"><label for="a-color">Cor da pelagem</label><input class="input" id="a-color" name="coat_color" maxlength="60" value="${esc(a.coat_color || "")}"></div>
        <div class="field"><label for="a-weight">Peso aproximado (kg)</label><input class="input" id="a-weight" name="weight_kg" type="number" step="0.1" min="0.1" max="149" value="${esc(a.weight_kg || "")}"></div>
      </div>
      <div class="field"><label for="a-desc">Descrição <span class="req">*</span></label><textarea class="textarea" id="a-desc" name="description" minlength="30" maxlength="4000" placeholder="Conte a história, o jeitinho, do que gosta e do que não gosta.">${esc(a.description || "")}</textarea><span class="hint">Mínimo de 30 caracteres. Seja honesto: isso evita devoluções.</span></div>
      <fieldset class="field"><legend class="label">Personalidade <span class="muted small">(até 5)</span></legend><div class="chips">${TRAITS.map((t) => `<label class="check" style="margin-right:10px"><input type="checkbox" name="personality" value="${t}" ${(a.personality || []).includes(t) ? "checked" : ""}> ${t}</label>`).join("")}</div></fieldset>
      <div class="form-row form-row-3">${tri("good_with_children", "Convive com crianças?", a.good_with_children)}${tri("good_with_dogs", "Convive com cães?", a.good_with_dogs)}${tri("good_with_cats", "Convive com gatos?", a.good_with_cats)}</div>
    </div>
    <div class="card card-pad form mt-3">
      <h2 class="h3">Saúde e requisitos</h2>
      <div class="chips">${[["vaccinated", "Vacinado"], ["dewormed", "Vermifugado"], ["neutered", "Castrado"], ["microchipped", "Microchipado"], ["special_needs", "Tem necessidades especiais"]].map(([n, t]) => `<label class="check" style="margin-right:14px"><input type="checkbox" name="${n}" ${a[n] ? "checked" : ""}> ${t}</label>`).join("")}</div>
      <div class="field" data-special><label for="a-sn">Quais cuidados especiais?</label><input class="input" id="a-sn" name="special_needs_notes" maxlength="1000" value="${esc(a.special_needs_notes || "")}"></div>
      <div class="field"><label for="a-health">Observações de saúde</label><input class="input" id="a-health" name="health_notes" maxlength="1000" value="${esc(a.health_notes || "")}"></div>
      <div class="field"><label for="a-req">Requisitos para adoção</label><input class="input" id="a-req" name="adoption_requirements" maxlength="1000" value="${esc(a.adoption_requirements || "")}" placeholder="Ex.: casa com telas; visita prévia; termo de adoção"></div>
      <div class="form-row" style="grid-template-columns:2fr 1fr">
        <div class="field"><label for="a-city">Cidade <span class="req">*</span></label><input class="input" id="a-city" name="city" maxlength="80" value="${esc(a.city || ctx.org?.city || ctx.profile.city || "")}"></div>
        <div class="field"><label for="a-state">UF <span class="req">*</span></label><select class="select" id="a-state" name="state">${ufOptions(ufDefault)}</select></div>
      </div>
      ${ctx.profile.account_type === "ong" ? `<label class="check"><input type="checkbox" name="is_urgent" ${a.is_urgent ? "checked" : ""}> Precisa de lar com urgência</label>` : ""}
      <label class="check"><input type="checkbox" name="no_sale" ${id ? "checked" : ""}> Confirmo que é uma doação gratuita, sem venda, e que as informações são verdadeiras. <span class="req">*</span></label>
    </div>
    <div class="flex gap-1 wrap mt-3">
      <button class="btn btn-laranja" type="submit" data-submit-mode="em_analise">${id && a.approved_at ? "Salvar alterações" : "Salvar e enviar para análise"}</button>
      ${!a.approved_at ? `<button class="btn btn-branco" type="submit" data-submit-mode="rascunho">Salvar rascunho</button>` : ""}
    </div>
  </form>`;
  const form = $("[data-animal-form]", view);
  const special = $("[data-special]", form);
  special.classList.toggle("hidden", !a.special_needs);
  form.special_needs.addEventListener("change", () => special.classList.toggle("hidden", !form.special_needs.checked));
  form.addEventListener("change", (e) => {
    if (e.target.name === "personality" && $$('[name="personality"]:checked', form).length > 5) { e.target.checked = false; toast("Escolha até 5 traços.", "info"); }
  });

  let animalId = id;
  const pendingFiles = []; // fotos de um anúncio ainda não salvo
  const renderPhotos = () => {
    const tiles = photos.map((p, i) => `<div class="photo-tile"><img src="${esc(photoUrl(p.storage_path))}" alt="Foto ${i + 1}">
        ${i === 0 ? `<span class="chip chip-amarelo cover-tag">Capa</span>` : ""}
        <div class="tile-actions">${i ? `<button type="button" data-cover="${esc(p.id)}">Capa</button>` : "<span></span>"}<button type="button" data-rm="${esc(p.id)}">Remover</button></div></div>`);
    const pend = pendingFiles.map((b, i) => `<div class="photo-tile"><img src="${URL.createObjectURL(b)}" alt="Nova foto ${i + 1}"><span class="chip chip-azul cover-tag">Nova</span></div>`);
    const total = photos.length + pendingFiles.length;
    $("[data-photos]", form).innerHTML = tiles.join("") + pend.join("") + (total < 8
      ? `<label class="photo-add">${icons.camera}<span>Adicionar foto</span><input type="file" accept="image/*" data-add-photo></label>` : "");
    $("[data-add-photo]", form)?.addEventListener("change", onAdd);
    $$("[data-rm]", form).forEach((b) => b.addEventListener("click", () => removePhoto(b.dataset.rm)));
    $$("[data-cover]", form).forEach((b) => b.addEventListener("click", () => setCover(b.dataset.cover)));
  };
  const uploadBlob = async (blob, isCover) => {
    const path = `${ctx.profile.id}/${animalId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.webp`;
    await sb.storage.upload("animal-photos", path, blob, { contentType: blob.type });
    const { data } = await sb.from("animal_photos").insert({ animal_id: animalId, storage_path: path, is_cover: isCover, position: photos.length, width: 1200, height: 1500, alt_text: form.name.value ? `Foto de ${form.name.value}` : null }).select("id,storage_path,is_cover,position");
    photos.push(data[0]);
  };
  async function onAdd(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const blob = await processImage(f, { aspect: 4 / 5, width: 1200, title: "Enquadre a foto" });
      if (!blob) return;
      if (blob.size > 5 * 1024 * 1024) throw new Error("A foto final ficou maior que 5 MB. Tente reduzir o zoom.");
      if (!animalId) { pendingFiles.push(blob); renderPhotos(); return; }
      await uploadBlob(blob, photos.length === 0);
      renderPhotos();
      toast("Foto adicionada!", "ok", 1800);
    } catch (er) { toast(er.message, "bad"); }
  }
  async function removePhoto(pid) {
    const p = photos.find((x) => x.id === pid);
    try {
      await sb.from("animal_photos").delete().eq("id", pid);
      await sb.storage.remove("animal-photos", [p.storage_path]).catch(() => {});
      photos = photos.filter((x) => x.id !== pid);
      if (p.is_cover && photos[0]) await setCover(photos[0].id, true);
      renderPhotos();
    } catch (er) { toast(er.message, "bad"); }
  }
  async function setCover(pid, silent) {
    try {
      await sb.from("animal_photos").update({ is_cover: false }, { returning: false }).eq("animal_id", animalId).eq("is_cover", true);
      await sb.from("animal_photos").update({ is_cover: true }, { returning: false }).eq("id", pid);
      photos.forEach((x) => { x.is_cover = x.id === pid; });
      photos.sort((x, y) => (y.is_cover - x.is_cover) || (x.position - y.position));
      renderPhotos();
      if (!silent) toast("Capa atualizada!", "ok", 1600);
    } catch (er) { toast(er.message, "bad"); }
  }
  renderPhotos();

  let submitMode = "em_analise";
  $$("[data-submit-mode]", form).forEach((b) => b.addEventListener("click", () => { submitMode = b.dataset.submitMode; }));
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearErrors(form);
    const fd = new FormData(form);
    const v = Object.fromEntries(fd.entries());
    let ok = true;
    const err = (n, m) => { ok = false; setFieldError(form.querySelector(`[name=${n}]`), m); };
    if (!(v.name || "").trim()) err("name", "Informe o nome.");
    for (const [n, m] of [["species", "Escolha a espécie."], ["sex", "Escolha o sexo."], ["size", "Escolha o porte."], ["age_group", "Escolha a idade."]]) if (!v[n]) err(n, m);
    if ((v.description || "").trim().length < 30) err("description", "Escreva pelo menos 30 caracteres.");
    if ((v.city || "").trim().length < 2) err("city", "Informe a cidade.");
    if (!v.state) err("state", "Selecione a UF.");
    if (!form.no_sale.checked) err("no_sale", "Confirme que é uma doação gratuita.");
    if (submitMode === "em_analise" && photos.length + pendingFiles.length === 0) { ok = false; toast("Adicione pelo menos uma foto para enviar à análise.", "bad"); }
    if (!ok) { focusFirstError(form); return; }
    const tri = (n) => (v[n] === "true" ? true : v[n] === "false" ? false : null);
    const row = {
      name: v.name.trim(), breed: (v.breed || "").trim() || "SRD (vira-lata)", species: v.species, sex: v.sex, size: v.size, age_group: v.age_group,
      coat_color: v.coat_color?.trim() || null, weight_kg: v.weight_kg ? Number(v.weight_kg) : null, description: v.description.trim(),
      personality: fd.getAll("personality"), good_with_children: tri("good_with_children"), good_with_dogs: tri("good_with_dogs"), good_with_cats: tri("good_with_cats"),
      vaccinated: form.vaccinated.checked, dewormed: form.dewormed.checked, neutered: form.neutered.checked, microchipped: form.microchipped.checked,
      special_needs: form.special_needs.checked, special_needs_notes: form.special_needs.checked ? (v.special_needs_notes || "").trim() || null : null,
      health_notes: v.health_notes?.trim() || null, adoption_requirements: v.adoption_requirements?.trim() || null,
      city: v.city.trim(), state: v.state,
    };
    if (form.is_urgent) row.is_urgent = form.is_urgent.checked;
    const btn = e.submitter || $('button[type="submit"]', form);
    await withLoading(btn, async () => {
      try {
        if (!animalId) {
          const { data } = await sb.from("animals").insert({ ...row, owner_id: ctx.profile.id, status: "rascunho" }).select("id");
          animalId = data[0].id;
          for (let i = 0; i < pendingFiles.length; i++) await uploadBlob(pendingFiles[i], i === 0);
          pendingFiles.length = 0;
        } else {
          await sb.from("animals").update(row, { returning: false }).eq("id", animalId);
        }
        if (!a.approved_at || a.status === "rejeitado") await sb.from("animals").update({ status: submitMode }, { returning: false }).eq("id", animalId);
        let msg = submitMode === "rascunho" ? "Rascunho salvo." : "Enviado para análise! Avisaremos quando estiver no ar.";
        if (a.approved_at) {
          const { data: now } = await sb.from("animals").select("status").eq("id", animalId).maybeSingle();
          msg = now?.status === "em_analise" ? "Alterações salvas e enviadas para uma revisão rápida antes de voltar ao ar." : "Alterações salvas!";
        }
        toast(msg, "ok", 6000);
        const same = location.hash === "#animais";
        location.hash = "#animais";
        if (same) route();
      } catch (er) { toast(er.message, "bad", 7000); }
    });
  });
}

// ---------------------------------------------------------------------------
// Pedidos de adoção recebidos
// ---------------------------------------------------------------------------
const FLOW = ["em_analise", "entrevista", "visita", "aprovado", "concluido"];

async function renderPedidos() {
  if (!canPostAnimals()) { location.hash = "#inicio"; return; }
  const { data } = await sb.from("adoption_applications")
    .select("id,status,created_at,applicant_id,animals(name,slug,animal_photos(storage_path,is_cover,position))")
    .eq("manager_id", ctx.profile.id).order("created_at", { ascending: false }).limit(200);
  const ids = [...new Set((data || []).map((a) => a.applicant_id).filter(Boolean))];
  const people = ids.length ? (await sb.from("profiles").select("id,full_name,city,state").in("id", ids)).data || [] : [];
  const byId = Object.fromEntries(people.map((p) => [p.id, p]));
  const groups = { abertos: [], encerrados: [] };
  (data || []).forEach((a) => (["recusado", "cancelado", "concluido"].includes(a.status) ? groups.encerrados : groups.abertos).push(a));
  const item = (a) => {
    const c = a.animals ? coverPath(a.animals) : null;
    const pp = byId[a.applicant_id];
    return `<div class="list-item"><div class="thumb">${c ? `<img src="${esc(photoUrl(c))}" alt="">` : ""}</div>
      <div><h3>${esc(pp?.full_name || "Candidato(a)")} → ${esc(a.animals?.name || "")}</h3><p>${pp ? `${esc(pp.city || "")} - ${esc(pp.state || "")} · ` : ""}recebido ${esc(timeAgo(a.created_at))}</p></div>
      <div class="actions">${statusPill(a.status, L.adoption)}<a class="btn btn-sm btn-azul" href="/painel/pedidos/${esc(a.id)}">Abrir</a></div></div>`;
  };
  view.innerHTML = `<div class="dash-title"><h1>Pedidos recebidos</h1></div>
  ${data?.length ? `<h2 class="h3">Em andamento (${groups.abertos.length})</h2><div class="list mb-3">${groups.abertos.map(item).join("") || `<p class="muted">Nenhum pedido em andamento.</p>`}</div>
    ${groups.encerrados.length ? `<details><summary class="bold" style="cursor:pointer">Encerrados (${groups.encerrados.length})</summary><div class="list mt-2">${groups.encerrados.map(item).join("")}</div></details>` : ""}`
    : emptyState({ title: "Nenhum pedido ainda", text: "Quando alguém pedir para adotar um dos seus animais, o questionário completo aparece aqui.", art: icons.heart })}`;
}

async function renderPedido(id) {
  const { data: a } = await sb.from("adoption_applications").select("*,animals(name,slug,species)").eq("id", id).maybeSingle();
  if (!a || a.manager_id !== ctx.profile.id) { view.innerHTML = emptyState({ title: "Pedido não encontrado", text: "Ele pode ter sido removido.", cta: `<a class="btn" href="/painel#pedidos">Voltar</a>` }); return; }
  const [{ data: person }, { data: note }, { data: hist }] = await Promise.all([
    a.applicant_id ? sb.from("profiles").select("full_name,email,phone,city,state,birth_date,bio").eq("id", a.applicant_id).maybeSingle() : Promise.resolve({ data: null }),
    sb.from("adoption_notes").select("note").eq("application_id", id).maybeSingle(),
    sb.from("application_status_history").select("to_status,created_at").eq("application_id", id).order("created_at"),
  ]);
  const open = !["recusado", "cancelado", "concluido"].includes(a.status);
  const yn = (v) => (v == null ? "—" : v ? "Sim" : "Não");
  const cpfStage = ["entrevista", "visita", "aprovado", "concluido"].includes(a.status);
  const idx = FLOW.indexOf(a.status);
  const nextSteps = FLOW.filter((s, i) => i > idx);
  view.innerHTML = `
  <a class="link small" href="/painel#pedidos">← Pedidos recebidos</a>
  <div class="dash-title mt-2"><h1>${esc(person?.full_name || "Candidato(a)")} quer adotar ${esc(a.animals.name)}</h1>${statusPill(a.status, L.adoption)}</div>
  ${open ? `<div class="card card-pad mb-3"><h2 class="h3">Próximo passo</h2><div class="flex gap-1 wrap">
     ${nextSteps.map((s) => `<button class="btn btn-sm ${s === "concluido" ? "btn-rosa" : "btn-azul"}" type="button" data-step="${s}">${esc(L.adoption[s])}</button>`).join("")}
     <button class="btn btn-sm btn-ghost" type="button" data-step="recusado">Não aprovar</button></div>
     <p class="small muted mt-1 mb-0">O candidato é avisado a cada mudança. "Adoção concluída" marca o animal como adotado e encerra os outros pedidos.</p></div>` : ""}
  <div class="grid grid-2" style="align-items:start">
    <div class="card card-pad">
      <h2 class="h3">Candidato(a)</h2>
      ${person ? `<dl class="small">${[["Nome", person.full_name], ["E-mail", person.email], ["Celular", person.phone ? masks.phone(person.phone) : "—"], ["Cidade", `${person.city || ""} - ${person.state || ""}`], ["Idade", person.birth_date ? `${new Date().getFullYear() - Number(person.birth_date.slice(0, 4))} anos (aprox.)` : "—"]].map(([k, v]) => `<dt class="bold mt-1">${esc(k)}</dt><dd style="margin:0">${esc(v)}</dd>`).join("")}</dl>
        ${person.bio ? `<p class="mt-2">${esc(person.bio)}</p>` : ""}
        ${person.phone ? `<a class="btn btn-sm btn-branco mt-2" href="https://wa.me/55${esc(person.phone.replace(/^55/, ""))}" target="_blank" rel="noopener noreferrer">${icons.whatsapp} WhatsApp</a>` : ""}
        <div class="mt-2" data-cpf>${cpfStage ? `<button class="btn btn-sm btn-ghost" type="button" data-show-cpf>${icons.shield} Ver CPF (acesso registrado)</button>` : `<p class="small muted mb-0">${icons.shield} O CPF fica disponível a partir da etapa de entrevista.</p>`}</div>`
        : `<p class="muted">Os dados do candidato foram removidos a pedido do titular (LGPD).</p>`}
      <h2 class="h3 mt-3">Questionário</h2>
      <dl class="small">${[
        ["Moradia", `${L.housing[a.housing_type]} · ${L.housingOwner[a.housing_owner]}`], ["Proprietário permite animais", yn(a.landlord_allows_pets)],
        ["Quintal", yn(a.has_yard)], ["Quintal cercado", yn(a.yard_fenced)], ["Telas de proteção", yn(a.window_screens)],
        ["Adultos na casa", a.adults_in_home], ["Crianças", `${a.children_in_home}${a.children_ages ? ` (${a.children_ages})` : ""}`], ["Todos concordam", yn(a.household_agrees)],
        ["Outros animais", a.other_pets || "—"], ["Animais anteriores", a.previous_pets || "—"], ["Horas sozinho por dia", a.hours_alone],
        ["Quem cuida na ausência", a.caretaker_when_away], ["Compromete-se a castrar", yn(a.agrees_to_neuter)], ["Motivação", a.motivation],
      ].map(([k, v]) => `<dt class="bold mt-1">${esc(k)}</dt><dd style="margin:0">${esc(v)}</dd>`).join("")}</dl>
    </div>
    <div>
      <div class="card card-pad"><h2 class="h3">Conversa</h2><div class="chat" data-chat></div>
        ${open ? `<form class="flex gap-1 mt-2" data-msg-form><label class="sr-only" for="msg">Mensagem</label><input class="input" id="msg" name="body" maxlength="2000" placeholder="Escreva uma mensagem…" autocomplete="off" required><button class="btn btn-azul" type="submit">Enviar</button></form>` : ""}</div>
      <form class="card card-pad mt-3 form" data-note-form><h2 class="h3">Anotações internas</h2><p class="small muted mb-0">Só você vê.</p>
        <textarea class="textarea" name="note" maxlength="2000">${esc(note?.note || "")}</textarea><button class="btn btn-sm btn-branco" type="submit">Salvar anotação</button></form>
      <div class="card card-pad mt-3"><h2 class="h3">Histórico</h2><ol class="timeline">${(hist || []).map((h) => `<li><strong>${esc(L.adoption[h.to_status])}</strong><time>${esc(fmtDateTime(h.created_at))}</time></li>`).join("")}</ol></div>
    </div>
  </div>`;
  setupChatFor(id, ctx.profile.id, view);
  $$("[data-step]", view).forEach((b) => b.addEventListener("click", async () => {
    const st = b.dataset.step;
    const msgs = { recusado: "O candidato será avisado de forma gentil. Considere explicar o motivo pelo chat.", concluido: `${a.animals.name} será marcado como adotado e os demais pedidos serão encerrados.` };
    if (msgs[st] && !(await confirmDialog({ title: L.adoption[st], message: msgs[st], confirmText: "Confirmar", danger: st === "recusado" }))) return;
    try { await sb.from("adoption_applications").update({ status: st }, { returning: false }).eq("id", id); toast("Status atualizado!", "ok"); refreshOpenApps(); renderPedido(id); }
    catch (er) { toast(er.message, "bad"); }
  }));
  $("[data-show-cpf]", view)?.addEventListener("click", async () => {
    try { const cpf = await sb.rpc("get_applicant_cpf", { p_application: id }); $("[data-cpf]", view).innerHTML = `<p class="mb-0"><strong>CPF:</strong> ${esc(masks.cpf(cpf || ""))}</p><p class="small muted">Use apenas para o termo de adoção.</p>`; }
    catch (er) { toast(er.message, "bad"); }
  });
  $("[data-note-form]", view).addEventListener("submit", async (e) => {
    e.preventDefault();
    const val = e.target.note.value.trim();
    try {
      if (val) await sb.from("adoption_notes").upsert({ application_id: id, note: val }, { onConflict: "application_id", returning: false });
      else await sb.from("adoption_notes").delete().eq("application_id", id);
      toast("Anotação salva.", "ok", 1800);
    } catch (er) { toast(er.message, "bad"); }
  });
}

// ---------------------------------------------------------------------------
// Campanhas e eventos
// ---------------------------------------------------------------------------
async function renderEventos() {
  if (!isOrgAccount()) { location.hash = "#inicio"; return; }
  if (ctx.org?.status !== "aprovada") {
    view.innerHTML = emptyState({ title: "Disponível após a aprovação", text: "Assim que sua organização for verificada, você poderá divulgar campanhas e eventos para toda a comunidade.", cta: `<a class="btn" href="#organizacao">Ver meu cadastro</a>`, art: icons.calendar });
    return;
  }
  const { data } = await sb.from("events").select("*").eq("organization_id", ctx.org.id).order("starts_at", { ascending: false });
  view.innerHTML = `<div class="dash-title"><h1>Campanhas e eventos</h1><button class="btn btn-laranja btn-sm" type="button" data-new>${icons.plus} Novo</button></div>
    ${data?.length ? `<div class="list">${data.map((ev) => `<div class="list-item" data-ev="${esc(ev.id)}"><div class="thumb">${icons.calendar}</div>
      <div><h3>${esc(ev.title)}</h3><p>${esc(L.eventKind[ev.kind])} · ${esc(fmtDateTime(ev.starts_at))}</p>${ev.status === "rejeitado" && ev.review_note ? `<p class="small" style="color:var(--vermelho)">Moderação: ${esc(ev.review_note)}</p>` : ""}</div>
      <div class="actions">${statusPill(ev.status, L.contentStatus)}<button class="btn btn-sm btn-branco" type="button" data-edit>${icons.edit} Editar</button><button class="btn btn-sm btn-ghost" type="button" data-del aria-label="Excluir">${icons.trash}</button></div></div>`).join("")}</div>`
      : emptyState({ title: "Nenhuma campanha ainda", text: "Feiras de adoção, mutirões de castração, vacinação, arrecadações… divulgue aqui!", art: icons.megaphone })}`;
  $("[data-new]", view).addEventListener("click", () => eventForm(null));
  $$("[data-ev]", view).forEach((row) => {
    const ev = data.find((x) => x.id === row.dataset.ev);
    $("[data-edit]", row).addEventListener("click", () => eventForm(ev));
    $("[data-del]", row).addEventListener("click", async () => {
      if (!(await confirmDialog({ title: "Excluir evento?", message: ev.title, confirmText: "Excluir", danger: true }))) return;
      try { await sb.from("events").delete().eq("id", ev.id); renderEventos(); } catch (er) { toast(er.message, "bad"); }
    });
  });
}

function eventForm(ev) {
  const e0 = ev || {};
  const local = (d) => (d ? new Date(new Date(d).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "");
  const body = document.createElement("form");
  body.className = "form";
  body.noValidate = true;
  body.innerHTML = `
    <div class="field"><label for="ev-kind">Tipo</label><select class="select" id="ev-kind" name="kind">${Object.entries(L.eventKind).map(([k, v]) => `<option value="${k}" ${e0.kind === k ? "selected" : ""}>${v}</option>`).join("")}</select></div>
    <div class="field"><label for="ev-title">Título <span class="req">*</span></label><input class="input" id="ev-title" name="title" maxlength="120" value="${esc(e0.title || "")}"></div>
    <div class="field"><label for="ev-sum">Resumo <span class="req">*</span></label><input class="input" id="ev-sum" name="summary" maxlength="280" value="${esc(e0.summary || "")}"></div>
    <div class="field"><label for="ev-desc">Descrição</label><textarea class="textarea" id="ev-desc" name="description" maxlength="6000">${esc(e0.description || "")}</textarea></div>
    <div class="form-row"><div class="field"><label for="ev-start">Início <span class="req">*</span></label><input class="input" id="ev-start" name="starts_at" type="datetime-local" value="${local(e0.starts_at)}"></div>
      <div class="field"><label for="ev-end">Término</label><input class="input" id="ev-end" name="ends_at" type="datetime-local" value="${local(e0.ends_at)}"></div></div>
    <label class="check"><input type="checkbox" name="is_online" ${e0.is_online ? "checked" : ""}> Evento online</label>
    <div class="form-row"><div class="field"><label for="ev-loc">Local</label><input class="input" id="ev-loc" name="location_name" maxlength="120" value="${esc(e0.location_name || "")}"></div>
      <div class="field"><label for="ev-addr">Endereço</label><input class="input" id="ev-addr" name="address" maxlength="200" value="${esc(e0.address || "")}"></div></div>
    <div class="form-row" style="grid-template-columns:2fr 1fr"><div class="field"><label for="ev-city">Cidade</label><input class="input" id="ev-city" name="city" maxlength="80" value="${esc(e0.city || ctx.org.city || "")}"></div>
      <div class="field"><label for="ev-uf">UF</label><select class="select" id="ev-uf" name="state">${ufOptions(e0.state || ctx.org.state || "")}</select></div></div>
    <div class="field"><label for="ev-url">Link de inscrição (https://)</label><input class="input" id="ev-url" name="external_url" type="url" value="${esc(e0.external_url || "")}"></div>
    <div class="field"><span class="label">Imagem de capa (16:9)</span><label class="btn btn-sm btn-branco" style="justify-self:start">${icons.camera} Escolher imagem<input type="file" accept="image/*" class="sr-only" data-cover-input></label><div data-cover-prev>${e0.cover_url ? `<img src="${esc(e0.cover_url)}" alt="" style="border-radius:16px;border:2px solid var(--preto);max-height:160px">` : ""}</div></div>
    <p class="small muted">Eventos passam por moderação antes de aparecer no site.</p>
    <div class="flex gap-1 wrap" style="justify-content:flex-end"><button class="btn btn-ghost" type="button" data-close>Cancelar</button><button class="btn btn-laranja" type="submit">Enviar para análise</button></div>`;
  const m = modal({ title: ev ? "Editar evento" : "Nova campanha ou evento", body, wide: true });
  let cover = null;
  $("[data-cover-input]", body).addEventListener("change", async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try { cover = await processImage(f, { aspect: 16 / 9, width: 1600, title: "Ajuste a capa" }); if (cover) $("[data-cover-prev]", body).innerHTML = `<img src="${URL.createObjectURL(cover)}" alt="" style="border-radius:16px;border:2px solid var(--preto);max-height:160px">`; }
    catch (er) { toast(er.message, "bad"); }
  });
  body.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearErrors(body);
    const v = Object.fromEntries(new FormData(body).entries());
    let ok = true;
    const err = (n, msg) => { ok = false; setFieldError(body.querySelector(`[name=${n}]`), msg); };
    if ((v.title || "").trim().length < 4) err("title", "Título muito curto.");
    if ((v.summary || "").trim().length < 10) err("summary", "Resumo muito curto.");
    if (!v.starts_at) err("starts_at", "Informe a data de início.");
    if (v.ends_at && v.starts_at && v.ends_at < v.starts_at) err("ends_at", "O término deve ser depois do início.");
    if (!body.is_online.checked && (!(v.city || "").trim() || !v.state)) err("city", "Informe cidade e UF (ou marque online).");
    if (v.external_url && !/^https:\/\//i.test(v.external_url)) err("external_url", "Use https://");
    if (!ok) { focusFirstError(body); return; }
    await withLoading($('button[type="submit"]', body), async () => {
      try {
        const row = {
          kind: v.kind, title: v.title.trim(), summary: v.summary.trim(), description: v.description?.trim() || null,
          starts_at: new Date(v.starts_at).toISOString(), ends_at: v.ends_at ? new Date(v.ends_at).toISOString() : null,
          is_online: body.is_online.checked, location_name: v.location_name?.trim() || null, address: v.address?.trim() || null,
          city: v.city?.trim() || null, state: v.state || null, external_url: v.external_url?.trim() || null, status: "em_analise",
        };
        if (cover) {
          const path = `${ctx.profile.id}/evento-${Date.now()}.webp`;
          await sb.storage.upload("event-media", path, cover, { contentType: cover.type });
          row.cover_url = sb.storage.publicUrl("event-media", path);
        }
        if (ev) await sb.from("events").update(row, { returning: false }).eq("id", ev.id);
        else await sb.from("events").insert({ ...row, organization_id: ctx.org.id }, { returning: false });
        toast("Enviado para análise!", "ok");
        m.close();
        renderEventos();
      } catch (er) { toast(er.message, "bad", 6000); }
    });
  });
}

// ---------------------------------------------------------------------------
function applyNav() {
  $$('[data-only="org"]').forEach((a) => a.classList.toggle("hidden", !isOrgAccount()));
  $$('[data-only="animais"]').forEach((a) => a.classList.toggle("hidden", !canPostAnimals()));
}
async function refreshOpenApps() {
  if (!canPostAnimals()) return;
  try {
    const { count } = await sb.from("adoption_applications").select("id", { count: true }).eq("manager_id", ctx.profile.id).in("status", ["enviado"]).limit(1);
    const el = $("[data-open-apps]");
    el.textContent = count || "";
    el.classList.toggle("hidden", !count);
  } catch { /* ignore */ }
}

(async () => {
  ctx = await requireAuth();
  if (!ctx) { view.innerHTML = errorState({ code: "not_configured" }); return; }
  applyNav();
  refreshOpenApps();
  window.addEventListener("hashchange", () => {
    if (location.pathname !== "/painel") history.replaceState(null, "", `/painel${location.hash}`);
    route();
  });
  route();
})();
void isValidEmail; void fmtDate;
