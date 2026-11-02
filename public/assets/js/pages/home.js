import "../app.js";
import { observeReveal, countUp, setPosterWord } from "../app.js";
import sb from "../sb.js";
import { $, $$, esc, ufOptions } from "../ui.js";
import { ANIMAL_CARD_COLS, petCard, bindFavorites, postCard, eventCard, emptyState, skeletons, orgLogo } from "../components.js";

// ---------------------------------------------------------------------------
// Herói: troca de animal e cor da marca, com profundidade ao mover o cursor
// ---------------------------------------------------------------------------
const SLIDES = [
  { theme: "laranja", name: "Me leva pra casa?", sub: "Prometo te esperar na porta" },
  { theme: "azul", name: "Gato também é amigo pra vida", sub: "E adora uma janela com sol" },
  { theme: "preto", name: "O melhor para o seu pet!!", sub: "Vacina, castração e muito carinho" },
  { theme: "rosa", name: "Ronrono garantido", sub: "Adote, não compre" },
  { theme: "azul", name: "Quer passear comigo?", sub: "Cachorro adulto também aprende" },
  { theme: "laranja", name: "Pequeno no tamanho", sub: "Enorme no amor" },
];
const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

function setupHero() {
  const stage = $("#hero");
  if (!stage) return;
  setPosterWord($(".hero-giant", stage), "amigo", 4);
  const pets = $$(".hero-pet", stage);
  const dots = $(".hero-dots", stage);
  const nameBox = $(".hero-name", stage);
  let i = 0;
  let timer;

  dots.innerHTML = SLIDES.map((_, k) => `<button type="button" role="tab" aria-label="Destaque ${k + 1} de ${SLIDES.length}"></button>`).join("");
  const dotBtns = $$("button", dots);

  const show = (n) => {
    const prev = pets[i];
    i = (n + SLIDES.length) % SLIDES.length;
    const s = SLIDES[i];
    if (prev && prev !== pets[i]) {
      prev.classList.remove("is-active");
      prev.classList.add("is-leaving");
      setTimeout(() => prev.classList.remove("is-leaving"), 700);
    }
    pets[i].loading = "eager";
    setTimeout(() => pets[i].classList.add("is-active"), prev && prev !== pets[i] ? 220 : 0);
    stage.dataset.theme = s.theme;
    nameBox.classList.add("swap");
    setTimeout(() => {
      $("[data-hero-name]", nameBox).textContent = s.name;
      $("[data-hero-sub]", nameBox).textContent = s.sub;
      nameBox.classList.remove("swap");
    }, 280);
    dotBtns.forEach((b, k) => b.setAttribute("aria-current", String(k === i)));
  };
  const next = () => show(i + 1);
  const start = () => { if (!reduce) { clearInterval(timer); timer = setInterval(next, 5600); } };
  dotBtns.forEach((b, k) => b.addEventListener("click", () => { show(k); start(); }));
  stage.addEventListener("focusin", () => clearInterval(timer));
  stage.addEventListener("focusout", start);
  document.addEventListener("visibilitychange", () => (document.hidden ? clearInterval(timer) : start()));
  show(0);
  start();

  // profundidade: animal, laço e palavra gigante se movem em camadas
  if (!reduce && finePointer) {
    let raf = 0;
    stage.addEventListener("pointermove", (e) => {
      const r = stage.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width - 0.5) * 22;
      const y = ((e.clientY - r.top) / r.height - 0.5) * 14;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => { stage.style.setProperty("--px", `${x.toFixed(1)}px`); stage.style.setProperty("--py", `${y.toFixed(1)}px`); });
    });
    stage.addEventListener("pointerleave", () => { stage.style.setProperty("--px", "0px"); stage.style.setProperty("--py", "0px"); });
  }

  // busca rápida: estados
  const uf = $("[data-qs-uf]");
  if (uf) uf.innerHTML = ufOptions("").replace('<option value="">UF</option>', '<option value="">Estado</option>');
  $(".quick-search")?.addEventListener("submit", (e) => {
    // não envia campos vazios (URL limpa em /adote)
    e.preventDefault();
    const q = new URLSearchParams();
    new FormData(e.currentTarget).forEach((v, k) => { if (v) q.set(k, v); });
    location.href = `/adote${q.toString() ? `?${q}` : ""}`;
  });
}

// ---------------------------------------------------------------------------
// Como participar: foto do animal acompanha o cursor sobre cada linha
// ---------------------------------------------------------------------------
function setupHelpRows() {
  const list = $("[data-help]");
  if (!list || reduce || !finePointer) return;
  const peek = document.createElement("div");
  peek.className = "help-peek";
  peek.setAttribute("aria-hidden", "true");
  peek.innerHTML = '<img alt="" src="">';
  document.body.append(peek);
  const img = $("img", peek);
  $$(".help-row", list).forEach((row) => {
    const pre = new Image(); pre.src = row.dataset.peek;
    row.addEventListener("pointerenter", () => { img.src = row.dataset.peek; peek.classList.add("on"); });
    row.addEventListener("pointerleave", () => peek.classList.remove("on"));
  });
  list.addEventListener("pointermove", (e) => {
    peek.style.setProperty("--x", `${e.clientX}px`);
    peek.style.setProperty("--y", `${e.clientY}px`);
  });
}

// ---------------------------------------------------------------------------
// Rolagem: faixa de texto gigante e linha do processo de adoção
// ---------------------------------------------------------------------------
function setupScrollEffects() {
  const proc = $("[data-process]");
  const film = $(".film-frame");
  if (reduce) { proc?.querySelectorAll("li").forEach((li) => li.classList.add("is-reached")); proc?.style.setProperty("--progress", 1); return; }
  const steps = proc ? $$("li", proc) : [];
  let ticking = false;
  const update = () => {
    ticking = false;
    const vh = window.innerHeight;
    if (proc) {
      const r = proc.getBoundingClientRect();
      const t = Math.min(1, Math.max(0, (vh * 0.75 - r.top) / (r.height + vh * 0.25)));
      proc.querySelector(".process-track span").style.setProperty("--progress", t.toFixed(3));
      proc.style.setProperty("--progress", t.toFixed(3));
      steps.forEach((li, k) => li.classList.toggle("is-reached", t >= (k / steps.length) + 0.02 || t >= 0.98));
    }
    if (film) {
      // o vídeo "abre" de 0,9 para 1 enquanto chega ao centro da tela
      const r = film.getBoundingClientRect();
      const t = Math.min(1, Math.max(0, (vh - r.top) / (vh * 0.75)));
      film.style.setProperty("--film-s", (0.9 + 0.1 * t).toFixed(4));
    }
  };
  const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } };
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);
  update();
}

// Faixa de palavras gigantes: corre sem parar, acelera e muda de sentido com a rolagem.
function setupMarquee() {
  const band = $("[data-scroll-type]");
  if (!band) return;
  const rows = $$(".st-row", band).map((row) => ({ row, dir: Number(row.dataset.dir) || -1, x: 0, w: 0 }));
  const fill = () => rows.forEach((r) => {
    const chunks = $$(".st-chunk", r.row);
    chunks.slice(1).forEach((c) => c.remove());
    r.w = chunks[0].getBoundingClientRect().width || 1;
    const copies = Math.ceil((window.innerWidth * 2) / r.w) + 1;
    for (let k = 0; k < copies; k++) r.row.appendChild(chunks[0].cloneNode(true));
    r.x = r.dir < 0 ? 0 : -r.w;
    r.row.style.transform = `translate3d(${r.x}px,0,0)`;
  });
  (document.fonts?.ready || Promise.resolve()).then(fill);
  if (reduce) return;
  let last = 0, lastY = window.scrollY, boost = 0, sign = 1, visible = false, raf = 0;
  const tick = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const y = window.scrollY, dy = y - lastY; lastY = y;
    if (dy) { sign = dy > 0 ? 1 : -1; boost = Math.min(900, boost + Math.abs(dy) * 7); }
    boost *= Math.pow(0.05, dt);
    rows.forEach((r) => {
      r.x += (70 + boost) * r.dir * sign * dt;
      if (r.x <= -r.w) r.x += r.w; else if (r.x > 0) r.x -= r.w;
      r.row.style.transform = `translate3d(${r.x.toFixed(2)}px,0,0)`;
    });
    raf = visible ? requestAnimationFrame(tick) : 0;
  };
  new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    if (visible && !raf) { last = performance.now(); lastY = window.scrollY; raf = requestAnimationFrame(tick); }
  }, { rootMargin: "120px 0px" }).observe(band);
  let rt;
  window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(fill, 200); });
}

// Vídeo "Como funciona": toca sozinho (sem som) quando aparece, pausa fora da tela
// e acende na lista abaixo o passo que está passando no vídeo.
const FILM_STEPS = [3.6, 7.4, 11.2, 15.0];
function setupFilm() {
  const fig = $("[data-film]");
  if (!fig) return;
  const v = $("video", fig), btn = $("[data-film-toggle]", fig), label = $("[data-film-label]", fig);
  const steps = $$("[data-process] li");
  v.removeAttribute("controls");
  btn.hidden = false;
  let userPaused = reduce;
  const sync = () => {
    const playing = !v.paused;
    fig.classList.toggle("is-playing", playing);
    btn.setAttribute("aria-label", playing ? "Pausar vídeo" : "Reproduzir vídeo");
    label.textContent = playing ? "Pausar vídeo" : "Reproduzir vídeo";
    const t = v.currentTime;
    const idx = !playing ? -1 : FILM_STEPS.reduce((acc, s, k) => (t >= s ? k : acc), -1);
    steps.forEach((li, k) => li.classList.toggle("is-current", k === idx));
  };
  btn.addEventListener("click", () => {
    if (v.paused) { userPaused = false; v.play().catch(() => {}); } else { userPaused = true; v.pause(); }
  });
  ["play", "pause", "timeupdate"].forEach((ev) => v.addEventListener(ev, sync));
  new IntersectionObserver(([e]) => {
    if (e.isIntersecting && !userPaused) v.play().catch(() => {});
    else if (!e.isIntersecting && !v.paused) v.pause();
  }, { threshold: 0.35 }).observe(v);
  sync();
}

// ---------------------------------------------------------------------------
// Conteúdo dinâmico
// ---------------------------------------------------------------------------
async function loadPets() {
  const box = $("[data-home-pets]");
  box.innerHTML = skeletons(4);
  try {
    const { data } = await sb.from("animals").select(ANIMAL_CARD_COLS)
      .in("status", ["disponivel", "em_processo"]).order("is_urgent", { ascending: false }).order("approved_at", { ascending: false }).limit(8);
    if (!data?.length) {
      box.style.display = "block";
      box.innerHTML = emptyState({
        title: "Os primeiros amigos estão chegando!",
        text: "Estamos verificando as ONGs e os protetores parceiros. Em breve, cães e gatos incríveis vão aparecer aqui. Que tal cadastrar sua ONG ou anunciar um animal?",
        cta: `<div class="flex gap-1 wrap justify-center"><a class="btn btn-laranja" href="/cadastro?tipo=ong">Cadastrar ONG</a><a class="btn btn-branco" href="/doar">Anunciar um animal</a></div>`,
      });
    } else {
      box.innerHTML = data.map((a) => petCard(a)).join("");
      bindFavorites(box, data.map((a) => a.id));
    }
  } catch (e) {
    box.style.display = "block";
    box.innerHTML = emptyState({ title: "Os primeiros amigos estão chegando!", text: "Em breve você verá aqui os animais disponíveis para adoção." });
    console.warn(e);
  }
  observeReveal(box);
}

async function loadStats() {
  try {
    const s = await sb.rpc("get_public_stats");
    // só exibe os números quando a comunidade já tem movimento (evita uma vitrine de zeros)
    if (!s || (s.animais_disponiveis || 0) + (s.adocoes_concluidas || 0) < 1) return;
    $("[data-impact]").classList.remove("hidden");
    observeReveal($("[data-impact]"));
    $$("[data-stat]").forEach((el) => {
      const io = new IntersectionObserver(([e]) => {
        if (e.isIntersecting) { countUp(el, s?.[el.dataset.stat] || 0); io.disconnect(); }
      });
      io.observe(el);
    });
  } catch { /* mantém zeros */ }
}

async function loadPosts() {
  const box = $("[data-home-posts]");
  box.innerHTML = skeletons(3, 380);
  try {
    const { data } = await sb.from("blog_posts").select("slug,title,excerpt,cover_url,cover_alt,published_at,reading_minutes,blog_categories(name,color)")
      .eq("status", "publicado").order("featured", { ascending: false }).order("published_at", { ascending: false }).limit(3);
    box.innerHTML = data?.length ? data.map(postCard).join("") : "";
  } catch { box.innerHTML = ""; }
  observeReveal(box);
}

async function loadEvents() {
  try {
    const { data } = await sb.from("events").select("slug,title,summary,kind,starts_at,is_online,location_name,city,state,organizations(trade_name)")
      .eq("status", "publicado").gte("starts_at", new Date(Date.now() - 86400000).toISOString()).order("starts_at").limit(3);
    if (data?.length) {
      $("[data-home-events]").innerHTML = data.map(eventCard).join("");
      $("[data-home-events-wrap]").classList.remove("hidden");
      observeReveal($("[data-home-events-wrap]"));
    }
  } catch { /* seção fica oculta */ }
}

async function loadPartners() {
  try {
    const { data } = await sb.from("organizations").select("slug,trade_name,logo_url,kind")
      .eq("status", "aprovada").not("kind", "in", "(ong,protetor_independente)").order("partner_since").limit(20);
    if (data?.length) {
      $("[data-home-partners]").innerHTML = data.map((o) => `<a class="partner-pill" href="/organizacao/${esc(o.slug)}"><span class="org-logo">${orgLogo(o)}</span>${esc(o.trade_name)}</a>`).join("").repeat(data.length < 6 ? 3 : 1);
      const inner = $("[data-home-partners]");
      inner.insertAdjacentHTML("beforeend", inner.innerHTML);
      $("[data-home-partners-wrap]").classList.remove("hidden");
    }
  } catch { /* seção fica oculta */ }
}

setupHero();
setupMarquee();
setupFilm();
setupHelpRows();
setupScrollEffects();
loadPets();
loadStats();
loadPosts();
loadEvents();
loadPartners();
