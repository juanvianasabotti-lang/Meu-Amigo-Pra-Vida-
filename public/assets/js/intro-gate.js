// Portão da abertura animada do logo. Roda no <head>, antes da página aparecer, para a
// abertura nunca piscar: ela toca uma vez por sessão, só na primeira página de entrada
// (as que trazem data-intro), e nunca para quem chega de um buscador ou pede menos movimento.
(function () {
  try {
    var KEY = "mapv.intro";
    var me = document.currentScript;
    if (sessionStorage.getItem(KEY)) return;          // a sessão já começou: nada de abertura
    sessionStorage.setItem(KEY, "1");                 // a primeira página da sessão marca a visita
    if (!me || !me.hasAttribute("data-intro")) return;
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (/^https?:\/\/([^/]+\.)?(google|bing|duckduckgo|yahoo|ecosia|brave|yandex|baidu)\./i.test(document.referrer || "")) return;
    document.documentElement.classList.add("intro-play");
  } catch (e) { /* sem armazenamento da sessão: segue sem abertura */ }
})();
