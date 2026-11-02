// Chat do pedido de adoção (candidato <-> responsável), com atualização periódica
import sb from "./sb.js";
import { $, esc, fmtDateTime, toast } from "./ui.js";

let chatTimer;
export function stopChat() { clearInterval(chatTimer); }
export function setupChatFor(appId, myId, root) {
  clearInterval(chatTimer);
  const box = $("[data-chat]", root);
  if (!box) return;
  const load = async () => {
    try {
      const { data } = await sb.from("application_messages").select("id,sender_id,body,created_at,read_at").eq("application_id", appId).order("created_at");
      const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 40;
      box.innerHTML = data?.length ? data.map((m) => `<div class="msg ${m.sender_id === myId ? "me" : ""}">${esc(m.body)}<time>${esc(fmtDateTime(m.created_at))}</time></div>`).join("")
        : `<p class="muted small center" style="margin:auto">Nenhuma mensagem ainda. Diga olá.</p>`;
      if (atBottom) box.scrollTop = box.scrollHeight;
      const unread = (data || []).filter((m) => m.sender_id !== myId && !m.read_at).map((m) => m.id);
      if (unread.length) await sb.from("application_messages").update({ read_at: new Date().toISOString() }, { returning: false }).in("id", unread);
    } catch { /* tenta de novo no próximo ciclo */ }
  };
  load().then(() => { box.scrollTop = box.scrollHeight; });
  chatTimer = setInterval(() => { if (!document.hidden) load(); }, 12000);
  $("[data-msg-form]", root)?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = e.target.body;
    const body = input.value.trim();
    if (!body) return;
    input.disabled = true;
    try {
      await sb.from("application_messages").insert({ application_id: appId, sender_id: myId, body }, { returning: false });
      input.value = "";
      await load();
      box.scrollTop = box.scrollHeight;
    } catch (er) { toast(er.message, "bad"); }
    input.disabled = false;
    input.focus();
  });
}
