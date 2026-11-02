import { observeReveal } from "../app.js";
import sb from "../sb.js";
import { $, ufOptions, fmtNum } from "../ui.js";
import { ANIMAL_CARD_COLS, petCard, bindFavorites, emptyState, skeletons, errorState } from "../components.js";

const PAGE = 12;
const form = $("[data-filters]");
const grid = $("[data-results]");
const more = $("[data-more]");
const countEl = $("[data-count]");
let page = 0;

// Filtros vindos da URL (permite compartilhar a busca)
const params = new URLSearchParams(location.search);
$("[data-uf]").innerHTML = ufOptions(params.get("uf") || "").replace('<option value="">UF</option>', '<option value="">Todo o Brasil</option>');
const especie = params.get("especie") || "";
const radio = form.querySelector(`input[name="especie"][value="${especie}"]`);
if (radio) radio.checked = true;
for (const [k, sel] of [["porte", "#f-porte"], ["idade", "#f-idade"], ["sexo", "#f-sexo"], ["q", "#f-busca"]]) {
  if (params.get(k)) $(sel).value = params.get(k);
}

function currentFilters() {
  const fd = new FormData(form);
  return Object.fromEntries([...fd.entries()].map(([k, v]) => [k, String(v).trim()]).filter(([, v]) => v));
}

async function load(reset = true) {
  if (reset) { page = 0; grid.style.display = ""; grid.innerHTML = skeletons(6); }
  const f = currentFilters();
  const url = new URLSearchParams(f);
  history.replaceState(null, "", `${location.pathname}${url.toString() ? `?${url}` : ""}`);

  let q = sb.from("animals").select(ANIMAL_CARD_COLS, { count: true }).in("status", ["disponivel", "em_processo"]);
  if (f.especie) q = q.eq("species", f.especie);
  if (f.porte) q = q.eq("size", f.porte);
  if (f.idade) q = q.eq("age_group", f.idade);
  if (f.sexo) q = q.eq("sex", f.sexo);
  if (f.uf) q = q.eq("state", f.uf);
  if (f.q) q = q.textSearch("search", f.q);
  q = q.order("is_urgent", { ascending: false }).order("approved_at", { ascending: false }).range(page * PAGE, page * PAGE + PAGE - 1);

  try {
    const { data, count } = await q;
    if (reset) grid.innerHTML = "";
    if (!data?.length && page === 0) {
      grid.style.display = "block";
      grid.innerHTML = emptyState({
        title: Object.keys(f).length ? "Nenhum amigo com esses filtros" : "Os primeiros amigos estão chegando!",
        text: Object.keys(f).length ? "Tente ampliar a busca: outro estado, porte ou idade. Seu amigo pode estar logo ali!" : "Estamos verificando ONGs e protetores. Volte em breve!",
        cta: Object.keys(f).length ? `<a class="btn btn-branco" href="/adote">Limpar filtros</a>` : "",
      });
      countEl.textContent = "";
      more.classList.add("hidden");
    } else {
      grid.insertAdjacentHTML("beforeend", data.map((a) => petCard(a)).join(""));
      bindFavorites(grid, data.map((a) => a.id));
      const shown = page * PAGE + data.length;
      countEl.textContent = `${fmtNum(count ?? shown)} ${count === 1 ? "amigo encontrado" : "amigos encontrados"}`;
      more.classList.toggle("hidden", shown >= (count ?? 0));
    }
  } catch (e) {
    grid.style.display = "block";
    grid.innerHTML = errorState(e);
    more.classList.add("hidden");
  }
  observeReveal(grid);
}

form.addEventListener("submit", (e) => { e.preventDefault(); load(true); });
form.addEventListener("change", (e) => { if (e.target.name !== "q") load(true); });
more.addEventListener("click", () => { page++; load(false); });
load(true);
