// Messages written while offline wait here and are sent when the connection returns.
// The id is made on the phone, so sending twice can never create two messages.
import { supabase } from "./supabase";

export type Pending = {
  id: string; business_id: string; channel_id: string; person_id: string;
  sender_label: string; text: string; sent_at: string;
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
    const { error } = await supabase.from("message").insert({
      id: p.id, business_id: p.business_id, channel_id: p.channel_id, source_id: p.id,
      sent_at: p.sent_at, sender_label: p.sender_label, saved_contact: true, person_id: p.person_id,
      kind: "text", text: p.text, raw: p.text,
    });
    if (!error || error.code === "23505") sent.push(p.id); // 23505 = already there
    else break; // stop at the first failure and keep order
  }
  if (sent.length) writeQueue(readQueue().filter((p) => !sent.includes(p.id)));
  return sent;
}
