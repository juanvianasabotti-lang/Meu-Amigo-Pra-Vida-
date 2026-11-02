// =============================================================================
// Componentes de interface (cards, estados vazios, favoritos)
// =============================================================================
import sb from "./sb.js";
import { esc, icons, stickers, L, fmtDate, initials, toast, $$ } from "./ui.js";

export const ANIMAL_CARD_COLS = "id,slug,name,species,sex,size,age_group,breed,city,state,status,is_urgent,personality,publisher_name,animal_photos(storage_path,is_cover,position)";

export function coverPath(animal) {
  const photos = (animal.animal_photos || []).slice().sort((a, b) => (b.is_cover - a.is_cover) || (a.position - b.position));
  return photos[0]?.storage_path || null;
}
export const photoUrl = (path) => sb.storage.publicUrl("animal-photos", path);

export function petCard(a, { favorited = false } = {}) {
  const path = coverPath(a);
  const img = path
    ? `<img src="${esc(photoUrl(path))}" alt="Foto de ${esc(a.name)}" loading="lazy" decoding="async" width="480" height="600">`
    : `<div style="position:absolute;inset:0;display:grid;place-items:center;color:rgba(17,17,17,.35)"><div style="width:42%">${a.species === "gato" ? icons.cat : icons.dog}</div></div>`;
  const status = a.status === "em_processo" ? `<span class="status-ribbon">Em processo de adoção</span>`
    : a.status === "adotado" ? `<span class="status-ribbon" style="background:var(--rosa);color:var(--preto)">Adotado 💛</span>` : "";
  const traits = (a.personality || []).slice(0, 3).map((t) => `<span class="chip chip-soft">${esc(t)}</span>`).join("");
  return `<article class="pet-card" data-reveal="up">
    <div class="pet-photo">
      ${img}
      <div class="pet-badges">
        <span class="chips">${a.is_urgent ? `<span class="chip chip-laranja">Urgente</span>` : ""}<span class="chip chip-outline">${esc(L.species[a.species])}</span></span>
        <button class="fav-btn" type="button" data-fav="${esc(a.id)}" aria-pressed="${favorited}" aria-label="${favorited ? "Remover dos favoritos" : "Salvar nos favoritos"}">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5s-8-4.7-8-10.6A4.4 4.4 0 0 1 12 7a4.4 4.4 0 0 1 8 2.9c0 5.9-8 10.6-8 10.6z" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/></svg>
        </button>
      </div>
      ${status}
    </div>
    <div class="pet-info">
      <h3 class="pet-name"><a href="/adote/${esc(a.slug)}" style="text-decoration:none" class="stretched">${esc(a.name)}</a></h3>
      <div class="pet-meta">
        <span>${esc(L.sex[a.sex])}</span><span>${esc(L.age[a.age_group])}</span><span>Porte ${esc(L.size[a.size].toLowerCase())}</span>
      </div>
      <div class="pet-meta"><span>${icons.pin}${esc(a.city)} - ${esc(a.state)}</span></div>
      ${traits ? `<div class="pet-traits chips">${traits}</div>` : ""}
    </div>
  </article>`;
}

// Favoritos: liga os botões ❤ de uma lista
export async function bindFavorites(root, animalIds) {
  let favs = new Set();
  if (sb.auth.session && animalIds.length) {
    try {
      const { data } = await sb.from("favorites").select("animal_id").in("animal_id", animalIds);
      favs = new Set((data || []).map((f) => f.animal_id));
    } catch { /* ignore */ }
  }
  $$("[data-fav]:not([data-bound])", root).forEach((btn) => {
    btn.dataset.bound = "1";
    const id = btn.dataset.fav;
    const set = (on) => {
      btn.setAttribute("aria-pressed", String(on));
      btn.setAttribute("aria-label", on ? "Remover dos favoritos" : "Salvar nos favoritos");
    };
    set(favs.has(id));
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!sb.auth.session) {
        toast("Entre na sua conta para salvar favoritos.", "info");
        setTimeout(() => location.assign(`/entrar?voltar=${encodeURIComponent(location.pathname + location.search)}`), 900);
        return;
      }
      const on = btn.getAttribute("aria-pressed") !== "true";
      set(on);
      try {
        if (on) await sb.from("favorites").insert({ user_id: sb.auth.user.id, animal_id: id }, { returning: false });
        else await sb.from("favorites").delete().eq("animal_id", id).eq("user_id", sb.auth.user.id);
        toast(on ? "Salvo nos seus favoritos 💛" : "Removido dos favoritos.", "ok", 2200);
      } catch (err) {
        set(!on);
        toast(err.message, "bad");
      }
    });
  });
}

const CAT_ART = { laranja: icons.heart, azul: icons.syringe, rosa: icons.megaphone, amarelo: icons.gift };
export function postCard(p) {
  const color = p.blog_categories?.color || "laranja";
  const cover = p.cover_url
    ? `<img src="${esc(p.cover_url)}" alt="${esc(p.cover_alt || "")}" loading="lazy">`
    : `<div class="post-art">${CAT_ART[color] || icons.paw}</div>`;
  return `<a class="post-card cat-${esc(color)}" href="/blog/${esc(p.slug)}" data-reveal="up">
    <div class="post-cover">${cover}</div>
    <div class="post-body">
      ${p.blog_categories ? `<span class="chip chip-soft" style="align-self:flex-start">${esc(p.blog_categories.name)}</span>` : ""}
      <h3>${esc(p.title)}</h3>
      <p>${esc(p.excerpt)}</p>
      <div class="post-foot"><span>${esc(fmtDate(p.published_at))}</span><span>·</span><span>${esc(p.reading_minutes)} min de leitura</span></div>
    </div>
  </a>`;
}

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
export function eventCard(e) {
  const d = new Date(e.starts_at);
  const where = e.is_online ? "Online" : [e.location_name, e.city && `${e.city} - ${e.state}`].filter(Boolean).join(" · ");
  return `<a class="event-card" href="/eventos/${esc(e.slug)}" data-reveal="up">
    <div class="event-date"><strong>${d.getDate()}</strong><span>${MONTHS[d.getMonth()]}</span></div>
    <div>
      <span class="chip chip-amarelo">${esc(L.eventKind[e.kind])}</span>
      <h3>${esc(e.title)}</h3>
      <p>${esc(e.summary)}</p>
      <p class="small mt-1" style="display:flex;gap:6px;align-items:center">${icons.pin}${esc(where)}</p>
      ${e.organizations ? `<p class="small muted mt-1">Por ${esc(e.organizations.trade_name)}</p>` : ""}
    </div>
  </a>`;
}

export const orgLogo = (o) => (o.logo_url ? `<img src="${esc(o.logo_url)}" alt="" loading="lazy">` : esc(initials(o.trade_name)));
export function orgCard(o, { showPix = true } = {}) {
  const isOng = ["ong", "protetor_independente"].includes(o.kind);
  return `<article class="org-card" data-reveal="up">
    <div class="org-head">
      <div class="org-logo" style="background:${isOng ? "var(--amarelo)" : "var(--rosa)"}">${orgLogo(o)}</div>
      <div><h3 class="org-name"><a href="/organizacao/${esc(o.slug)}" style="text-decoration:none">${esc(o.trade_name)}</a></h3>
      <div class="org-place">${esc(L.orgKind[o.kind])}${o.city ? ` · ${esc(o.city)} - ${esc(o.state)}` : ""}</div></div>
    </div>
    ${o.tagline ? `<p class="mb-0">${esc(o.tagline)}</p>` : ""}
    ${!isOng && o.services?.length ? `<div class="chips">${o.services.slice(0, 5).map((s) => `<span class="chip chip-soft">${esc(s)}</span>`).join("")}</div>` : ""}
    ${showPix && isOng && o.pix_key ? pixBox(o) : ""}
    <a class="link small" href="/organizacao/${esc(o.slug)}" style="margin-top:auto">Conhecer ${isOng ? "a ONG" : "o parceiro"} →</a>
  </article>`;
}
export function pixBox(o) {
  return `<div class="pix-box"><span class="chip chip-preto">Pix · ${esc(L.pix[o.pix_key_type] || "")}</span>
    <code>${esc(o.pix_key)}</code>
    <button class="btn btn-sm btn-amarelo" type="button" data-copy="${esc(o.pix_key)}">${icons.copy} Copiar</button></div>`;
}
export function bindCopy(root = document) {
  $$("[data-copy]", root).forEach((b) => b.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(b.dataset.copy); toast("Chave Pix copiada! Obrigado por ajudar 💛", "ok"); }
    catch { toast("Não foi possível copiar. Selecione o texto manualmente.", "bad"); }
  }));
}

export function emptyState({ title, text, cta = "", art = icons.paw }) {
  return `<div class="empty" data-reveal="pop"><div class="empty-art">${art}</div><h3>${esc(title)}</h3><p>${esc(text)}</p>${cta}</div>`;
}
export const skeletons = (n = 3, h = 420) => Array.from({ length: n }, () => `<div class="skeleton" style="min-height:${h}px"></div>`).join("");

export function errorState(err) {
  return emptyState({
    title: "Ops! Não conseguimos carregar agora",
    text: err?.code === "not_configured" ? "O site ainda está sendo conectado ao banco de dados." : (err?.message || "Tente novamente em instantes."),
    cta: `<button class="btn btn-branco" type="button" data-reload>Tentar de novo</button>`,
    art: icons.alert,
  });
}
export { stickers };
