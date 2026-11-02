import { observeReveal, getContext, setPosterWord } from "../app.js";
import sb from "../sb.js";
import { CONFIG } from "../config.js";
import {
  $, $$, icons, toast, bindMasks, ufOptions, withLoading, setFieldError, clearErrors, focusFirstError,
  isValidEmail, isValidPhone, ageFrom, passwordScore, digits, qs, safePath, esc,
} from "../ui.js";

const page = $("[data-auth]")?.dataset.auth;
const CALLBACK = `${location.origin}/auth/callback`;
const NEXT_KEY = "mapv.next";
const TYPE_KEY = "mapv.pendingType";

function safeNext(v) {
  // só aceita caminhos internos (evita redirecionamento aberto)
  return safePath(v);
}
function rememberNext() {
  const n = safeNext(qs("voltar"));
  try { if (n) sessionStorage.setItem(NEXT_KEY, n); } catch { /* ignore */ }
}
function popNext() {
  let n = null;
  try { n = sessionStorage.getItem(NEXT_KEY); sessionStorage.removeItem(NEXT_KEY); } catch { /* ignore */ }
  return safeNext(n);
}

function bindPasswordUi(root) {
  $$("[data-toggle-pass]", root).forEach((b) => {
    const input = b.parentElement.querySelector("input");
    const set = (show) => { input.type = show ? "text" : "password"; b.innerHTML = show ? icons.eyeOff : icons.eye; b.setAttribute("aria-label", show ? "Ocultar senha" : "Mostrar senha"); };
    set(false);
    b.addEventListener("click", () => set(input.type === "password"));
  });
  const pw = $("#password", root);
  const bar = $(".strength span", root);
  if (pw && bar) {
    pw.addEventListener("input", () => {
      const s = passwordScore(pw.value);
      bar.style.width = `${(s / 4) * 100}%`;
      bar.style.background = ["var(--vermelho)", "var(--vermelho)", "var(--amarelo)", "var(--azul)", "var(--verde)"][s];
    });
  }
}
const strongEnough = (p) => p.length >= 8 && /[A-Za-z]/.test(p) && /\d/.test(p);

// O botão do Google só aparece quando o provedor está ativo no Supabase (evita erro na tela)
async function setupGoogle(root, onClick) {
  const area = $("[data-google-area]", root);
  const btn = $("[data-google]", root);
  if (!area || !btn) return;
  btn.addEventListener("click", onClick);
  try {
    const p = await sb.providers();
    if (p.google) area.classList.remove("hidden");
  } catch { /* sem conexão: mantém só o e-mail */ }
}

async function googleLogin() {
  if (!sb.isConfigured()) { toast("Login indisponível no momento.", "bad"); return; }
  rememberNext();
  await sb.auth.signInWithGoogle(CALLBACK);
}

// ---------------------------------------------------------------------------
// Cadastro
// ---------------------------------------------------------------------------
const TYPE_INFO = {
  pessoa: { hint: "Para quem quer adotar, doar um animal ou acompanhar a causa.", name: "Nome completo", art: "Adote, anuncie e acompanhe tudo em um só lugar",
    c: "rosa", pet: "golden", word: "amigo", tag: ["Cadastro gratuito", "em poucos minutos"],
    list: ["Favorite animais e envie pedidos de adoção", "Anuncie um animal para doação sem expor seu telefone", "Acompanhe cada etapa pela sua conta"] },
  ong: { hint: "Etapa 1 de 2: crie a conta do(a) responsável. Em seguida você informa CNPJ (ou CPF, se for protetor independente), endereço e Pix da organização. A publicação acontece após a verificação da nossa equipe.", name: "Nome do(a) responsável", art: "Mais lares para quem você resgatou",
    c: "azul", pet: "labrador", word: "resgate", tag: ["Perfil verificado", "pela nossa equipe"],
    list: ["Publique os animais que você resgatou", "Receba pedidos com questionário completo", "Mostre sua chave Pix para doações"] },
  empresa: { hint: "Etapa 1 de 2: crie a conta do(a) responsável. Depois você informa CNPJ, endereço e serviços. Sua vitrine é publicada após a verificação da nossa equipe.", name: "Nome do(a) responsável", art: "Sua marca do lado certo da história",
    c: "preto", pet: "boiadeiro", word: "parceria", tag: ["Vitrine verificada", "pela nossa equipe"],
    list: ["Vitrine para quem ama animais", "Divulgue campanhas e eventos", "Apareça entre as empresas parceiras"] },
};

// Painel lateral do cadastro muda de cor, animal e texto conforme o tipo de conta.
function paintArt(info) {
  const art = $("[data-art]");
  if (!art) return;
  art.classList.remove("rosa", "azul", "preto", "laranja");
  art.classList.add(info.c);
  $("[data-art-title]", art).textContent = info.art;
  setPosterWord($("[data-art-word]", art), info.word);
  $("[data-art-list]", art).innerHTML = info.list.map((t) => `<li>${esc(t)}</li>`).join("");
  $("[data-art-tag]", art).innerHTML = `${esc(info.tag[0])}<small>${esc(info.tag[1])}</small>`;
  const img = $("[data-pet]", art);
  const src = `/assets/img/animais/${info.pet}.webp`;
  if (img.getAttribute("src") === src) return;
  img.classList.add("is-swapping");
  setTimeout(() => { img.src = src; img.onload = () => img.classList.remove("is-swapping"); }, 260);
}

function setupCadastro() {
  const root = $("[data-auth]");
  const form = $("[data-form]", root);
  let type = ["pessoa", "ong", "empresa"].includes(qs("tipo")) ? qs("tipo") : "pessoa";
  $("[data-uf]", form).innerHTML = ufOptions();
  bindMasks(form);
  bindPasswordUi(form);
  rememberNext();

  const max = new Date(); max.setFullYear(max.getFullYear() - 18);
  $("#birth_date", form).max = max.toISOString().slice(0, 10);
  $("#birth_date", form).min = "1900-01-01";

  const setType = (t) => {
    type = t;
    $$("[data-type]", root).forEach((b) => b.setAttribute("aria-selected", String(b.dataset.type === t)));
    $("[data-type-hint]", root).textContent = TYPE_INFO[t].hint;
    $("[data-name-label]", root).innerHTML = `${TYPE_INFO[t].name} <span class="req">*</span>`;
    paintArt(TYPE_INFO[t]);
    history.replaceState(null, "", `?tipo=${t}`);
  };
  $$("[data-type]", root).forEach((b) => b.addEventListener("click", () => setType(b.dataset.type)));
  setType(type);

  setupGoogle(root, () => {
    try { sessionStorage.setItem(TYPE_KEY, type); } catch { /* ignore */ }
    googleLogin();
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearErrors(form);
    const v = Object.fromEntries(new FormData(form).entries());
    let ok = true;
    const err = (id, msg) => { ok = false; setFieldError($(`#${id}`, form) || form.querySelector(`[name=${id}]`), msg); };
    if ((v.full_name || "").trim().split(/\s+/).length < 2) err("full_name", "Informe nome e sobrenome.");
    if (!isValidEmail(v.email)) err("email", "E-mail inválido.");
    if (!isValidPhone(v.phone)) err("phone", "Celular com DDD inválido.");
    if (!v.birth_date || ageFrom(v.birth_date) < 18) err("birth_date", "É preciso ter 18 anos ou mais.");
    else if (ageFrom(v.birth_date) > 120) err("birth_date", "Data inválida.");
    if ((v.city || "").trim().length < 2) err("city", "Informe a cidade.");
    if (!v.state) err("state", "Selecione a UF.");
    if (!strongEnough(v.password || "")) err("password", "Use pelo menos 8 caracteres, com letras e números.");
    if (v.password !== v.password2) err("password2", "As senhas não conferem.");
    if (!form.terms.checked) { ok = false; setFieldError(form.terms, "É preciso aceitar os Termos e a Política de Privacidade."); }
    if (!ok) { focusFirstError(form); return; }

    await withLoading($('button[type="submit"]', form), async () => {
      try {
        const { session, alreadyExists } = await sb.auth.signUp({
          email: v.email.trim().toLowerCase(),
          password: v.password,
          redirectTo: CALLBACK,
          data: {
            full_name: v.full_name.trim(),
            account_type: type,
            phone: digits(v.phone),
            birth_date: v.birth_date,
            city: v.city.trim(),
            state: v.state,
            terms_version: CONFIG.TERMS_VERSION,
            privacy_version: CONFIG.PRIVACY_VERSION,
            marketing_opt_in: form.marketing.checked,
          },
        });
        if (alreadyExists) { setFieldError($("#email", form), "Já existe uma conta com este e-mail. Tente entrar ou recuperar a senha."); focusFirstError(form); return; }
        if (session) { location.replace(type === "pessoa" ? (popNext() || "/minha-conta") : "/painel#organizacao"); return; }
        root.querySelector(".auth-card").innerHTML = `
          <div class="center">
            <div class="empty-art" style="margin:0 auto 16px;width:120px;height:120px;border-radius:50%;background:var(--amarelo);display:grid;place-items:center"><span style="width:56px;height:56px;display:block">${icons.check}</span></div>
            <h1>Confira seu e-mail</h1>
            <p>Enviamos um link de confirmação para <strong>${v.email.replace(/[<>&"]/g, "")}</strong>. Clique nele para ativar sua conta.</p>
            ${type !== "pessoa" ? `<p class="notice info" style="text-align:left">${icons.info}<span>Depois de confirmar, entre e complete os dados da sua ${type === "ong" ? "ONG" : "empresa"} no painel. Essa é a etapa 2 de 2.</span></p>` : ""}
            <p class="small muted">Não chegou? Verifique o spam ou <button class="link" type="button" data-resend style="background:none;border:0;cursor:pointer;padding:0">reenvie o e-mail</button>.</p>
          </div>`;
        $("[data-resend]", root).addEventListener("click", async () => {
          try { await sb.auth.resend(v.email, CALLBACK); toast("E-mail reenviado!", "ok"); } catch (er) { toast(er.message, "bad"); }
        });
      } catch (er) {
        toast(er.message, "bad", 6000);
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Entrar
// ---------------------------------------------------------------------------
function setupEntrar() {
  const root = $("[data-auth]");
  const form = $("[data-form]", root);
  const msg = $("[data-msg]", root);
  bindPasswordUi(form);
  rememberNext();
  if (qs("confirmado")) { msg.className = "notice ok mb-2"; msg.innerHTML = `${icons.check}<p>E-mail confirmado! Agora é só entrar.</p>`; }
  if (sb.auth.session) { location.replace(popNext() || "/minha-conta"); return; }
  setupGoogle(root, googleLogin);
  $("[data-resend]", root).addEventListener("click", async () => {
    try { await sb.auth.resend(form.email.value.trim(), CALLBACK); toast("Enviamos um novo e-mail de confirmação.", "ok"); } catch (er) { toast(er.message, "bad"); }
  });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearErrors(form);
    if (!isValidEmail(form.email.value)) { setFieldError(form.email, "Informe um e-mail válido."); form.email.focus(); return; }
    if (!form.password.value) { setFieldError(form.password, "Informe a senha."); form.password.focus(); return; }
    await withLoading($('button[type="submit"]', form), async () => {
      try {
        await sb.auth.signIn({ email: form.email.value.trim().toLowerCase(), password: form.password.value });
        const ctx = await getContext({ force: true });
        const next = popNext();
        if (ctx.profile && !ctx.profile.onboarding_completed) location.replace("/minha-conta?completar=1#perfil");
        else if (next) location.replace(next);
        else if (ctx.profile?.account_type !== "pessoa") location.replace("/painel");
        else location.replace("/minha-conta");
      } catch (er) {
        msg.className = "notice bad mb-2";
        msg.innerHTML = `${icons.alert}<p></p>`;
        msg.querySelector("p").textContent = er.message;
        if (/confirme seu e-mail/i.test(er.message)) $("[data-resend]", root).classList.remove("hidden");
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Recuperar / nova senha / callback
// ---------------------------------------------------------------------------
function setupRecuperar() {
  const form = $("[data-form]");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!isValidEmail(form.email.value)) { setFieldError(form.email, "Informe um e-mail válido."); return; }
    await withLoading($('button[type="submit"]', form), async () => {
      try {
        await sb.auth.resetPassword(form.email.value.trim().toLowerCase(), `${CALLBACK}?tipo=recuperacao`);
      } catch { /* não revela se o e-mail existe */ }
      form.innerHTML = `<div class="notice ok">${icons.check}<p>Se houver uma conta com esse e-mail, você receberá um link em instantes. Confira também a caixa de spam.</p></div>`;
    });
  });
}

function setupNovaSenha() {
  const form = $("[data-form]");
  bindPasswordUi(form);
  if (!sb.auth.session) {
    form.innerHTML = `<div class="notice bad">${icons.alert}<p>Este link expirou ou já foi usado. <a class="link" href="/recuperar-senha">Peça um novo link</a>.</p></div>`;
    return;
  }
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearErrors(form);
    if (!strongEnough(form.password.value)) { setFieldError(form.password, "Use pelo menos 8 caracteres, com letras e números."); return; }
    if (form.password.value !== form.password2.value) { setFieldError(form.password2, "As senhas não conferem."); return; }
    await withLoading($('button[type="submit"]', form), async () => {
      try {
        await sb.auth.updateUser({ password: form.password.value });
        toast("Senha atualizada com sucesso!", "ok");
        setTimeout(() => location.replace("/minha-conta"), 900);
      } catch (er) { toast(er.message, "bad"); }
    });
  });
}

async function setupCallback() {
  const box = $("[data-status]");
  try {
    const r = await sb.auth.handleCallback();
    history.replaceState(null, "", location.pathname);
    if (r.type === "recovery") { location.replace("/nova-senha"); return; }
    if (r.type === "recovery_other_browser") throw new Error("Abra o link de redefinição no mesmo navegador em que você pediu a nova senha, ou peça um novo link.");
    if (r.type === "confirmed_other_browser" || !sb.auth.session) { location.replace("/entrar?confirmado=1"); return; }
    const ctx = await getContext({ force: true });
    let pending = null;
    try { pending = sessionStorage.getItem(TYPE_KEY); sessionStorage.removeItem(TYPE_KEY); } catch { /* ignore */ }
    if (ctx.profile && !ctx.profile.onboarding_completed) {
      location.replace(`/minha-conta?completar=1${pending ? `&tipo=${encodeURIComponent(pending)}` : ""}#perfil`);
      return;
    }
    const next = popNext();
    location.replace(next || (ctx.profile?.account_type === "pessoa" ? "/minha-conta" : "/painel"));
  } catch (er) {
    box.innerHTML = `<div class="empty"><div class="empty-art">${icons.alert}</div><h1 class="h3">Não foi possível concluir o acesso</h1><p></p><a class="btn btn-azul" href="/entrar">Tentar novamente</a></div>`;
    box.querySelector("p").textContent = er.message;
  }
}

({ cadastro: setupCadastro, entrar: setupEntrar, recuperar: setupRecuperar, "nova-senha": setupNovaSenha, callback: setupCallback })[page]?.();
observeReveal();
