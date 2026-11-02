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

// Títulos que entram palavra por palavra ([data-split])
export function splitWords(root = document) {
  $$("[data-split]", root).forEach((el) => {
    if (el.dataset.splitDone) return;
    el.dataset.splitDone = "1";
    let i = 0;
    const walk = (node) => {
      [...node.childNodes].forEach((n) => {
        if (n.nodeType === 3) {
          const frag = document.createDocumentFragment();
          n.textContent.split(/(\s+)/).forEach((part) => {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.append(part); return; }
            const w = document.createElement("span");
            w.className = "w";
            const inner = document.createElement("span");
            inner.style.setProperty("--i", i++);
            inner.textContent = part;
            w.append(inner);
            frag.append(w);
          });
          n.replaceWith(frag);
        } else if (n.nodeType === 1) walk(n);
      });
    };
    el.setAttribute("aria-label", el.textContent.trim());
    walk(el);
    [...el.children].forEach((c) => c.setAttribute("aria-hidden", "true"));
  });
  const els = $$("[data-split]:not(.is-split-in)", root);
  if (reduceMotion || !("IntersectionObserver" in window)) { els.forEach((el) => el.classList.add("is-split-in")); return; }
  const io = new IntersectionObserver((entries) => entries.forEach((e) => {
    if (e.isIntersecting) { e.target.classList.add("is-split-in"); io.unobserve(e.target); }
  }), { threshold: 0.3 });
  els.forEach((el) => io.observe(el));
}

// Laços da marca que se desenham quando aparecem
function drawLoops() {
  const els = $$(".loop.draw-on-view");
  if (reduceMotion || !("IntersectionObserver" in window)) { els.forEach((el) => el.classList.add("is-visible")); return; }
  const io = new IntersectionObserver((entries) => entries.forEach((e) => {
    if (e.isIntersecting) { e.target.classList.add("is-visible"); io.unobserve(e.target); }
  }), { threshold: 0.4 });
  els.forEach((el) => io.observe(el));
}

// Botões que acompanham levemente o cursor (só com mouse)
function magnets() {
  if (reduceMotion || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
  $$(".magnet").forEach((el) => {
    el.addEventListener("pointermove", (e) => {
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left - r.width / 2) * 0.18;
      const y = (e.clientY - r.top - r.height / 2) * 0.28;
      el.style.transform = `translate(${x}px, ${y}px)`;
    });
    el.addEventListener("pointerleave", () => { el.style.transform = ""; });
  });
}

// Palavra gigante em faixa contínua: duas metades iguais deslizando sem parar.
export function setPosterWord(el, text, reps = 3) {
  if (!el) return;
  const word = String(text ?? el.textContent).trim();
  el.textContent = "";
  const track = document.createElement("span");
  track.className = "pw-track";
  for (let i = 0; i < reps * 2; i++) { const s = document.createElement("span"); s.textContent = word; track.appendChild(s); }
  el.appendChild(track);
}

// Cartazes: a cor entra de baixo para cima, o animal sobe para dentro da moldura,
// a palavra gigante desliza com a rolagem e as camadas seguem o cursor (só mouse).
function posters() {
  $$(".poster-word").forEach((w, i) => { setPosterWord(w); if (i % 2) w.closest(".poster")?.classList.add("pw-rev"); });
  const list = $$("[data-poster]");
  if (!list.length) return;
  if (reduceMotion || !("IntersectionObserver" in window)) { list.forEach((el) => el.classList.add("is-in", "is-settled")); return; }
  const io = new IntersectionObserver((entries) => entries.forEach((e) => {
    if (!e.isIntersecting) return;
    e.target.classList.add("is-in");
    setTimeout(() => e.target.classList.add("is-settled"), 1500);
    io.unobserve(e.target);
  }), { threshold: 0.18 });
  list.forEach((el) => io.observe(el));

  let ticking = false;
  const update = () => {
    ticking = false;
    const vh = window.innerHeight;
    list.forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.bottom < -100 || r.top > vh + 100) return;
      const p = Math.max(-1, Math.min(1, (r.top + r.height / 2 - vh / 2) / vh));
      el.style.setProperty("--sx", (-p * 160).toFixed(1));
      el.style.setProperty("--sy", (Math.max(0, p) * 70).toFixed(1));
    });
  };
  const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } };
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);
  update();

  if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
  $$("[data-depth-area]").forEach((el) => {
    el.addEventListener("pointermove", (e) => {
      const r = el.getBoundingClientRect();
      el.style.setProperty("--dx", `${(((e.clientX - r.left) / r.width) - 0.5) * 28}px`);
      el.style.setProperty("--dy", `${(((e.clientY - r.top) / r.height) - 0.5) * 18}px`);
    });
    el.addEventListener("pointerleave", () => { el.style.setProperty("--dx", "0px"); el.style.setProperty("--dy", "0px"); });
  });
}

// Rodapé: o cachorro espia por cima da borda e a assinatura gigante entra letra a letra.
function footerFx() {
  const foot = $(".site-footer");
  if (!foot) return;
  const mark = $(".footer-mark", foot);
  if (mark && !mark.dataset.split) {
    mark.dataset.split = "1";
    let i = 0;
    mark.innerHTML = [...mark.textContent].map((ch) => ch === " " ? " " : `<span style="--i:${i++}">${ch}</span>`).join("");
  }
  const top = $("[data-to-top]", foot);
  top?.addEventListener("click", (e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" }); });
  if (reduceMotion || !("IntersectionObserver" in window)) { foot.classList.add("is-in"); return; }
  const io = new IntersectionObserver((entries) => entries.forEach((e) => {
    foot.classList.toggle("is-in", e.isIntersecting);
  }), { threshold: 0.08 });
  io.observe(foot);
}

document.addEventListener("click", (e) => {
  if (e.target instanceof Element && e.target.closest("[data-reload]")) location.reload();
});

// ---------------------------------------------------------------------------
sb.auth.onChange((event) => {
  if (event === "SIGNED_OUT" || event === "SIGNED_IN") { ctxPromise = null; renderUserArea(); }
});

setupHeader();
setupRibbons();
splitWords();
observeReveal();
drawLoops();
magnets();
posters();
footerFx();
renderUserArea();
$$("[data-year]").forEach((el) => { el.textContent = new Date().getFullYear(); });

if (!sb.isConfigured()) {
  console.info("[Meu Amigo pra Vida] Supabase ainda não configurado em assets/js/config.js — conteúdo dinâmico desativado.");
}
