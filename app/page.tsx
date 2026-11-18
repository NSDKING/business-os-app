"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase, type Channel, type Draft, type Message } from "@/lib/supabase";
import { enqueue, flushQueue, readQueue } from "@/lib/queue";
import ReviewCard from "@/components/ReviewCard";
import Chats from "@/components/Chats";
import Avatar from "@/components/Avatar";
import { toAvatar } from "@/lib/image";

type Tab = "chat" | "reports" | "business" | "settings";
type Ctx = { business_id: string; business: string; person_id: string; name: string };

export default function Home() {
  const [ctx, setCtx] = useState<Ctx | null | undefined>(undefined);
  const [tab, setTab] = useState<Tab>("chat");
  const [online, setOnline] = useState(true);
  const [pendingN, setPendingN] = useState(0);
  const [full, setFull] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

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
      const { data: me } = await supabase.from("member").select("id").eq("person_id", m[0].person_id).limit(1);
      if (me?.length) {
        const { data: g } = await supabase.from("role_grant").select("id").eq("member_id", me[0].id).eq("permission", "appoint").is("revoked_at", null).limit(1);
        setIsAdmin(!!g?.length);
      }
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
      {!(tab === "chat" && full) && tab !== "chat" && <div className="top"><span>{ctx.business}</span><span className="muted">{ctx.name}</span></div>}
      {!online && <div className="offline">Hors ligne · vos messages partiront dès le retour du réseau{pendingN ? ` (${pendingN})` : ""}</div>}
      {tab === "chat" && <Chats ctx={ctx} online={online} isAdmin={isAdmin} onQueue={() => setPendingN(readQueue().length)} onFull={setFull} />}
      {tab === "reports" && <Reports />}
      {tab === "business" && <div className="body"><div className="card"><h3>Business</h3><p className="muted">Les chiffres approuvés apparaîtront ici (tableau de bord, étape suivante).</p></div></div>}
      {tab === "settings" && <Settings ctx={ctx} />}
      {!(tab === "chat" && full) && <div className="tabs">
        {(["chat", "reports", "business", "settings"] as Tab[]).map((t) => (
          <button key={t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>
            {{ chat: "Chat", reports: "Rapports", business: "Business", settings: "Réglages" }[t]}
          </button>))}
      </div>}
    </div>
  );
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
  const [isAdmin, setIsAdmin] = useState(false);
  const [me, setMe] = useState<{ avatar: string | null }>({ avatar: null });
  const [channels, setChannels] = useState<Channel[]>([]);
  const [team, setTeam] = useState<{ member_id: string; name: string; avatar: string | null; chans: Set<string> }[]>([]);
  const [saved, setSaved] = useState("");

  const loadTeam = useCallback(async () => {
    const [{ data: ms }, { data: ps }, { data: cm }, { data: cs }, { data: me2 }] = await Promise.all([
      supabase.from("member").select("id, person_id, active"),
      supabase.from("person").select("id, display_name, avatar"),
      supabase.from("channel_member").select("channel_id, member_id"),
      supabase.from("channel").select("*").order("name"),
      supabase.from("member").select("id").eq("person_id", ctx.person_id).limit(1),
    ]);
    setChannels(cs ?? []);
    const pm = new Map((ps ?? []).map((p) => [p.id, p]));
    setMe({ avatar: pm.get(ctx.person_id)?.avatar ?? null });
    const myMember = me2?.[0]?.id;
    if (myMember) {
      const { data: g } = await supabase.from("role_grant").select("id").eq("member_id", myMember).eq("permission", "appoint").is("revoked_at", null).limit(1);
      setIsAdmin(!!g?.length);
    }
    setTeam((ms ?? []).filter((m) => m.active).map((m) => ({
      member_id: m.id, name: pm.get(m.person_id)?.display_name ?? "?", avatar: pm.get(m.person_id)?.avatar ?? null,
      chans: new Set((cm ?? []).filter((c) => c.member_id === m.id).map((c) => c.channel_id)),
    })));
  }, [ctx.person_id]);
  useEffect(() => { loadTeam(); }, [loadTeam]);

  async function invite() {
    setErr(""); setLink("");
    const { data, error } = await supabase.rpc("create_invite", { p_business: ctx.business_id, p_name: name });
    if (error) return setErr("Vous n'avez pas le droit d'inviter.");
    setLink(`${location.origin}/join/${data}`); setName(""); loadTeam();
  }
  async function toggle(member_id: string, chan: string, on: boolean) {
    const row = team.find((t) => t.member_id === member_id)!;
    const next = new Set(row.chans); if (on) next.add(chan); else next.delete(chan);
    setTeam((tm) => tm.map((t) => (t.member_id === member_id ? { ...t, chans: next } : t)));
    const { error } = await supabase.rpc("set_channel_access", { p_member: member_id, p_channels: [...next] });
    setSaved(error ? "Échec de l'enregistrement" : "Enregistré"); if (error) loadTeam();
  }
  async function pickPhoto(f: File | undefined) {
    if (!f) return;
    const data = await toAvatar(f);
    const { error } = await supabase.rpc("set_my_avatar", { p_business: ctx.business_id, p_avatar: data });
    if (!error) setMe({ avatar: data });
  }

  return (<div className="body">
    <div className="card" style={{ display: "flex", gap: 14, alignItems: "center" }}>
      <Avatar name={ctx.name} src={me.avatar} size={64} />
      <div style={{ flex: 1 }}>
        <b>{ctx.name}</b>
        <div><label className="muted" style={{ textDecoration: "underline", cursor: "pointer" }}>
          Changer ma photo<input type="file" accept="image/*" hidden onChange={(e) => pickPhoto(e.target.files?.[0])} />
        </label></div>
      </div>
    </div>
    {isAdmin && (<>
      <div className="card"><h3>Équipe et accès</h3>
        <p className="muted">Cochez les groupes que chaque personne peut voir et où elle peut écrire. {saved && <b>{saved}</b>}</p>
        {team.map((t) => (
          <div key={t.member_id} style={{ padding: "10px 0", borderTop: "1px solid var(--line)" }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}><Avatar name={t.name} src={t.avatar} size={36} /><b>{t.name}</b></div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
              {channels.map((c) => (
                <label key={c.id} className={"chips"} style={{ display: "inline-flex", gap: 6, alignItems: "center", minHeight: 40 }}>
                  <input type="checkbox" style={{ width: 22, minHeight: 22 }} checked={t.chans.has(c.id)} onChange={(e) => toggle(t.member_id, c.id, e.target.checked)} />{c.name}
                </label>))}
            </div>
          </div>))}
      </div>
      <div className="card"><h3>Inviter quelqu'un</h3>
        <p><input placeholder="Nom de la personne" value={name} onChange={(e) => setName(e.target.value)} /></p>
        <button className="primary big" disabled={!name.trim()} onClick={invite}>Créer le lien</button>
        {err && <p style={{ color: "var(--error)" }}>{err}</p>}
        {link && <p className="muted" style={{ wordBreak: "break-all" }}>Envoyez ce lien par WhatsApp (valable 7 jours, une seule fois). La personne ne verra aucun groupe tant que vous ne les avez pas cochés ci-dessus :<br /><b>{link}</b></p>}
      </div>
    </>)}
    <button className="big" onClick={async () => { await supabase.auth.signOut(); location.reload(); }}>Se déconnecter</button>
  </div>);
}
