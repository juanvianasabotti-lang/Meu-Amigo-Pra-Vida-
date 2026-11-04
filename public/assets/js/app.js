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
export const isTeam = (ctx) => (ctx.roles?.length || 0) > 0;

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
        ${isTeam(ctx) ? `<hr><a role="menuitem" href="/equipe">${icons.shield} Painel da equipe</a>` : ""}
        ${isStaff(ctx) ? `<a role="menuitem" href="/admin">${icons.shield} Moderação</a>` : ""}
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
  $$(".ribbon-inner, .pb-track").forEach((inner) => {
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

// ---------------------------------------------------------------------------
// Experiência guiada: o site leva a pessoa pelos capítulos de cada página
// ---------------------------------------------------------------------------
const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
const clamp01 = (v) => Math.max(0, Math.min(1, v));

// Uma única escuta de rolagem (com requestAnimationFrame) para todos os efeitos
const scrollFns = [];
let scrollTicking = false;
function onScrollFrame(fn) {
  scrollFns.push(fn);
  if (scrollFns.length === 1) {
    const run = () => { scrollTicking = false; const vh = window.innerHeight; scrollFns.forEach((f) => f(vh)); };
    const req = () => { if (!scrollTicking) { scrollTicking = true; requestAnimationFrame(run); } };
    window.addEventListener("scroll", req, { passive: true });
    window.addEventListener("resize", req);
    requestAnimationFrame(run);
  }
}

// Altura do cabeçalho fixo (o guia e as âncoras se posicionam logo abaixo dele)
function headerHeight() {
  const header = $(".site-header");
  if (!header) return;
  const set = () => document.documentElement.style.setProperty("--header-h", `${Math.round(header.getBoundingClientRect().height)}px`);
  set();
  if ("ResizeObserver" in window) new ResizeObserver(set).observe(header);
}

// Barra fina de progresso no topo
function pageProgress() {
  if ($(".read-progress") || document.body.classList.contains("layout-bare")) return;
  const bar = document.createElement("div");
  bar.className = "page-progress";
  bar.setAttribute("aria-hidden", "true");
  document.body.append(bar);
  onScrollFrame((vh) => {
    const max = document.documentElement.scrollHeight - vh;
    bar.style.setProperty("--p", max > 200 ? clamp01(window.scrollY / max).toFixed(4) : 0);
  });
}

// Guia "Nesta página": monta a lista de capítulos ([data-chapter]) e marca onde a pessoa está
function chapterGuide() {
  const chapters = $$("main [data-chapter]");
  if (chapters.length < 3) return;
  const nav = document.createElement("nav");
  nav.className = "guide";
  nav.setAttribute("aria-label", "Nesta página");
  nav.innerHTML = `<div class="guide-inner"><span class="guide-label">Nesta página</span>${chapters.map((c, i) => {
    if (!c.id) c.id = `capitulo-${i + 1}`;
    return `<a href="#${esc(c.id)}"><span class="n">${String(i + 1).padStart(2, "0")}</span>${esc(c.dataset.chapter)}</a>`;
  }).join("")}</div>`;
  // logo depois do cabeçalho: entra cedo na ordem do teclado
  const header = $(".site-header");
  if (header) header.after(nav); else document.body.append(nav);
  const inner = $(".guide-inner", nav);
  const links = $$("a", nav);
  const footer = $(".site-footer");
  let current = -1;
  links.forEach((a) => a.addEventListener("click", () => a.blur()));
  onScrollFrame((vh) => {
    const line = vh * 0.38;
    let idx = -1;
    chapters.forEach((c, i) => { if (c.getBoundingClientRect().top <= line) idx = i; });
    const firstTop = chapters[0].getBoundingClientRect().top;
    const footTop = footer ? footer.getBoundingClientRect().top : Infinity;
    nav.classList.toggle("is-on", firstTop < vh * 0.7 && footTop > vh * 0.55);
    if (idx !== current) {
      links.forEach((a, i) => (i === idx ? a.setAttribute("aria-current", "true") : a.removeAttribute("aria-current")));
      current = idx;
      const a = links[idx];
      if (a) {
        // mantém o capítulo atual à vista dentro do guia, sem mexer na rolagem da página
        const target = a.offsetLeft - (inner.clientWidth - a.offsetWidth) / 2;
        inner.scrollTo({ left: Math.max(0, target), behavior: reduceMotion ? "auto" : "smooth" });
      }
    }
    if (idx >= 0) {
      const r = chapters[idx].getBoundingClientRect();
      links[idx].style.setProperty("--cp", clamp01((line - r.top) / Math.max(1, r.height)).toFixed(3));
    }
  });
}

// Fotos reais: entram subindo dentro da moldura e andam um pouco com a rolagem
export function photos(root = document) {
  const list = $$(".foto[data-photo]:not([data-photo-bound])", root);
  if (!list.length) return;
  list.forEach((f) => f.setAttribute("data-photo-bound", ""));
  if (reduceMotion || !("IntersectionObserver" in window)) { list.forEach((f) => f.classList.add("is-in", "is-settled")); return; }
  const io = new IntersectionObserver((entries) => entries.forEach((e) => {
    if (!e.isIntersecting) return;
    e.target.classList.add("is-in");
    setTimeout(() => e.target.classList.add("is-settled"), 1400);
    io.unobserve(e.target);
  }), { threshold: 0.12, rootMargin: "0px 0px -4% 0px" });
  list.forEach((f) => io.observe(f));
  onScrollFrame((vh) => {
    list.forEach((f) => {
      if (!f.classList.contains("is-settled")) return;
      const r = f.getBoundingClientRect();
      if (r.bottom < -50 || r.top > vh + 50) return;
      const p = Math.max(-1, Math.min(1, (r.top + r.height / 2 - vh / 2) / vh));
      f.style.setProperty("--fy", `${(p * r.height * -0.045).toFixed(1)}px`);
    });
  });
}

// Linha do processo que se preenche com a rolagem ([data-process])
function processLines() {
  $$("[data-process]").forEach((proc) => {
    const steps = $$("li", proc);
    const track = $(".process-track span", proc);
    if (reduceMotion) { steps.forEach((li) => li.classList.add("is-reached")); track?.style.setProperty("--progress", 1); return; }
    onScrollFrame((vh) => {
      const r = proc.getBoundingClientRect();
      if (r.bottom < -100 || r.top > vh + 100) return;
      const t = clamp01((vh * 0.75 - r.top) / (r.height + vh * 0.25));
      track?.style.setProperty("--progress", t.toFixed(3));
      steps.forEach((li, k) => li.classList.toggle("is-reached", t >= (k / steps.length) + 0.02 || t >= 0.98));
    });
  });
}

// História em etapas ([data-story]): a foto fica parada ao lado e troca conforme o texto passa
function stories() {
  $$("[data-story]").forEach((story) => {
    const steps = $$(".story-step", story);
    const media = $(".story-media", story);
    if (!steps.length || !media) return;
    const imgs = steps.map((s, i) => {
      const src = $(".foto img", s);
      const img = document.createElement("img");
      img.className = "sm-img";
      img.alt = "";
      img.loading = i === 0 ? "eager" : "lazy";
      img.decoding = "async";
      if (src) { img.src = src.currentSrc || src.getAttribute("src"); if (src.getAttribute("srcset")) { img.srcset = src.getAttribute("srcset"); img.sizes = "50vw"; } img.style.setProperty("--pos", src.style.getPropertyValue("--pos") || "50% 50%"); }
      return img;
    });
    media.setAttribute("aria-hidden", "true");
    media.innerHTML = `<div class="story-bars">${steps.map(() => "<i><b></b></i>").join("")}</div><p class="foto-tag"><span data-t></span><small data-s></small></p><p class="foto-credito" data-c></p>`;
    imgs.forEach((img) => media.prepend(img));
    const bars = $$(".story-bars b", media);
    const tag = $(".foto-tag", media);
    const credit = $("[data-c]", media);
    story.classList.add("is-enhanced");
    let cur = -1;
    const show = (i) => {
      cur = i;
      imgs.forEach((img, k) => img.classList.toggle("is-on", k === i));
      steps.forEach((s, k) => s.classList.toggle("is-active", k === i));
      const s = steps[i];
      tag.classList.add("swap");
      setTimeout(() => {
        $("[data-t]", tag).textContent = s.dataset.tag || "";
        $("[data-s]", tag).textContent = s.dataset.tagSub || "";
        tag.hidden = !s.dataset.tag;
        tag.classList.remove("swap");
      }, reduceMotion ? 0 : 220);
      credit.innerHTML = $(".foto-credito", s)?.innerHTML || "";
    };
    show(0);
    onScrollFrame((vh) => {
      const r = story.getBoundingClientRect();
      if (r.bottom < 0 || r.top > vh) return;
      const line = vh * 0.55;
      let idx = 0;
      steps.forEach((s, k) => { if (s.getBoundingClientRect().top < line) idx = k; });
      if (idx !== cur) show(idx);
      steps.forEach((s, k) => {
        const sr = s.getBoundingClientRect();
        bars[k].style.setProperty("--f", k < idx ? 1 : k > idx ? 0 : clamp01((line - sr.top) / Math.max(1, sr.height)).toFixed(3));
      });
    });
  });
}

// Faixa horizontal ([data-hscroll]): no computador a rolagem para baixo leva os cartões para o lado
function hscrolls() {
  $$("[data-hscroll]").forEach((sec) => {
    const sticky = $(".hscroll-sticky", sec);
    const track = $(".hscroll-track", sec);
    if (!sticky || !track) return;
    const mq = window.matchMedia("(min-width: 900px) and (min-height: 700px)");
    let dist = 0;
    const measure = () => {
      const pin = mq.matches && !reduceMotion;
      sec.classList.toggle("is-pinned", pin);
      if (!pin) { sec.style.removeProperty("--hs-h"); track.style.removeProperty("--hs-x"); return; }
      dist = Math.max(0, track.scrollWidth - track.clientWidth);
      sec.style.setProperty("--hs-h", `${dist + sticky.clientHeight + 40}px`);
    };
    measure();
    window.addEventListener("resize", () => requestAnimationFrame(measure));
    mq.addEventListener?.("change", measure);
    (document.fonts?.ready || Promise.resolve()).then(measure);
    $$("img", track).forEach((im) => im.complete || im.addEventListener("load", measure, { once: true }));
    const stickyTop = () => parseFloat(getComputedStyle(sticky).top) || 0;
    onScrollFrame(() => {
      if (!sec.classList.contains("is-pinned")) return;
      const r = sec.getBoundingClientRect();
      const p = clamp01((stickyTop() - r.top) / Math.max(1, dist));
      track.style.setProperty("--hs-x", `${(-p * dist).toFixed(1)}px`);
      sec.style.setProperty("--hs-p", p.toFixed(3));
    });
    track.addEventListener("scroll", () => {
      if (sec.classList.contains("is-pinned")) return;
      const max = track.scrollWidth - track.clientWidth;
      sec.style.setProperty("--hs-p", max > 0 ? (track.scrollLeft / max).toFixed(3) : 0);
    }, { passive: true });
    // teclado: ao focar um cartão escondido à direita, a página rola até ele aparecer
    track.addEventListener("focusin", (e) => {
      if (!sec.classList.contains("is-pinned")) return;
      const card = e.target.closest(".hs-card");
      if (!card) return;
      const p = clamp01((card.offsetLeft - track.offsetLeft - 24) / Math.max(1, dist));
      window.scrollTo({ top: window.scrollY + sec.getBoundingClientRect().top - stickyTop() + p * dist, behavior: "auto" });
    });
  });
}

// Linhas editoriais com foto que acompanha o cursor ([data-help]) — só com mouse
function peekRows() {
  const lists = $$("[data-help]");
  if (!lists.length || reduceMotion || !finePointer) return;
  const peek = document.createElement("div");
  peek.className = "help-peek";
  peek.setAttribute("aria-hidden", "true");
  peek.innerHTML = '<img alt="" src="">';
  document.body.append(peek);
  const img = $("img", peek);
  lists.forEach((list) => {
    $$(".help-row[data-peek]", list).forEach((row) => {
      const pre = new Image(); pre.src = row.dataset.peek;
      row.addEventListener("pointerenter", () => {
        img.src = row.dataset.peek;
        peek.classList.toggle("is-photo", row.dataset.peek.includes("/fotos/"));
        peek.classList.add("on");
      });
      row.addEventListener("pointerleave", () => peek.classList.remove("on"));
    });
    list.addEventListener("pointermove", (e) => {
      peek.style.setProperty("--x", `${e.clientX}px`);
      peek.style.setProperty("--y", `${e.clientY}px`);
    });
  });
}

// Números com fonte que contam ao aparecer ([data-count-to])
function countOnView() {
  const els = $$("[data-count-to]");
  if (!els.length) return;
  if (reduceMotion || !("IntersectionObserver" in window)) { els.forEach((el) => countUp(el, el.dataset.countTo)); return; }
  els.forEach((el) => { if (el.getBoundingClientRect().top > window.innerHeight) el.textContent = "0"; });
  const io = new IntersectionObserver((entries) => entries.forEach((e) => {
    if (!e.isIntersecting) return;
    countUp(e.target, e.target.dataset.countTo);
    io.unobserve(e.target);
  }), { threshold: 0.6 });
  els.forEach((el) => io.observe(el));
}

// Contador de visitas próprio: só página e dia, sem cookies e sem identificar ninguém.
function trackVisit() {
  if (!sb.isConfigured() || navigator.globalPrivacyControl || navigator.doNotTrack === "1") return;
  let path = location.pathname.replace(/\.html$/, "").replace(/\/+$/, "") || "/";
  if (/^\/(admin|equipe|painel|minha-conta|auth|nova-senha)/.test(path)) return;
  path = path.replace(/^\/(adote|blog|eventos|organizacao|adotar)\/.+$/, "/$1/*").toLowerCase();
  if (!/^\/[a-z0-9/*_-]{0,79}$/.test(path)) return;
  let fresh = false;
  try { fresh = !sessionStorage.getItem("mapv.v"); sessionStorage.setItem("mapv.v", "1"); } catch { /* ignore */ }
  const mobile = window.matchMedia("(max-width: 760px)").matches;
  sb.rpc("track_visit", { p_path: path, p_new_session: fresh, p_mobile: mobile }).catch(() => {});
}

document.addEventListener("click", (e) => {
  if (e.target instanceof Element && e.target.closest("[data-reload]")) location.reload();
});

// ---------------------------------------------------------------------------
sb.auth.onChange((event) => {
  if (event === "SIGNED_OUT" || event === "SIGNED_IN") { ctxPromise = null; renderUserArea(); }
});

setupHeader();
headerHeight();
setupRibbons();
splitWords();
observeReveal();
drawLoops();
magnets();
posters();
photos();
processLines();
stories();
hscrolls();
peekRows();
countOnView();
chapterGuide();
pageProgress();
footerFx();
trackVisit();
renderUserArea();
$$("[data-year]").forEach((el) => { el.textContent = new Date().getFullYear(); });

if (!sb.isConfigured()) {
  console.info("[Meu Amigo pra Vida] Supabase ainda não configurado em assets/js/config.js — conteúdo dinâmico desativado.");
}
