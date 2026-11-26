// Termo de Adoção e Ciência.
// Sem parâmetro: modelo em branco, público.
// Com ?animal=<slug>: só para quem teve o pedido aprovado para aquele animal, para o responsável
// pelo anúncio e para a equipe. Preenche apenas os dados do animal; responsável e adotante
// ficam em branco para preencher à mão na entrega.
import { getContext, isStaff } from "../app.js";
import sb from "../sb.js";
import { $, $$, esc, L } from "../ui.js";

const sim = (v) => (v === true ? "(X)" : "( )");
$("[data-termo-imprimir]")?.addEventListener("click", () => window.print());
$$(".termo-doc dd:empty").forEach((dd) => dd.setAttribute("aria-label", "Campo para preencher"));

function aviso(html) {
  const lead = $("[data-termo-lead]");
  if (lead) lead.insertAdjacentHTML("afterend", `<div class="notice info mt-3 termo-acoes">${html}</div>`);
}

async function podeVer(slug) {
  if (!sb.auth.session) return { ok: false, motivo: "login" };
  const ctx = await getContext();
  const { data } = await sb.from("animals").select("id,slug,owner_id").eq("slug", slug).limit(1);
  const animal = data?.[0];
  if (!animal) return { ok: false, motivo: "nao_encontrado" };
  if (isStaff(ctx) || animal.owner_id === ctx.profile?.id) return { ok: true, id: animal.id };
  const { data: ped } = await sb.from("adoption_applications").select("id")
    .eq("animal_id", animal.id).eq("applicant_id", ctx.profile?.id).in("status", ["aprovado", "concluido"]).limit(1);
  return ped?.length ? { ok: true, id: animal.id } : { ok: false, motivo: "sem_aprovacao" };
}

async function preencher(slug) {
  const acesso = await podeVer(slug);
  if (!acesso.ok) {
    const volta = encodeURIComponent(location.pathname + location.search);
    aviso(acesso.motivo === "login"
      ? `<p>O termo de cada animal fica disponível só para quem teve o pedido de adoção aprovado. <a class="link" href="/entrar?voltar=${volta}">Entre na sua conta</a> para baixá-lo. Abaixo está o modelo geral, sem dados.</p>`
      : `<p>O termo deste animal fica disponível só para quem teve o pedido de adoção aprovado. Abaixo está o modelo geral, sem dados.</p>`);
    return;
  }
  const { data } = await sb.from("animals")
    .select("name,slug,species,sex,size,weight_kg,age_group,breed,coat_color,neutered,vaccinated,dewormed,microchipped,health_notes,special_needs,special_needs_notes")
    .eq("id", acesso.id).limit(1);
  const a = data?.[0];
  if (!a) return;
  const set = (k, v) => { const el = $(`[data-campo="${k}"]`); if (el && v) el.textContent = v; };
  set("nome", a.name);
  set("especie", L.species[a.species]);
  set("sexo", L.sex[a.sex]);
  set("porte", `${L.size[a.size] || ""}${a.weight_kg ? ` · ${String(a.weight_kg).replace(".", ",")} kg` : ""}`);
  set("idade", L.age[a.age_group]);
  set("raca", a.breed);
  set("cor", a.coat_color);
  set("obs", [a.health_notes, a.special_needs ? a.special_needs_notes || "Tem necessidades especiais." : ""].filter(Boolean).join(" · "));
  const saude = $('[data-campo="saude"]');
  if (saude) saude.innerHTML = `${sim(a.neutered)} castrado &nbsp; ${sim(a.vaccinated)} vacinado &nbsp; ${sim(a.dewormed)} vermifugado &nbsp; ${sim(a.microchipped)} microchipado`;

  document.title = `Termo de adoção de ${a.name} | Meu Amigo pra Vida`;
  $("h1").textContent = `Termo de adoção de ${a.name}`;
  $("[data-termo-lead]").innerHTML = `Os dados de <strong>${esc(a.name)}</strong> já estão no termo. Baixe em PDF ou imprima, leia com calma e preencha à mão os dados do adotante e do responsável. O termo é assinado na entrega do animal.`;
  const voltar = $("[data-termo-voltar]");
  if (voltar) { voltar.href = "/minha-conta#pedidos"; voltar.textContent = "← Meus pedidos"; }
  const ref = $("[data-termo-ref]");
  if (ref) ref.textContent = `Termo de adoção de ${a.name} · Meu Amigo pra Vida · meuamigopravida.com.br`;
}

const slug = new URLSearchParams(location.search).get("animal");
if (slug && /^[a-z0-9-]{1,120}$/.test(slug)) preencher(slug).catch(() => {});
