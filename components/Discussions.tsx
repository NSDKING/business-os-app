"use client";
// Discussions clients (P-017): conversations started on the public chat link. The AI answers; a person takes over here.
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Ctx } from "./Chats";

type Thread = { id: string; customer_name: string | null; customer_phone: string | null; status: string; handoff_reason: string | null; last_at: string };
type Msg = { id: string; thread_id: string; role: string; text: string; created_at: string };
const ST: Record<string, string> = { ai: "IA", needs_human: "À traiter", human: "En cours", closed: "Clos" };
const when = (iso: string) => new Date(iso).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });

export default function Discussions({ ctx }: { ctx: Ctx }) {
  const [threads, setThreads] = useState<Thread[]>([]); const [open, setOpen] = useState(""); const [msgs, setMsgs] = useState<Msg[]>([]);
  const [can, setCan] = useState(false); const [admin, setAdmin] = useState(false); const [text, setText] = useState(""); const [err, setErr] = useState("");
  const [cfg, setCfg] = useState({ on: false, slug: "", profile: "" }); const [saved, setSaved] = useState("");

  const load = useCallback(async () => {
    const [{ data: th }, { data: bz }, { data: me }] = await Promise.all([
      supabase.from("customer_thread").select("id,customer_name,customer_phone,status,handoff_reason,last_at").eq("business_id", ctx.business_id).order("last_at", { ascending: false }).limit(50),
      supabase.from("business").select("public_chat_enabled,public_slug,public_profile").eq("id", ctx.business_id).single(),
      supabase.from("member").select("id").eq("business_id", ctx.business_id).eq("person_id", ctx.person_id).limit(1),
    ]);
    setThreads((th as Thread[]) ?? []);
    if (bz) setCfg({ on: bz.public_chat_enabled, slug: bz.public_slug ?? "", profile: bz.public_profile ?? "" });
    if (me?.[0]) {
      const { data: g } = await supabase.from("role_grant").select("permission").eq("member_id", me[0].id).in("permission", ["approve", "appoint"]).is("revoked_at", null);
      setCan(!!g?.length); setAdmin(!!g?.some((x) => x.permission === "appoint"));
    }
  }, [ctx.business_id, ctx.person_id]);
  const loadMsgs = useCallback(async (id: string) => {
    const { data } = await supabase.from("customer_message").select("id,thread_id,role,text,created_at").eq("thread_id", id).order("created_at");
    setMsgs((data as Msg[]) ?? []);
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const sub = supabase.channel("cust-" + ctx.business_id)
      .on("postgres_changes", { event: "*", schema: "public", table: "customer_message", filter: `business_id=eq.${ctx.business_id}` }, () => { load(); if (open) loadMsgs(open); })
      .subscribe();
    return () => { supabase.removeChannel(sub); };
  }, [ctx.business_id, load, loadMsgs, open]);

  async function reply() {
    const t = text.trim(); if (!t) return; setErr("");
    const { error } = await supabase.rpc("staff_reply", { p_thread: open, p_text: t });
    if (error) return setErr("Impossible d'envoyer."); setText(""); loadMsgs(open); load();
  }
  async function setStatus(s: "ai" | "closed") { await supabase.rpc("set_thread_status", { p_thread: open, p_status: s }); load(); }
  async function saveCfg() {
    setSaved("");
    const { error } = await supabase.rpc("set_public_chat", { p_business: ctx.business_id, p_enabled: cfg.on, p_slug: cfg.slug.trim() || null, p_profile: cfg.profile });
    setSaved(error ? "Échec (nom de lien invalide ou déjà pris)" : "Enregistré");
  }

  const link = cfg.on && cfg.slug ? `${location.origin}/c/${cfg.slug}` : "";
  const cur = threads.find((t) => t.id === open);
  if (open && cur) return (<div className="body">
    <button style={{ minHeight: 36, marginBottom: 8 }} onClick={() => { setOpen(""); setMsgs([]); }}>← Retour</button>
    <div className="card">
      <b>{cur.customer_name || "Client"}</b> <span className="pill pending">{ST[cur.status]}</span>
      <div className="muted" style={{ fontSize: 12 }}>{cur.customer_phone || "téléphone inconnu"}{cur.handoff_reason ? ` · ${cur.handoff_reason}` : ""}</div>
      {msgs.map((m) => <div key={m.id} style={{ margin: "8px 0", textAlign: m.role === "customer" ? "left" : "right" }}>
        <div className="muted" style={{ fontSize: 11 }}>{m.role === "customer" ? "Client" : m.role === "ai" ? "Assistant IA" : "Équipe"} · {when(m.created_at)}</div>
        <div style={{ display: "inline-block", maxWidth: "90%", padding: "6px 10px", borderRadius: 12, background: m.role === "customer" ? "var(--soft)" : "var(--soft)", whiteSpace: "pre-wrap", textAlign: "left" }}>{m.text}</div></div>)}
      {can && <>
        <p><input placeholder="Votre réponse au client" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && reply()} /></p>
        {err && <p style={{ color: "var(--error)" }}>{err}</p>}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="primary" disabled={!text.trim()} onClick={reply}>Répondre</button>
          {cur.status !== "ai" && <button onClick={() => setStatus("ai")}>Rendre à l'IA</button>}
          {cur.status !== "closed" && <button onClick={() => setStatus("closed")}>Clore</button>}
        </div></>}
    </div></div>);

  return (<div className="body">
    {admin && <div className="card"><h3 style={{ marginBottom: 2 }}>Chat public pour vos clients</h3>
      <div className="muted" style={{ marginBottom: 8 }}>Un lien que vos clients ouvrent sans compte. L'assistant IA répond avec vos prix, votre stock et le texte ci-dessous ; une personne confirme les commandes.</div>
      <label style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}><input type="checkbox" style={{ width: 22, minHeight: 22 }} checked={cfg.on} onChange={(e) => setCfg({ ...cfg, on: e.target.checked })} />Activer le chat public</label>
      <p><input placeholder="Nom du lien (lettres, chiffres, tirets)" value={cfg.slug} onChange={(e) => setCfg({ ...cfg, slug: e.target.value.toLowerCase() })} /></p>
      <p><textarea rows={5} style={{ width: "100%" }} placeholder="Horaires, adresse, livraison, paiement, comment commander…" value={cfg.profile} onChange={(e) => setCfg({ ...cfg, profile: e.target.value })} /></p>
      <button onClick={saveCfg}>Enregistrer</button> {saved && <b>{saved}</b>}
      {link && <p className="muted" style={{ wordBreak: "break-all" }}>Lien à partager (WhatsApp, Facebook, QR code sur vos factures) :<br /><b>{link}</b></p>}
    </div>}
    <div className="card"><h3 style={{ marginBottom: 6 }}>Discussions clients</h3>
      {threads.length === 0 && <p className="muted">Aucune discussion pour l'instant.</p>}
      {threads.map((t, i) => <div key={t.id} onClick={() => { setOpen(t.id); loadMsgs(t.id); }} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "10px 0", borderTop: i ? "1px solid var(--line)" : undefined, cursor: "pointer" }}>
        <span><b>{t.customer_name || "Client"}</b><div className="muted" style={{ fontSize: 12 }}>{t.handoff_reason || t.customer_phone || when(t.last_at)}</div></span>
        <span className={"pill " + (t.status === "needs_human" ? "pending" : "")} style={{ alignSelf: "center" }}>{ST[t.status]}</span></div>)}
    </div></div>);
}
