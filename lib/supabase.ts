import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  { auth: { persistSession: true, autoRefreshToken: true } }
);

export type Channel = { id: string; business_id: string; unit_id: string; name: string };
export type Message = {
  id: string; business_id: string; channel_id: string; sent_at: string;
  sender_label: string; person_id: string | null; kind: string; text: string; attachment: string | null; raw?: string;
  imported_at?: string; edited?: boolean; reply_to?: string | null; forwarded_from?: string | null;
  message_tag?: { tag_id: string }[]; message_reaction?: { member_id: string; kind: string }[]; message_pin?: unknown;
};
export type Draft = {
  id: string; business_id: string; record_type_id: string; fields: Record<string, unknown>;
  status: string; confidence: number | null; created_at: string; questions: string[]; edited_at?: string | null;
};
