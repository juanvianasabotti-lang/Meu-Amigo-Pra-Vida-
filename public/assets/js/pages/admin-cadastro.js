// =============================================================================
// Painel da equipe: animais e eventos cadastrados pela própria equipe
// (sem vínculo com ONG ou empresa). Publicam direto, em nome do Meu Amigo pra Vida.
// =============================================================================
import sb from "../sb.js";
import {
  $, $$, esc, icons, L, toast, withLoading, setFieldError, clearErrors, focusFirstError, fmtDateTime, timeAgo,
  statusPill, confirmDialog, modal, masks, bindMasks, ufOptions, isValidPhone, isValidEmail, digits,
} from "../ui.js";
import { emptyState, photoUrl, coverPath } from "../components.js";
import { processImage } from "../image.js";
import { CONFIG } from "../config.js";

const TRAITS = ["Brincalhão", "Carinhoso", "Calmo", "Tímido", "Sociável", "Protetor", "Independente", "Curioso", "Dorminhoco", "Agitado", "Obediente", "Companheiro"];
const local = (d) => (d ? new Date(new Date(d).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "");

// ---------------------------------------------------------------------------
// Animais da equipe
// ---------------------------------------------------------------------------
export async function teamAnimals(view, ctx, { admin }) {
  const { data } = await sb.from("animals")
    .select("id,slug,name,species,status,owner_id,contact_mode,contact_name,created_at,approved_at,animal_photos(storage_path,is_cover,position)")
    .eq("posted_by_team", true).order("created_at", { ascending: false }).limit(200);
  const contactLabel = (a) => (a.contact_mode === "doador" ? `Contato de quem anuncia${a.contact_name ? `: ${a.contact_name}` : ""}` : `E-mail institucional`);
  view.innerHTML = `<div class="dash-title"><h1>Animais cadastrados pela equipe</h1><button class="btn btn-laranja btn-sm" type="button" data-new>${icons.plus} Cadastrar animal</button></div>
    <div class="notice info mb-3">${icons.info}<p>Para animais de quem não tem conta no site. O anúncio aparece em nome do <strong>Meu Amigo pra Vida</strong> e quem quiser adotar fala direto com o doador (WhatsApp, telefone ou e-mail) ou com o nosso e-mail ${esc(CONFIG.CONTACT_EMAIL)}.</p></div>
    ${data?.length ? `<div class="list">${data.map((a) => {
      const c = coverPath(a);
      return `<div class="list-item" data-id="${esc(a.id)}">
        <div class="thumb">${c ? `<img src="${esc(photoUrl(c))}" alt="">` : a.species === "gato" ? icons.cat : icons.dog}</div>
        <div><h3>${esc(a.name)}</h3><p>${statusPill(a.status, L.animalStatus)} · ${esc(contactLabel(a))} · criado ${esc(timeAgo(a.created_at))}</p></div>
        <div class="actions">
          ${["disponivel", "em_processo"].includes(a.status) ? `<a class="btn btn-sm btn-ghost" href="/adote/${esc(a.slug)}" target="_blank">Ver</a>` : ""}
          <button class="btn btn-sm btn-branco" type="button" data-edit>${icons.edit} Editar</button>
          ${["disponivel", "em_processo"].includes(a.status) ? `<button class="btn btn-sm btn-rosa" type="button" data-status="adotado">Foi adotado!</button>` : ""}
          ${["rascunho", "arquivado"].includes(a.status) ? `<button class="btn btn-sm btn-azul" type="button" data-status="disponivel">Publicar</button>` : ""}
          ${!["arquivado", "rascunho"].includes(a.status) ? `<button class="btn btn-sm btn-ghost" type="button" data-status="arquivado">Arquivar</button>` : ""}
          ${admin ? `<button class="btn btn-sm btn-ghost" type="button" data-del aria-label="Excluir ${esc(a.name)}">${icons.trash}</button>` : ""}
        </div></div>`;
    }).join("")}</div>`
    : emptyState({ title: "Nenhum animal cadastrado pela equipe", text: "Cadastre aqui os animais de quem entrou em contato com a gente.", cta: `<button class="btn btn-laranja" type="button" data-new>Cadastrar animal</button>` })}`;

  const reload = () => teamAnimals(view, ctx, { admin });
  $$("[data-new]", view).forEach((b) => b.addEventListener("click", () => teamAnimalForm(view, ctx, null, reload)));
  $$("[data-id]", view).forEach((row) => {
    const a = data.find((x) => x.id === row.dataset.id);
    $("[data-edit]", row).addEventListener("click", () => teamAnimalForm(view, ctx, a.id, reload));
    $$("[data-status]", row).forEach((b) => b.addEventListener("click", async () => {
      const st = b.dataset.status;
      if (st === "disponivel" && !(a.animal_photos || []).length) { toast("Adicione pelo menos uma foto antes de publicar.", "bad"); teamAnimalForm(view, ctx, a.id, reload); return; }
      if (st === "adotado" && !(await confirmDialog({ title: `${a.name} foi adotado?`, message: "O anúncio sai da lista de adoção e entra para as histórias felizes.", confirmText: "Sim, foi adotado!" }))) return;
      if (st === "arquivado" && !(await confirmDialog({ title: "Arquivar anúncio?", message: "Ele deixa de aparecer no site. Dá para publicar de novo depois.", confirmText: "Arquivar" }))) return;
      try { await sb.from("animals").update({ status: st }, { returning: false }).eq("id", a.id); toast("Atualizado!", "ok"); reload(); }
      catch (er) { toast(er.message, "bad"); }
    }));
    $("[data-del]", row)?.addEventListener("click", async () => {
      if (!(await confirmDialog({ title: `Excluir ${a.name}?`, message: "O anúncio e as fotos serão apagados.", confirmText: "Excluir", danger: true }))) return;
      try {
        const paths = (a.animal_photos || []).map((p) => p.storage_path);
        if (paths.length) await sb.storage.remove("animal-photos", paths).catch(() => {});
        await sb.from("animals").delete().eq("id", a.id);
        toast("Anúncio excluído.", "ok"); reload();
      } catch (er) { toast(er.message, "bad"); }
    });
  });
}

async function teamAnimalForm(view, ctx, id, back) {
  const a = id ? (await sb.from("animals").select("*,animal_photos(id,storage_path,is_cover,position)").eq("id", id).single()).data : { contact_mode: "doador" };
  let photos = (a.animal_photos || []).sort((x, y) => (y.is_cover - x.is_cover) || (x.position - y.position));
  // As fotos ficam na pasta de quem criou o anúncio; outra pessoa da equipe edita só os textos
  const canPhoto = !id || a.owner_id === ctx.profile.id;
  const radio = (name, opts, val) => opts.map(([v, t]) => `<div class="choice"><input type="radio" name="${name}" id="t-${name}-${v}" value="${v}" ${val === v ? "checked" : ""}><label for="t-${name}-${v}">${t}</label></div>`).join("");
  const tri = (name, label, val) => `<div class="field"><span class="label">${label}</span><select class="select" name="${name}"><option value="">Não sei</option><option value="true" ${val === true ? "selected" : ""}>Sim</option><option value="false" ${val === false ? "selected" : ""}>Não</option></select></div>`;
  const live = ["disponivel", "em_processo"].includes(a.status);
  view.innerHTML = `
  <a class="link small" href="#equipe-animais" data-back>← Animais da equipe</a>
  <div class="dash-title mt-2"><h1>${id ? `Editar ${esc(a.name)}` : "Cadastrar animal para adoção"}</h1></div>
  <form class="form" novalidate data-team-animal>
    <div class="card card-pad form">
      <h2 class="h3">Contato para adoção</h2>
      <p class="small muted">Quem quiser adotar vai falar com este contato. O anúncio aparece em nome do Meu Amigo pra Vida, sem precisar de conta de ONG ou petshop.</p>
      <fieldset class="field"><legend class="label">Quem atende os interessados? <span class="req">*</span></legend>
        <div class="choice-grid">${radio("contact_mode", [["doador", "Quem está anunciando"], ["institucional", `Nosso e-mail (${esc(CONFIG.CONTACT_EMAIL)})`]], a.contact_mode)}</div></fieldset>
      <div data-donor class="form">
        <div class="form-row">
          <div class="field"><label for="t-cn">Nome de quem anuncia <span class="req">*</span></label><input class="input" id="t-cn" name="contact_name" maxlength="80" value="${esc(a.contact_name || "")}" placeholder="Como ele quer ser chamado"></div>
          <div class="field"><label for="t-cp">WhatsApp ou telefone</label><input class="input" id="t-cp" name="contact_phone" inputmode="tel" data-mask="phone" value="${esc(a.contact_phone ? masks.phone(a.contact_phone) : "")}" placeholder="(11) 99999-9999"></div>
        </div>
        <div class="field"><label for="t-ce">E-mail de quem anuncia</label><input class="input" id="t-ce" name="contact_email" type="email" maxlength="200" value="${esc(a.contact_email || "")}"><span class="hint">Informe o telefone, o e-mail ou os dois.</span></div>
        <label class="check"><input type="checkbox" name="consent" ${a.contact_consent_at ? "checked" : ""}> A pessoa autorizou mostrar esse contato publicamente no anúncio (LGPD). <span class="req">*</span></label>
      </div>
    </div>
    <div class="card card-pad form mt-3">
      <h2 class="h3">Fotos <span class="muted small">(até 8, a primeira é a capa)</span></h2>
      ${canPhoto ? `<p class="small muted">Luz natural, na altura dos olhos do animal, fundo limpo. Você ajusta o enquadramento antes de enviar.</p><div class="photo-grid" data-photos></div>`
        : `<p class="small muted">As fotos deste anúncio foram enviadas por outra pessoa da equipe e só ela pode trocá-las.</p><div class="photo-grid">${photos.map((p) => `<div class="photo-tile"><img src="${esc(photoUrl(p.storage_path))}" alt=""></div>`).join("")}</div>`}
    </div>
    <div class="card card-pad form mt-3">
      <h2 class="h3">Quem é</h2>
      <div class="form-row">
        <div class="field"><label for="t-name">Nome <span class="req">*</span></label><input class="input" id="t-name" name="name" maxlength="60" value="${esc(a.name || "")}"></div>
        <div class="field"><label for="t-breed">Raça</label><input class="input" id="t-breed" name="breed" maxlength="60" value="${esc(a.breed || "SRD (vira-lata)")}"></div>
      </div>
      <fieldset class="field"><legend class="label">Espécie <span class="req">*</span></legend><div class="choice-grid">${radio("species", [["cao", "Cão"], ["gato", "Gato"]], a.species)}</div></fieldset>
      <fieldset class="field"><legend class="label">Sexo <span class="req">*</span></legend><div class="choice-grid">${radio("sex", [["macho", "Macho"], ["femea", "Fêmea"]], a.sex)}</div></fieldset>
      <fieldset class="field"><legend class="label">Porte <span class="req">*</span></legend><div class="choice-grid">${radio("size", [["pequeno", "Pequeno"], ["medio", "Médio"], ["grande", "Grande"]], a.size)}</div></fieldset>
      <fieldset class="field"><legend class="label">Idade <span class="req">*</span></legend><div class="choice-grid">${radio("age_group", [["filhote", "Filhote"], ["adulto", "Adulto"], ["idoso", "Idoso"]], a.age_group)}</div></fieldset>
      <div class="form-row">
        <div class="field"><label for="t-color">Cor da pelagem</label><input class="input" id="t-color" name="coat_color" maxlength="60" value="${esc(a.coat_color || "")}"></div>
        <div class="field"><label for="t-weight">Peso aproximado (kg)</label><input class="input" id="t-weight" name="weight_kg" type="number" step="0.1" min="0.1" max="149" value="${esc(a.weight_kg || "")}"></div>
      </div>
      <div class="field"><label for="t-desc">Descrição <span class="req">*</span></label><textarea class="textarea" id="t-desc" name="description" minlength="30" maxlength="4000" placeholder="História, jeitinho, do que gosta e do que não gosta.">${esc(a.description || "")}</textarea><span class="hint">Mínimo de 30 caracteres.</span></div>
      <fieldset class="field"><legend class="label">Personalidade <span class="muted small">(até 5)</span></legend><div class="chips">${TRAITS.map((t) => `<label class="check" style="margin-right:10px"><input type="checkbox" name="personality" value="${t}" ${(a.personality || []).includes(t) ? "checked" : ""}> ${t}</label>`).join("")}</div></fieldset>
      <div class="form-row form-row-3">${tri("good_with_children", "Convive com crianças?", a.good_with_children)}${tri("good_with_dogs", "Convive com cães?", a.good_with_dogs)}${tri("good_with_cats", "Convive com gatos?", a.good_with_cats)}</div>
    </div>
    <div class="card card-pad form mt-3">
      <h2 class="h3">Saúde e requisitos</h2>
      <div class="chips">${[["vaccinated", "Vacinado"], ["dewormed", "Vermifugado"], ["neutered", "Castrado"], ["microchipped", "Microchipado"], ["special_needs", "Tem necessidades especiais"]].map(([n, t]) => `<label class="check" style="margin-right:14px"><input type="checkbox" name="${n}" ${a[n] ? "checked" : ""}> ${t}</label>`).join("")}</div>
      <div class="field" data-special><label for="t-sn">Quais cuidados especiais?</label><input class="input" id="t-sn" name="special_needs_notes" maxlength="1000" value="${esc(a.special_needs_notes || "")}"></div>
      <div class="field"><label for="t-health">Observações de saúde</label><input class="input" id="t-health" name="health_notes" maxlength="1000" value="${esc(a.health_notes || "")}"></div>
      <div class="field"><label for="t-req">Requisitos para adoção</label><input class="input" id="t-req" name="adoption_requirements" maxlength="1000" value="${esc(a.adoption_requirements || "")}" placeholder="Ex.: casa com telas; visita prévia; termo de adoção"></div>
      <div class="form-row" style="grid-template-columns:2fr 1fr">
        <div class="field"><label for="t-city">Cidade <span class="req">*</span></label><input class="input" id="t-city" name="city" maxlength="80" value="${esc(a.city || ctx.profile.city || "")}"></div>
        <div class="field"><label for="t-state">UF <span class="req">*</span></label><select class="select" id="t-state" name="state">${ufOptions(a.state || ctx.profile.state || "SP")}</select></div>
      </div>
      <label class="check"><input type="checkbox" name="is_urgent" ${a.is_urgent ? "checked" : ""}> Precisa de lar com urgência</label>
      <label class="check"><input type="checkbox" name="no_sale" ${id ? "checked" : ""}> Confirmo que é uma doação gratuita, sem venda, e que as informações foram conferidas com quem anuncia. <span class="req">*</span></label>
    </div>
    <div class="flex gap-1 wrap mt-3">
      <button class="btn btn-laranja" type="submit" data-mode="disponivel">${live ? "Salvar alterações" : "Salvar e publicar"}</button>
      ${!live ? `<button class="btn btn-branco" type="submit" data-mode="rascunho">Salvar rascunho</button>` : ""}
    </div>
  </form>`;
  const form = $("[data-team-animal]", view);
  bindMasks(form);
  $("[data-back]", view).addEventListener("click", (e) => { e.preventDefault(); back(); });
  const donor = $("[data-donor]", form);
  const syncMode = () => donor.classList.toggle("hidden", form.querySelector('[name="contact_mode"]:checked')?.value !== "doador");
  $$('[name="contact_mode"]', form).forEach((r) => r.addEventListener("change", syncMode)); syncMode();
  const special = $("[data-special]", form);
  special.classList.toggle("hidden", !a.special_needs);
  form.special_needs.addEventListener("change", () => special.classList.toggle("hidden", !form.special_needs.checked));
  form.addEventListener("change", (e) => {
    if (e.target.name === "personality" && $$('[name="personality"]:checked', form).length > 5) { e.target.checked = false; toast("Escolha até 5 traços.", "info"); }
  });

  let animalId = id;
  const pending = [];
  const renderPhotos = () => {
    if (!canPhoto) return;
    const tiles = photos.map((p, i) => `<div class="photo-tile"><img src="${esc(photoUrl(p.storage_path))}" alt="Foto ${i + 1}">
        ${i === 0 ? `<span class="chip chip-amarelo cover-tag">Capa</span>` : ""}
        <div class="tile-actions">${i ? `<button type="button" data-cover="${esc(p.id)}">Capa</button>` : "<span></span>"}<button type="button" data-rm="${esc(p.id)}">Remover</button></div></div>`);
    const pend = pending.map((b, i) => `<div class="photo-tile"><img src="${URL.createObjectURL(b)}" alt="Nova foto ${i + 1}"><span class="chip chip-azul cover-tag">Nova</span></div>`);
    const total = photos.length + pending.length;
    $("[data-photos]", form).innerHTML = tiles.join("") + pend.join("") + (total < 8 ? `<label class="photo-add">${icons.camera}<span>Adicionar foto</span><input type="file" accept="image/*" data-add-photo></label>` : "");
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
      if (!animalId) { pending.push(blob); renderPhotos(); return; }
      await uploadBlob(blob, photos.length === 0);
      renderPhotos(); toast("Foto adicionada!", "ok", 1800);
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
      renderPhotos(); if (!silent) toast("Capa atualizada!", "ok", 1600);
    } catch (er) { toast(er.message, "bad"); }
  }
  renderPhotos();

  let mode = "disponivel";
  $$("[data-mode]", form).forEach((b) => b.addEventListener("click", () => { mode = b.dataset.mode; }));
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearErrors(form);
    const fd = new FormData(form);
    const v = Object.fromEntries(fd.entries());
    let ok = true;
    const err = (n, m) => { ok = false; setFieldError(form.querySelector(`[name=${n}]`), m); };
    const cm = v.contact_mode;
    if (!cm) err("contact_mode", "Escolha quem atende os interessados.");
    if (cm === "doador") {
      if ((v.contact_name || "").trim().length < 2) err("contact_name", "Informe o nome de quem anuncia.");
      const hasPhone = Boolean(digits(v.contact_phone));
      const hasMail = Boolean((v.contact_email || "").trim());
      if (!hasPhone && !hasMail) err("contact_phone", "Informe telefone ou e-mail de quem anuncia.");
      if (hasPhone && !isValidPhone(v.contact_phone)) err("contact_phone", "Telefone com DDD, ex.: (11) 99999-9999.");
      if (hasMail && !isValidEmail(v.contact_email)) err("contact_email", "E-mail inválido.");
      if (!form.consent.checked) err("consent", "É preciso a autorização da pessoa para mostrar o contato.");
    }
    if (!(v.name || "").trim()) err("name", "Informe o nome.");
    for (const [n, m] of [["species", "Escolha a espécie."], ["sex", "Escolha o sexo."], ["size", "Escolha o porte."], ["age_group", "Escolha a idade."]]) if (!v[n]) err(n, m);
    if ((v.description || "").trim().length < 30) err("description", "Escreva pelo menos 30 caracteres.");
    if ((v.city || "").trim().length < 2) err("city", "Informe a cidade.");
    if (!v.state) err("state", "Selecione a UF.");
    if (!form.no_sale.checked) err("no_sale", "Confirme que é uma doação gratuita.");
    if (mode === "disponivel" && photos.length + pending.length === 0) { ok = false; toast("Adicione pelo menos uma foto para publicar.", "bad"); }
    if (!ok) { focusFirstError(form); return; }
    const tri = (n) => (v[n] === "true" ? true : v[n] === "false" ? false : null);
    const row = {
      name: v.name.trim(), breed: (v.breed || "").trim() || "SRD (vira-lata)", species: v.species, sex: v.sex, size: v.size, age_group: v.age_group,
      coat_color: v.coat_color?.trim() || null, weight_kg: v.weight_kg ? Number(v.weight_kg) : null, description: v.description.trim(),
      personality: fd.getAll("personality"), good_with_children: tri("good_with_children"), good_with_dogs: tri("good_with_dogs"), good_with_cats: tri("good_with_cats"),
      vaccinated: form.vaccinated.checked, dewormed: form.dewormed.checked, neutered: form.neutered.checked, microchipped: form.microchipped.checked,
      special_needs: form.special_needs.checked, special_needs_notes: form.special_needs.checked ? (v.special_needs_notes || "").trim() || null : null,
      health_notes: v.health_notes?.trim() || null, adoption_requirements: v.adoption_requirements?.trim() || null,
      city: v.city.trim(), state: v.state, is_urgent: form.is_urgent.checked,
      contact_mode: cm,
      contact_name: cm === "doador" ? v.contact_name.trim() : null,
      contact_phone: cm === "doador" && digits(v.contact_phone) ? digits(v.contact_phone) : null,
      contact_email: cm === "doador" && (v.contact_email || "").trim() ? v.contact_email.trim().toLowerCase() : null,
      contact_consent_at: cm === "doador" ? (a.contact_consent_at || new Date().toISOString()) : null,
    };
    const btn = e.submitter || $('button[type="submit"]', form);
    await withLoading(btn, async () => {
      try {
        if (!animalId) {
          // nasce como rascunho para receber as fotos; depois é publicado
          const { data } = await sb.from("animals").insert({ ...row, owner_id: ctx.profile.id, posted_by_team: true, status: "rascunho" }).select("id");
          animalId = data[0].id;
          for (let i = 0; i < pending.length; i++) await uploadBlob(pending[i], i === 0);
          pending.length = 0;
          if (mode === "disponivel") await sb.from("animals").update({ status: "disponivel" }, { returning: false }).eq("id", animalId);
        } else {
          await sb.from("animals").update(live ? row : { ...row, status: mode }, { returning: false }).eq("id", animalId);
        }
        toast(mode === "rascunho" ? "Rascunho salvo." : live ? "Alterações salvas!" : "Publicado! O animal já aparece na página de adoção.", "ok", 6000);
        back();
      } catch (er) { toast(er.message, "bad", 7000); }
    });
  });
}

// ---------------------------------------------------------------------------
// Eventos da equipe
// ---------------------------------------------------------------------------
export async function teamEvents(view, ctx, { admin }, filtro = "proximos") {
  const agora = new Date().toISOString();
  let q = sb.from("events").select("*,organizations(trade_name)").limit(300);
  q = filtro === "passados" ? q.lt("starts_at", agora).order("starts_at", { ascending: false }) : q.gte("starts_at", agora).order("starts_at", { ascending: true });
  const { data } = await q;
  const por = (ev) => ev.organizations?.trade_name || ev.organizer_name || "Meu Amigo pra Vida";
  view.innerHTML = `<div class="dash-title"><h1>Eventos do site</h1><button class="btn btn-laranja btn-sm" type="button" data-new>${icons.plus} Novo evento</button></div>
    <div class="notice info mb-3">${icons.info}<p>Todos os eventos da agenda, da equipe e das organizações. A equipe pode criar, editar, encerrar e excluir qualquer um. Eventos novos da equipe publicam direto na agenda.</p></div>
    <div class="flex gap-1 wrap mb-3"><button class="btn btn-sm ${filtro === "proximos" ? "btn-azul" : "btn-branco"}" type="button" data-filtro="proximos">Próximos</button><button class="btn btn-sm ${filtro === "passados" ? "btn-azul" : "btn-branco"}" type="button" data-filtro="passados">Já aconteceram</button></div>
    ${data?.length ? `<div class="list">${data.map((ev) => `<div class="list-item" data-ev="${esc(ev.id)}">
      <div class="thumb">${ev.cover_url ? `<img src="${esc(ev.cover_url)}" alt="">` : icons.calendar}</div>
      <div><h3>${esc(ev.title)}</h3><p>${statusPill(ev.status, L.contentStatus)} · ${esc(L.eventKind[ev.kind])} · ${esc(fmtDateTime(ev.starts_at))} · por ${esc(por(ev))}${ev.posted_by_team ? "" : " (organização)"}</p></div>
      <div class="actions">
        ${ev.status === "publicado" ? `<a class="btn btn-sm btn-ghost" href="/eventos/${esc(ev.slug)}" target="_blank">Ver</a>` : ""}
        <button class="btn btn-sm btn-branco" type="button" data-edit>${icons.edit} Editar</button>
        ${ev.status === "publicado" ? `<button class="btn btn-sm btn-ghost" type="button" data-st="encerrado">Encerrar</button>` : ""}
        ${["rascunho", "encerrado", "em_analise", "rejeitado"].includes(ev.status) ? `<button class="btn btn-sm btn-azul" type="button" data-st="publicado">Publicar</button>` : ""}
        <button class="btn btn-sm btn-ghost" type="button" data-del aria-label="Excluir">${icons.trash}</button>
      </div></div>`).join("")}</div>`
    : emptyState({ title: filtro === "passados" ? "Nenhum evento passado" : "Nenhum evento marcado", text: "Divulgue feiras de adoção, mutirões de castração, vacinação, arrecadações e encontros.", art: icons.megaphone, cta: `<button class="btn btn-laranja" type="button" data-new>Novo evento</button>` })}`;
  const reload = () => teamEvents(view, ctx, { admin }, filtro);
  $$("[data-filtro]", view).forEach((b) => b.addEventListener("click", () => teamEvents(view, ctx, { admin }, b.dataset.filtro)));
  $$("[data-new]", view).forEach((b) => b.addEventListener("click", () => teamEventForm(ctx, null, reload)));
  $$("[data-ev]", view).forEach((row) => {
    const ev = data.find((x) => x.id === row.dataset.ev);
    $("[data-edit]", row).addEventListener("click", () => teamEventForm(ctx, ev, reload));
    $$("[data-st]", row).forEach((b) => b.addEventListener("click", async () => {
      try { await sb.from("events").update({ status: b.dataset.st }, { returning: false }).eq("id", ev.id); toast("Atualizado!", "ok"); reload(); } catch (er) { toast(er.message, "bad"); }
    }));
    $("[data-del]", row).addEventListener("click", async () => {
      if (!(await confirmDialog({ title: "Excluir evento?", message: ev.title, confirmText: "Excluir", danger: true }))) return;
      try { await sb.from("events").delete().eq("id", ev.id); reload(); } catch (er) { toast(er.message, "bad"); }
    });
  });
}

function teamEventForm(ctx, ev, done) {
  const e0 = ev || { kind: "feira_adocao" };
  const body = document.createElement("form");
  body.className = "form";
  body.noValidate = true;
  body.innerHTML = `
    <div class="form-row"><div class="field"><label for="te-kind">Tipo</label><select class="select" id="te-kind" name="kind">${Object.entries(L.eventKind).map(([k, v]) => `<option value="${k}" ${e0.kind === k ? "selected" : ""}>${v}</option>`).join("")}</select></div>
      ${ev && !ev.posted_by_team ? `<div class="field"><span class="label">Organizado por</span><p class="mb-0"><strong>${esc(ev.organizations?.trade_name || "Organização")}</strong></p><span class="hint">Evento de organização cadastrada.</span></div>`
        : `<div class="field"><label for="te-org">Organizado por</label><input class="input" id="te-org" name="organizer_name" maxlength="120" value="${esc(e0.organizer_name || "Meu Amigo pra Vida")}"><span class="hint">Nome que aparece no evento.</span></div>`}</div>
    <div class="field"><label for="te-title">Título <span class="req">*</span></label><input class="input" id="te-title" name="title" maxlength="120" value="${esc(e0.title || "")}"></div>
    <div class="field"><label for="te-sum">Resumo <span class="req">*</span></label><input class="input" id="te-sum" name="summary" maxlength="280" value="${esc(e0.summary || "")}" placeholder="Uma frase que aparece nos cartões da agenda"></div>
    <div class="field"><label for="te-desc">Descrição</label><textarea class="textarea" id="te-desc" name="description" maxlength="6000" placeholder="Programação, o que levar, regras de adoção… Aceita **negrito**, listas com - e links.">${esc(e0.description || "")}</textarea></div>
    <div class="form-row"><div class="field"><label for="te-start">Início <span class="req">*</span></label><input class="input" id="te-start" name="starts_at" type="datetime-local" value="${local(e0.starts_at)}"></div>
      <div class="field"><label for="te-end">Término</label><input class="input" id="te-end" name="ends_at" type="datetime-local" value="${local(e0.ends_at)}"></div></div>
    <label class="check"><input type="checkbox" name="is_online" ${e0.is_online ? "checked" : ""}> Evento online</label>
    <div class="form-row"><div class="field"><label for="te-loc">Local</label><input class="input" id="te-loc" name="location_name" maxlength="120" value="${esc(e0.location_name || "")}" placeholder="Ex.: Praça da Moça"></div>
      <div class="field"><label for="te-addr">Endereço</label><input class="input" id="te-addr" name="address" maxlength="200" value="${esc(e0.address || "")}"></div></div>
    <div class="form-row" style="grid-template-columns:2fr 1fr"><div class="field"><label for="te-city">Cidade</label><input class="input" id="te-city" name="city" maxlength="80" value="${esc(e0.city || ctx.profile.city || "")}"></div>
      <div class="field"><label for="te-uf">UF</label><select class="select" id="te-uf" name="state">${ufOptions(e0.state || ctx.profile.state || "SP")}</select></div></div>
    <div class="field"><label for="te-url">Link de inscrição ou mais informações (https://)</label><input class="input" id="te-url" name="external_url" type="url" value="${esc(e0.external_url || "")}"></div>
    <div class="field"><span class="label">Imagem de capa (16:9)</span><label class="btn btn-sm btn-branco" style="justify-self:start">${icons.camera} Escolher imagem<input type="file" accept="image/*" class="sr-only" data-cover-input></label>
      <div data-cover-prev>${e0.cover_url ? `<img src="${esc(e0.cover_url)}" alt="" style="border-radius:16px;border:2px solid var(--preto);max-height:160px">` : ""}</div></div>
    <div class="flex gap-1 wrap" style="justify-content:flex-end"><button class="btn btn-ghost" type="button" data-close>Cancelar</button>
      ${ev?.status === "publicado" ? "" : `<button class="btn btn-branco" type="submit" data-mode="rascunho">Salvar rascunho</button>`}
      <button class="btn btn-laranja" type="submit" data-mode="publicado">${ev?.status === "publicado" ? "Salvar alterações" : "Publicar na agenda"}</button></div>`;
  const m = modal({ title: ev ? "Editar evento" : "Cadastrar evento", body, wide: true });
  let cover = null;
  let mode = "publicado";
  $$("[data-mode]", body).forEach((b) => b.addEventListener("click", () => { mode = b.dataset.mode; }));
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
    if ((v.summary || "").trim().length < 10) err("summary", "Resumo com pelo menos 10 caracteres.");
    if (!v.starts_at) err("starts_at", "Informe a data de início.");
    if (v.ends_at && v.starts_at && v.ends_at < v.starts_at) err("ends_at", "O término deve ser depois do início.");
    if (!body.is_online.checked && (!(v.city || "").trim() || !v.state)) err("city", "Informe cidade e UF (ou marque online).");
    if (v.external_url && !/^https:\/\//i.test(v.external_url)) err("external_url", "Use um link que comece com https://");
    if ((v.organizer_name || "").trim() && v.organizer_name.trim().length < 2) err("organizer_name", "Nome muito curto.");
    if (ev && !ev.posted_by_team) delete v.organizer_name;
    if (!ok) { focusFirstError(body); return; }
    await withLoading(e.submitter || $('button[type="submit"]', body), async () => {
      try {
        const row = {
          kind: v.kind, title: v.title.trim(), summary: v.summary.trim(), description: v.description?.trim() || null,
          starts_at: new Date(v.starts_at).toISOString(), ends_at: v.ends_at ? new Date(v.ends_at).toISOString() : null,
          is_online: body.is_online.checked, location_name: v.location_name?.trim() || null, address: v.address?.trim() || null,
          city: v.city?.trim() || null, state: v.state || null, external_url: v.external_url?.trim() || null,
          status: mode,
        };
        if (!ev || ev.posted_by_team) row.organizer_name = (v.organizer_name || "").trim() || null;
        if (cover) {
          const path = `${ctx.profile.id}/evento-${Date.now()}.webp`;
          await sb.storage.upload("event-media", path, cover, { contentType: cover.type });
          row.cover_url = sb.storage.publicUrl("event-media", path);
        }
        if (ev) await sb.from("events").update(row, { returning: false }).eq("id", ev.id);
        else await sb.from("events").insert({ ...row, posted_by_team: true }, { returning: false });
        toast(mode === "publicado" ? "Evento publicado na agenda!" : "Rascunho salvo.", "ok");
        m.close();
        done();
      } catch (er) { toast(er.message, "bad", 6000); }
    });
  });
}
