// =============================================================================
// Editor de imagem: enquadramento padronizado (arrastar + zoom), correção de
// orientação, leve realce e exportação em WebP. Garante fotos uniformes no site.
// =============================================================================
import { modal, esc, icons, toast } from "./ui.js";

const MAX_INPUT = 25 * 1024 * 1024; // 25 MB de entrada
const ACCEPT = /^image\/(jpeg|png|webp|heic|heif|avif)$/i;

async function loadBitmap(file) {
  if (!ACCEPT.test(file.type) && !/\.(jpe?g|png|webp|heic|heif|avif)$/i.test(file.name)) throw new Error("Envie uma imagem JPG, PNG ou WebP.");
  if (file.size > MAX_INPUT) throw new Error("Imagem muito grande (máximo 25 MB).");
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    // fallback para navegadores sem suporte às opções
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } catch { throw new Error("Não foi possível abrir esta imagem. Tente outra foto (JPG ou PNG)."); }
    finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
  }
}

/**
 * Abre o editor e devolve um Blob WebP (ou null se cancelado).
 * @param {File} file
 * @param {{aspect?: number, width?: number, title?: string, quality?: number}} opts aspect = largura/altura
 */
export async function processImage(file, { aspect = 4 / 5, width = 1200, title = "Ajuste o enquadramento", quality = 0.86 } = {}) {
  const bmp = await loadBitmap(file);
  const iw = bmp.width;
  const ih = bmp.height;
  const minSide = Math.min(iw, ih);
  if (minSide < 500) toast("A foto tem baixa resolução. Se puder, use uma imagem maior para ficar nítida no site.", "info", 6000);

  return new Promise((resolve) => {
    let done = false;
    const body = document.createElement("div");
    body.innerHTML = `
      <p class="muted small mb-2">Arraste para posicionar e use o zoom. Deixe o rosto do animal bem visível.</p>
      <div class="cropper" style="aspect-ratio:${aspect}"><div class="guide"></div></div>
      <div class="form mt-2">
        <div class="field"><label for="crop-zoom">Zoom</label><input id="crop-zoom" type="range" min="1" max="4" step="0.01" value="1"></div>
        <div class="field"><label for="crop-light">Luz</label><input id="crop-light" type="range" min="-30" max="30" step="1" value="0"></div>
        <label class="check"><input type="checkbox" id="crop-vivid" checked> Realçar cores levemente</label>
      </div>
      <div class="flex gap-1 wrap mt-3" style="justify-content:flex-end">
        <button class="btn btn-ghost" type="button" data-close>Cancelar</button>
        <button class="btn btn-laranja" type="button" data-ok>${icons.check} Usar esta foto</button>
      </div>`;
    const m = modal({ title, body, wide: false, onClose: () => { if (!done) resolve(null); } });
    const frame = body.querySelector(".cropper");
    const canvasPrev = document.createElement("canvas");
    canvasPrev.style.cssText = "position:absolute;inset:0;width:100%;height:100%";
    frame.prepend(canvasPrev);
    const zoomEl = body.querySelector("#crop-zoom");
    const lightEl = body.querySelector("#crop-light");
    const vividEl = body.querySelector("#crop-vivid");

    // estado: escala base cobre o quadro; offset em pixels da imagem
    let fw = 0; let fh = 0; let base = 1; let zoom = 1; let ox = 0; let oy = 0;
    const scale = () => base * zoom;
    const clamp = () => {
      const s = scale();
      ox = Math.min(0, Math.max(fw - iw * s, ox));
      oy = Math.min(0, Math.max(fh - ih * s, oy));
    };
    const filter = () => `brightness(${1 + Number(lightEl.value) / 100}) saturate(${vividEl.checked ? 1.12 : 1}) contrast(${vividEl.checked ? 1.04 : 1})`;
    const draw = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvasPrev.width = Math.round(fw * dpr);
      canvasPrev.height = Math.round(fh * dpr);
      const c = canvasPrev.getContext("2d");
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.filter = filter();
      c.imageSmoothingQuality = "high";
      c.drawImage(bmp, ox, oy, iw * scale(), ih * scale());
    };
    const layout = () => {
      const r = frame.getBoundingClientRect();
      const prevS = scale(); const cx = (fw / 2 - ox) / prevS; const cy = (fh / 2 - oy) / prevS;
      fw = r.width; fh = r.height;
      base = Math.max(fw / iw, fh / ih);
      if (!Number.isFinite(cx) || !prevS || prevS === 1) { ox = (fw - iw * scale()) / 2; oy = (fh - ih * scale()) / 2; }
      else { ox = fw / 2 - cx * scale(); oy = fh / 2 - cy * scale(); }
      clamp(); draw();
    };
    requestAnimationFrame(layout);
    const ro = new ResizeObserver(layout);
    ro.observe(frame);

    // arrastar (mouse e toque)
    let drag = null;
    frame.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, y: e.clientY, ox, oy }; frame.setPointerCapture(e.pointerId); });
    frame.addEventListener("pointermove", (e) => {
      if (!drag) return;
      ox = drag.ox + (e.clientX - drag.x); oy = drag.oy + (e.clientY - drag.y); clamp(); draw();
    });
    frame.addEventListener("pointerup", () => { drag = null; });
    frame.addEventListener("pointercancel", () => { drag = null; });
    const setZoom = (z) => {
      const prev = scale();
      zoom = Math.min(4, Math.max(1, z));
      const s = scale();
      ox = fw / 2 - ((fw / 2 - ox) / prev) * s;
      oy = fh / 2 - ((fh / 2 - oy) / prev) * s;
      clamp(); draw();
      zoomEl.value = zoom;
    };
    zoomEl.addEventListener("input", () => setZoom(Number(zoomEl.value)));
    frame.addEventListener("wheel", (e) => { e.preventDefault(); setZoom(zoom * (e.deltaY < 0 ? 1.06 : 0.94)); }, { passive: false });
    lightEl.addEventListener("input", draw);
    vividEl.addEventListener("change", draw);
    frame.tabIndex = 0;
    frame.setAttribute("aria-label", "Área de enquadramento. Use as setas para mover e + ou - para zoom.");
    frame.addEventListener("keydown", (e) => {
      const step = 12;
      if (e.key === "ArrowLeft") ox += step; else if (e.key === "ArrowRight") ox -= step;
      else if (e.key === "ArrowUp") oy += step; else if (e.key === "ArrowDown") oy -= step;
      else if (e.key === "+" || e.key === "=") return setZoom(zoom * 1.1);
      else if (e.key === "-") return setZoom(zoom / 1.1);
      else return;
      e.preventDefault(); clamp(); draw();
    });

    body.querySelector("[data-ok]").addEventListener("click", async () => {
      const outW = Math.round(width);
      const outH = Math.round(width / aspect);
      const k = outW / fw;
      const canvas = document.createElement("canvas");
      canvas.width = outW; canvas.height = outH;
      const c = canvas.getContext("2d");
      c.filter = filter();
      c.imageSmoothingQuality = "high";
      c.fillStyle = "#fff";
      c.fillRect(0, 0, outW, outH);
      c.drawImage(bmp, ox * k, oy * k, iw * scale() * k, ih * scale() * k);
      let blob = await new Promise((r) => canvas.toBlob(r, "image/webp", quality));
      if (!blob || blob.type !== "image/webp") blob = await new Promise((r) => canvas.toBlob(r, "image/jpeg", quality));
      done = true;
      ro.disconnect();
      m.close();
      resolve(blob);
    });
  });
}
export { esc };
