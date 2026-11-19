"use client";
// Message tools (P-007 stage A): the long-press menu, tag pills, reactions, and the Tagged / Saved lists.
import { useEffect, useMemo, useState } from "react";
import { supabase, type Message } from "@/lib/supabase";
import Icon from "./Icon";

export type Tag = { id: string; name: string; color: string };
export const REACTIONS = [
  { kind: "ok", icon: "thumb", label: "D'accord" },
  { kind: "done", icon: "check", label: "Fait" },
  { kind: "alert", icon: "alert", label: "Attention" },
] as const;

export const snippet = (m: Pick<Message, "kind" | "text">) => (m.kind === "image" ? "Photo" : m.kind === "audio" ? "Message vocal" : m.text);

export function TagPills({ ids, tags }: { ids: string[]; tags: Tag[] }) {
  const list = ids.map((id) => tags.find((t) => t.id === id)).filter(Boolean) as Tag[];
  if (!list.length) return null;
  return <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
    {list.map((t) => <span key={t.id} style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 10, color: t.color, border: `1px solid ${t.color}`, background: "#fff" }}>{t.name}</span>)}
  </div>;
}

export function MessageSheet(p: {
  m: Message; tags: Tag[]; activeTags: Set<string>; myReactions: Set<string>; saved: boolean; pinned: boolean;
  targets: { id: string; name: string }[]; canForward: boolean; note: string;
  onClose: () => void; onReply: () => void; onTag: (id: string) => void; onNewTag: (name: string) => void;
  onReact: (kind: string) => void; onSave: () => void; onPin: () => void; onForward: (channel: string) => void; onCopy: () => void;
}) {
  const [name, setName] = useState(""); const [fwd, setFwd] = useState(false);
  const row = (icon: Parameters<typeof Icon>[0]["name"], label: string, fn: () => void) => (
    <button key={label} onClick={fn} style={{ display: "flex", gap: 12, alignItems: "center", width: "100%", textAlign: "left", background: "none", border: 0, padding: "12px 4px", fontSize: 16, minHeight: 48 }}>
      <Icon name={icon} size={22} />{label}</button>);
  return (
    <div onClick={p.onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", zIndex: 60, display: "flex", alignItems: "flex-end" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", width: "100%", maxHeight: "88%", overflowY: "auto", borderRadius: "16px 16px 0 0", padding: "14px 16px 20px" }}>
        <div className="muted" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: 10 }}>{p.m.sender_label} : {snippet(p.m) || "…"}</div>
        {fwd ? (<>
          <b>Transférer à</b>
          {p.targets.map((t) => <button key={t.id} onClick={() => p.onForward(t.id)} style={{ display: "block", width: "100%", textAlign: "left", background: "none", border: 0, borderBottom: "1px solid var(--line)", padding: "12px 4px", fontSize: 16 }}>{t.name}</button>)}
          <p><button onClick={() => setFwd(false)}>Retour</button></p>
        </>) : (<>
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            {REACTIONS.map((r) => <button key={r.kind} onClick={() => p.onReact(r.kind)} aria-label={r.label}
              style={{ flex: 1, display: "flex", gap: 6, alignItems: "center", justifyContent: "center", padding: "10px 0", borderRadius: 12, border: "1px solid var(--line)", background: p.myReactions.has(r.kind) ? "var(--soft)" : "#fff", color: p.myReactions.has(r.kind) ? "var(--primary)" : "inherit" }}>
              <Icon name={r.icon} size={20} /> {r.label}</button>)}
          </div>
          <div className="muted" style={{ fontWeight: 600, marginBottom: 6 }}><Icon name="tag" size={16} /> Étiquettes</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {p.tags.map((t) => { const on = p.activeTags.has(t.id); return (
              <button key={t.id} onClick={() => p.onTag(t.id)} style={{ padding: "6px 12px", borderRadius: 16, border: `1.5px solid ${t.color}`, background: on ? t.color : "#fff", color: on ? "#fff" : t.color, fontWeight: 600, fontSize: 13 }}>{t.name}</button>); })}
          </div>
          <div style={{ display: "flex", gap: 8, margin: "10px 0 6px" }}>
            <input placeholder="Nouvelle étiquette" value={name} maxLength={30} onChange={(e) => setName(e.target.value)} style={{ flex: 1 }} />
            <button disabled={!name.trim()} onClick={() => { p.onNewTag(name.trim()); setName(""); }}>Ajouter</button>
          </div>
          <div style={{ borderTop: "1px solid var(--line)", marginTop: 8 }}>
            {row("reply", "Répondre", p.onReply)}
            {row("bookmark", p.saved ? "Retirer des enregistrés" : "Enregistrer", p.onSave)}
            {row("pin", p.pinned ? "Détacher" : "Épingler dans la discussion", p.onPin)}
            {p.canForward && row("forward", "Transférer", () => setFwd(true))}
            {p.m.kind === "text" && row("copy", "Copier le texte", p.onCopy)}
          </div>
        </>)}
        {p.note && <p style={{ color: "var(--error)" }}>{p.note}</p>}
      </div>
    </div>);
}

type Row = { message: Message; tags: Tag[]; at: string };

// "Étiquetés" and "Enregistrés": messages across all conversations the person can see.
export function Collection({ mode, businessId, chatName, onOpen }: {
  mode: "tagged" | "saved"; businessId: string; chatName: (channel: string) => string; onOpen: (channel: string, message: string) => void;
}) {
  const [rows, setRows] = useState<Row[] | null>(null); const [pick, setPick] = useState("");
  useEffect(() => {
    let on = true; setRows(null); setPick("");
    (async () => {
      const out: Row[] = [];
      if (mode === "tagged") {
        const { data } = await supabase.from("message_tag").select("created_at, tag:tag_id(id,name,color), message:message_id(id,business_id,channel_id,sent_at,sender_label,person_id,kind,text,attachment)")
          .eq("business_id", businessId).order("created_at", { ascending: false }).limit(300);
        const by = new Map<string, Row>();
        for (const r of (data ?? []) as unknown as { created_at: string; tag: Tag | null; message: Message | null }[]) {
          if (!r.message || !r.tag) continue;
          const e = by.get(r.message.id) ?? { message: r.message, tags: [], at: r.created_at }; e.tags.push(r.tag); by.set(r.message.id, e);
        }
        out.push(...by.values());
      } else {
        const { data } = await supabase.from("saved_message").select("created_at, message:message_id(id,business_id,channel_id,sent_at,sender_label,person_id,kind,text,attachment)")
          .eq("business_id", businessId).order("created_at", { ascending: false }).limit(200);
        for (const r of (data ?? []) as unknown as { created_at: string; message: Message | null }[]) if (r.message) out.push({ message: r.message, tags: [], at: r.created_at });
      }
      if (on) setRows(out);
    })();
    return () => { on = false; };
  }, [mode, businessId]);
  const used = useMemo(() => { const m = new Map<string, Tag>(); (rows ?? []).forEach((r) => r.tags.forEach((t) => m.set(t.id, t))); return [...m.values()]; }, [rows]);
  const shown = (rows ?? []).filter((r) => !pick || r.tags.some((t) => t.id === pick));
  return (<>
    {mode === "tagged" && used.length > 0 && <div style={{ display: "flex", gap: 8, overflowX: "auto", padding: "8px 16px", background: "#fff", borderBottom: "1px solid var(--line)" }}>
      {used.map((t) => <button key={t.id} onClick={() => setPick(pick === t.id ? "" : t.id)} style={{ flex: "none", padding: "5px 12px", borderRadius: 16, border: `1.5px solid ${t.color}`, background: pick === t.id ? t.color : "#fff", color: pick === t.id ? "#fff" : t.color, fontWeight: 600, fontSize: 13 }}>{t.name}</button>)}
    </div>}
    {rows === null && <p className="muted" style={{ padding: 16 }}>Chargement…</p>}
    {rows && shown.length === 0 && <p className="muted" style={{ padding: 16 }}>{mode === "tagged" ? "Aucun message étiqueté. Appuyez longuement sur un message pour l'étiqueter." : "Aucun message enregistré. Appuyez longuement sur un message pour l'enregistrer."}</p>}
    {shown.map((r) => (
      <div key={r.message.id} onClick={() => onOpen(r.message.channel_id, r.message.id)} style={{ padding: "12px 16px", borderBottom: "1px solid var(--line)", background: "#fff", cursor: "pointer" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
          <b style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.message.sender_label}<span className="muted" style={{ fontWeight: 400, fontSize: 12 }}> · {chatName(r.message.channel_id)}</span></b>
          <span className="muted" style={{ fontSize: 12 }}>{new Date(r.message.sent_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })}</span>
        </div>
        <div className="muted" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 2 }}>{snippet(r.message)}</div>
        <TagPills ids={r.tags.map((t) => t.id)} tags={r.tags} />
      </div>))}
  </>);
}
