// =============================================================================
// Gestão do blog dentro do painel da equipe. Só administradores (quem chama
// este módulo já confere isAdmin). O banco também bloqueia quem não é admin.
// =============================================================================
import sb from "../sb.js";
import { $, $$, esc, toast, withLoading, confirmDialog, markdown, icons } from "../ui.js";
import { processImage } from "../image.js";

const slugify = (t) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export async function blogAdmin(el) {
  el.innerHTML = `<div class="team-card blog-admin"><div class="team-card-head"><h2>Blog de conscientização</h2>
    <button class="btn btn-sm btn-laranja" type="button" data-b-new>${icons.plus} Novo artigo</button></div>
    <div data-b-body><div class="loading-page"><span class="spinner" aria-label="Carregando"></span></div></div></div>`;
  $("[data-b-new]", el).addEventListener("click", () => editor(el, null));
  await list(el);
}

async function list(el) {
  const box = $("[data-b-body]", el);
  const [{ data: posts, error }, { data: cats }] = await Promise.all([
    sb.from("blog_posts").select("id,title,status,updated_at").order("updated_at", { ascending: false }),
    sb.from("blog_categories").select("id,name").order("position"),
  ]);
  if (error) { box.innerHTML = `<p class="muted">Não foi possível carregar os artigos.</p>`; return; }
  if (!posts?.length) { box.innerHTML = `<p class="muted">Nenhum artigo ainda.</p>`; return; }
  box.innerHTML = `<ul class="blog-list">${posts.map((p) => `<li data-id="${esc(p.id)}">
      <span><strong>${esc(p.title)}</strong> <small class="muted">· ${p.status === "publicado" ? "publicado" : "rascunho"}</small></span>
      <span class="actions"><button class="btn btn-sm btn-branco" type="button" data-b-edit>Editar</button>
      <button class="btn btn-sm btn-ghost" type="button" data-b-del>Excluir</button></span></li>`).join("")}</ul>`;
  $$("[data-id]", box).forEach((row) => {
    $("[data-b-edit]", row).addEventListener("click", async () => {
      const { data } = await sb.from("blog_posts").select("*").eq("id", row.dataset.id).single();
      editor(el, data, cats || []);
    });
    $("[data-b-del]", row).addEventListener("click", async () => {
      if (!(await confirmDialog({ title: "Excluir artigo?", message: "Essa ação não pode ser desfeita.", confirmText: "Excluir", danger: true }))) return;
      try { await sb.from("blog_posts").delete().eq("id", row.dataset.id); await list(el); } catch (er) { toast(er.message, "bad"); }
    });
  });
}

async function editor(el, p, cats) {
  if (!cats) cats = (await sb.from("blog_categories").select("id,name").order("position")).data || [];
  const x = p || { status: "rascunho", tags: [] };
  const box = $("[data-b-body]", el);
  box.innerHTML = `<button class="link small" type="button" data-b-back>← Voltar aos artigos</button>
  <form class="form mt-2" data-b-form novalidate>
    <div class="field"><label for="bt">Título *</label><input class="input" id="bt" name="title" maxlength="140" value="${esc(x.title || "")}"></div>
    <div class="field"><label for="bs">Endereço (slug)</label><input class="input" id="bs" name="slug" maxlength="120" value="${esc(x.slug || "")}" placeholder="gerado a partir do título"></div>
    <div class="field"><label for="bc">Categoria</label><select class="select" id="bc" name="category_id"><option value="">Sem categoria</option>${cats.map((c) => `<option value="${esc(c.id)}" ${x.category_id === c.id ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select></div>
    <div class="field"><label for="be">Resumo *</label><textarea class="textarea" id="be" name="excerpt" maxlength="300">${esc(x.excerpt || "")}</textarea></div>
    <div class="field"><label for="bm">Conteúdo (Markdown) *</label><textarea class="textarea" id="bm" name="content_md" style="min-height:320px;font-family:ui-monospace,monospace">${esc(x.content_md || "")}</textarea>
      <p class="small muted">Use ## para subtítulos, **negrito**, - listas, [texto](https://link).</p></div>
    <div class="field"><label for="bp">Pré-visualização</label><div class="prose" data-b-preview></div></div>
    <div class="field"><span class="label">Imagem de capa (16:10)</span>
      <div class="flex gap-1 items-center wrap"><label class="btn btn-sm btn-branco">Escolher imagem<input type="file" accept="image/*" class="sr-only" data-b-cover></label>
      <span class="small muted" data-b-cover-msg>${x.cover_url ? "Capa atual salva" : "Sem capa"}</span></div>
      ${x.cover_url ? `<img src="${esc(x.cover_url)}" alt="" style="margin-top:8px;max-width:260px;border-radius:12px">` : ""}
    </div>
    <div class="field"><label for="bh">Texto alternativo da capa</label><input class="input" id="bh" name="cover_alt" maxlength="200" value="${esc(x.cover_alt || "")}"></div>
    <div class="field"><label for="bg">Tags (separadas por vírgula)</label><input class="input" id="bg" name="tags" value="${esc((x.tags || []).join(", "))}"></div>
    <label class="check"><input type="checkbox" name="featured" ${x.featured ? "checked" : ""}> Destaque na página inicial</label>
    <div class="flex gap-2 wrap items-center mt-2">
      <select class="select" name="status" style="width:auto"><option value="rascunho" ${x.status !== "publicado" ? "selected" : ""}>Rascunho</option><option value="publicado" ${x.status === "publicado" ? "selected" : ""}>Publicado</option></select>
      <button class="btn btn-laranja" type="submit">Salvar</button>
    </div></form>`;
  $("[data-b-back]", el).addEventListener("click", () => list(el));
  const form = $("[data-b-form]", el);
  const prev = $("[data-b-preview]", el);
  const upd = () => { prev.innerHTML = markdown(form.content_md.value, { allowExternal: true }); };
  form.content_md.addEventListener("input", upd); upd();
  let cover = null;
  $("[data-b-cover]", el).addEventListener("change", async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      cover = await processImage(f, { aspect: 16 / 10, width: 1600, title: "Capa do artigo" });
      if (cover) $("[data-b-cover-msg]", el).textContent = "Nova capa pronta (será salva ao publicar)";
    } catch (er) { toast(er.message, "bad"); }
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const v = Object.fromEntries(new FormData(form).entries());
    if ((v.title || "").trim().length < 5) return toast("Título muito curto.", "bad");
    if ((v.excerpt || "").trim().length < 20) return toast("Resumo com pelo menos 20 caracteres.", "bad");
    if ((v.content_md || "").trim().length < 50) return toast("Conteúdo muito curto.", "bad");
    const row = {
      title: v.title.trim(),
      slug: slugify(v.slug || v.title) || slugify(v.title),
      excerpt: v.excerpt.trim(),
      content_md: v.content_md,
      category_id: v.category_id || null,
      status: v.status,
      featured: !!form.featured.checked,
      cover_alt: (v.cover_alt || "").trim() || null,
      tags: (v.tags || "").split(",").map((t) => t.trim()).filter(Boolean).slice(0, 10),
    };
    await withLoading($('button[type="submit"]', form), async () => {
      try {
        if (cover) {
          const path = `artigos/blog-${Date.now()}.webp`;
          await sb.storage.upload("blog-media", path, cover, { contentType: cover.type });
          row.cover_url = sb.storage.publicUrl("blog-media", path);
        }
        const q = p ? sb.from("blog_posts").update(row).eq("id", p.id) : sb.from("blog_posts").insert(row);
        const { error } = await q;
        if (error) throw error;
        toast("Artigo salvo!", "ok");
        await list(el);
      } catch (er) { toast(er.message || "Não foi possível salvar.", "bad", 6000); }
    });
  });
}
