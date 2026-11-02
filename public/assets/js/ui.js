// =============================================================================
// Utilitários de interface: ícones, escape, toasts, modais, máscaras, validação,
// markdown seguro, rótulos e formatação.
// =============================================================================

// ---------- Ícones (SVG inline, traço arredondado) ----------
const P = (d, extra = "") => `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${d}</svg>`;
export const icons = {
  paw: `<svg class="icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><ellipse cx="6" cy="9.5" rx="2.2" ry="2.8"/><ellipse cx="10" cy="5.5" rx="2.2" ry="2.8"/><ellipse cx="14.5" cy="5.5" rx="2.2" ry="2.8"/><ellipse cx="18.5" cy="9.5" rx="2.2" ry="2.8"/><path d="M12.2 11.5c-3 0-6.2 3.7-6.2 6.4 0 1.7 1.3 2.6 2.9 2.6 1.4 0 2.2-.8 3.3-.8s1.9.8 3.3.8c1.6 0 2.9-.9 2.9-2.6 0-2.7-3.2-6.4-6.2-6.4z"/></svg>`,
  heart: P(`<path d="M12 20.5s-8-4.7-8-10.6A4.4 4.4 0 0 1 12 7a4.4 4.4 0 0 1 8 2.9c0 5.9-8 10.6-8 10.6z"/>`),
  heartFill: `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5s-8-4.7-8-10.6A4.4 4.4 0 0 1 12 7a4.4 4.4 0 0 1 8 2.9c0 5.9-8 10.6-8 10.6z" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/></svg>`,
  arrow: P(`<path d="M5 12h14M13 6l6 6-6 6"/>`),
  arrowLeft: P(`<path d="M19 12H5M11 6l-6 6 6 6"/>`),
  pin: P(`<path d="M12 21s-7-6.1-7-11.5A7 7 0 0 1 19 9.5C19 14.9 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>`),
  close: P(`<path d="M6 6l12 12M18 6L6 18"/>`),
  check: P(`<path d="M5 12.5l4.5 4.5L19 7.5"/>`),
  x: P(`<path d="M7 7l10 10M17 7L7 17"/>`),
  info: P(`<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.5v.5"/>`),
  alert: P(`<path d="M12 3l9.5 17h-19z"/><path d="M12 10v4M12 17v.5"/>`),
  user: P(`<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>`),
  logout: P(`<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H3"/>`),
  bell: P(`<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 21h4"/>`),
  home: P(`<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>`),
  calendar: P(`<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>`),
  clock: P(`<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>`),
  search: P(`<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>`),
  eye: P(`<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>`),
  eyeOff: P(`<path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4M6.6 6.6C3.7 8.5 2 12 2 12s3.6 7 10 7c1.7 0 3.2-.5 4.5-1.2"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>`),
  google: `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.3-1.6 3.9-5.5 3.9-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.2.8 3.9 1.5l2.7-2.6C16.9 3.1 14.7 2 12 2 6.5 2 2 6.5 2 12s4.5 10 10 10c5.8 0 9.6-4.1 9.6-9.8 0-.7-.1-1.2-.2-1.7H12z"/><path fill="#34A853" d="M3.2 7.3l3.2 2.4C7.2 7.6 9.4 6 12 6c1.9 0 3.2.8 3.9 1.5l2.7-2.6C16.9 3.1 14.7 2 12 2 8.1 2 4.8 4.2 3.2 7.3z" opacity=".0"/><path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.2-.2-1.7H12v3.9h5.5c-.3 1.4-1.1 2.5-2.3 3.3l3.4 2.6c2-1.8 3-4.6 3-8.1z"/><path fill="#FBBC05" d="M6.4 14.3A6 6 0 0 1 6 12c0-.8.1-1.6.4-2.3L3.2 7.3A10 10 0 0 0 2 12c0 1.6.4 3.1 1.1 4.5z"/><path fill="#34A853" d="M12 22c2.7 0 5-.9 6.6-2.4l-3.4-2.6c-.9.6-2 1-3.2 1-2.5 0-4.7-1.7-5.5-4l-3.3 2.5C4.8 19.8 8.1 22 12 22z"/></svg>`,
  plus: P(`<path d="M12 5v14M5 12h14"/>`),
  edit: P(`<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>`),
  trash: P(`<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>`),
  camera: P(`<path d="M4 8h3l2-3h6l2 3h3v12H4z"/><circle cx="12" cy="13.5" r="3.5"/>`),
  shield: P(`<path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>`),
  download: P(`<path d="M12 4v12M6 11l6 6 6-6M4 20h16"/>`),
  copy: P(`<rect x="8" y="8" width="12" height="12" rx="3"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>`),
  chat: P(`<path d="M4 5h16v11H9l-5 4z"/>`),
  instagram: P(`<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><path d="M17.5 6.5v.5"/>`),
  whatsapp: `<svg class="icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm5.8 14.1c-.2.7-1.4 1.3-2 1.4-.5.1-1.2.1-1.9-.1-.4-.1-1-.3-1.7-.7-3-1.3-5-4.4-5.1-4.6-.2-.2-1.2-1.6-1.2-3.1s.8-2.2 1-2.5c.3-.3.6-.4.8-.4h.6c.2 0 .4 0 .6.5l.9 2.1c.1.2.1.4 0 .6l-.3.5-.4.5c-.1.1-.3.3-.1.6.2.3.8 1.3 1.7 2.1 1.2 1 2.1 1.4 2.4 1.5.3.2.5.1.6 0l.9-1c.2-.3.4-.2.7-.1l2 1c.3.1.5.2.5.3.1.2.1.7-.1 1.4z"/></svg>`,
  globe: P(`<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>`),
  phone: P(`<path d="M5 3h4l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 5a2 2 0 0 1 2-2z"/>`),
  syringe: P(`<path d="M18 2l4 4M20 4l-9.5 9.5M14 4l6 6M15.5 8.5L8 16l-3 1 1-3 7.5-7.5M5 19l-3 3"/>`),
  scissors: P(`<circle cx="6" cy="7" r="3"/><circle cx="6" cy="17" r="3"/><path d="M8.6 8.6L20 18M8.6 15.4L20 6"/>`),
  pill: P(`<rect x="2.5" y="8.5" width="19" height="7" rx="3.5" transform="rotate(-45 12 12)"/><path d="M8.5 8.5l7 7"/>`),
  chip: P(`<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/>`),
  dog: P(`<path d="M10 5L6 3 3 8l3 2M14 5l4-2 3 5-3 2"/><path d="M6 10c0 6 2.5 10 6 10s6-4 6-10c0-3-2.5-5-6-5s-6 2-6 5z"/><path d="M10 12v.5M14 12v.5M11 16h2"/>`),
  cat: P(`<path d="M5 3l3 5h8l3-5v9c0 5-3 8-7 8s-7-3-7-8z"/><path d="M9.5 12v.5M14.5 12v.5M11 15.5h2"/>`),
  gift: P(`<rect x="3" y="8" width="18" height="5" rx="1"/><path d="M5 13v8h14v-8M12 8v13M12 8S10.5 3 8 4s1 4 4 4c3 0 6.5-3 4-4s-4 4-4 4"/>`),
  store: P(`<path d="M3 9l2-5h14l2 5M3 9h18v2a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0zM5 13v8h14v-8"/>`),
  megaphone: P(`<path d="M3 10v4h4l8 5V5L7 10zM18 9a4 4 0 0 1 0 6"/>`),
  book: P(`<path d="M4 4h6a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H4zM20 4h-6a3 3 0 0 0-3 3v13a2 2 0 0 1 2-2h7z"/>`),
  settings: P(`<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/>`),
  list: P(`<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>`),
};

// ---------- Adesivos (formas da marca) ----------
export const stickers = {
  burst: `<svg viewBox="0 0 200 200" aria-hidden="true"><path fill="currentColor" d="M100 0l17 38 38-20-6 42 42 4-32 28 34 26-42 6 10 41-38-18-17 40-17-40-38 18 10-41-42-6 34-26L19 64l42-4-6-42 38 20z"/></svg>`,
  squiggle: `<svg viewBox="0 0 220 120" aria-hidden="true"><path d="M10 90c25-60 45-60 50-25s-35 40-20 5 55-55 65-20-30 45-15 15 60-60 70-25-20 40-5 20 40-45 55-30" fill="none" stroke="currentColor" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  zigzag: `<svg viewBox="0 0 200 60" aria-hidden="true"><path d="M8 40L35 12l25 36 26-36 25 36 26-36 25 36 22-28" fill="none" stroke="currentColor" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  star: `<svg viewBox="0 0 100 100" aria-hidden="true"><path fill="currentColor" d="M50 2l12 30 32-6-20 26 20 26-32-6-12 30-12-30-32 6 20-26L6 26l32 6z"/></svg>`,
  loop: `<svg viewBox="0 0 160 160" aria-hidden="true"><path d="M20 140C10 80 60 30 100 40s30 70-10 70-40-60 10-80 50 10 50 10" fill="none" stroke="currentColor" stroke-width="13" stroke-linecap="round"/></svg>`,
  blob: `<svg viewBox="0 0 200 200" aria-hidden="true"><path fill="currentColor" d="M44 -61C57 -51 67 -36 71 -19 75 -2 73 17 64 31 55 45 40 55 23 62 6 69 -13 74 -30 68 -48 62 -63 46 -70 27 -77 8 -75 -13 -66 -30 -57 -46 -40 -57 -23 -65 -6 -73 12 -73 27 -69 44 -61z" transform="translate(100 100)"/></svg>`,
};

// ---------- Segurança: escape de HTML ----------
const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;", "`": "&#96;" };
export const esc = (v) => String(v ?? "").replace(/[&<>"'`]/g, (c) => ESC[c]);
// Caminho interno seguro para redirecionamentos (evita //site e /\\site)
export const safePath = (v) => (typeof v === "string" && /^\/(?![\/\\])[\w\-./?=&#%]*$/.test(v) ? v : null);
export const safeUrl = (u) => {
  const s = String(u || "").trim();
  if (/^(https?:\/\/|\/(?![\/\\])|#|mailto:)/i.test(s) && !/[\s\\]/.test(s.replace(/^https?:\/\//i, ""))) return s;
  return "#";
};

// ---------- DOM ----------
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
export function h(html) {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

// ---------- Toasts ----------
let toastRoot;
export function toast(message, type = "info", ms = 4200) {
  if (!toastRoot) {
    toastRoot = document.createElement("div");
    toastRoot.className = "toasts";
    toastRoot.setAttribute("role", "status");
    toastRoot.setAttribute("aria-live", "polite");
    document.body.appendChild(toastRoot);
  }
  const icon = type === "ok" ? icons.check : type === "bad" ? icons.alert : icons.info;
  const el = h(`<div class="toast ${type}">${icon}<span>${esc(message)}</span></div>`);
  toastRoot.appendChild(el);
  setTimeout(() => { el.classList.add("leaving"); setTimeout(() => el.remove(), 320); }, ms);
}

// ---------- Modal ----------
export function modal({ title, body, wide = false, onClose } = {}) {
  const el = h(`<div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
    <div class="modal-box ${wide ? "wide" : ""}">
      <div class="modal-head"><h2 id="modal-title">${esc(title)}</h2>
        <button class="icon-btn" type="button" data-close aria-label="Fechar">${icons.close}</button></div>
      <div class="modal-body"></div>
    </div></div>`);
  const content = el.querySelector(".modal-body");
  if (typeof body === "string") content.innerHTML = body; else if (body) content.appendChild(body);
  const prevFocus = document.activeElement;
  const close = () => {
    el.classList.remove("open");
    document.removeEventListener("keydown", onKey);
    setTimeout(() => el.remove(), 260);
    document.body.style.overflow = "";
    prevFocus?.focus?.();
    onClose?.();
  };
  const onKey = (e) => {
    if (e.key === "Escape") close();
    if (e.key === "Tab") {
      const f = $$('a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])', el).filter((n) => n.offsetParent !== null);
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    }
  };
  el.addEventListener("click", (e) => { if (e.target === el || e.target.closest("[data-close]")) close(); });
  document.addEventListener("keydown", onKey);
  document.body.appendChild(el);
  document.body.style.overflow = "hidden";
  requestAnimationFrame(() => {
    el.classList.add("open");
    (el.querySelector("[autofocus]") || el.querySelector("input, select, textarea, button:not([data-close])") || el.querySelector("[data-close]"))?.focus();
  });
  return { el, body: content, close };
}

export function confirmDialog({ title, message, confirmText = "Confirmar", danger = false }) {
  return new Promise((resolve) => {
    let done = false;
    const m = modal({
      title,
      body: `<p>${esc(message)}</p><div class="flex gap-1 wrap mt-3" style="justify-content:flex-end">
        <button class="btn btn-ghost" type="button" data-close>Cancelar</button>
        <button class="btn ${danger ? "btn-laranja" : "btn-azul"}" type="button" data-ok>${esc(confirmText)}</button></div>`,
      onClose: () => { if (!done) resolve(false); },
    });
    m.el.querySelector("[data-ok]").addEventListener("click", () => { done = true; resolve(true); m.close(); });
  });
}

export function promptDialog({ title, label, placeholder = "", required = true, confirmText = "Enviar", multiline = true }) {
  return new Promise((resolve) => {
    let done = false;
    const field = multiline
      ? `<textarea class="textarea" id="pd-input" maxlength="1000" placeholder="${esc(placeholder)}"></textarea>`
      : `<input class="input" id="pd-input" maxlength="200" placeholder="${esc(placeholder)}">`;
    const m = modal({
      title,
      body: `<form class="form"><div class="field"><label for="pd-input">${esc(label)}</label>${field}</div>
        <div class="flex gap-1 wrap" style="justify-content:flex-end"><button class="btn btn-ghost" type="button" data-close>Cancelar</button>
        <button class="btn btn-azul" type="submit">${esc(confirmText)}</button></div></form>`,
      onClose: () => { if (!done) resolve(null); },
    });
    m.el.querySelector("form").addEventListener("submit", (e) => {
      e.preventDefault();
      const v = m.el.querySelector("#pd-input").value.trim();
      if (required && !v) { m.el.querySelector("#pd-input").setAttribute("aria-invalid", "true"); return; }
      done = true; resolve(v); m.close();
    });
  });
}

// ---------- Botão com carregamento ----------
export async function withLoading(btn, fn) {
  if (!btn) return fn();
  const html = btn.innerHTML;
  btn.disabled = true;
  btn.setAttribute("aria-busy", "true");
  btn.innerHTML = `<span class="spinner" aria-hidden="true"></span><span>Aguarde…</span>`;
  try { return await fn(); }
  finally { btn.disabled = false; btn.removeAttribute("aria-busy"); btn.innerHTML = html; }
}

// ---------- Máscaras ----------
export const digits = (v) => String(v || "").replace(/\D/g, "");
export const masks = {
  cpf: (v) => digits(v).slice(0, 11).replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d{1,2})$/, "$1-$2"),
  cnpj: (v) => {
    const s = String(v || "").toUpperCase().replace(/[^0-9A-Z]/g, "").slice(0, 14);
    return s.replace(/^(.{2})(.)/, "$1.$2").replace(/^(.{2})\.(.{3})(.)/, "$1.$2.$3").replace(/\.(.{3})(.)/, ".$1/$2").replace(/(.{4})(\d{1,2})$/, "$1-$2");
  },
  phone: (v) => {
    const d = digits(v).slice(0, 11);
    if (d.length <= 10) return d.replace(/(\d{2})(\d)/, "($1) $2").replace(/(\d{4})(\d{1,4})$/, "$1-$2");
    return d.replace(/(\d{2})(\d)/, "($1) $2").replace(/(\d{5})(\d{1,4})$/, "$1-$2");
  },
  cep: (v) => digits(v).slice(0, 8).replace(/(\d{5})(\d{1,3})$/, "$1-$2"),
};
export function bindMasks(root = document) {
  $$("[data-mask]", root).forEach((input) => {
    const fn = masks[input.dataset.mask];
    if (!fn) return;
    input.addEventListener("input", () => { input.value = fn(input.value); });
    if (input.value) input.value = fn(input.value);
  });
}

// ---------- Validação (espelha as regras do banco) ----------
export function isValidCPF(v) {
  const d = digits(v);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const calc = (n) => {
    let s = 0;
    for (let i = 0; i < n; i++) s += Number(d[i]) * (n + 1 - i);
    const r = (s * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(9) === Number(d[9]) && calc(10) === Number(d[10]);
}
export function isValidCNPJ(v) {
  const d = String(v || "").toUpperCase().replace(/[^0-9A-Z]/g, "");
  if (!/^[A-Z0-9]{12}\d{2}$/.test(d) || /^(.)\1{13}$/.test(d)) return false;
  const val = (c) => c.charCodeAt(0) - 48;
  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  let s = 0;
  for (let i = 0; i < 12; i++) s += val(d[i]) * w1[i];
  const dv1 = s % 11 < 2 ? 0 : 11 - (s % 11);
  s = 0;
  for (let i = 0; i < 13; i++) s += (i === 12 ? dv1 : val(d[i])) * w2[i];
  const dv2 = s % 11 < 2 ? 0 : 11 - (s % 11);
  return Number(d[12]) === dv1 && Number(d[13]) === dv2;
}
export const isValidPhone = (v) => /^[1-9]\d{9,10}$/.test(digits(v));
export const isValidEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v || "").trim());
export function ageFrom(dateStr) {
  if (!dateStr) return 0;
  const b = new Date(`${dateStr}T00:00:00`);
  const n = new Date();
  let a = n.getFullYear() - b.getFullYear();
  if (n.getMonth() < b.getMonth() || (n.getMonth() === b.getMonth() && n.getDate() < b.getDate())) a--;
  return a;
}
export function passwordScore(p) {
  let s = 0;
  if (p.length >= 8) s++;
  if (p.length >= 12) s++;
  if (/[a-z]/.test(p) && /[A-Z]/.test(p)) s++;
  if (/\d/.test(p)) s++;
  if (/[^A-Za-z0-9]/.test(p)) s++;
  return Math.min(s, 4);
}

export function setFieldError(input, message) {
  if (!input) return;
  const field = input.closest(".field") || input.parentElement;
  let err = field.querySelector(".field-error");
  if (!err) { err = document.createElement("div"); err.className = "field-error"; field.appendChild(err); }
  if (!err.id) err.id = `${input.id || input.name || "f"}-err`;
  if (message) {
    input.setAttribute("aria-invalid", "true");
    input.setAttribute("aria-describedby", err.id);
    err.textContent = message;
  } else {
    input.removeAttribute("aria-invalid");
    err.textContent = "";
  }
}
export function clearErrors(form) { $$("[aria-invalid]", form).forEach((i) => setFieldError(i, "")); }
export function focusFirstError(form) { form.querySelector('[aria-invalid="true"]')?.focus(); }

export function formData(form) {
  const fd = new FormData(form);
  const out = {};
  for (const [k, v] of fd.entries()) {
    if (k in out) { out[k] = [].concat(out[k], v); } else out[k] = typeof v === "string" ? v.trim() : v;
  }
  return out;
}

// ---------- CEP (ViaCEP) ----------
export async function lookupCEP(cep) {
  const d = digits(cep);
  if (d.length !== 8) return null;
  try {
    const r = await fetch(`https://viacep.com.br/ws/${d}/json/`, { credentials: "omit" });
    if (!r.ok) return null;
    const j = await r.json();
    if (j.erro) return null;
    return { street: j.logradouro || "", district: j.bairro || "", city: j.localidade || "", state: j.uf || "" };
  } catch { return null; }
}

export const UFS = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];
export const ufOptions = (selected = "") => `<option value="">UF</option>${UFS.map((u) => `<option ${u === selected ? "selected" : ""}>${u}</option>`).join("")}`;

// ---------- Rótulos ----------
export const L = {
  species: { cao: "Cão", gato: "Gato" },
  sex: { macho: "Macho", femea: "Fêmea" },
  size: { pequeno: "Pequeno", medio: "Médio", grande: "Grande" },
  age: { filhote: "Filhote", adulto: "Adulto", idoso: "Idoso" },
  animalStatus: { rascunho: "Rascunho", em_analise: "Em análise", disponivel: "Disponível", em_processo: "Em processo de adoção", adotado: "Adotado", rejeitado: "Precisa de ajustes", arquivado: "Arquivado" },
  adoption: { enviado: "Enviado", em_analise: "Em análise", entrevista: "Entrevista", visita: "Visita", aprovado: "Aprovado", recusado: "Não aprovado", cancelado: "Cancelado", concluido: "Adoção concluída" },
  orgStatus: { pendente: "Em análise", aprovada: "Aprovada", rejeitada: "Precisa de ajustes", suspensa: "Suspensa" },
  orgKind: { ong: "ONG", protetor_independente: "Protetor(a) independente", petshop: "Pet shop", clinica_veterinaria: "Clínica veterinária", banho_e_tosa: "Banho e tosa", hotel_creche: "Hotel e creche", adestramento: "Adestramento", outro: "Outro" },
  eventKind: { campanha: "Campanha", evento: "Evento", feira_adocao: "Feira de adoção", castracao: "Mutirão de castração", vacinacao: "Vacinação", arrecadacao: "Arrecadação" },
  contentStatus: { rascunho: "Rascunho", em_analise: "Em análise", publicado: "Publicado", rejeitado: "Precisa de ajustes", encerrado: "Encerrado" },
  housing: { casa: "Casa", apartamento: "Apartamento", chacara_sitio: "Chácara / sítio", outro: "Outro" },
  housingOwner: { propria: "Própria", alugada: "Alugada", cedida: "Cedida" },
  dsr: { confirmacao: "Confirmar se tratamos meus dados", acesso: "Acessar meus dados", correcao: "Corrigir dados", anonimizacao: "Anonimizar ou bloquear dados", portabilidade: "Portabilidade", eliminacao: "Eliminar dados", revogacao_consentimento: "Revogar consentimento", informacao: "Saber com quem compartilham meus dados" },
  dsrStatus: { aberta: "Aberta", em_andamento: "Em andamento", concluida: "Concluída", negada: "Negada" },
  pix: { cpf: "CPF", cnpj: "CNPJ", email: "E-mail", telefone: "Telefone", aleatoria: "Chave aleatória" },
};
export const statusClass = (s) => ({
  disponivel: "st-ok", aprovada: "st-ok", aprovado: "st-ok", concluido: "st-ok", publicado: "st-ok", concluida: "st-ok", adotado: "st-pink",
  em_analise: "st-wait", pendente: "st-wait", enviado: "st-wait", aberta: "st-wait", rascunho: "st-wait",
  entrevista: "st-info", visita: "st-info", em_processo: "st-info", em_andamento: "st-info",
  rejeitado: "st-bad", rejeitada: "st-bad", recusado: "st-bad", cancelado: "st-bad", suspensa: "st-bad", negada: "st-bad", arquivado: "st-bad", encerrado: "st-bad",
}[s] || "");
export const statusPill = (s, labels) => `<span class="status ${statusClass(s)}">${esc(labels[s] || s)}</span>`;

// ---------- Formatação ----------
const dtf = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
const dtfLong = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
const dttf = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
export const fmtDate = (d) => (d ? dtf.format(new Date(d)) : "");
export const fmtDateLong = (d) => (d ? dtfLong.format(new Date(d)) : "");
export const fmtDateTime = (d) => (d ? dttf.format(new Date(d)) : "");
export const fmtNum = (n) => new Intl.NumberFormat("pt-BR").format(n || 0);
export function timeAgo(d) {
  const s = Math.round((Date.now() - new Date(d).getTime()) / 1000);
  const rtf = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" });
  if (s < 60) return "agora";
  if (s < 3600) return rtf.format(-Math.floor(s / 60), "minute");
  if (s < 86400) return rtf.format(-Math.floor(s / 3600), "hour");
  if (s < 2592000) return rtf.format(-Math.floor(s / 86400), "day");
  return fmtDate(d);
}
export const initials = (name) => String(name || "?").trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase() || "?";

// ---------- Markdown seguro (subset) ----------
function inline(md, allowExternal = false) {
  let s = esc(md);
  s = s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g, "$1<em>$2</em>");
  s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, text, url) => {
    const u = safeUrl(url.replace(/&amp;/g, "&"));
    const ext = /^https?:/i.test(u);
    if (ext && !allowExternal) return text;
    return `<a href="${esc(u)}"${ext ? ' target="_blank" rel="noopener noreferrer"' : ""}>${text}</a>`;
  });
  return s;
}
export function markdown(md, { allowExternal = false } = {}) {
  const lines = String(md || "").replace(/\r\n?/g, "\n").split("\n");
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    let m;
    if ((m = line.match(/^(#{2,4})\s+(.*)$/))) { const n = m[1].length; out.push(`<h${n}>${inline(m[2], allowExternal)}</h${n}>`); i++; continue; }
    if (/^---+\s*$/.test(line)) { out.push("<hr>"); i++; continue; }
    if (/^>\s?/.test(line)) {
      const buf = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) { buf.push(lines[i].replace(/^>\s?/, "")); i++; }
      out.push(`<blockquote><p>${inline(buf.join(" "), allowExternal)}</p></blockquote>`); continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      const buf = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) { buf.push(`<li>${inline(lines[i].replace(/^\s*[-*]\s+/, ""), allowExternal)}</li>`); i++; }
      out.push(`<ul>${buf.join("")}</ul>`); continue;
    }
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const buf = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) { buf.push(`<li>${inline(lines[i].replace(/^\s*\d+[.)]\s+/, ""), allowExternal)}</li>`); i++; }
      out.push(`<ol>${buf.join("")}</ol>`); continue;
    }
    if (/^\|.*\|\s*$/.test(line)) {
      const rows = [];
      while (i < lines.length && /^\|.*\|\s*$/.test(lines[i])) { rows.push(lines[i]); i++; }
      const cells = (r) => r.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
      const head = cells(rows[0]);
      const body = rows.slice(rows[1] && /^[\s|:-]+$/.test(rows[1]) ? 2 : 1);
      out.push(`<table><thead><tr>${head.map((c) => `<th>${inline(c, allowExternal)}</th>`).join("")}</tr></thead><tbody>${body.map((r) => `<tr>${cells(r).map((c) => `<td>${inline(c, allowExternal)}</td>`).join("")}</tr>`).join("")}</tbody></table>`);
      continue;
    }
    const buf = [];
    while (i < lines.length && lines[i].trim() && !/^(#{2,4}\s|>|\s*[-*]\s|\s*\d+[.)]\s|\||---)/.test(lines[i])) { buf.push(lines[i]); i++; }
    if (buf.length) out.push(`<p>${inline(buf.join(" "), allowExternal)}</p>`); else i++;
  }
  return out.join("\n");
}

// ---------- URL helpers ----------
export function slugFromPath(prefix) {
  const q = new URLSearchParams(location.search).get("s");
  if (q) return q;
  const parts = location.pathname.replace(/\/+$/, "").split("/");
  const idx = parts.indexOf(prefix);
  return idx >= 0 && parts[idx + 1] ? decodeURIComponent(parts[idx + 1]) : "";
}
export const qs = (k) => new URLSearchParams(location.search).get(k);

// ---------- Imagens dos animais ----------
export const PET_CUTOUTS = {
  labrador: "/assets/img/animais/labrador.webp",
  boiadeiro: "/assets/img/animais/boiadeiro.webp",
  chihuahua: "/assets/img/animais/chihuahua.webp",
  golden: "/assets/img/animais/golden.webp",
};
