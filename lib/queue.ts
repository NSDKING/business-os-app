// Messages written while offline wait here and are sent when the connection returns.
// The id is made on the phone, so sending twice can never create two messages.
import { supabase } from "./supabase";
import { dataUrlToBlob, extOf } from "./media";

export type Pending = {
  id: string; business_id: string; channel_id: string; person_id: string;
  sender_label: string; text: string; sent_at: string;
  reply_to?: string | null;
  kind?: "text" | "image" | "audio"; media?: string; seconds?: number; // media = the file as a data URL until it is sent
};
const KEY = "bos.queue.v1";

export function readQueue(): Pending[] {
  try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; }
}
function writeQueue(q: Pending[]) {
  try { localStorage.setItem(KEY, JSON.stringify(q)); } catch {}
}
export function enqueue(p: Pending) { writeQueue([...readQueue(), p]); }

export async function flushQueue(): Promise<string[]> {
  const sent: string[] = [];
  for (const p of readQueue()) {
    let attachment: string | null = null;
    if (p.media) {
      const path = `${p.business_id}/${p.channel_id}/${p.id}.${extOf(p.media)}`;
      const { error: up } = await supabase.storage.from("chat-media").upload(path, await dataUrlToBlob(p.media), { upsert: false });
      if (up && !/exists|duplicate/i.test(up.message)) break; // keep it and retry when the network is back
      attachment = path;
    }
    const kind = p.kind ?? "text";
    const { error } = await supabase.from("message").insert({
      id: p.id, business_id: p.business_id, channel_id: p.channel_id, source_id: p.id,
      sent_at: p.sent_at, sender_label: p.sender_label, saved_contact: true, person_id: p.person_id,
      kind, text: p.text, raw: kind === "audio" ? `audio:${p.seconds ?? 0}` : p.text || kind, attachment, reply_to: p.reply_to ?? null,
    });
    if (!error || error.code === "23505") {
      sent.push(p.id); // 23505 = already there
      // Ask the AI to read it and propose reports. Fire and forget: a failure never blocks sending.
      if (!error && (kind === "image" || p.text.trim().length >= 8)) supabase.functions.invoke("extract", { body: { message_id: p.id } }).catch(() => {});
    }
    else break; // stop at the first failure and keep order
  }
  if (sent.length) writeQueue(readQueue().filter((p) => !sent.includes(p.id)));
  return sent;
}
