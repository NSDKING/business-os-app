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
    {list.map((t) => <span key={t.id} style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 10, color: t.color, border: `1px solid ${t.color}`, background: "var(--surface)" }}>{t.name}</span>)}
  </div>;
}

export function MessageSheet(p: {
  m: Message; tags: Tag[]; activeTags: Set<string>; myReactions: Set<string>; saved: boolean; pinned: boolean;
  targets: { id: string; name: string }[]; canForward: boolean; note: string; tagOnly?: boolean;
  receipts?: { name: string; state: "read" | "delivered" | "none" }[];
  assignees?: { id: string; name: string }[]; meId?: string;
  onTask?: (title: string, assignee: string, due: string) => void; onReport?: () => void;
  onClose: () => void; onReply: () => void; onTag: (id: string) => void; onNewTag: (name: string) => void;
  onReact: (kind: string) => void; onSave: () => void; onPin: () => void; onForward: (channel: string) => void; onCopy: () => void;
}) {
  const [name, setName] = useState(""); const [fwd, setFwd] = useState(false);
  const [task, setTask] = useState(false); const [tTitle, setTTitle] = useState(""); const [tWho, setTWho] = useState(p.meId ?? ""); const [tDue, setTDue] = useState(""); const [more, setMore] = useState(!p.tagOnly);
  const row = (icon: Parameters<typeof Icon>[0]["name"], label: string, fn: () => void) => (
    <button key={label} onClick={fn} style={{ display: "flex", gap: 12, alignItems: "center", width: "100%", textAlign: "left", background: "none", border: 0, padding: "12px 4px", fontSize: 16, minHeight: 48 }}>
      <Icon name={icon} size={22} />{label}</button>);
  return (
    <div onClick={p.onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", zIndex: 60, display: "flex", alignItems: "flex-end" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "var(--surface)", width: "100%", maxHeight: "88%", overflowY: "auto", borderRadius: "16px 16px 0 0", padding: "14px 16px 20px" }}>
        <div className="muted" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: 10 }}>{p.m.sender_label} : {snippet(p.m) || "…"}</div>
        {task ? (<>
          <b>Créer une tâche</b>
          <input value={tTitle} maxLength={200} onChange={(e) => setTTitle(e.target.value)} style={{ width: "100%", margin: "8px 0" }} aria-label="Tâche" />
          <div className="muted">Pour</div>
          <select value={tWho} onChange={(e) => setTWho(e.target.value)} style={{ width: "100%", minHeight: 44, margin: "4px 0 8px" }}>
            {(p.assignees ?? []).map((a) => <option key={a.id} value={a.id}>{a.id === p.meId ? `${a.name} (moi)` : a.name}</option>)}</select>
          <div className="muted">Échéance (facultatif)</div>
          <input type="date" value={tDue} onChange={(e) => setTDue(e.target.value)} style={{ width: "100%", minHeight: 44, margin: "4px 0 12px" }} />
          <div className="row"><button className="primary" disabled={!tTitle.trim() || !tWho} onClick={() => p.onTask?.(tTitle.trim(), tWho, tDue)}>Créer la tâche</button>
            <button onClick={() => setTask(false)}>Retour</button></div>
        </>) : fwd ? (<>
          <b>Transférer à</b>
          {p.targets.map((t) => <button key={t.id} onClick={() => p.onForward(t.id)} style={{ display: "block", width: "100%", textAlign: "left", background: "none", border: 0, borderBottom: "1px solid var(--line)", padding: "12px 4px", fontSize: 16 }}>{t.name}</button>)}
          <p><button onClick={() => setFwd(false)}>Retour</button></p>
        </>) : (<>
          {more && <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            {REACTIONS.map((r) => <button key={r.kind} onClick={() => p.onReact(r.kind)} aria-label={r.label}
              style={{ flex: 1, display: "flex", gap: 6, alignItems: "center", justifyContent: "center", padding: "10px 0", borderRadius: 12, border: "1px solid var(--line)", background: p.myReactions.has(r.kind) ? "var(--soft)" : "var(--surface)", color: p.myReactions.has(r.kind) ? "var(--primary)" : "inherit" }}>
              <Icon name={r.icon} size={20} /> {r.label}</button>)}
          </div>}
          <div className="muted" style={{ fontWeight: 600, marginBottom: 6 }}><Icon name="tag" size={16} /> Étiquettes</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {p.tags.map((t) => { const on = p.activeTags.has(t.id); return (
              <button key={t.id} onClick={() => p.onTag(t.id)} style={{ padding: "6px 12px", borderRadius: 16, border: `1.5px solid ${t.color}`, background: on ? t.color : "var(--surface)", color: on ? "#fff" : t.color, fontWeight: 600, fontSize: 13 }}>{t.name}</button>); })}
          </div>
          <div style={{ display: "flex", gap: 8, margin: "10px 0 6px" }}>
            <input placeholder="Nouvelle étiquette" value={name} maxLength={30} onChange={(e) => setName(e.target.value)} style={{ flex: 1 }} />
            <button disabled={!name.trim()} onClick={() => { p.onNewTag(name.trim()); setName(""); }}>Ajouter</button>
          </div>
          {!more && <p><button onClick={() => setMore(true)}>Plus d'actions</button></p>}
          {more && <div style={{ borderTop: "1px solid var(--line)", marginTop: 8 }}>
            {row("reply", "Répondre", p.onReply)}
            {row("bookmark", p.saved ? "Retirer des enregistrés" : "Enregistrer", p.onSave)}
            {row("pin", p.pinned ? "Détacher" : "Épingler dans la discussion", p.onPin)}
            {p.canForward && row("forward", "Transférer", () => setFwd(true))}
            {p.onTask && row("check", "Créer une tâche", () => { setTTitle(snippet(p.m).slice(0, 120)); setTask(true); })}
            {p.onReport && row("more", "Créer un rapport (l'IA lit ce message)", p.onReport)}
            {p.m.kind === "text" && row("copy", "Copier le texte", p.onCopy)}
          </div>}
          {more && p.receipts && p.receipts.length > 0 && (() => {
            const by = (st: string) => p.receipts!.filter((r) => r.state === st).map((r) => r.name).join(", ");
            const line = (label: string, v: string) => v ? <div style={{ padding: "4px 0" }}><span className="muted">{label} </span>{v}</div> : null;
            return <div style={{ borderTop: "1px solid var(--line)", marginTop: 8, paddingTop: 10 }}>
              <b>Infos du message</b>
              {line("Lu par", by("read"))}{line("Reçu par", by("delivered"))}{line("Pas encore reçu par", by("none"))}
            </div>; })()}
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
    {mode === "tagged" && used.length > 0 && <div style={{ display: "flex", gap: 8, overflowX: "auto", padding: "8px 16px", background: "var(--surface)", borderBottom: "1px solid var(--line)" }}>
      {used.map((t) => <button key={t.id} onClick={() => setPick(pick === t.id ? "" : t.id)} style={{ flex: "none", padding: "5px 12px", borderRadius: 16, border: `1.5px solid ${t.color}`, background: pick === t.id ? t.color : "var(--surface)", color: pick === t.id ? "#fff" : t.color, fontWeight: 600, fontSize: 13 }}>{t.name}</button>)}
    </div>}
    {rows === null && <p className="muted" style={{ padding: 16 }}>Chargement…</p>}
    {rows && shown.length === 0 && <p className="muted" style={{ padding: 16 }}>{mode === "tagged" ? "Aucun message étiqueté. Appuyez longuement sur un message pour l'étiqueter." : "Aucun message enregistré. Appuyez longuement sur un message pour l'enregistrer."}</p>}
    {shown.map((r) => (
      <div key={r.message.id} onClick={() => onOpen(r.message.channel_id, r.message.id)} style={{ padding: "12px 16px", borderBottom: "1px solid var(--line)", background: "var(--surface)", cursor: "pointer" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
          <b style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.message.sender_label}<span className="muted" style={{ fontWeight: 400, fontSize: 12 }}> · {chatName(r.message.channel_id)}</span></b>
          <span className="muted" style={{ fontSize: 12 }}>{new Date(r.message.sent_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })}</span>
        </div>
        <div className="muted" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 2 }}>{snippet(r.message)}</div>
        <TagPills ids={r.tags.map((t) => t.id)} tags={r.tags} />
      </div>))}
  </>);
}

type TaskRow = { id: string; title: string; assignee: string; due_on: string | null; status: string; message_id: string; message: { channel_id: string; sender_label: string; text: string; kind: string } | null };

// "Tâches": actions created from conversations, with owner, deadline and the message they came from (spec section 10).
export function TaskList({ businessId, meId, nameOf, onOpen }: {
  businessId: string; meId: string; nameOf: (member: string) => string; onOpen: (channel: string, message: string) => void;
}) {
  const [rows, setRows] = useState<TaskRow[] | null>(null); const [mine, setMine] = useState(true); const [err, setErr] = useState("");
  const load = () => supabase.from("task").select("id,title,assignee,due_on,status,message_id,message:message_id(channel_id,sender_label,text,kind)")
    .eq("business_id", businessId).order("due_on", { ascending: true, nullsFirst: false }).limit(200)
    .then(({ data }) => setRows((data ?? []) as unknown as TaskRow[]));
  useEffect(() => { load(); }, [businessId]); // eslint-disable-line react-hooks/exhaustive-deps
  async function toggle(t: TaskRow) {
    setErr("");
    const { error } = await supabase.rpc("set_task_done", { p_task: t.id, p_done: t.status !== "done" });
    if (error) setErr("Seule la personne concernée ou celle qui l'a créée peut la cocher."); else load();
  }
  const today = new Date().toISOString().slice(0, 10);
  const list = (rows ?? []).filter((t) => !mine || t.assignee === meId);
  const open = list.filter((t) => t.status === "open"), done = list.filter((t) => t.status === "done");
  const item = (t: TaskRow) => (
    <div key={t.id} style={{ display: "flex", gap: 12, padding: "12px 16px", borderBottom: "1px solid var(--line)", background: "var(--surface)", alignItems: "flex-start" }}>
      <button onClick={() => toggle(t)} aria-label={t.status === "done" ? "Rouvrir" : "Marquer fait"} style={{ flex: "none", width: 28, height: 28, minHeight: 28, padding: 0, borderRadius: 14, border: "2px solid var(--primary)", background: t.status === "done" ? "var(--primary)" : "var(--surface)", color: "#fff", display: "grid", placeItems: "center" }}>
        {t.status === "done" && <Icon name="check" size={16} />}</button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, textDecoration: t.status === "done" ? "line-through" : undefined, opacity: t.status === "done" ? 0.6 : 1 }}>{t.title}</div>
        <div className="muted" style={{ fontSize: 13 }}>
          {t.assignee === meId ? "Moi" : nameOf(t.assignee)}
          {t.due_on && <span style={{ color: t.status === "open" && t.due_on < today ? "var(--error)" : undefined, fontWeight: t.status === "open" && t.due_on < today ? 700 : 400 }}> · {t.status === "open" && t.due_on < today ? "en retard, " : ""}{new Date(t.due_on + "T00:00").toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "2-digit" })}</span>}
        </div>
        {t.message && <div onClick={() => onOpen(t.message!.channel_id, t.message_id)} className="muted" style={{ fontSize: 13, marginTop: 4, cursor: "pointer", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          Message de {t.message.sender_label} : {snippet(t.message as Pick<Message, "kind" | "text">)}</div>}
      </div>
    </div>);
  return (<>
    <div style={{ display: "flex", gap: 8, padding: "8px 16px", background: "var(--surface)", borderBottom: "1px solid var(--line)" }}>
      <button onClick={() => setMine(true)} style={{ flex: 1, background: mine ? "var(--primary)" : "var(--surface)", color: mine ? "#fff" : "var(--text)" }}>Mes tâches</button>
      <button onClick={() => setMine(false)} style={{ flex: 1, background: !mine ? "var(--primary)" : "var(--surface)", color: !mine ? "#fff" : "var(--text)" }}>Toutes</button>
    </div>
    {err && <p style={{ color: "var(--error)", padding: "0 16px" }}>{err}</p>}
    {rows === null && <p className="muted" style={{ padding: 16 }}>Chargement…</p>}
    {rows && list.length === 0 && <p className="muted" style={{ padding: 16 }}>Aucune tâche. Appuyez longuement sur un message, puis « Créer une tâche ».</p>}
    {open.map(item)}
    {done.length > 0 && <div className="muted" style={{ padding: "12px 16px 4px", fontWeight: 600 }}>Terminées</div>}
    {done.map(item)}
  </>);
}

type Hit = { id: string; channel_id: string; sent_at: string; sender_label: string; person_id: string | null; kind: string; text: string; message_tag: { tag_id: string }[] };

// "Recherche": words in messages, narrowed by person, type, tag and period (spec section 7). Only messages the person can see come back.
export function MessageSearch({ businessId, tags, people, chatName, onOpen }: {
  businessId: string; tags: Tag[]; people: { id: string; name: string }[]; chatName: (channel: string) => string; onOpen: (channel: string, message: string) => void;
}) {
  const [q, setQ] = useState(""); const [kind, setKind] = useState(""); const [tag, setTag] = useState(""); const [who, setWho] = useState(""); const [days, setDays] = useState(0);
  const [hits, setHits] = useState<Hit[] | null>(null);
  const active = q.trim().length >= 2 || !!(kind || tag || who || days);
  useEffect(() => {
    if (!active) { setHits(null); return; }
    let on = true;
    const t = setTimeout(async () => {
      let qb = supabase.from("message").select(`id,channel_id,sent_at,sender_label,person_id,kind,text,message_tag${tag ? "!inner" : ""}(tag_id)`).eq("business_id", businessId);
      const term = q.trim().replace(/[%_,()]/g, " ");
      if (term.length >= 2) qb = qb.ilike("text", `%${term}%`);
      if (kind) qb = qb.eq("kind", kind);
      if (who) qb = qb.eq("person_id", who);
      if (tag) qb = qb.eq("message_tag.tag_id", tag);
      if (days) qb = qb.gte("sent_at", new Date(Date.now() - days * 86400000).toISOString());
      const { data } = await qb.order("sent_at", { ascending: false }).limit(60);
      if (on) setHits((data ?? []) as unknown as Hit[]);
    }, 300);
    return () => { on = false; clearTimeout(t); };
  }, [q, kind, tag, who, days, businessId, active]);
  const chip = (on: boolean) => ({ flex: "none" as const, padding: "5px 12px", borderRadius: 16, border: "1.5px solid var(--primary)", background: on ? "var(--primary)" : "var(--surface)", color: on ? "#fff" : "var(--primary)", fontWeight: 600, fontSize: 13, minHeight: 34 });
  const row = (label: string, items: [string, string][], val: string, set: (v: string) => void) => (
    <div style={{ display: "flex", gap: 8, overflowX: "auto", alignItems: "center", padding: "4px 16px" }}>
      <span className="muted" style={{ flex: "none", width: 64, fontSize: 12 }}>{label}</span>
      {items.map(([k, l]) => <button key={k} style={chip(val === k)} onClick={() => set(val === k ? "" : k)}>{l}</button>)}
    </div>);
  return (<>
    <div style={{ padding: "8px 16px 4px", background: "var(--surface)" }}>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Mots dans les messages" aria-label="Rechercher dans les messages" style={{ width: "100%" }} />
    </div>
    <div style={{ background: "var(--surface)", paddingBottom: 8, borderBottom: "1px solid var(--line)" }}>
      {row("Type", [["text", "Texte"], ["image", "Photo"], ["audio", "Vocal"]], kind, setKind)}
      {row("Période", [["7", "7 jours"], ["30", "30 jours"]], days ? String(days) : "", (v) => setDays(Number(v)))}
      {tags.length > 0 && row("Étiquette", tags.map((t) => [t.id, t.name] as [string, string]), tag, setTag)}
      {row("Personne", people.map((p) => [p.id, p.name.split(" ")[0]] as [string, string]), who, setWho)}
    </div>
    {!active && <p className="muted" style={{ padding: 16 }}>Tapez des mots, ou choisissez un filtre, par exemple l'étiquette « Paiement ».</p>}
    {active && hits === null && <p className="muted" style={{ padding: 16 }}>Recherche…</p>}
    {hits && hits.length === 0 && <p className="muted" style={{ padding: 16 }}>Aucun message trouvé.</p>}
    {hits && hits.length > 0 && <div className="muted" style={{ padding: "8px 16px 0", fontSize: 12 }}>{hits.length}{hits.length === 60 ? "+" : ""} message{hits.length > 1 ? "s" : ""}</div>}
    {(hits ?? []).map((h) => (
      <div key={h.id} onClick={() => onOpen(h.channel_id, h.id)} style={{ padding: "12px 16px", borderBottom: "1px solid var(--line)", background: "var(--surface)", cursor: "pointer" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
          <b style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.sender_label}<span className="muted" style={{ fontWeight: 400, fontSize: 12 }}> · {chatName(h.channel_id)}</span></b>
          <span className="muted" style={{ fontSize: 12 }}>{new Date(h.sent_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })}</span>
        </div>
        <div className="muted" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 2 }}>{snippet(h as unknown as Pick<Message, "kind" | "text">)}</div>
        <TagPills ids={h.message_tag.map((t) => t.tag_id)} tags={tags} />
      </div>))}
  </>);
}
