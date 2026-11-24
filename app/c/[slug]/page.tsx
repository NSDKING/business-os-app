"use client";
// Public customer chat (P-017): no login. The visitor keeps a random token in this browser.
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";

type Msg = { role: "customer" | "ai" | "staff"; text: string; created_at: string };
const URL_ = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/public-chat`;

function getToken() {
  try { let t = localStorage.getItem("bos.visitor"); if (!t) { t = crypto.randomUUID() + crypto.randomUUID().slice(0, 8); localStorage.setItem("bos.visitor", t); } return t; }
  catch { return crypto.randomUUID() + crypto.randomUUID().slice(0, 8); }
}

export default function PublicChat() {
  const { slug } = useParams<{ slug: string }>();
  const [name, setName] = useState(""); const [msgs, setMsgs] = useState<Msg[]>([]); const [status, setStatus] = useState("ai");
  const [text, setText] = useState(""); const [busy, setBusy] = useState(false); const [err, setErr] = useState(""); const [missing, setMissing] = useState(false);
  const tok = useRef(""); const end = useRef<HTMLDivElement>(null);

  const call = useCallback(async (body: Record<string, unknown>) => {
    const r = await fetch(URL_, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ slug, token: tok.current, ...body }) });
    return { ok: r.ok, status: r.status, data: await r.json().catch(() => ({})) };
  }, [slug]);

  useEffect(() => { tok.current = getToken(); (async () => {
    const { ok, data } = await call({ action: "load" });
    if (!ok) return setMissing(true);
    setName(data.name); setMsgs(data.messages ?? []); setStatus(data.status ?? "ai");
  })(); }, [call]);
  // while a person is expected to answer, check for their reply
  useEffect(() => {
    if (status === "ai" || missing) return;
    const id = setInterval(async () => { const { ok, data } = await call({ action: "load" }); if (ok) { setMsgs(data.messages ?? []); setStatus(data.status ?? "ai"); } }, 8000);
    return () => clearInterval(id);
  }, [status, missing, call]);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs.length]);

  async function send() {
    const t = text.trim(); if (!t || busy) return;
    setBusy(true); setErr(""); setText("");
    setMsgs((m) => [...m, { role: "customer", text: t, created_at: new Date().toISOString() }]);
    const { ok, status: s, data } = await call({ action: "send", text: t });
    setBusy(false);
    if (!ok) { setErr(s === 429 ? "Trop de messages pour l'instant. Réessayez dans un moment." : "Message non envoyé. Réessayez."); return; }
    setMsgs(data.messages ?? []); setStatus(data.status ?? "ai");
  }

  if (missing) return <div className="shell"><div className="top">Chat</div><div className="body"><div className="card"><p className="muted">Ce chat n'est pas disponible.</p></div></div></div>;
  return (
    <div className="shell">
      <div className="top"><span>{name || "…"}</span><span className="muted" style={{ fontSize: 12, fontWeight: 400 }}>Assistant IA</span></div>
      <div className="body">
        <div className="quote" style={{ marginBottom: 10 }}>Vous parlez à un assistant IA. Il répond avec les prix et les informations de l'entreprise ; une personne confirme les commandes.</div>
        {msgs.map((m, i) => <div key={i} style={{ display: "flex", justifyContent: m.role === "customer" ? "flex-end" : "flex-start", margin: "6px 0" }}>
          <div style={{ maxWidth: "82%", padding: "8px 12px", borderRadius: 14, whiteSpace: "pre-wrap", background: m.role === "customer" ? "var(--primary, #1e6fd9)" : "var(--soft)", color: m.role === "customer" ? "#fff" : "var(--text)" }}>
            {m.role === "staff" && <div style={{ fontSize: 11, opacity: 0.7 }}>Équipe</div>}{m.text}</div></div>)}
        {busy && <div className="muted" style={{ margin: "6px 0" }}>L'assistant écrit…</div>}
        {status !== "ai" && <div className="muted" style={{ margin: "10px 0", fontSize: 13 }}>Une personne de l'équipe va vous répondre ici. Revenez sur cette page plus tard avec le même appareil.</div>}
        {err && <p style={{ color: "var(--error)" }}>{err}</p>}
        <div ref={end} />
      </div>
      <div style={{ flex: "none", display: "flex", gap: 8, padding: "10px 12px", borderTop: "1px solid var(--line)", background: "var(--bg)" }}>
        <input style={{ flex: 1 }} placeholder="Votre message" maxLength={500} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} />
        <button className="primary" disabled={busy || !text.trim()} onClick={send}>Envoyer</button>
      </div>
    </div>
  );
}
