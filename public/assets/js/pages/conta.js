import { requireAuth, getContext, observeReveal } from "../app.js";
import sb from "../sb.js";
import { CONFIG } from "../config.js";
import {
  $, $$, esc, icons, L, toast, bindMasks, ufOptions, withLoading, setFieldError, clearErrors, focusFirstError,
  isValidPhone, isValidCPF, isValidEmail, ageFrom, digits, masks, safeUrl, safePath, fmtDate, fmtDateTime, timeAgo, statusPill, confirmDialog, qs, initials,
} from "../ui.js";
import { ANIMAL_CARD_COLS, petCard, bindFavorites, emptyState, errorState, photoUrl, coverPath } from "../components.js";
import { processImage } from "../image.js";
import { setupChatFor, stopChat } from "../chat.js";

const view = $("[data-view]");
let ctx;

const routes = {
  perfil: renderPerfil,
  pedidos: renderPedidos,
  favoritos: renderFavoritos,
  notificacoes: renderNotificacoes,
  seguranca: renderSeguranca,
  privacidade: renderPrivacidade,
};

function current() {
  const m = location.pathname.match(/^\/minha-conta\/pedidos\/([0-9a-f-]{36})/i);
  if (m) return ["pedido", m[1]];
  const h = location.hash.replace("#", "");
  return [routes[h] ? h : "perfil"];
}
async function route() {
  stopChat();
  const [name, arg] = current();
  $$("[data-dash-nav] a").forEach((a) => a.toggleAttribute("aria-current", a.getAttribute("href") === `#${name === "pedido" ? "pedidos" : name}`));
  $$("[data-dash-nav] a[aria-current]").forEach((a) => a.setAttribute("aria-current", "page"));
  view.innerHTML = `<div class="loading-page"><span class="spinner" aria-label="Carregando"></span></div>`;
  try {
    if (name === "pedido") await renderPedido(arg); else await routes[name]();
  } catch (e) { view.innerHTML = errorState(e); }
  observeReveal(view);
}

// ---------------------------------------------------------------------------
// Perfil (inclui o "completar cadastro" de quem entrou com Google)
// ---------------------------------------------------------------------------
async function renderPerfil() {
  const p = ctx.profile;
  const completing = !p.onboarding_completed;
  const { data: priv } = await sb.from("profile_private").select("cpf").eq("user_id", p.id).maybeSingle();
  const pendingType = qs("tipo");
  const canChangeType = !ctx.org;
  const maxBirth = new Date(); maxBirth.setFullYear(maxBirth.getFullYear() - 18);
  const consents = await sb.rpc("my_consents").catch(() => []);
  const hasTerms = (consents || []).some((c) => c.consent_type === "termos_uso" && c.granted);

  view.innerHTML = `
  <div class="dash-title"><h1>${completing ? "Complete seu cadastro" : "Meu perfil"}</h1></div>
  ${completing ? `<div class="notice mb-3">${icons.info}<p>Falta pouco! Precisamos de alguns dados para você ${p.account_type === "pessoa" ? "adotar ou anunciar" : "cadastrar sua organização"}.</p></div>` : ""}
  <form class="form card card-pad" novalidate data-form>
    <div class="flex items-center gap-2 wrap">
      <div class="avatar" style="width:84px;height:84px;font-size:1.6rem" data-avatar>${p.avatar_url ? `<img src="${esc(p.avatar_url)}" alt="" referrerpolicy="no-referrer">` : esc(initials(p.full_name || p.email))}</div>
      <label class="btn btn-sm btn-branco" style="position:relative">${icons.camera} Trocar foto<input type="file" accept="image/*" data-avatar-input class="sr-only"></label>
      ${p.avatar_url ? `<button class="btn btn-sm btn-ghost" type="button" data-avatar-remove>Remover</button>` : ""}
    </div>
    ${canChangeType && (completing || pendingType) ? `
    <fieldset class="field"><legend class="label">Como você vai participar? <span class="req">*</span></legend>
      <div class="choice-grid">
        ${[["pessoa", "", "Pessoa", "adotar e doar"], ["ong", "", "ONG / Protetor", "resgatar e anunciar"], ["empresa", "", "Empresa", "vitrine e eventos"]].map(([v, e, t, s]) =>
          `<div class="choice"><input type="radio" name="account_type" id="at-${v}" value="${v}" ${(pendingType || p.account_type) === v ? "checked" : ""}><label for="at-${v}"><span class="emoji">${e}</span>${t}<small>${s}</small></label></div>`).join("")}
      </div></fieldset>` : ""}
    <div class="field"><label for="full_name">${p.account_type === "pessoa" ? "Nome completo" : "Nome do(a) responsável"} <span class="req">*</span></label><input class="input" id="full_name" name="full_name" value="${esc(p.full_name)}" maxlength="120" autocomplete="name"></div>
    <div class="form-row">
      <div class="field"><label for="phone">Celular (WhatsApp) <span class="req">*</span></label><input class="input" id="phone" name="phone" data-mask="phone" value="${esc(p.phone ? masks.phone(p.phone) : "")}" inputmode="tel"></div>
      <div class="field"><label for="birth_date">Data de nascimento <span class="req">*</span></label><input class="input" id="birth_date" name="birth_date" type="date" min="1900-01-01" max="${maxBirth.toISOString().slice(0, 10)}" value="${esc(p.birth_date || "")}"></div>
    </div>
    <div class="form-row" style="grid-template-columns:2fr 1fr">
      <div class="field"><label for="city">Cidade <span class="req">*</span></label><input class="input" id="city" name="city" value="${esc(p.city || "")}" maxlength="80"></div>
      <div class="field"><label for="state">UF <span class="req">*</span></label><select class="select" id="state" name="state">${ufOptions(p.state || "")}</select></div>
    </div>
    ${p.account_type === "pessoa" || pendingType === "pessoa" ? `
    <div class="field"><label for="cpf">CPF ${priv?.cpf ? "" : '<span class="muted small">(necessário para enviar pedidos de adoção)</span>'}</label>
      <input class="input" id="cpf" name="cpf" data-mask="cpf" inputmode="numeric" autocomplete="off" value="${priv?.cpf ? esc(masks.cpf(priv.cpf)) : ""}" placeholder="000.000.000-00">
      <span class="hint">${icons.shield} Fica protegido e só é compartilhado, com registro de acesso, com o responsável de um animal que você pedir para adotar.</span></div>` : ""}
    <div class="field"><label for="bio">Sobre você <span class="muted small">(opcional)</span></label><textarea class="textarea" id="bio" name="bio" maxlength="500" style="min-height:90px" placeholder="Conte um pouco sobre você e sua relação com os animais">${esc(p.bio || "")}</textarea></div>
    ${!hasTerms ? `<label class="check"><input type="checkbox" name="terms"> <span>Li e aceito os <a class="link" href="/termos" target="_blank">Termos de Uso</a> e a <a class="link" href="/privacidade" target="_blank">Política de Privacidade</a>. Tenho 18 anos ou mais. <span class="req">*</span></span></label>` : ""}
    <div class="flex gap-1 wrap"><button class="btn btn-laranja" type="submit">${completing ? "Concluir cadastro" : "Salvar alterações"}</button></div>
  </form>`;
  bindMasks(view);
  const form = $("[data-form]", view);

  // Foto de perfil (padronizada em 400x400)
  $("[data-avatar-input]", view).addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const blob = await processImage(file, { aspect: 1, width: 400, title: "Ajuste sua foto" });
      if (!blob) return;
      const path = `${p.id}/avatar-${Date.now()}.webp`;
      await sb.storage.upload("avatars", path, blob, { contentType: "image/webp" });
      const url = sb.storage.publicUrl("avatars", path);
      await sb.from("profiles").update({ avatar_url: url }, { returning: false }).eq("id", p.id);
      toast("Foto atualizada!", "ok");
      ctx = await getContext({ force: true });
      renderPerfil();
    } catch (er) { toast(er.message, "bad"); }
  });
  $("[data-avatar-remove]", view)?.addEventListener("click", async () => {
    await sb.from("profiles").update({ avatar_url: null }, { returning: false }).eq("id", p.id);
    ctx = await getContext({ force: true });
    renderPerfil();
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearErrors(form);
    const v = Object.fromEntries(new FormData(form).entries());
    let ok = true;
    const err = (n, m) => { ok = false; setFieldError(form.querySelector(`[name=${n}]`), m); };
    if ((v.full_name || "").trim().split(/\s+/).length < 2) err("full_name", "Informe nome e sobrenome.");
    if (!isValidPhone(v.phone)) err("phone", "Celular com DDD inválido.");
    if (!v.birth_date || ageFrom(v.birth_date) < 18) err("birth_date", "É preciso ter 18 anos ou mais.");
    if ((v.city || "").trim().length < 2) err("city", "Informe a cidade.");
    if (!v.state) err("state", "Selecione a UF.");
    if (v.cpf && !isValidCPF(v.cpf)) err("cpf", "CPF inválido.");
    if (form.terms && !form.terms.checked) err("terms", "É preciso aceitar os Termos e a Política.");
    if (!ok) { focusFirstError(form); return; }
    await withLoading($('button[type="submit"]', form), async () => {
      try {
        if (form.terms) {
          await sb.from("consents").insert([
            { user_id: p.id, consent_type: "termos_uso", version: CONFIG.TERMS_VERSION, granted: true, source: "perfil", user_agent: navigator.userAgent.slice(0, 300) },
            { user_id: p.id, consent_type: "politica_privacidade", version: CONFIG.PRIVACY_VERSION, granted: true, source: "perfil", user_agent: navigator.userAgent.slice(0, 300) },
          ], { returning: false });
        }
        const upd = {
          full_name: v.full_name.trim(), phone: digits(v.phone), birth_date: v.birth_date,
          city: v.city.trim(), state: v.state, bio: (v.bio || "").trim() || null, onboarding_completed: true,
        };
        if (v.account_type && canChangeType) upd.account_type = v.account_type;
        await sb.from("profiles").update(upd, { returning: false }).eq("id", p.id);
        if (v.cpf && digits(v.cpf) !== (priv?.cpf || "")) await sb.rpc("set_my_cpf", { p_cpf: digits(v.cpf) });
        ctx = await getContext({ force: true });
        toast(completing ? "Cadastro concluído! Bem-vindo(a)!" : "Perfil atualizado!", "ok");
        const next = qs("voltar");
        if (completing) {
          if (safePath(next)) location.replace(safePath(next));
          else if (ctx.profile.account_type !== "pessoa") location.replace("/painel#organizacao");
          else { history.replaceState(null, "", "/minha-conta#perfil"); renderPerfil(); }
        } else renderPerfil();
      } catch (er) { toast(er.message, "bad", 6000); }
    });
  });
}

// ---------------------------------------------------------------------------
// Pedidos de adoção (candidato)
// ---------------------------------------------------------------------------
async function renderPedidos() {
  const { data } = await sb.from("adoption_applications")
    .select("id,status,created_at,updated_at,animals(name,slug,species,animal_photos(storage_path,is_cover,position))")
    .eq("applicant_id", ctx.profile.id).order("created_at", { ascending: false });
  view.innerHTML = `<div class="dash-title"><h1>Meus pedidos de adoção</h1><a class="btn btn-sm btn-laranja" href="/adote">Ver animais</a></div>
  ${data?.length ? `<div class="list">${data.map((a) => {
    const c = a.animals ? coverPath(a.animals) : null;
    return `<div class="list-item" data-reveal="up">
      <div class="thumb">${c ? `<img src="${esc(photoUrl(c))}" alt="">` : ""}</div>
      <div><h3>${esc(a.animals?.name || "Animal")}</h3><p>Enviado ${esc(timeAgo(a.created_at))} · atualizado ${esc(timeAgo(a.updated_at))}</p></div>
      <div class="actions">${statusPill(a.status, L.adoption)}<a class="btn btn-sm btn-azul" href="/minha-conta/pedidos/${esc(a.id)}">Abrir</a></div></div>`;
  }).join("")}</div>`
    : emptyState({ title: "Nenhum pedido ainda", text: "Quando você enviar um pedido de adoção, ele aparece aqui com cada etapa e um chat com o responsável.", cta: `<a class="btn btn-laranja" href="/adote">Encontrar meu amigo</a>`, art: icons.heart })}`;
}

async function renderPedido(id) {
  const { data: a } = await sb.from("adoption_applications")
    .select("*,animals(name,slug,city,state,publisher_name,animal_photos(storage_path,is_cover,position))").eq("id", id).maybeSingle();
  if (!a || a.applicant_id !== ctx.profile.id) { view.innerHTML = emptyState({ title: "Pedido não encontrado", text: "Ele pode ter sido removido.", cta: `<a class="btn" href="/minha-conta#pedidos">Voltar</a>` }); return; }
  const { data: hist } = await sb.from("application_status_history").select("to_status,created_at").eq("application_id", id).order("created_at");
  const c = coverPath(a.animals);
  const open = !["recusado", "cancelado", "concluido"].includes(a.status);
  view.innerHTML = `
  <a class="link small" href="/minha-conta#pedidos">← Meus pedidos</a>
  <div class="dash-title mt-2"><div class="flex items-center gap-2"><div class="org-logo">${c ? `<img src="${esc(photoUrl(c))}" alt="">` : ""}</div>
    <div><h1>${esc(a.animals.name)}</h1><p class="muted mb-0">Anunciado por ${esc(a.animals.publisher_name)} · ${esc(a.animals.city)} - ${esc(a.animals.state)}</p></div></div>
    ${statusPill(a.status, L.adoption)}</div>
  <div class="grid grid-2" style="align-items:start">
    <div class="card card-pad"><h2 class="h3">Conversa</h2><div class="chat" data-chat aria-live="polite"></div>
      ${open ? `<form class="flex gap-1 mt-2" data-msg-form><label class="sr-only" for="msg">Mensagem</label><input class="input" id="msg" name="body" maxlength="2000" placeholder="Escreva uma mensagem…" autocomplete="off" required><button class="btn btn-azul" type="submit">Enviar</button></form>
      <p class="small muted mt-1">Por segurança, não compartilhe senhas ou dados bancários no chat.</p>` : `<p class="small muted mt-2">Este pedido foi encerrado.</p>`}
    </div>
    <div class="card card-pad"><h2 class="h3">Andamento</h2>
      <ol class="timeline">${(hist || []).map((h) => `<li><strong>${esc(L.adoption[h.to_status])}</strong><time>${esc(fmtDateTime(h.created_at))}</time></li>`).join("")}</ol>
      ${open ? `<button class="btn btn-sm btn-ghost mt-2" type="button" data-cancel>Cancelar meu pedido</button>` : ""}
      <details class="mt-3"><summary class="bold" style="cursor:pointer">Minhas respostas do questionário</summary>
        <dl class="small mt-2">${[["Moradia", `${L.housing[a.housing_type]} (${L.housingOwner[a.housing_owner].toLowerCase()})`], ["Quintal", a.has_yard ? "Sim" : "Não"], ["Telas", a.window_screens == null ? "—" : a.window_screens ? "Sim" : "Não"], ["Adultos/crianças", `${a.adults_in_home} / ${a.children_in_home}`], ["Horas sozinho", a.hours_alone], ["Quem cuida na ausência", a.caretaker_when_away], ["Motivação", a.motivation]].map(([k, v]) => `<dt class="bold mt-1">${esc(k)}</dt><dd style="margin:0">${esc(v)}</dd>`).join("")}</dl></details>
    </div>
  </div>`;
  setupChat(id);
  $("[data-cancel]", view)?.addEventListener("click", async () => {
    if (!(await confirmDialog({ title: "Cancelar pedido?", message: "O responsável será avisado. Você poderá enviar um novo pedido depois, se quiser.", confirmText: "Cancelar pedido", danger: true }))) return;
    try { await sb.from("adoption_applications").update({ status: "cancelado" }, { returning: false }).eq("id", id); toast("Pedido cancelado.", "ok"); renderPedido(id); }
    catch (er) { toast(er.message, "bad"); }
  });
}

const setupChat = (id) => setupChatFor(id, ctx.profile.id, view);

// ---------------------------------------------------------------------------
// Favoritos e notificações
// ---------------------------------------------------------------------------
async function renderFavoritos() {
  const { data } = await sb.from("favorites").select(`created_at,animals(${ANIMAL_CARD_COLS})`).eq("user_id", ctx.profile.id).order("created_at", { ascending: false });
  const animals = (data || []).map((f) => f.animals).filter(Boolean);
  view.innerHTML = `<div class="dash-title"><h1>Meus favoritos</h1></div>
    ${animals.length ? `<div class="pets-grid">${animals.map((a) => petCard(a, { favorited: true })).join("")}</div>`
      : emptyState({ title: "Nenhum favorito ainda", text: "Toque no coração dos animais que roubarem seu coração para encontrá-los aqui depois.", cta: `<a class="btn btn-laranja" href="/adote">Explorar animais</a>`, art: icons.heart })}`;
  if (animals.length) bindFavorites(view, animals.map((a) => a.id));
}

async function renderNotificacoes() {
  const { data } = await sb.from("notifications").select("*").order("created_at", { ascending: false }).limit(100);
  view.innerHTML = `<div class="dash-title"><h1>Notificações</h1>${data?.some((n) => !n.read_at) ? `<button class="btn btn-sm btn-branco" type="button" data-read-all>Marcar todas como lidas</button>` : ""}</div>
  ${data?.length ? `<div class="list">${data.map((n) => `<a class="list-item" href="${esc(safeUrl(n.link || "#"))}" data-notif="${esc(n.id)}" style="text-decoration:none;${n.read_at ? "opacity:.7" : "border-width:3px"}">
      <div class="thumb" style="background:${n.read_at ? "var(--creme)" : "var(--amarelo)"}">${icons.bell}</div>
      <div><h3>${esc(n.title)}</h3>${n.body ? `<p>${esc(n.body)}</p>` : ""}<p class="small">${esc(timeAgo(n.created_at))}</p></div>
      <div class="actions">${n.read_at ? "" : `<span class="chip chip-laranja">Nova</span>`}</div></a>`).join("")}</div>`
    : emptyState({ title: "Tudo em dia!", text: "Você será avisado aqui sobre pedidos, mensagens e moderação.", art: icons.bell })}`;
  $("[data-read-all]", view)?.addEventListener("click", async () => {
    await sb.from("notifications").update({ read_at: new Date().toISOString() }, { returning: false }).is("read_at", null);
    renderNotificacoes(); refreshUnread();
  });
  $$("[data-notif]", view).forEach((a) => a.addEventListener("click", () => {
    sb.from("notifications").update({ read_at: new Date().toISOString() }, { returning: false }).eq("id", a.dataset.notif).is("read_at", null).catch(() => {});
  }));
}

async function refreshUnread() {
  try {
    const { count } = await sb.from("notifications").select("id", { count: true }).is("read_at", null).limit(1);
    const el = $("[data-unread]");
    el.textContent = count || "";
    el.classList.toggle("hidden", !count);
  } catch { /* ignore */ }
}

// ---------------------------------------------------------------------------
// Acesso: e-mail e senha
// ---------------------------------------------------------------------------
async function renderSeguranca() {
  const user = sb.auth.user || (await sb.auth.getUser());
  const google = (user?.app_metadata?.providers || []).includes("google");
  view.innerHTML = `<div class="dash-title"><h1>Acesso e senha</h1></div>
  <div class="grid grid-2" style="align-items:start">
    <form class="form card card-pad" novalidate data-email-form>
      <h2 class="h3">E-mail de acesso</h2>
      <p class="muted small">Atual: <strong>${esc(user?.email || ctx.profile.email || "")}</strong>${google ? " · conectado com Google" : ""}</p>
      <div class="field"><label for="new-email">Novo e-mail</label><input class="input" id="new-email" name="email" type="email" autocomplete="email"></div>
      <button class="btn btn-azul" type="submit">Alterar e-mail</button>
      <p class="small muted mb-0">Enviaremos um link de confirmação para o novo endereço.</p>
    </form>
    <form class="form card card-pad" novalidate data-pass-form>
      <h2 class="h3">${google ? "Criar ou trocar senha" : "Trocar senha"}</h2>
      <div class="field"><label for="np">Nova senha</label><input class="input" id="np" name="password" type="password" autocomplete="new-password" minlength="8" maxlength="72"></div>
      <div class="field"><label for="np2">Confirme</label><input class="input" id="np2" name="password2" type="password" autocomplete="new-password"></div>
      <button class="btn btn-azul" type="submit">Salvar senha</button>
    </form>
  </div>
  <div class="card card-pad mt-3"><h2 class="h3">Sair de todos os dispositivos</h2><p class="muted">Encerra esta sessão. Use se acessou de um computador público.</p>
    <button class="btn btn-branco" type="button" data-logout-all>${icons.logout} Sair</button></div>`;
  const ef = $("[data-email-form]", view);
  ef.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!isValidEmail(ef.email.value)) { setFieldError(ef.email, "E-mail inválido."); return; }
    await withLoading($("button", ef), async () => {
      try { await sb.auth.updateUser({ email: ef.email.value.trim().toLowerCase() }); toast("Confira a caixa de entrada do novo e-mail para confirmar.", "ok", 6000); ef.reset(); }
      catch (er) { toast(er.message, "bad"); }
    });
  });
  const pf = $("[data-pass-form]", view);
  pf.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearErrors(pf);
    const pw = pf.password.value;
    if (pw.length < 8 || !/[A-Za-z]/.test(pw) || !/\d/.test(pw)) { setFieldError(pf.password, "Use 8+ caracteres com letras e números."); return; }
    if (pw !== pf.password2.value) { setFieldError(pf.password2, "As senhas não conferem."); return; }
    await withLoading($("button", pf), async () => {
      try { await sb.auth.updateUser({ password: pw }); toast("Senha atualizada!", "ok"); pf.reset(); } catch (er) { toast(er.message, "bad"); }
    });
  });
  $("[data-logout-all]", view).addEventListener("click", async () => { await sb.auth.signOut(); location.href = "/"; });
}

// ---------------------------------------------------------------------------
// Privacidade (LGPD): consentimentos, exportação, solicitações e exclusão
// ---------------------------------------------------------------------------
async function renderPrivacidade() {
  const [consents, { data: reqs }] = await Promise.all([
    sb.rpc("my_consents").catch(() => []),
    sb.from("data_subject_requests").select("*").order("created_at", { ascending: false }),
  ]);
  const c = Object.fromEntries((consents || []).map((x) => [x.consent_type, x]));
  const label = { termos_uso: "Termos de Uso", politica_privacidade: "Política de Privacidade", marketing: "Novidades e campanhas por e-mail", compartilhamento_adocao: "Compartilhamento com responsáveis (pedidos de adoção)" };
  view.innerHTML = `<div class="dash-title"><h1>Privacidade e seus dados</h1></div>
  <div class="notice info mb-3">${icons.shield}<p>Você é o dono dos seus dados (LGPD, art. 18). Aqui você vê o que autorizou, baixa uma cópia de tudo, faz solicitações e pode excluir sua conta.</p></div>
  <div class="grid grid-2" style="align-items:start">
    <div class="card card-pad"><h2 class="h3">Consentimentos</h2>
      <ul class="list" style="list-style:none;padding:0">${Object.entries(label).map(([k, t]) => `<li class="flex justify-between items-center gap-1 wrap" style="padding:8px 0;border-bottom:1px solid var(--line)">
        <span><strong>${t}</strong><br><span class="small muted">${c[k] ? `${c[k].granted ? "Autorizado" : "Revogado"} em ${esc(fmtDate(c[k].updated_at))} · v${esc(c[k].version)}` : "Não autorizado"}</span></span>
        ${k === "marketing" ? `<button class="btn btn-sm ${c[k]?.granted ? "btn-branco" : "btn-amarelo"}" type="button" data-mkt="${c[k]?.granted ? "0" : "1"}">${c[k]?.granted ? "Revogar" : "Autorizar"}</button>` : ""}</li>`).join("")}</ul>
      <p class="small muted mt-2">Para revogar a aceitação dos Termos/Política, é preciso excluir a conta, pois sem eles não é possível usar a plataforma.</p>
    </div>
    <div class="card card-pad"><h2 class="h3">Baixar meus dados</h2><p class="muted">Gera um arquivo com todas as informações que guardamos sobre você (portabilidade).</p>
      <button class="btn btn-azul" type="button" data-export>${icons.download} Baixar meus dados (JSON)</button></div>
  </div>
  <div class="card card-pad mt-3"><h2 class="h3">Solicitações ao encarregado (DPO)</h2>
    <form class="form" data-dsr novalidate>
      <div class="form-row"><div class="field"><label for="dsr-type">Tipo de solicitação</label><select class="select" id="dsr-type" name="request_type">${Object.entries(L.dsr).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select></div>
      <div class="field"><label for="dsr-det">Detalhes (opcional)</label><input class="input" id="dsr-det" name="details" maxlength="2000"></div></div>
      <button class="btn btn-branco" type="submit">Enviar solicitação</button>
      <p class="small muted mb-0">Respondemos em até 15 dias. Contato direto: ${esc(CONFIG.CONTACT_EMAIL)}.</p>
    </form>
    ${reqs?.length ? `<div class="list mt-3">${reqs.map((r) => `<div class="list-item"><div class="thumb">${icons.shield}</div><div><h3>${esc(L.dsr[r.request_type])}</h3><p>Aberta em ${esc(fmtDate(r.created_at))}${r.response ? ` · Resposta: ${esc(r.response)}` : ""}</p></div><div class="actions">${statusPill(r.status, L.dsrStatus)}</div></div>`).join("")}</div>` : ""}
  </div>
  <div class="card card-pad mt-3" style="border-color:var(--vermelho)"><h2 class="h3" style="color:var(--vermelho)">Excluir minha conta</h2>
    <p>Apagamos seu perfil, CPF, favoritos, mensagens, anúncios e fotos. Pedidos de adoção são anonimizados para preservar o histórico dos animais. <strong>Não dá para desfazer.</strong></p>
    <form class="form" data-delete novalidate><div class="field"><label for="del-confirm">Para confirmar, digite <strong>EXCLUIR MINHA CONTA</strong></label><input class="input" id="del-confirm" name="confirm" autocomplete="off"></div>
    <button class="btn btn-laranja" type="submit" style="--btn-bg:var(--vermelho)">${icons.trash} Excluir definitivamente</button></form>
  </div>`;

  $("[data-mkt]", view)?.addEventListener("click", async (e) => {
    try {
      await sb.from("consents").insert({ user_id: ctx.profile.id, consent_type: "marketing", version: CONFIG.PRIVACY_VERSION, granted: e.currentTarget.dataset.mkt === "1", source: "privacidade", user_agent: navigator.userAgent.slice(0, 300) }, { returning: false });
      toast("Preferência registrada.", "ok"); renderPrivacidade();
    } catch (er) { toast(er.message, "bad"); }
  });
  $("[data-export]", view).addEventListener("click", async (e) => {
    await withLoading(e.currentTarget, async () => {
      try {
        const data = await sb.rpc("export_my_data");
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `meus-dados-meu-amigo-pra-vida-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      } catch (er) { toast(er.message, "bad"); }
    });
  });
  const dsr = $("[data-dsr]", view);
  dsr.addEventListener("submit", async (e) => {
    e.preventDefault();
    await withLoading($("button", dsr), async () => {
      try {
        await sb.from("data_subject_requests").insert({ user_id: ctx.profile.id, contact_email: ctx.profile.email || sb.auth.user?.email, request_type: dsr.request_type.value, details: dsr.details.value.trim() || null }, { returning: false });
        toast("Solicitação registrada. Responderemos em até 15 dias.", "ok"); renderPrivacidade();
      } catch (er) { toast(er.message, "bad"); }
    });
  });
  const del = $("[data-delete]", view);
  del.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (del.confirm.value.trim() !== "EXCLUIR MINHA CONTA") { setFieldError(del.confirm, "Digite exatamente: EXCLUIR MINHA CONTA"); return; }
    if (!(await confirmDialog({ title: "Última confirmação", message: "Sua conta e seus dados serão apagados agora. Tem certeza?", confirmText: "Sim, excluir", danger: true }))) return;
    await withLoading($("button", del), async () => {
      try {
        const uid = ctx.profile.id;
        for (const bucket of ["animal-photos", "org-media", "avatars", "event-media"]) {
          const files = await sb.storage.listAll(bucket, uid).catch(() => []);
          for (let i = 0; i < files.length; i += 100) await sb.storage.remove(bucket, files.slice(i, i + 100));
        }
        await sb.rpc("delete_my_account", { p_confirmation: "EXCLUIR MINHA CONTA" });
        await sb.auth.signOut();
        location.replace("/?conta=excluida");
      } catch (er) { toast(er.message, "bad", 7000); }
    });
  });
}

// ---------------------------------------------------------------------------
(async () => {
  ctx = await requireAuth({ onboarding: false });
  if (!ctx) { view.innerHTML = errorState({ code: "not_configured" }); return; }
  if (ctx.profile.account_type !== "pessoa") $$('[data-only="pessoa"]').forEach((a) => a.remove());
  if (!ctx.profile.onboarding_completed && location.hash !== "#perfil") history.replaceState(null, "", `${location.pathname}${location.search}#perfil`);
  window.addEventListener("hashchange", () => {
    if (location.pathname !== "/minha-conta") { history.replaceState(null, "", `/minha-conta${location.hash}`); }
    route();
  });
  refreshUnread();
  route();
})();
