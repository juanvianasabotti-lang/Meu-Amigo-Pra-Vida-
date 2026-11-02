// =============================================================================
// Comportamentos compartilhados por todas as páginas
// =============================================================================
import sb from "./sb.js";
import { $, $$, esc, icons, initials, toast } from "./ui.js";

document.documentElement.classList.remove("no-js");
document.documentElement.classList.add("js");
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---------------------------------------------------------------------------
// Contexto do usuário (perfil, papéis e organização) — carregado uma vez
// ---------------------------------------------------------------------------
let ctxPromise = null;
export function getContext({ force = false } = {}) {
  if (ctxPromise && !force) return ctxPromise;
  ctxPromise = (async () => {
    if (!sb.isConfigured() || !sb.auth.session) return { session: null, profile: null, roles: [], org: null };
    try {
      const uid = sb.auth.session.user?.id || (await sb.auth.getUser())?.id;
      const [profile, roles, org] = await Promise.all([
        sb.from("profiles").select("*").eq("id", uid).maybeSingle().then((r) => r.data),
        sb.rpc("my_roles").catch(() => []),
        sb.from("organizations").select("*").eq("owner_id", uid).maybeSingle().then((r) => r.data).catch(() => null),
      ]);
      return { session: sb.auth.session, profile, roles: roles || [], org };
    } catch (e) {
      if (e?.status === 401) await sb.auth.signOut();
      return { session: sb.auth.session, profile: null, roles: [], org: null };
    }
  })();
  return ctxPromise;
}
export const isStaff = (ctx) => ctx.roles?.includes("admin") || ctx.roles?.includes("moderador");
export const isAdmin = (ctx) => ctx.roles?.includes("admin");

// Exige login; devolve o contexto ou redireciona
export async function requireAuth({ onboarding = true } = {}) {
  if (!sb.isConfigured()) return null;
  if (!sb.auth.session) {
    location.replace(`/entrar?voltar=${encodeURIComponent(location.pathname + location.search + location.hash)}`);
    return new Promise(() => {});
  }
  const ctx = await getContext();
  if (!ctx.profile) {
    toast("Não foi possível carregar seu perfil. Entre novamente.", "bad");
    await sb.auth.signOut();
    location.replace("/entrar");
    return new Promise(() => {});
  }
  if (onboarding && !ctx.profile.onboarding_completed && !location.pathname.startsWith("/minha-conta")) {
    location.replace("/minha-conta?completar=1#perfil");
    return new Promise(() => {});
  }
  return ctx;
}

// ---------------------------------------------------------------------------
// Cabeçalho: estado ao rolar, menu mobile e área do usuário
// ---------------------------------------------------------------------------
function setupHeader() {
  const header = $(".site-header");
  if (header) {
    const onScroll = () => header.classList.toggle("is-scrolled", window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
  }
  const toggle = $(".nav-toggle");
  const backdrop = $(".nav-backdrop");
  const setNav = (open) => {
    document.body.classList.toggle("nav-open", open);
    toggle?.setAttribute("aria-expanded", String(open));
    document.body.style.overflow = open ? "hidden" : "";
  };
  toggle?.addEventListener("click", () => setNav(!document.body.classList.contains("nav-open")));
  backdrop?.addEventListener("click", () => setNav(false));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") setNav(false); });
  $$(".main-nav a").forEach((a) => a.addEventListener("click", () => setNav(false)));

  // marca o link da página atual
  const path = location.pathname.replace(/\/+$/, "") || "/";
  $$(".main-nav a").forEach((a) => {
    const href = a.getAttribute("href").replace(/\/+$/, "") || "/";
    if (href === path || (href !== "/" && path.startsWith(`${href}/`))) a.setAttribute("aria-current", "page");
  });
}

async function renderUserArea() {
  const slot = $("[data-user-area]");
  if (!slot) return;
  if (!sb.isConfigured() || !sb.auth.session) {
    slot.innerHTML = `<a class="btn btn-ghost btn-sm btn-entrar" href="/entrar">Entrar</a>
      <a class="btn btn-laranja btn-sm" href="/cadastro">Cadastre-se</a>`;
    return;
  }
  const ctx = await getContext();
  const p = ctx.profile;
  if (!p) { slot.innerHTML = `<a class="btn btn-laranja btn-sm" href="/entrar">Entrar</a>`; return; }
  let unread = 0;
  try {
    const r = await sb.from("notifications").select("id", { count: true }).is("read_at", null).limit(1);
    unread = r.count || 0;
  } catch { /* ignore */ }
  const avatar = p.avatar_url ? `<img src="${esc(p.avatar_url)}" alt="" referrerpolicy="no-referrer">` : esc(initials(p.full_name || p.email));
  const managesAnimals = p.account_type !== "empresa";
  slot.innerHTML = `
    <div class="user-menu">
      <button class="user-btn" type="button" aria-haspopup="true" aria-expanded="false">
        <span class="avatar">${avatar}</span><span class="name-short">${esc(p.display_name || "Minha conta")}</span>
        ${unread ? `<span class="badge-dot" aria-label="${unread} notificações não lidas">${unread > 9 ? "9+" : unread}</span>` : ""}
      </button>
      <div class="dropdown" role="menu">
        <a role="menuitem" href="/minha-conta">${icons.user} Minha conta</a>
        <a role="menuitem" href="/minha-conta#notificacoes">${icons.bell} Notificações ${unread ? `<span class="chip chip-laranja" style="margin-left:auto">${unread}</span>` : ""}</a>
        ${p.account_type === "pessoa" ? `<a role="menuitem" href="/minha-conta#pedidos">${icons.heart} Meus pedidos de adoção</a>` : ""}
        <a role="menuitem" href="/painel">${icons.home} ${p.account_type === "pessoa" ? "Meus anúncios" : "Painel da organização"}</a>
        ${managesAnimals ? `<a role="menuitem" href="/painel#novo-animal">${icons.plus} Anunciar um animal</a>` : ""}
        ${isStaff(ctx) ? `<hr><a role="menuitem" href="/admin">${icons.shield} Administração</a>` : ""}
        <hr><button role="menuitem" type="button" data-logout>${icons.logout} Sair</button>
      </div>
    </div>`;
  const btn = $(".user-btn", slot);
  const dd = $(".dropdown", slot);
  const close = () => { dd.classList.remove("open"); btn.setAttribute("aria-expanded", "false"); };
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const open = !dd.classList.contains("open");
    dd.classList.toggle("open", open);
    btn.setAttribute("aria-expanded", String(open));
  });
  document.addEventListener("click", (e) => { if (!slot.contains(e.target)) close(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
  $("[data-logout]", slot).addEventListener("click", async () => {
    await sb.auth.signOut();
    location.href = "/";
  });
}

// ---------------------------------------------------------------------------
// Animações: revelação ao rolar (entrada E saída), contadores e faixas
// ---------------------------------------------------------------------------
export function observeReveal(root = document) {
  const els = $$("[data-reveal]", root);
  if (reduceMotion || !("IntersectionObserver" in window)) { els.forEach((el) => el.classList.add("is-visible")); return; }
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      const el = entry.target;
      if (entry.isIntersecting) {
        el.classList.add("is-visible");
        if (!el.hasAttribute("data-reveal-repeat")) io.unobserve(el);
      } else if (el.hasAttribute("data-reveal-repeat")) {
        el.classList.remove("is-visible");
      }
    });
  }, { threshold: 0.18, rootMargin: "0px 0px -6% 0px" });
  els.forEach((el) => io.observe(el));
}

export function countUp(el, to) {
  const target = Number(to) || 0;
  if (reduceMotion || target === 0) { el.textContent = target.toLocaleString("pt-BR"); return; }
  const start = performance.now();
  const dur = 1600;
  const step = (now) => {
    const t = Math.min(1, (now - start) / dur);
    const eased = 1 - Math.pow(1 - t, 4);
    el.textContent = Math.round(target * eased).toLocaleString("pt-BR");
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function setupRibbons() {
  $$(".ribbon-inner").forEach((inner) => {
    if (inner.dataset.cloned) return;
    inner.dataset.cloned = "1";
    const clone = inner.innerHTML;
    inner.insertAdjacentHTML("beforeend", clone);
    $$(":scope > *", inner).slice(inner.children.length / 2).forEach((n) => n.setAttribute("aria-hidden", "true"));
  });
}

// Patinhas que pulam ao clicar nos botões principais
export function pawBurst(x, y) {
  if (reduceMotion) return;
  const colors = ["var(--laranja)", "var(--azul)", "var(--rosa)", "var(--amarelo)"];
  for (let i = 0; i < 6; i++) {
    const el = document.createElement("span");
    el.className = "paw-burst";
    el.innerHTML = icons.paw;
    const ang = (Math.PI * 2 * i) / 6 + Math.random() * 0.6;
    const dist = 50 + Math.random() * 40;
    el.style.left = `${x - 11}px`;
    el.style.top = `${y - 11}px`;
    el.style.color = colors[i % colors.length];
    el.style.setProperty("--dx", `${Math.cos(ang) * dist}px`);
    el.style.setProperty("--dy", `${Math.sin(ang) * dist - 20}px`);
    el.style.setProperty("--rot", `${Math.random() * 120 - 60}deg`);
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 950);
  }
}
document.addEventListener("click", (e) => {
  if (e.target instanceof Element && e.target.closest("[data-reload]")) { location.reload(); return; }
  const b = e.target instanceof Element && e.target.closest(".btn-laranja, .btn-rosa, .btn-amarelo, .btn-azul, [data-paws]");
  if (b && e.clientX) pawBurst(e.clientX, e.clientY);
});

// ---------------------------------------------------------------------------
sb.auth.onChange((event) => {
  if (event === "SIGNED_OUT" || event === "SIGNED_IN") { ctxPromise = null; renderUserArea(); }
});

setupHeader();
setupRibbons();
observeReveal();
renderUserArea();
$$("[data-year]").forEach((el) => { el.textContent = new Date().getFullYear(); });

if (!sb.isConfigured()) {
  console.info("[Meu Amigo Pra Vida] Supabase ainda não configurado em assets/js/config.js — conteúdo dinâmico desativado.");
}
