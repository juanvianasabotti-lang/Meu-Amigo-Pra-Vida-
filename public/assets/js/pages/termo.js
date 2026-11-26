// Termo de Adoção e Ciência: com ?animal=<slug>, preenche os dados do animal e de quem anuncia.
import "../app.js";
import sb from "../sb.js";
import { $, $$, esc, L, masks } from "../ui.js";
import { ANIMAL_PUBLIC_COLS } from "../components.js";
import { CONFIG } from "../config.js";

const sim = (v) => (v === true ? "(X)" : "( )");

$("[data-termo-imprimir]")?.addEventListener("click", () => window.print());

async function preencher(slug) {
  const { data } = await sb.from("animals").select(`${ANIMAL_PUBLIC_COLS},organizations(trade_name)`).eq("slug", slug).limit(1);
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

  // Responsável: organização, contato informado no anúncio da equipe ou pessoa que anunciou
  const resp = a.organizations?.trade_name
    || (a.posted_by_team ? (a.contact_mode === "doador" && a.contact_name ? a.contact_name : "Meu Amigo pra Vida") : (a.publisher_name || "").replace(/\s*\(pessoa física\)$/, ""));
  set("responsavel", resp);
  if (a.posted_by_team) {
    set("responsavel_tel", a.contact_phone ? masks.phone(a.contact_phone) : "");
    set("responsavel_email", a.contact_email || (a.contact_mode === "institucional" ? CONFIG.CONTACT_EMAIL : ""));
  }

  document.title = `Termo de adoção de ${a.name} | Meu Amigo pra Vida`;
  $("h1").textContent = `Termo de adoção de ${a.name}`;
  $("[data-termo-lead]").innerHTML = `Os dados de <strong>${esc(a.name)}</strong> já estão preenchidos. Baixe ou imprima, complete os dados de quem adota e assinem na entrega do animal. Leia com calma: o termo explica tudo o que você assume ao adotar.`;
  const voltar = $("[data-termo-voltar]");
  if (voltar) { voltar.href = `/adote/${encodeURIComponent(a.slug)}`; voltar.textContent = `← Voltar para ${a.name}`; }
  const ref = $("[data-termo-ref]");
  if (ref) ref.textContent = `Termo de adoção de ${a.name} · meuamigopravida.com.br/adote/${a.slug}`;
}

const slug = new URLSearchParams(location.search).get("animal");
if (slug && /^[a-z0-9-]{1,120}$/.test(slug)) preencher(slug).catch(() => {});
$$(".termo-doc dd:empty").forEach((dd) => dd.setAttribute("aria-label", "Campo para preencher"));
