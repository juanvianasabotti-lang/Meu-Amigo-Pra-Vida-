import { requireAuth, observeReveal, pawBurst } from "../app.js";
import sb from "../sb.js";
import { $, $$, esc, icons, L, slugFromPath, bindMasks, isValidCPF, digits, setFieldError, clearErrors, focusFirstError, withLoading, toast, ageFrom } from "../ui.js";
import { photoUrl, coverPath, emptyState, errorState } from "../components.js";

const root = $("[data-adopt]");
const slug = slugFromPath("adotar");

const yn = (name, label, { required = true, hint = "" } = {}) => `
  <fieldset class="field" data-yn="${name}"><legend class="label">${label}${required ? ' <span class="req">*</span>' : ""}</legend>
    ${hint ? `<span class="hint">${hint}</span>` : ""}
    <div class="flex gap-2 wrap">
      <label class="check"><input type="radio" name="${name}" value="true" ${required ? "required" : ""}> Sim</label>
      <label class="check"><input type="radio" name="${name}" value="false"> Não</label>
    </div></fieldset>`;

async function main() {
  const ctx = await requireAuth();
  if (!ctx) { root.innerHTML = errorState({ code: "not_configured" }); return; }
  let animal;
  try {
    animal = (await sb.from("animals").select("id,slug,name,species,status,city,state,owner_id,adoption_requirements,animal_photos(storage_path,is_cover,position)").eq("slug", slug).maybeSingle()).data;
  } catch (e) { root.innerHTML = errorState(e); return; }
  if (!animal || !["disponivel", "em_processo"].includes(animal.status)) {
    root.innerHTML = emptyState({ title: "Este animal não está disponível", text: "Ele pode já ter sido adotado. Conheça outros amigos!", cta: `<a class="btn btn-laranja" href="/adote">Ver animais</a>` });
    return;
  }
  const p = ctx.profile;
  if (p.account_type !== "pessoa") {
    root.innerHTML = emptyState({ title: "A adoção é feita por pessoa física", text: "Contas de ONG e de empresa não enviam pedidos de adoção. Use uma conta pessoal para adotar.", art: icons.user });
    return;
  }
  if (animal.owner_id === p.id) {
    root.innerHTML = emptyState({ title: "Este anúncio é seu", text: "Você não pode se candidatar ao próprio anúncio.", cta: `<a class="btn" href="/painel#animais">Ir ao painel</a>` });
    return;
  }
  if (!p.birth_date || ageFrom(p.birth_date) < 18 || !p.phone || !p.city || !p.state) {
    root.innerHTML = emptyState({ title: "Complete seu perfil primeiro", text: "Para adotar, precisamos do seu celular, data de nascimento (18+), cidade e UF.", cta: `<a class="btn btn-laranja" href="/minha-conta?voltar=${encodeURIComponent(location.pathname)}#perfil">Completar perfil</a>`, art: icons.user });
    return;
  }
  // pedido já existente?
  const { data: existing } = await sb.from("adoption_applications").select("id,status").eq("animal_id", animal.id).eq("applicant_id", p.id)
    .not("status", "in", "(recusado,cancelado,concluido)").limit(1);
  if (existing?.length) {
    root.innerHTML = emptyState({ title: `Você já tem um pedido para ${animal.name}`, text: `Status atual: ${L.adoption[existing[0].status]}. Acompanhe e converse com o responsável pela sua conta.`, cta: `<a class="btn btn-azul" href="/minha-conta/pedidos/${esc(existing[0].id)}">Ver meu pedido</a>`, art: icons.heart });
    return;
  }
  const { data: priv } = await sb.from("profile_private").select("cpf").eq("user_id", p.id).maybeSingle();
  const cover = coverPath(animal);

  root.innerHTML = `
  <a class="link small" href="/adote/${esc(animal.slug)}">← Voltar para ${esc(animal.name)}</a>
  <div class="flex gap-2 items-center mt-3 mb-3" data-reveal="up">
    <div class="org-logo" style="width:84px;height:84px;border-radius:24px;background:var(--amarelo)">${cover ? `<img src="${esc(photoUrl(cover))}" alt="">` : esc(animal.name[0])}</div>
    <div><span class="eyebrow" style="margin-bottom:.4rem">Pedido de adoção</span><h1 class="h1 mb-0" style="font-size:clamp(1.8rem,4vw,2.8rem)">Um lar para ${esc(animal.name)}</h1></div>
  </div>
  <p class="lead">Leva uns 5 minutos. Responda com sinceridade: não existe resposta "certa", existe o lar certo para cada amigo.</p>
  ${animal.adoption_requirements ? `<div class="notice mb-3">${icons.info}<p><strong>Requisitos do responsável:</strong> ${esc(animal.adoption_requirements)}</p></div>` : ""}
  <div class="steps-bar" aria-hidden="true"><span style="width:25%"></span></div>
  <form class="form card card-pad mt-2" novalidate data-form>
    <section data-step="1" class="form">
      <h2 class="h3">1. Sua casa</h2>
      <fieldset class="field"><legend class="label">Tipo de moradia <span class="req">*</span></legend>
        <div class="choice-grid">
          ${[["casa", "🏠", "Casa"], ["apartamento", "🏢", "Apartamento"], ["chacara_sitio", "🌳", "Chácara / sítio"], ["outro", "🏡", "Outro"]].map(([v, e, t]) =>
            `<div class="choice"><input type="radio" name="housing_type" id="ht-${v}" value="${v}" required><label for="ht-${v}"><span class="emoji">${e}</span>${t}</label></div>`).join("")}
        </div></fieldset>
      <fieldset class="field"><legend class="label">A moradia é <span class="req">*</span></legend>
        <div class="flex gap-2 wrap">${Object.entries(L.housingOwner).map(([v, t]) => `<label class="check"><input type="radio" name="housing_owner" value="${v}" required> ${t}</label>`).join("")}</div></fieldset>
      <div class="hidden" data-if="alugada">${yn("landlord_allows_pets", "O contrato/condomínio permite animais?", { required: false })}</div>
      ${yn("has_yard", "Tem quintal ou área externa?")}
      <div class="hidden" data-if="yard">${yn("yard_fenced", "O quintal é cercado/murado com segurança?", { required: false })}</div>
      ${yn("window_screens", "Janelas e sacadas têm telas de proteção?", { required: animal.species === "gato", hint: animal.species === "gato" ? "Para gatos, as telas são essenciais para a segurança." : "" })}
    </section>

    <section data-step="2" class="form hidden">
      <h2 class="h3">2. Sua família e rotina</h2>
      <div class="form-row">
        <div class="field"><label for="adults">Adultos na casa (incluindo você) <span class="req">*</span></label><input class="input" id="adults" name="adults_in_home" type="number" min="1" max="20" value="1" required></div>
        <div class="field"><label for="children">Crianças na casa</label><input class="input" id="children" name="children_in_home" type="number" min="0" max="20" value="0"></div>
      </div>
      <div class="field hidden" data-if="kids"><label for="kids-ages">Idade das crianças</label><input class="input" id="kids-ages" name="children_ages" maxlength="100" placeholder="Ex.: 4 e 9 anos"></div>
      ${yn("household_agrees", "Todos da casa concordam com a adoção?")}
      <div class="field"><label for="other-pets">Tem outros animais? Quais?</label><input class="input" id="other-pets" name="other_pets" maxlength="500" placeholder="Ex.: 1 gata castrada de 5 anos"></div>
      <div class="field"><label for="prev-pets">Já teve animais antes? O que aconteceu com eles?</label><textarea class="textarea" id="prev-pets" name="previous_pets" maxlength="500" style="min-height:90px"></textarea></div>
      <div class="form-row">
        <div class="field"><label for="hours">Horas por dia que ele ficaria sozinho <span class="req">*</span></label><input class="input" id="hours" name="hours_alone" type="number" min="0" max="24" required></div>
        <div class="field"><label for="caretaker">Quem cuida quando você viaja? <span class="req">*</span></label><input class="input" id="caretaker" name="caretaker_when_away" maxlength="300" required placeholder="Ex.: minha mãe, que mora perto"></div>
      </div>
    </section>

    <section data-step="3" class="form hidden">
      <h2 class="h3">3. Seu compromisso</h2>
      <div class="field"><label for="motivation">Por que você quer adotar ${esc(animal.name)}? <span class="req">*</span></label>
        <textarea class="textarea" id="motivation" name="motivation" minlength="30" maxlength="2000" required placeholder="Conte um pouco sobre você e por que acha que vocês combinam."></textarea>
        <span class="hint"><span data-motivation-count>0</span>/2000 · mínimo de 30 caracteres</span></div>
      <label class="check"><input type="checkbox" name="aware_of_costs" required> Entendo os custos com alimentação, vacinas, veterinário e cuidados ao longo da vida dele. <span class="req">*</span></label>
      <label class="check"><input type="checkbox" name="agrees_to_follow_up" required> Aceito que o responsável acompanhe a adaptação nas primeiras semanas. <span class="req">*</span></label>
      <label class="check"><input type="checkbox" name="agrees_to_neuter" checked> Me comprometo a castrar o animal, se ainda não for castrado.</label>
    </section>

    <section data-step="4" class="form hidden">
      <h2 class="h3">4. Identificação e privacidade</h2>
      ${priv?.cpf ? `<div class="notice ok">${icons.shield}<p>Seu CPF já está cadastrado com segurança.</p></div>`
        : `<div class="field"><label for="cpf">Seu CPF <span class="req">*</span></label><input class="input" id="cpf" name="cpf" inputmode="numeric" autocomplete="off" data-mask="cpf" placeholder="000.000.000-00" required>
           <span class="hint">Guardado de forma protegida. O responsável só vê o seu CPF a partir da etapa de entrevista, e cada acesso fica registrado.</span></div>`}
      <div class="notice info">${icons.info}<p>Vamos compartilhar com o responsável por ${esc(animal.name)}: seu nome, celular, e-mail, cidade e as respostas deste questionário.</p></div>
      <label class="check"><input type="checkbox" name="share_data_consent" required> Autorizo o compartilhamento dos meus dados com o responsável pelo anúncio, exclusivamente para avaliar esta adoção, conforme a <a class="link" href="/privacidade" target="_blank">Política de Privacidade</a>. <span class="req">*</span></label>
    </section>

    <div class="flex justify-between gap-1 wrap mt-2">
      <button class="btn btn-ghost" type="button" data-prev disabled>← Voltar</button>
      <button class="btn btn-azul" type="button" data-next>Continuar <span class="arrow">→</span></button>
      <button class="btn btn-laranja hidden" type="submit" data-submit>Enviar pedido de adoção 🐾</button>
    </div>
  </form>`;
  observeReveal(root);
  bindMasks(root);
  setupForm(animal, !priv?.cpf, p);
}

function setupForm(animal, needsCpf, profile) {
  const form = $("[data-form]", root);
  const steps = $$("[data-step]", form);
  const bar = $(".steps-bar span", root);
  let step = 0;
  const show = (n) => {
    step = n;
    steps.forEach((s, i) => s.classList.toggle("hidden", i !== n));
    $("[data-prev]", form).disabled = n === 0;
    $("[data-next]", form).classList.toggle("hidden", n === steps.length - 1);
    $("[data-submit]", form).classList.toggle("hidden", n !== steps.length - 1);
    bar.style.width = `${((n + 1) / steps.length) * 100}%`;
    steps[n].querySelector("input, textarea")?.focus({ preventScroll: true });
    root.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const val = (name) => form.querySelector(`[name="${name}"]:checked`)?.value ?? form.querySelector(`[name="${name}"]`)?.value;

  // campos condicionais
  form.addEventListener("change", () => {
    $("[data-if=alugada]", form).classList.toggle("hidden", val("housing_owner") !== "alugada");
    $("[data-if=yard]", form).classList.toggle("hidden", val("has_yard") !== "true");
    $("[data-if=kids]", form).classList.toggle("hidden", !(Number(val("children_in_home")) > 0));
  });
  $("#children", form).addEventListener("input", () => form.dispatchEvent(new Event("change")));
  const mot = $("#motivation", form);
  mot.addEventListener("input", () => { $("[data-motivation-count]", form).textContent = mot.value.length; });

  const validateStep = (n) => {
    clearErrors(steps[n]);
    let ok = true;
    const req = (sel, msg) => {
      const els = $$(sel, steps[n]);
      if (!els.length) return;
      const el = els[0];
      const filled = el.type === "radio" ? els.some((e) => e.checked) : el.type === "checkbox" ? el.checked : el.value.trim() !== "";
      if (!filled) { ok = false; setFieldError(el.closest("fieldset")?.querySelector("input") || el, msg); }
    };
    if (n === 0) {
      req('[name="housing_type"]', "Escolha o tipo de moradia.");
      req('[name="housing_owner"]', "Informe se a moradia é própria, alugada ou cedida.");
      if (val("housing_owner") === "alugada") req('[name="landlord_allows_pets"]', "Responda se o contrato permite animais.");
      req('[name="has_yard"]', "Responda sobre o quintal.");
      if (animal.species === "gato") req('[name="window_screens"]', "Responda sobre as telas de proteção.");
    }
    if (n === 1) {
      const ad = Number(val("adults_in_home"));
      if (!(ad >= 1 && ad <= 20)) { ok = false; setFieldError($("#adults", form), "Informe entre 1 e 20."); }
      req('[name="household_agrees"]', "Responda se todos concordam.");
      const h = val("hours_alone");
      if (h === "" || !(Number(h) >= 0 && Number(h) <= 24)) { ok = false; setFieldError($("#hours", form), "Informe de 0 a 24 horas."); }
      if ((val("caretaker_when_away") || "").trim().length < 3) { ok = false; setFieldError($("#caretaker", form), "Conte quem cuidaria dele."); }
    }
    if (n === 2) {
      if (mot.value.trim().length < 30) { ok = false; setFieldError(mot, "Escreva pelo menos 30 caracteres."); }
      req('[name="aware_of_costs"]', "Confirme que está ciente dos custos.");
      req('[name="agrees_to_follow_up"]', "Confirme o acompanhamento.");
    }
    if (n === 3) {
      if (needsCpf && !isValidCPF(val("cpf"))) { ok = false; setFieldError($("#cpf", form), "CPF inválido. Confira os números."); }
      req('[name="share_data_consent"]', "É preciso autorizar o compartilhamento para enviar o pedido.");
    }
    if (!ok) focusFirstError(steps[n]);
    return ok;
  };

  $("[data-next]", form).addEventListener("click", () => { if (validateStep(step)) show(step + 1); });
  $("[data-prev]", form).addEventListener("click", () => show(Math.max(0, step - 1)));

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    for (let i = 0; i < steps.length; i++) { if (!validateStep(i)) { show(i); return; } }
    const bool = (n) => (val(n) === "true" ? true : val(n) === "false" ? false : null);
    const row = {
      animal_id: animal.id,
      applicant_id: profile.id,
      housing_type: val("housing_type"),
      housing_owner: val("housing_owner"),
      landlord_allows_pets: val("housing_owner") === "alugada" ? bool("landlord_allows_pets") : null,
      has_yard: bool("has_yard"),
      yard_fenced: bool("has_yard") ? bool("yard_fenced") : null,
      window_screens: bool("window_screens"),
      adults_in_home: Number(val("adults_in_home")),
      children_in_home: Number(val("children_in_home") || 0),
      children_ages: Number(val("children_in_home")) > 0 ? (val("children_ages") || null) : null,
      household_agrees: bool("household_agrees"),
      other_pets: val("other_pets") || null,
      previous_pets: val("previous_pets") || null,
      hours_alone: Number(val("hours_alone")),
      caretaker_when_away: val("caretaker_when_away").trim(),
      motivation: mot.value.trim(),
      aware_of_costs: form.aware_of_costs.checked,
      agrees_to_follow_up: form.agrees_to_follow_up.checked,
      agrees_to_neuter: form.agrees_to_neuter.checked,
      share_data_consent: form.share_data_consent.checked,
    };
    await withLoading($("[data-submit]", form), async () => {
      try {
        if (needsCpf) {
          await sb.from("profile_private").upsert({ user_id: profile.id, cpf: digits(val("cpf")) }, { onConflict: "user_id", returning: false });
          needsCpf = false;
        }
        const { data } = await sb.from("adoption_applications").insert(row).select("id");
        const id = Array.isArray(data) ? data[0]?.id : data?.id;
        celebrate(animal, id);
      } catch (err) {
        toast(err.message, "bad", 6000);
      }
    });
  });
  show(0);
}

function celebrate(animal, id) {
  root.innerHTML = `<div class="empty" style="border-style:solid;box-shadow:var(--shadow-pop)">
    <div class="empty-art" style="background:var(--rosa)">${icons.heart}</div>
    <h1 class="h2">Pedido enviado! 🎉</h1>
    <p>O responsável por <strong>${esc(animal.name)}</strong> recebeu suas respostas e vai entrar em contato pela plataforma. Você será avisado a cada etapa.</p>
    <div class="flex gap-1 wrap justify-center mt-2">
      ${id ? `<a class="btn btn-azul" href="/minha-conta/pedidos/${esc(id)}">Acompanhar pedido</a>` : ""}
      <a class="btn btn-branco" href="/blog/primeiros-30-dias-em-casa">Como preparar a casa</a>
    </div></div>`;
  const r = root.getBoundingClientRect();
  for (let k = 0; k < 5; k++) setTimeout(() => pawBurst(r.left + r.width * (0.15 + k * 0.175), r.top + 110), k * 160);
}

main();
