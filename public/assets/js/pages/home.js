import "../app.js";
import { observeReveal, countUp } from "../app.js";
import sb from "../sb.js";
import { $, $$, esc } from "../ui.js";
import { ANIMAL_CARD_COLS, petCard, bindFavorites, postCard, eventCard, emptyState, skeletons, orgLogo } from "../components.js";

// ---------------------------------------------------------------------------
// Herói: troca de animais com entrada e saída animadas + cor de fundo da marca
// ---------------------------------------------------------------------------
const SLIDES = [
  { theme: "laranja", word: "pra vida inteira", name: "Quer me levar pra casa??", sub: "Cada adoção muda duas vidas" },
  { theme: "azul", word: "de quatro patas", name: "Miau! Me adota? 🐱", sub: "Gatos também são amigos pra vida" },
  { theme: "rosa", word: "cheio de amor", name: "O melhor para o seu pet!!", sub: "Cuidado, carinho e respeito" },
  { theme: "amarelo", word: "pra todas as horas", name: "Ronrono garantido", sub: "Adote, não compre" },
  { theme: "azul", word: "pra vida inteira", name: "Me adota? 🥺", sub: "Prometo amor incondicional" },
  { theme: "laranja", word: "de quatro patas", name: "Amor que abana o rabo", sub: "Castrado, vacinado e pronto pra te amar" },
]
function setupHero() {
  const stage = $("#hero");
  if (!stage) return;
  const pets = $$(".hero-pet", stage);
  const dots = $(".hero-dots", stage);
  const tags = $(".hero-tags", stage);
  const word = $("[data-hero-word]", stage);
  const nameBox = $(".hero-name", stage);
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let i = 0;
  let timer;

  dots.innerHTML = SLIDES.map((_, k) => `<button type="button" role="tab" aria-label="Destaque ${k + 1}"></button>`).join("");
  const dotBtns = $$("button", dots);

  const show = (n) => {
    const prev = pets[i];
    i = (n + SLIDES.length) % SLIDES.length;
    const s = SLIDES[i];
    if (prev && prev !== pets[i]) {
      prev.classList.remove("is-active");
      prev.classList.add("is-leaving");
      setTimeout(() => prev.classList.remove("is-leaving"), 800);
    }
    // carrega a imagem se ainda for lazy
    pets[i].loading = "eager";
    setTimeout(() => pets[i].classList.add("is-active"), prev && prev !== pets[i] ? 260 : 0);
    stage.dataset.theme = s.theme;
    word.textContent = s.word;
    word.className = `hl hero-word ${s.theme === "amarelo" || s.theme === "rosa" ? "hl-azul" : "hl-branco"}`;
    nameBox.classList.add("swap");
    setTimeout(() => {
      $("[data-hero-name]", nameBox).textContent = s.name;
      $("[data-hero-sub]", nameBox).textContent = s.sub;
      nameBox.classList.remove("swap");
    }, 300);
    dotBtns.forEach((b, k) => b.setAttribute("aria-current", String(k === i)));
  };
  const next = () => show(i + 1);
  const start = () => { if (!reduce) { clearInterval(timer); timer = setInterval(next, 5200); } };
  dotBtns.forEach((b, k) => b.addEventListener("click", () => { show(k); start(); }));
  stage.addEventListener("mouseenter", () => clearInterval(timer));
  stage.addEventListener("mouseleave", start);
  document.addEventListener("visibilitychange", () => (document.hidden ? clearInterval(timer) : start()));

  show(0);
  setTimeout(() => tags.classList.add("is-in"), 500);
  start();
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
loadPets();
loadStats();
loadPosts();
loadEvents();
loadPartners();
