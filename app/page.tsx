"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase, type Channel, type Draft, type Message } from "@/lib/supabase";
import { enqueue, flushQueue, readQueue } from "@/lib/queue";
import ReviewCard from "@/components/ReviewCard";

type Tab = "chat" | "reports" | "business" | "settings";
type Ctx = { business_id: string; business: string; person_id: string; name: string };

export default function Home() {
  const [ctx, setCtx] = useState<Ctx | null | undefined>(undefined);
  const [tab, setTab] = useState<Tab>("chat");
  const [online, setOnline] = useState(true);
  const [pendingN, setPendingN] = useState(0);

  useEffect(() => {
    (async () => {
      const { data: s } = await supabase.auth.getSession();
      if (!s.session) return setCtx(null);
      const { data: m } = await supabase.from("member").select("business_id, person_id").eq("auth_user_id", s.session.user.id).limit(1);
      if (!m?.length) return setCtx(null);
      const [{ data: b }, { data: p }] = await Promise.all([
        supabase.from("business").select("name").eq("id", m[0].business_id).single(),
        supabase.from("person").select("display_name").eq("id", m[0].person_id).single(),
      ]);
      setCtx({ business_id: m[0].business_id, person_id: m[0].person_id, business: b?.name ?? "", name: p?.display_name ?? "" });
    })();
  }, []);

  useEffect(() => {
    const up = async () => { setOnline(true); await flushQueue(); setPendingN(readQueue().length); };
    const down = () => setOnline(false);
    setOnline(navigator.onLine); setPendingN(readQueue().length);
    window.addEventListener("online", up); window.addEventListener("offline", down);
    return () => { window.removeEventListener("online", up); window.removeEventListener("offline", down); };
  }, []);

  if (ctx === undefined) return <div className="shell"><div className="body muted">Chargement…</div></div>;
  if (ctx === null) return (
    <div className="shell"><div className="top">Business OS</div>
      <div className="body"><div className="card"><h3>Accès sur invitation</h3>
        <p className="muted">Ouvrez le lien d'invitation que le propriétaire vous a envoyé sur WhatsApp.</p></div></div></div>);

  return (
    <div className="shell">
      <div className="top"><span>{ctx.business}</span><span className="muted">{ctx.name}</span></div>
      {!online && <div className="offline">Hors ligne · vos messages partiront dès le retour du réseau{pendingN ? ` (${pendingN})` : ""}</div>}
      {tab === "chat" && <Chat ctx={ctx} online={online} onQueue={() => setPendingN(readQueue().length)} />}
      {tab === "reports" && <Reports />}
      {tab === "business" && <div className="body"><div className="card"><h3>Business</h3><p className="muted">Les chiffres approuvés apparaîtront ici (tableau de bord, étape suivante).</p></div></div>}
      {tab === "settings" && <Settings ctx={ctx} />}
      <div className="tabs">
        {(["chat", "reports", "business", "settings"] as Tab[]).map((t) => (
          <button key={t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>
            {{ chat: "Chat", reports: "Rapports", business: "Business", settings: "Réglages" }[t]}
          </button>))}
      </div>
    </div>
  );
}

function Chat({ ctx, online, onQueue }: { ctx: Ctx; online: boolean; onQueue: () => void }) {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [cur, setCur] = useState<string>("");
  const [msgs, setMsgs] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase.from("channel").select("*").order("name").then(({ data }) => {
      setChannels(data ?? []); if (data?.length) setCur((c) => c || data[0].id);
    });
  }, []);

  const load = useCallback(async (ch: string) => {
    const { data } = await supabase.from("message").select("*").eq("channel_id", ch).order("sent_at").limit(200);
    setMsgs(data ?? []);
  }, []);

  useEffect(() => {
    if (!cur) return;
    load(cur);
    const sub = supabase.channel("msg-" + cur)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "message", filter: `channel_id=eq.${cur}` },
        (p) => setMsgs((m) => (m.some((x) => x.id === (p.new as Message).id) ? m : [...m, p.new as Message])))
      .subscribe();
    return () => { supabase.removeChannel(sub); };
  }, [cur, load]);

  useEffect(() => { end.current?.scrollIntoView(); }, [msgs]);

  async function send() {
    const t = text.trim(); if (!t || !cur) return;
    setText("");
    const p = { id: crypto.randomUUID(), business_id: ctx.business_id, channel_id: cur, person_id: ctx.person_id,
      sender_label: ctx.name, text: t, sent_at: new Date().toISOString() };
    setMsgs((m) => [...m, { ...p, kind: "text", attachment: null }]);   // shown at once
    enqueue(p); onQueue();
    if (online) { await flushQueue(); onQueue(); }
  }

  return (<>
    <div className="body">
      <div className="chips">{channels.map((c) => (
        <button key={c.id} className={cur === c.id ? "on" : ""} onClick={() => setCur(c.id)}>{c.name}</button>))}</div>
      {msgs.length === 0 && <p className="muted">Aucun message. Écrivez le premier.</p>}
      {msgs.map((m) => {
        const mine = m.person_id === ctx.person_id; const ai = m.sender_label === "Assistant";
        return (<div key={m.id} className={"bubble " + (mine ? "me " : "") + (ai ? "ai" : "")}>
          {!mine && <div className="who">{m.sender_label}</div>}
          <div>{m.text}</div>
          <div className="t">{new Date(m.sent_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</div>
        </div>);
      })}
      <div ref={end} />
    </div>
    <div className="composer">
      <input placeholder="Message" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} />
      <button className="primary" onClick={send}>Envoyer</button>
    </div>
  </>);
}

function Reports() {
  const [drafts, setDrafts] = useState<(Draft & { rt?: string; src?: string; ev?: string })[]>([]);
  const [loaded, setLoaded] = useState(false);
  const load = useCallback(async () => {
    const { data: ds } = await supabase.from("draft").select("*").eq("status", "proposed").order("created_at", { ascending: false });
    const out = [];
    for (const d of ds ?? []) {
      const [{ data: rt }, { data: s }] = await Promise.all([
        supabase.from("record_type").select("label").eq("id", d.record_type_id).single(),
        supabase.from("draft_source").select("message_id").eq("draft_id", d.id).limit(1),
      ]);
      let src = "chat", ev = "";
      if (s?.length) {
        const { data: m } = await supabase.from("message").select("text, sender_label, sent_at").eq("id", s[0].message_id).single();
        if (m) { src = `${m.sender_label} · ${new Date(m.sent_at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}`; ev = m.text; }
      }
      out.push({ ...d, rt: rt?.label, src, ev });
    }
    setDrafts(out); setLoaded(true);
  }, []);
  useEffect(() => { load(); }, [load]);
  return (<div className="body">
    {loaded && drafts.length === 0 && <div className="card"><span className="pill ok">Tout est à jour</span><p className="muted">Aucun rapport à approuver.</p></div>}
    {drafts.map((d) => <ReviewCard key={d.id} d={d} title={d.rt ?? "Rapport"} source={d.src ?? ""} evidence={d.ev ?? ""} onDone={load} />)}
  </div>);
}

function Settings({ ctx }: { ctx: Ctx }) {
  const [name, setName] = useState(""); const [link, setLink] = useState(""); const [err, setErr] = useState("");
  async function invite() {
    setErr(""); setLink("");
    const { data, error } = await supabase.rpc("create_invite", { p_business: ctx.business_id, p_name: name });
    if (error) return setErr("Vous n'avez pas le droit d'inviter."); setLink(`${location.origin}/join/${data}`); setName("");
  }
  return (<div className="body">
    <div className="card"><h3>Inviter quelqu'un</h3>
      <p><input placeholder="Nom de la personne" value={name} onChange={(e) => setName(e.target.value)} /></p>
      <button className="primary big" disabled={!name.trim()} onClick={invite}>Créer le lien</button>
      {err && <p style={{ color: "var(--error)" }}>{err}</p>}
      {link && <p className="muted" style={{ wordBreak: "break-all" }}>Envoyez ce lien par WhatsApp (valable 7 jours, une seule fois) :<br /><b>{link}</b></p>}
    </div>
    <button className="big" onClick={async () => { await supabase.auth.signOut(); location.reload(); }}>Se déconnecter</button>
  </div>);
}
