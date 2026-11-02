// =============================================================================
// Cliente leve do Supabase (Auth + PostgREST + Storage), sem dependências.
// Fala diretamente com as APIs REST oficiais do Supabase.
// =============================================================================
import { CONFIG, isConfigured } from "./config.js";

const STORAGE_KEY = "mapv.auth";
const VERIFIER_KEY = "mapv.pkce";

export class SbError extends Error {
  constructor(message, { status = 0, code = "", details = "", hint = "" } = {}) {
    super(message);
    this.name = "SbError";
    this.status = status;
    this.code = code;
    this.details = details;
    this.hint = hint;
  }
}

// ---------------------------------------------------------------------------
// Armazenamento seguro (localStorage pode lançar em modo privado)
// ---------------------------------------------------------------------------
const store = {
  get(key, area = "local") {
    try { const v = (area === "local" ? localStorage : sessionStorage).getItem(key); return v ? JSON.parse(v) : null; }
    catch { return null; }
  },
  set(key, value, area = "local") {
    try { (area === "local" ? localStorage : sessionStorage).setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
  },
  del(key, area = "local") {
    try { (area === "local" ? localStorage : sessionStorage).removeItem(key); } catch { /* ignore */ }
  },
};

const base = () => CONFIG.SUPABASE_URL.replace(/\/+$/, "");

// ---------------------------------------------------------------------------
// Mensagens de erro amigáveis
// ---------------------------------------------------------------------------
const AUTH_MESSAGES = {
  invalid_credentials: "E-mail ou senha incorretos.",
  "Invalid login credentials": "E-mail ou senha incorretos.",
  email_not_confirmed: "Confirme seu e-mail antes de entrar. Verifique sua caixa de entrada.",
  "Email not confirmed": "Confirme seu e-mail antes de entrar. Verifique sua caixa de entrada.",
  user_already_exists: "Já existe uma conta com este e-mail.",
  "User already registered": "Já existe uma conta com este e-mail.",
  weak_password: "Senha fraca. Use pelo menos 8 caracteres, com letras e números.",
  over_email_send_rate_limit: "Muitas tentativas. Aguarde alguns minutos e tente novamente.",
  over_request_rate_limit: "Muitas tentativas. Aguarde alguns minutos e tente novamente.",
  same_password: "A nova senha precisa ser diferente da atual.",
  session_not_found: "Sua sessão expirou. Entre novamente.",
  signup_disabled: "Novos cadastros estão temporariamente desativados.",
  email_address_invalid: "E-mail inválido.",
  validation_failed: "Dados inválidos. Revise os campos.",
};
const PG_MESSAGES = {
  "23505": "Esse registro já existe.",
  "23503": "Registro relacionado não encontrado.",
  "42501": "Você não tem permissão para fazer isso.",
  "PGRST116": "Registro não encontrado.",
  "PGRST301": "Sua sessão expirou. Entre novamente.",
};
function friendly(body, status) {
  const code = body?.error_code || body?.code || body?.error || "";
  const raw = body?.msg || body?.message || body?.error_description || body?.error || "";
  if (AUTH_MESSAGES[code]) return AUTH_MESSAGES[code];
  if (AUTH_MESSAGES[raw]) return AUTH_MESSAGES[raw];
  if (PG_MESSAGES[code]) {
    // As mensagens das nossas regras de negócio já são em português e claras.
    if (code === "42501" && raw && !/permission denied|row-level security/i.test(raw)) return raw;
    if (code === "23505" && /cpf/i.test(raw + (body?.details || ""))) return "Este CPF já está cadastrado em outra conta.";
    if (code === "23505" && /document/i.test(raw + (body?.details || ""))) return "Este documento já está cadastrado.";
    return PG_MESSAGES[code];
  }
  if (/row-level security|permission denied/i.test(raw)) return "Você não tem permissão para fazer isso.";
  if (/violates check constraint/i.test(raw)) return "Algum campo está fora do formato esperado. Revise os dados.";
  if (status === 0) return "Sem conexão. Verifique sua internet e tente novamente.";
  if (status >= 500) return "Nosso servidor está com instabilidade. Tente novamente em instantes.";
  return raw || "Algo deu errado. Tente novamente.";
}

async function parse(res) {
  const text = await res.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return text; }
}

async function http(url, { method = "GET", headers = {}, body, auth = true, raw = false, signal } = {}) {
  if (!isConfigured()) throw new SbError("O site ainda não está conectado ao banco de dados.", { code: "not_configured" });
  const h = { apikey: CONFIG.SUPABASE_ANON_KEY, ...headers };
  if (auth) {
    // Chaves publicáveis (sb_publishable_…) não são JWT: sem sessão, enviamos só o "apikey".
    const token = await auth_.getAccessToken();
    if (token) h.Authorization = `Bearer ${token}`;
  }
  let payload = body;
  if (body !== undefined && !(body instanceof Blob) && !(body instanceof FormData) && typeof body !== "string") {
    h["Content-Type"] = h["Content-Type"] || "application/json";
    payload = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(url, { method, headers: h, body: payload, signal, credentials: "omit" });
  } catch (e) {
    if (e?.name === "AbortError") throw e;
    throw new SbError(friendly(null, 0), { status: 0, code: "network" });
  }
  if (raw) return res;
  const data = await parse(res);
  if (!res.ok) {
    const b = typeof data === "object" && data ? data : { message: String(data || res.statusText) };
    if (res.status === 401 && auth) auth_._onUnauthorized();
    throw new SbError(friendly(b, res.status), { status: res.status, code: b.code || b.error_code || "", details: b.details || "", hint: b.hint || "" });
  }
  return { data, res };
}

// ---------------------------------------------------------------------------
// PKCE (login social seguro)
// ---------------------------------------------------------------------------
function b64url(bytes) {
  let s = "";
  bytes.forEach((b) => { s += String.fromCharCode(b); });
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function randomVerifier() {
  const a = new Uint8Array(48);
  crypto.getRandomValues(a);
  return b64url(a);
}
async function challengeOf(verifier) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return b64url(new Uint8Array(digest));
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
const listeners = new Set();
let refreshing = null;

const auth_ = {
  session: store.get(STORAGE_KEY),

  onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  _emit(event) { listeners.forEach((fn) => { try { fn(event, this.session); } catch (e) { console.error(e); } }); },

  _save(data, event = "SIGNED_IN") {
    if (!data?.access_token) return null;
    const expiresAt = data.expires_at || Math.floor(Date.now() / 1000) + (data.expires_in || 3600);
    this.session = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: expiresAt,
      user: data.user || this.session?.user || null,
    };
    store.set(STORAGE_KEY, this.session);
    this._emit(event);
    return this.session;
  },
  _clear(event = "SIGNED_OUT") {
    this.session = null;
    store.del(STORAGE_KEY);
    this._emit(event);
  },
  _onUnauthorized() {
    // um 401 com sessão salva significa token revogado/expirado sem refresh possível
    if (this.session && this.session.expires_at * 1000 < Date.now()) this._clear();
  },

  get user() { return this.session?.user || null; },

  async getAccessToken() {
    const s = this.session;
    if (!s) return null;
    if (s.expires_at * 1000 - Date.now() > 60_000) return s.access_token;
    try { await this.refresh(); } catch { this._clear(); return null; }
    return this.session?.access_token || null;
  },

  async refresh() {
    if (refreshing) return refreshing;
    const rt = this.session?.refresh_token;
    if (!rt) throw new SbError("Sem sessão.");
    refreshing = (async () => {
      const { data } = await http(`${base()}/auth/v1/token?grant_type=refresh_token`, {
        method: "POST", body: { refresh_token: rt }, auth: false,
      });
      return this._save(data, "TOKEN_REFRESHED");
    })().finally(() => { refreshing = null; });
    return refreshing;
  },

  async signUp({ email, password, data = {}, redirectTo }) {
    const q = redirectTo ? `?redirect_to=${encodeURIComponent(redirectTo)}` : "";
    const { data: body } = await http(`${base()}/auth/v1/signup${q}`, {
      method: "POST", auth: false, body: { email, password, data },
    });
    // Se a confirmação de e-mail estiver desligada, o Supabase já devolve a sessão.
    if (body?.access_token) this._save(body);
    const user = body?.user || body;
    // Supabase devolve um usuário "falso" sem identities quando o e-mail já existe
    const alreadyExists = Array.isArray(user?.identities) && user.identities.length === 0;
    return { user, session: body?.access_token ? this.session : null, alreadyExists };
  },

  async signIn({ email, password }) {
    const { data } = await http(`${base()}/auth/v1/token?grant_type=password`, {
      method: "POST", auth: false, body: { email, password },
    });
    return this._save(data);
  },

  async signInWithGoogle(redirectTo) {
    const verifier = randomVerifier();
    store.set(VERIFIER_KEY, verifier, "session");
    const challenge = await challengeOf(verifier);
    const params = new URLSearchParams({
      provider: "google",
      redirect_to: redirectTo,
      code_challenge: challenge,
      code_challenge_method: "s256",
    });
    window.location.assign(`${base()}/auth/v1/authorize?${params}`);
  },

  // Trata o retorno do Google (PKCE ?code=) e dos links de e-mail (#access_token=)
  async handleCallback() {
    const url = new URL(window.location.href);
    const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
    const errDesc = url.searchParams.get("error_description") || hash.get("error_description");
    if (errDesc) throw new SbError(decodeURIComponent(errDesc.replace(/\+/g, " ")));

    const code = url.searchParams.get("code");
    if (code) {
      const verifier = store.get(VERIFIER_KEY, "session");
      store.del(VERIFIER_KEY, "session");
      if (!verifier) throw new SbError("Não foi possível concluir o login. Tente entrar novamente neste mesmo navegador.");
      const { data } = await http(`${base()}/auth/v1/token?grant_type=pkce`, {
        method: "POST", auth: false, body: { auth_code: code, code_verifier: verifier },
      });
      this._save(data);
      return { type: "oauth" };
    }
    const at = hash.get("access_token");
    if (at) {
      const s = this._save({
        access_token: at,
        refresh_token: hash.get("refresh_token"),
        expires_in: Number(hash.get("expires_in")) || 3600,
        expires_at: Number(hash.get("expires_at")) || undefined,
      });
      if (s) {
        try { await this.getUser(); } catch { /* ignore */ }
      }
      return { type: hash.get("type") || "magiclink" };
    }
    return { type: null };
  },

  async getUser() {
    if (!this.session) return null;
    const { data } = await http(`${base()}/auth/v1/user`);
    this.session.user = data;
    store.set(STORAGE_KEY, this.session);
    return data;
  },

  async updateUser(attrs) {
    const { data } = await http(`${base()}/auth/v1/user`, { method: "PUT", body: attrs });
    if (this.session) { this.session.user = data; store.set(STORAGE_KEY, this.session); this._emit("USER_UPDATED"); }
    return data;
  },

  async resetPassword(email, redirectTo) {
    const q = redirectTo ? `?redirect_to=${encodeURIComponent(redirectTo)}` : "";
    await http(`${base()}/auth/v1/recover${q}`, { method: "POST", auth: false, body: { email } });
  },

  async resend(email, redirectTo) {
    const q = redirectTo ? `?redirect_to=${encodeURIComponent(redirectTo)}` : "";
    await http(`${base()}/auth/v1/resend${q}`, { method: "POST", auth: false, body: { type: "signup", email } });
  },

  async signOut() {
    try { if (this.session) await http(`${base()}/auth/v1/logout`, { method: "POST" }); } catch { /* ignore */ }
    this._clear();
  },
};

// sincroniza login/logout entre abas
window.addEventListener("storage", (e) => {
  if (e.key !== STORAGE_KEY) return;
  auth_.session = store.get(STORAGE_KEY);
  auth_._emit(auth_.session ? "SIGNED_IN" : "SIGNED_OUT");
});

// ---------------------------------------------------------------------------
// PostgREST: construtor de consultas
// ---------------------------------------------------------------------------
const enc = (v) => encodeURIComponent(String(v));
const listVal = (arr) => `(${arr.map((v) => `"${String(v).replace(/"/g, '\\"')}"`).join(",")})`;

class Query {
  constructor(table) {
    this.table = table;
    this.params = [];
    this.method = "GET";
    this.body = undefined;
    this.headers = {};
    this._single = false;
    this._maybe = false;
    this._count = false;
  }
  _f(col, op, val) { this.params.push(`${enc(col)}=${op}.${val}`); return this; }
  select(cols = "*", { count = false } = {}) {
    this.params.push(`select=${enc(cols.replace(/\s+/g, ""))}`);
    if (count) { this._count = true; this.headers.Prefer = [this.headers.Prefer, "count=exact"].filter(Boolean).join(","); }
    if (this.method !== "GET") this.headers.Prefer = [this.headers.Prefer, "return=representation"].filter(Boolean).join(",");
    return this;
  }
  eq(c, v) { return this._f(c, "eq", enc(v)); }
  neq(c, v) { return this._f(c, "neq", enc(v)); }
  gt(c, v) { return this._f(c, "gt", enc(v)); }
  gte(c, v) { return this._f(c, "gte", enc(v)); }
  lt(c, v) { return this._f(c, "lt", enc(v)); }
  lte(c, v) { return this._f(c, "lte", enc(v)); }
  is(c, v) { return this._f(c, "is", v === null ? "null" : enc(v)); }
  in(c, arr) { return this._f(c, "in", enc(listVal(arr))); }
  ilike(c, v) { return this._f(c, "ilike", enc(v)); }
  contains(c, arr) { return this._f(c, "cs", enc(`{${arr.map((x) => `"${x}"`).join(",")}}`)); }
  textSearch(c, q) { return this._f(c, "wfts(portuguese)", enc(q)); }
  not(c, op, v) { return this._f(c, `not.${op}`, enc(v)); }
  or(expr) { this.params.push(`or=${enc(`(${expr})`)}`); return this; }
  order(c, { ascending = true, nullsFirst } = {}) {
    const n = nullsFirst === undefined ? "" : nullsFirst ? ".nullsfirst" : ".nullslast";
    const existing = this.params.findIndex((p) => p.startsWith("order="));
    const part = `${c}.${ascending ? "asc" : "desc"}${n}`;
    if (existing >= 0) this.params[existing] += `,${part}`; else this.params.push(`order=${part}`);
    return this;
  }
  limit(n) { this.params.push(`limit=${n}`); return this; }
  range(from, to) { this.params.push(`offset=${from}`, `limit=${to - from + 1}`); return this; }
  single() { this._single = true; this.headers.Accept = "application/vnd.pgrst.object+json"; return this; }
  maybeSingle() { this._maybe = true; return this; }
  insert(rows, { returning = true } = {}) {
    this.method = "POST"; this.body = rows;
    this.headers.Prefer = returning ? "return=representation" : "return=minimal";
    return this;
  }
  upsert(rows, { onConflict, returning = true } = {}) {
    this.method = "POST"; this.body = rows;
    this.headers.Prefer = `resolution=merge-duplicates,${returning ? "return=representation" : "return=minimal"}`;
    if (onConflict) this.params.push(`on_conflict=${enc(onConflict)}`);
    return this;
  }
  update(values, { returning = true } = {}) {
    this.method = "PATCH"; this.body = values;
    this.headers.Prefer = returning ? "return=representation" : "return=minimal";
    return this;
  }
  delete() { this.method = "DELETE"; this.headers.Prefer = "return=minimal"; return this; }

  async run() {
    const url = `${base()}/rest/v1/${this.table}${this.params.length ? `?${this.params.join("&")}` : ""}`;
    const { data, res } = await http(url, { method: this.method, headers: this.headers, body: this.body });
    let count = null;
    if (this._count) {
      const cr = res.headers.get("content-range");
      if (cr && cr.includes("/")) count = Number(cr.split("/")[1]) || 0;
    }
    if (this._maybe) return { data: Array.isArray(data) ? data[0] || null : data, count };
    return { data, count };
  }
  then(resolve, reject) { return this.run().then(resolve, reject); }
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------
const storage = {
  publicUrl(bucket, path) {
    if (!path) return "";
    if (/^https?:\/\//.test(path)) return path;
    return `${base()}/storage/v1/object/public/${bucket}/${path.split("/").map(enc).join("/")}`;
  },
  async upload(bucket, path, blob, { upsert = false, contentType } = {}) {
    const url = `${base()}/storage/v1/object/${bucket}/${path.split("/").map(enc).join("/")}`;
    await http(url, {
      method: "POST", body: blob,
      headers: { "Content-Type": contentType || blob.type || "application/octet-stream", "x-upsert": String(upsert), "cache-control": "max-age=31536000" },
    });
    return { path };
  },
  async remove(bucket, paths) {
    if (!paths.length) return;
    await http(`${base()}/storage/v1/object/${bucket}`, { method: "DELETE", body: { prefixes: paths } });
  },
  async list(bucket, prefix = "", { limit = 1000 } = {}) {
    const { data } = await http(`${base()}/storage/v1/object/list/${bucket}`, {
      method: "POST", body: { prefix, limit, offset: 0, sortBy: { column: "name", order: "asc" } },
    });
    return data || [];
  },
  // Lista recursiva (pastas do próprio usuário) — usada na exclusão de conta
  async listAll(bucket, prefix) {
    const out = [];
    const walk = async (p) => {
      const items = await this.list(bucket, p);
      for (const it of items) {
        const full = p ? `${p}/${it.name}` : it.name;
        if (it.id) out.push(full); else await walk(full);
      }
    };
    await walk(prefix);
    return out;
  },
};

// ---------------------------------------------------------------------------
export const sb = {
  auth: auth_,
  from: (table) => new Query(table),
  rpc: async (fn, args = {}) => (await http(`${base()}/rest/v1/rpc/${fn}`, { method: "POST", body: args })).data,
  storage,
  isConfigured,
};
export default sb;
