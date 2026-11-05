// Página de links: abertura animada do logo, mostrada uma vez por sessão e que pode ser pulada.
import "../app.js";

const KEY = "mapv.links-intro";
const body = document.body;
const intro = document.querySelector(".lt-intro");

function skip() {
  body.style.setProperty("--lt-d", "0s");
  body.classList.add("lt-skip");
}

let seen = false;
try { seen = !!sessionStorage.getItem(KEY); sessionStorage.setItem(KEY, "1"); } catch { /* sem armazenamento: mostra a abertura */ }
if (seen) skip();
intro?.addEventListener("click", skip);
document.addEventListener("keydown", (e) => { if (e.key === "Escape" || e.key === "Enter" || e.key === " ") skip(); }, { once: true });
