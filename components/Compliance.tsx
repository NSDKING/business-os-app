"use client";
// The owner's audited access to other people's private chats (T-015, P-012): a written reason, 24 hours, a notice to both people, a log.
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type PC = { channel_id: string; people: string; last_at: string | null; access_id: string | null; expires_at: string | null };
type Hist = { id: string; people: string; reason: string; opened_at: string; expires_at: string; reads: number };
type Msg = { id: string; sent_at: string; sender_label: string; kind: string; text: string };
const when = (iso: string) => new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export default function Compliance({ businessId }: { businessId: string }) {
  const [chats, setChats] = useState<PC[]>([]); const [hist, setHist] = useState<Hist[]>([]);
  const [ask, setAsk] = useState<string | null>(null); const [reason, setReason] = useState(""); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const [view, setView] = useState<{ people: string; msgs: Msg[] } | null>(null); const [show, setShow] = useState(false);
  const load = useCallback(async () => {
    const [{ data: a }, { data: h }] = await Promise.all([supabase.rpc("private_chats", { p_business: businessId }), supabase.rpc("private_access_history", { p_business: businessId })]);
    setChats((a as PC[]) ?? []); setHist((h as Hist[]) ?? []);
  }, [businessId]);
  useEffect(() => { load(); }, [load]);
  async function request(channel: string) {
    setBusy(true); setErr("");
    const { error } = await supabase.rpc("request_private_access", { p_channel: channel, p_reason: reason });
    setBusy(false);
    if (error) return setErr("Impossible : le motif doit faire au moins 10 caractères.");
    setAsk(null); setReason(""); load();
  }
  async function read(c: PC) {
    const { data, error } = await supabase.rpc("private_chat_messages", { p_access: c.access_id });
    if (error) { setErr("L'accès a expiré."); load(); return; }
    setView({ people: c.people, msgs: (data as Msg[]) ?? [] }); load();
  }
  return (
    <div className="card"><h3>Accès aux discussions privées</h3>
      <p className="muted">Les discussions privées restent privées. En cas de fraude ou de litige, vous pouvez ouvrir l'accès pour 24 h avec un motif écrit. Les deux personnes en sont informées dans la discussion, et chaque lecture est enregistrée.</p>
      {!show ? <button onClick={() => setShow(true)}>Afficher les discussions privées</button> : chats.length === 0 ? <p className="muted">Aucune discussion privée entre d'autres personnes.</p> : chats.map((c) => (
        <div key={c.channel_id} style={{ padding: "10px 0", borderTop: "1px solid var(--line)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
            <span><b>{c.people}</b>{c.last_at && <div className="muted" style={{ fontSize: 13 }}>Dernier message : {when(c.last_at)}</div>}</span>
            {c.access_id ? <button className="primary" style={{ minHeight: 40 }} onClick={() => read(c)}>Lire (jusqu'à {new Date(c.expires_at!).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })})</button>
              : <button style={{ minHeight: 40 }} onClick={() => { setAsk(ask === c.channel_id ? null : c.channel_id); setErr(""); }}>Demander l'accès</button>}
          </div>
          {ask === c.channel_id && <div style={{ marginTop: 8 }}>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Motif (obligatoire, visible par les deux personnes)" rows={3} style={{ width: "100%" }} />
            <div className="row" style={{ marginTop: 6 }}><button className="primary" disabled={busy || reason.trim().length < 10} onClick={() => request(c.channel_id)}>Ouvrir l'accès pour 24 h</button><button onClick={() => setAsk(null)}>Annuler</button></div>
          </div>}
        </div>))}
      {err && <p style={{ color: "var(--error)" }}>{err}</p>}
      {hist.length > 0 && <div style={{ marginTop: 12 }}>
        <div className="muted" style={{ fontWeight: 600 }}>Journal des accès</div>
        {hist.map((h) => <div key={h.id} style={{ padding: "8px 0", borderTop: "1px solid var(--line)", fontSize: 14 }}>
          <b>{h.people}</b> · {when(h.opened_at)}<div className="muted">Motif : {h.reason} · {h.reads} lecture{h.reads > 1 ? "s" : ""} · {new Date(h.expires_at) > new Date() ? "ouvert" : "fermé"}</div></div>)}
      </div>}
      {view && <div onClick={() => setView(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 70, display: "flex", alignItems: "flex-end" }}>
        <div onClick={(e) => e.stopPropagation()} style={{ background: "var(--surface)", width: "100%", maxHeight: "88%", overflowY: "auto", borderRadius: "16px 16px 0 0", padding: 16 }}>
          <b>{view.people}</b><div className="muted" style={{ marginBottom: 8 }}>Lecture seule · cet accès est enregistré</div>
          {view.msgs.map((m) => <div key={m.id} style={{ padding: "6px 0", borderTop: "1px solid var(--line)" }}>
            <span className="muted" style={{ fontSize: 12 }}>{m.sender_label} · {when(m.sent_at)}</span><div>{m.text}</div></div>)}
          <p><button onClick={() => setView(null)}>Fermer</button></p>
        </div></div>}
    </div>);
}
