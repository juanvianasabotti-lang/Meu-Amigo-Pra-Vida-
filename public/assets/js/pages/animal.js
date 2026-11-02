import { observeReveal, getContext } from "../app.js";
import sb from "../sb.js";
import { $, $$, esc, icons, L, slugFromPath, fmtDate, markdown } from "../ui.js";
import { ANIMAL_CARD_COLS, ANIMAL_PUBLIC_COLS, petCard, bindFavorites, photoUrl, errorState, emptyState, pixBox, bindCopy } from "../components.js";

const root = $("[data-animal]");
const slug = slugFromPath("adote");

const yesNo = (v, yes, no) => (v === true ? yes : v === false ? no : null);

function healthItem(ok, label) {
  return `<span>${ok ? `<span style="color:var(--verde)">${icons.check}</span>` : `<span style="color:var(--cinza)">${icons.x}</span>`} ${esc(label)}</span>`;
}

async function render() {
  if (!slug) { root.innerHTML = emptyState({ title: "Animal não encontrado", text: "Confira o endereço ou volte para a lista.", cta: `<a class="btn" href="/adote">Ver todos</a>` }); return; }
  let a;
  try {
    const r = await sb.from("animals")
      .select(`${ANIMAL_PUBLIC_COLS}${sb.auth.session ? ",owner_id" : ""},animal_photos(id,storage_path,is_cover,position,alt_text),organizations(slug,trade_name,kind,city,state,pix_key,pix_key_type,logo_url)`)
      .eq("slug", slug).maybeSingle();
    a = r.data;
  } catch (e) { root.innerHTML = errorState(e); return; }
  if (!a) {
    root.innerHTML = emptyState({ title: "Esse amigo não está mais disponível", text: "Ele pode já ter encontrado um lar ou o anúncio foi retirado. Que tal conhecer outros?", cta: `<a class="btn btn-laranja" href="/adote">Ver outros amigos</a>` });
    return;
  }
  document.title = `${a.name} · ${L.species[a.species]} para adoção · Meu Amigo pra Vida`;
  document.querySelector('meta[name="description"]')?.setAttribute("content", `${a.name}, ${L.species[a.species].toLowerCase()} ${L.sex[a.sex].toLowerCase()} em ${a.city} - ${a.state}, está esperando um lar. Conheça e adote!`);

  const photos = (a.animal_photos || []).sort((x, y) => (y.is_cover - x.is_cover) || (x.position - y.position));
  const ctx = await getContext();
  const isOwner = Boolean(a.owner_id) && ctx.profile?.id === a.owner_id;
  const canApply = ["disponivel", "em_processo"].includes(a.status) && !isOwner;
  const traits = (a.personality || []).map((t) => `<span class="chip chip-amarelo">${esc(t)}</span>`).join("");
  const comp = [
    yesNo(a.good_with_children, "Convive bem com crianças", "Melhor sem crianças pequenas"),
    yesNo(a.good_with_dogs, "Gosta de outros cães", "Prefere ser o único cão"),
    yesNo(a.good_with_cats, "Convive com gatos", "Não convive com gatos"),
  ].filter(Boolean);
  const org = a.organizations;

  root.innerHTML = `
  <nav aria-label="Trilha" class="small muted" style="padding-top:20px"><a href="/adote">Adote</a> / ${esc(a.name)}</nav>
  <div class="pet-detail">
    <div data-reveal="left">
      <div class="gallery-main">
        ${photos.length ? photos.map((p, i) => `<img src="${esc(photoUrl(p.storage_path))}" alt="${esc(p.alt_text || `Foto ${i + 1} de ${a.name}`)}" class="${i === 0 ? "is-active" : ""}" ${i ? 'loading="lazy"' : ""}>`).join("")
          : `<div style="position:absolute;inset:0;display:grid;place-items:center;color:rgba(17,17,17,.3)"><div style="width:40%">${a.species === "gato" ? icons.cat : icons.dog}</div></div>`}
        ${a.is_urgent ? `<span class="chip chip-laranja" style="position:absolute;top:16px;left:16px;border:2px solid var(--preto)">Precisa de lar urgente</span>` : ""}
      </div>
      ${photos.length > 1 ? `<div class="gallery-thumbs" role="tablist" aria-label="Fotos">${photos.map((p, i) => `<button type="button" aria-label="Ver foto ${i + 1}" aria-current="${i === 0}"><img src="${esc(photoUrl(p.storage_path))}" alt="" loading="lazy"></button>`).join("")}</div>` : ""}
    </div>
    <div class="sticky-cta" data-reveal="right">
      <div class="chips mb-2"><span class="chip chip-outline">${esc(L.species[a.species])}</span>
        ${a.status === "em_processo" ? `<span class="chip chip-azul">Em processo de adoção</span>` : ""}
        ${a.status === "adotado" ? `<span class="chip chip-rosa">Adotado</span>` : ""}</div>
      <h1 class="display" style="font-size:clamp(2.6rem,6vw,4.6rem)">${esc(a.name)}</h1>
      <p class="lead" style="display:flex;gap:6px;align-items:center">${icons.pin} ${esc(a.city)} - ${esc(a.state)}</p>
      <div class="facts">
        <div class="fact"><small>Sexo</small><strong>${esc(L.sex[a.sex])}</strong></div>
        <div class="fact"><small>Idade</small><strong>${esc(L.age[a.age_group])}</strong></div>
        <div class="fact"><small>Porte</small><strong>${esc(L.size[a.size])}${a.weight_kg ? ` · ${esc(String(a.weight_kg).replace(".", ","))} kg` : ""}</strong></div>
        <div class="fact"><small>Raça</small><strong>${esc(a.breed)}</strong></div>
      </div>
      ${traits ? `<div class="chips mb-3">${traits}</div>` : ""}
      ${canApply ? `<div class="flex gap-1 wrap">
          <a class="btn btn-laranja" href="/adotar/${esc(a.slug)}" data-paws>Quero adotar ${esc(a.name)} <span class="arrow">→</span></a>
          <button class="btn btn-branco" type="button" data-share>${icons.heart} Compartilhar</button>
        </div>
        ${a.status === "em_processo" ? `<p class="small muted mt-2">Já existe um pedido em andamento, mas você ainda pode se candidatar caso ele não se concretize.</p>` : ""}`
        : isOwner ? `<div class="notice info">${icons.info}<p>Este é o seu anúncio. <a class="link" href="/painel#animais">Gerenciar no painel</a></p></div>`
        : `<div class="notice ok">${icons.heart}<p>${esc(a.name)} já encontrou um lar. Que tal conhecer outros amigos?</p></div>`}
      <div class="card card-pad mt-3" style="box-shadow:var(--shadow-pop-sm)">
        <p class="small muted mb-0">Anunciado por</p>
        <p class="bold mb-0">${org ? `<a class="link" href="/organizacao/${esc(org.slug)}">${esc(org.trade_name)}</a> · ${esc(L.orgKind[org.kind])}` : esc(a.publisher_name)}</p>
        ${org ? `<p class="small muted mb-0">Organização verificada pela nossa equipe</p>` : `<p class="small muted mb-0">Anúncio de pessoa física revisado pela moderação.</p>`}
      </div>
    </div>
  </div>
  <div class="grid grid-2" style="padding-bottom:24px">
    <div class="card card-pad" data-reveal="up">
      <h2 class="h3">Conheça ${esc(a.name)}</h2>
      <div class="prose">${markdown(a.description)}</div>
      ${comp.length ? `<div class="chips mt-2">${comp.map((c) => `<span class="chip chip-soft">${esc(c)}</span>`).join("")}</div>` : ""}
    </div>
    <div class="card card-pad" data-reveal="up" style="--delay:.1s">
      <h2 class="h3">Saúde</h2>
      <div class="health">
        ${healthItem(a.vaccinated, "Vacinado")}${healthItem(a.dewormed, "Vermifugado")}
        ${healthItem(a.neutered, "Castrado")}${healthItem(a.microchipped, "Microchipado")}
      </div>
      ${a.health_notes ? `<p class="mt-2 mb-0">${esc(a.health_notes)}</p>` : ""}
      ${a.special_needs ? `<div class="notice mt-2">${icons.info}<p><strong>Cuidados especiais:</strong> ${esc(a.special_needs_notes || "consulte o responsável")}</p></div>` : ""}
      ${a.adoption_requirements ? `<h3 class="h3 mt-3" style="font-size:1.15rem">Requisitos para adoção</h3><p class="mb-0">${esc(a.adoption_requirements)}</p>` : ""}
      ${org?.pix_key ? `<h3 class="mt-3" style="font-size:1.15rem">Ajude ${esc(org.trade_name)}</h3>${pixBox(org)}` : ""}
    </div>
  </div>`;

  // galeria
  const main = $$(".gallery-main img", root);
  $$(".gallery-thumbs button", root).forEach((b, i, all) => b.addEventListener("click", () => {
    main.forEach((im, k) => im.classList.toggle("is-active", k === i));
    all.forEach((x, k) => x.setAttribute("aria-current", String(k === i)));
  }));
  $("[data-share]", root)?.addEventListener("click", async () => {
    const data = { title: `Adote ${a.name}!`, text: `${a.name} está procurando um lar. Conheça:`, url: location.href };
    try { if (navigator.share) await navigator.share(data); else { await navigator.clipboard.writeText(location.href); (await import("../ui.js")).toast("Link copiado! Compartilhe com quem pode adotar", "ok"); } } catch { /* cancelado */ }
  });
  bindCopy(root);
  observeReveal(root);
  loadRelated(a);
}

async function loadRelated(a) {
  try {
    const { data } = await sb.from("animals").select(ANIMAL_CARD_COLS).eq("species", a.species).eq("status", "disponivel")
      .neq("id", a.id).order("approved_at", { ascending: false }).limit(4);
    if (data?.length) {
      $("[data-related]").innerHTML = data.map((x) => petCard(x)).join("");
      $("[data-related-wrap]").classList.remove("hidden");
      bindFavorites($("[data-related]"), data.map((x) => x.id));
      observeReveal($("[data-related-wrap]"));
    }
  } catch { /* opcional */ }
}

render();
void fmtDate;
