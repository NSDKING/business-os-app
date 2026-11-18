"use client";
import { toPhoto, startRecording, recorderSupported, mediaUrl, MAX_VOICE_SECONDS, type Recording } from "@/lib/media";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase, type Message } from "@/lib/supabase";
import { enqueue, flushQueue } from "@/lib/queue";
import Avatar from "./Avatar";

export type Ctx = { business_id: string; business: string; person_id: string; name: string };
type Item = {
  channel_id: string; kind: "group" | "direct"; name: string; other_person: string | null; other_name: string | null;
  other_avatar: string | null; last_kind: string | null; last_text: string | null; last_at: string | null;
  last_sender: string | null; unread: number;
};
type Person = { name: string; avatar: string | null };
type Screen = { s: "list" } | { s: "new" } | { s: "convo"; id: string } | { s: "info"; id: string };

const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div style={{ padding: "10px 16px", background: "#fff", borderBottom: "1px solid var(--line)", position: "relative" }}>
      <span aria-hidden style={{ position: "absolute", left: 28, top: 21, color: "var(--muted)" }}>🔍</span>
      <input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        style={{ paddingLeft: 38, borderRadius: 22, background: "var(--bg)" }} />
    </div>);
}
const title = (i: Item) => (i.kind === "direct" ? i.other_name ?? "?" : i.name);
function when(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso), n = new Date();
  if (d.toDateString() === n.toDateString()) return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  const y = new Date(n.getTime() - 86400000);
  if (d.toDateString() === y.toDateString()) return "Hier";
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
}
function preview(i: Item) {
  if (!i.last_at) return "Aucun message";
  const body = i.last_kind === "image" ? "📷 Photo" : i.last_kind === "audio" ? "🎤 Message vocal" : i.last_text ?? "";
  return i.kind === "group" && i.last_sender ? `${i.last_sender.split(" ")[0]} : ${body}` : body;
}

export default function Chats({ ctx, online, isAdmin, onQueue, onFull }: {
  ctx: Ctx; online: boolean; isAdmin: boolean; onQueue: () => void; onFull: (full: boolean) => void;
}) {
  const [screen, setScreen] = useState<Screen>({ s: "list" });
  const [items, setItems] = useState<Item[]>([]);
  const [people, setPeople] = useState<Record<string, Person>>({});
  const [members, setMembers] = useState<{ member_id: string; person_id: string }[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [q, setQ] = useState("");
  const [searchErr, setSearchErr] = useState("");

  const loadList = useCallback(async () => {
    const { data } = await supabase.rpc("chat_list", { p_business: ctx.business_id });
    setItems((data as Item[]) ?? []); setLoaded(true);
  }, [ctx.business_id]);

  useEffect(() => {
    loadList();
    supabase.from("person").select("id, display_name, avatar").then(({ data }) => {
      const m: Record<string, Person> = {};
      for (const p of data ?? []) m[p.id] = { name: p.display_name, avatar: p.avatar };
      setPeople(m);
    });
    supabase.from("member").select("id, person_id, active").then(({ data }) =>
      setMembers((data ?? []).filter((m) => m.active).map((m) => ({ member_id: m.id, person_id: m.person_id }))));
    const sub = supabase.channel("list")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "message" }, () => loadList())
      .subscribe();
    return () => { supabase.removeChannel(sub); };
  }, [loadList]);

  const go = (s: Screen) => { setScreen(s); onFull(s.s !== "list"); if (s.s === "list") loadList(); };
  const cur = screen.s === "convo" || screen.s === "info" ? items.find((i) => i.channel_id === screen.id) : undefined;

  if (screen.s === "new") return <NewChat ctx={ctx} isAdmin={isAdmin} people={people} members={members}
    onBack={() => go({ s: "list" })} onOpen={(id) => { loadList(); go({ s: "convo", id }); }} />;
  if ((screen.s === "convo" || screen.s === "info") && cur) {
    return screen.s === "info"
      ? <GroupInfo item={cur} people={people} onBack={() => go({ s: "convo", id: cur.channel_id })} onRenamed={loadList} />
      : <Convo ctx={ctx} item={cur} people={people} online={online} onQueue={onQueue}
          onBack={() => go({ s: "list" })} onInfo={() => cur.kind === "group" && go({ s: "info", id: cur.channel_id })} />;
  }

  return (<>
    <div className="top"><span>Discussions</span>
      <button className="primary" style={{ minWidth: 44 }} onClick={() => go({ s: "new" })} aria-label="Nouvelle discussion">＋</button></div>
    <SearchBox value={q} onChange={setQ} placeholder="Rechercher une personne ou un groupe" />
    <div className="body" style={{ padding: 0 }}>
      {loaded && items.length === 0 && !q && <p className="muted" style={{ padding: 16 }}>Aucune discussion. Touchez ＋ ou cherchez une personne.</p>}
      {(() => {
        const nq = norm(q.trim());
        const shown = nq ? items.filter((i) => norm(title(i)).includes(nq) || norm(i.last_text ?? "").includes(nq)) : items;
        const haveDm = new Set(items.filter((i) => i.kind === "direct").map((i) => i.other_person));
        const found = nq ? members.filter((m) => m.person_id !== ctx.person_id && !haveDm.has(m.person_id) && norm(people[m.person_id]?.name ?? "").includes(nq)) : [];
        return (<>
          {nq && shown.length > 0 && <div className="muted" style={{ padding: "10px 16px 4px", fontWeight: 600 }}>Discussions</div>}
          {shown.map((i) => (
            <div key={i.channel_id} onClick={() => go({ s: "convo", id: i.channel_id })}
              style={{ display: "flex", gap: 12, padding: "12px 16px", borderBottom: "1px solid var(--line)", background: "#fff", cursor: "pointer", alignItems: "center" }}>
              <Avatar name={title(i)} src={i.kind === "direct" ? i.other_avatar : null} size={52} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <b style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title(i)}</b>
                  <span className="muted" style={{ fontSize: 12, color: i.unread ? "var(--primary)" : undefined }}>{when(i.last_at)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginTop: 2 }}>
                  <span className="muted" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{preview(i)}</span>
                  {i.unread > 0 && <span style={{ background: "var(--primary)", color: "#fff", borderRadius: 12, minWidth: 22, height: 22, padding: "0 6px", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{i.unread}</span>}
                </div>
              </div>
            </div>))}
          {found.length > 0 && <div className="muted" style={{ padding: "10px 16px 4px", fontWeight: 600 }}>Personnes</div>}
          {found.map((m) => (
            <div key={m.member_id} onClick={async () => {
                setSearchErr("");
                const { data, error } = await supabase.rpc("start_direct", { p_business: ctx.business_id, p_other: m.member_id });
                if (error) return setSearchErr("Impossible d'ouvrir la discussion.");
                setQ(""); await loadList(); go({ s: "convo", id: data as string });
              }}
              style={{ display: "flex", gap: 12, padding: "12px 16px", borderBottom: "1px solid var(--line)", background: "#fff", cursor: "pointer", alignItems: "center" }}>
              <Avatar name={people[m.person_id]?.name ?? "?"} src={people[m.person_id]?.avatar} size={44} />
              <span style={{ flex: 1 }}>{people[m.person_id]?.name}</span><span className="muted" style={{ fontSize: 13 }}>Écrire</span>
            </div>))}
          {nq && shown.length === 0 && found.length === 0 && <p className="muted" style={{ padding: 16 }}>Aucun résultat pour « {q} ».</p>}
          {searchErr && <p style={{ color: "var(--error)", padding: 16 }}>{searchErr}</p>}
        </>);
      })()}
    </div>
  </>);
}

function MediaView({ m }: { m: Message }) {
  const [url, setUrl] = useState<string | null>(null); const [big, setBig] = useState(false); const [fail, setFail] = useState(false);
  useEffect(() => { let on = true; if (m.attachment) mediaUrl(m.attachment).then((u) => { if (!on) return; if (u) setUrl(u); else setFail(true); }); return () => { on = false; }; }, [m.attachment]);
  if (!m.attachment) return null;
  if (fail) return <div className="muted">Fichier indisponible</div>;
  if (!url) return <div className="muted" style={{ padding: "20px 0" }}>Chargement…</div>;
  if (m.kind === "audio") return <audio controls preload="none" src={url} style={{ width: 220, maxWidth: "100%" }} />;
  return (<>
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={url} alt="Photo" onClick={() => setBig(true)} style={{ display: "block", maxWidth: "100%", maxHeight: 280, borderRadius: 8, cursor: "pointer" }} />
    {big && (/* eslint-disable-next-line @next/next/no-img-element */
      <div onClick={() => setBig(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.92)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <img src={url} alt="Photo" style={{ maxWidth: "100%", maxHeight: "100%" }} />
      </div>)}
  </>);
}

function Convo({ ctx, item, people, online, onQueue, onBack, onInfo }: {
  ctx: Ctx; item: Item; people: Record<string, Person>; online: boolean; onQueue: () => void; onBack: () => void; onInfo: () => void;
}) {
  const [msgs, setMsgs] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const end = useRef<HTMLDivElement>(null);
  const id = item.channel_id;
  const rec = useRef<Recording | null>(null);
  const [recording, setRecording] = useState<number | null>(null); // seconds so far, null = not recording
  const [note, setNote] = useState("");

  useEffect(() => {
    supabase.from("message").select("*").eq("channel_id", id).order("sent_at").limit(300).then(({ data }) => { setMsgs(data ?? []); supabase.rpc("mark_read", { p_channel: id }); });
    const sub = supabase.channel("msg-" + id)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "message", filter: `channel_id=eq.${id}` },
        (p) => { setMsgs((m) => (m.some((x) => x.id === (p.new as Message).id) ? m : [...m, p.new as Message])); supabase.rpc("mark_read", { p_channel: id }); })
      .subscribe();
    return () => { supabase.removeChannel(sub); };
  }, [id]);
  useEffect(() => { end.current?.scrollIntoView(); }, [msgs]);

  async function send() {
    const t = text.trim(); if (!t) return; setText("");
    const p = { id: crypto.randomUUID(), business_id: ctx.business_id, channel_id: id, person_id: ctx.person_id, sender_label: ctx.name, text: t, sent_at: new Date().toISOString() };
    setMsgs((m) => [...m, { ...p, kind: "text", attachment: null }]);
    enqueue(p); onQueue();
    if (online) { await flushQueue(); onQueue(); }
  }

  async function sendMedia(kind: "image" | "audio", media: string, seconds?: number) {
    const p = { id: crypto.randomUUID(), business_id: ctx.business_id, channel_id: id, person_id: ctx.person_id, sender_label: ctx.name, text: "", sent_at: new Date().toISOString(), kind, media, seconds };
    setMsgs((m) => [...m, { ...p, kind, attachment: media, text: "" }]);
    enqueue(p); onQueue();
    if (online) { await flushQueue(); onQueue(); }
  }
  async function pickPhoto(f: File | undefined) {
    if (!f) return; setNote("");
    try { await sendMedia("image", await toPhoto(f)); } catch { setNote("Impossible de lire cette photo."); }
  }
  async function startVoice() {
    setNote("");
    try { rec.current = await startRecording(); } catch { return setNote("Autorisez le micro dans votre navigateur pour envoyer un message vocal."); }
    setRecording(0);
  }
  async function finishVoice(send: boolean) {
    const r = rec.current; rec.current = null; setRecording(null); if (!r) return;
    if (!send) return r.cancel();
    const out = await r.stop(); if (out) await sendMedia("audio", out.dataUrl, out.seconds);
  }
  useEffect(() => {
    if (recording === null) return;
    if (recording >= MAX_VOICE_SECONDS) { finishVoice(true); return; }
    const t = setTimeout(() => setRecording((x) => (x === null ? x : x + 1)), 1000);
    return () => clearTimeout(t);
  }, [recording]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { rec.current?.cancel(); }, []);

  const name = title(item);
  return (<>
    <div className="top" style={{ justifyContent: "flex-start", gap: 10 }}>
      <button onClick={onBack} aria-label="Retour" style={{ border: 0, background: "none", fontSize: 22, minWidth: 40, padding: 0 }}>←</button>
      <div onClick={onInfo} style={{ display: "flex", gap: 10, alignItems: "center", flex: 1, cursor: item.kind === "group" ? "pointer" : "default" }}>
        <Avatar name={name} src={item.kind === "direct" ? item.other_avatar : null} size={38} />
        <div><div>{name}</div>{item.kind === "group" && <div className="muted" style={{ fontSize: 12, fontWeight: 400 }}>Touchez pour les infos du groupe</div>}</div>
      </div>
    </div>
    <div className="body">
      {msgs.length === 0 && <p className="muted">Aucun message. Écrivez le premier.</p>}
      {msgs.map((m) => {
        const mine = m.person_id === ctx.person_id; const ai = m.sender_label === "Assistant";
        const who = (m.person_id && people[m.person_id]) || null; const n = who?.name ?? m.sender_label;
        return (<div key={m.id} style={{ display: "flex", gap: 8, alignItems: "flex-end", flexDirection: mine ? "row-reverse" : "row" }}>
          <Avatar name={ai ? "IA" : n} src={who?.avatar} size={32} />
          <div className={"bubble " + (mine ? "me " : "") + (ai ? "ai" : "")} style={{ margin: "6px 0" }}>
            <div className="who">{ai ? "Assistant" : n}</div>{(m.kind === "image" || m.kind === "audio") ? <MediaView m={m} /> : <div>{m.text}</div>}
            <div className="t">{new Date(m.sent_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</div>
          </div></div>);
      })}
      <div ref={end} />
    </div>
    {note && <div className="muted" style={{ padding: "6px 16px", background: "#fff", color: "var(--error)" }}>{note}</div>}
    {recording !== null ? (
      <div className="composer" style={{ alignItems: "center" }}>
        <button onClick={() => finishVoice(false)} aria-label="Annuler" style={{ minWidth: 48 }}>✕</button>
        <div style={{ flex: 1, textAlign: "center", fontWeight: 600 }}><span style={{ color: "var(--error)" }}>●</span> {Math.floor(recording / 60)}:{String(recording % 60).padStart(2, "0")}</div>
        <button className="primary" onClick={() => finishVoice(true)}>Envoyer</button>
      </div>
    ) : (
      <div className="composer" style={{ alignItems: "center" }}>
        <label aria-label="Envoyer une photo" style={{ fontSize: 24, minWidth: 44, minHeight: 44, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>📷
          <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => { pickPhoto(e.target.files?.[0]); e.target.value = ""; }} />
        </label>
        <input placeholder="Message" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} />
        {text.trim() || !recorderSupported()
          ? <button className="primary" onClick={send}>Envoyer</button>
          : <button className="primary" onClick={startVoice} aria-label="Message vocal">🎤</button>}
      </div>
    )}
  </>);
}

function GroupInfo({ item, people, onBack, onRenamed }: { item: Item; people: Record<string, Person>; onBack: () => void; onRenamed: () => void }) {
  const [name, setName] = useState(item.name); const [msg, setMsg] = useState("");
  const [who, setWho] = useState<string[]>([]);
  useEffect(() => {
    (async () => {
      const { data: cm } = await supabase.from("channel_member").select("member_id").eq("channel_id", item.channel_id);
      const ids = (cm ?? []).map((c) => c.member_id);
      if (!ids.length) return setWho([]);
      const { data: ms } = await supabase.from("member").select("person_id").in("id", ids);
      setWho((ms ?? []).map((m) => m.person_id));
    })();
  }, [item.channel_id]);
  async function save() {
    setMsg("");
    const { error } = await supabase.rpc("rename_channel", { p_channel: item.channel_id, p_name: name });
    if (error) return setMsg("Ce nom est déjà pris ou invalide.");
    setMsg("Nom enregistré"); onRenamed();
  }
  return (<>
    <div className="top" style={{ justifyContent: "flex-start", gap: 10 }}>
      <button onClick={onBack} aria-label="Retour" style={{ border: 0, background: "none", fontSize: 22, minWidth: 40, padding: 0 }}>←</button><span>Infos du groupe</span>
    </div>
    <div className="body">
      <div className="card" style={{ textAlign: "center" }}>
        <div style={{ display: "flex", justifyContent: "center" }}><Avatar name={name} size={84} /></div>
        <p><input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} style={{ textAlign: "center", fontWeight: 700 }} /></p>
        <button className="primary big" disabled={!name.trim() || name.trim() === item.name} onClick={save}>Enregistrer le nom</button>
        {msg && <p className="muted">{msg}</p>}
      </div>
      <div className="card"><b>{who.length} participant{who.length > 1 ? "s" : ""}</b>
        {who.map((pid) => (
          <div key={pid} style={{ display: "flex", gap: 10, alignItems: "center", padding: "10px 0", borderTop: "1px solid var(--line)" }}>
            <Avatar name={people[pid]?.name ?? "?"} src={people[pid]?.avatar} size={40} /><span>{people[pid]?.name ?? "?"}</span>
          </div>))}
        <p className="muted">Les administrateurs voient tous les groupes. Ils choisissent qui est dans chaque groupe dans Réglages.</p>
      </div>
    </div>
  </>);
}

function NewChat({ ctx, isAdmin, people, members, onBack, onOpen }: {
  ctx: Ctx; isAdmin: boolean; people: Record<string, Person>; members: { member_id: string; person_id: string }[];
  onBack: () => void; onOpen: (id: string) => void;
}) {
  const [group, setGroup] = useState(false); const [name, setName] = useState(""); const [pick, setPick] = useState<Set<string>>(new Set());
  const [err, setErr] = useState(""); const [q, setQ] = useState("");
  const others = members.filter((m) => m.person_id !== ctx.person_id && norm(people[m.person_id]?.name ?? "").includes(norm(q.trim())));
  async function direct(member_id: string) {
    const { data, error } = await supabase.rpc("start_direct", { p_business: ctx.business_id, p_other: member_id });
    if (error) return setErr("Impossible d'ouvrir la discussion."); onOpen(data as string);
  }
  async function createGroup() {
    setErr("");
    const { data, error } = await supabase.rpc("create_group", { p_business: ctx.business_id, p_name: name, p_members: [...pick] });
    if (error) return setErr("Nom déjà pris ou invalide."); onOpen(data as string);
  }
  return (<>
    <div className="top" style={{ justifyContent: "flex-start", gap: 10 }}>
      <button onClick={onBack} aria-label="Retour" style={{ border: 0, background: "none", fontSize: 22, minWidth: 40, padding: 0 }}>←</button>
      <span>{group ? "Nouveau groupe" : "Nouvelle discussion"}</span>
    </div>
    <SearchBox value={q} onChange={setQ} placeholder="Rechercher une personne" />
    <div className="body" style={{ padding: 0 }}>
      {!group && isAdmin && !q && (
        <div onClick={() => setGroup(true)} style={{ display: "flex", gap: 12, padding: "12px 16px", background: "#fff", borderBottom: "1px solid var(--line)", alignItems: "center", cursor: "pointer" }}>
          <div style={{ width: 48, height: 48, borderRadius: "50%", background: "var(--primary)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>👥</div><b>Nouveau groupe</b>
        </div>)}
      {group && <div style={{ padding: 16, background: "#fff" }}>
        <input placeholder="Nom du groupe" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
        <p className="muted">Choisissez les participants :</p></div>}
      {others.length === 0 && <p className="muted" style={{ padding: 16 }}>Personne d'autre dans l'équipe pour l'instant. Invitez quelqu'un dans Réglages.</p>}
      {others.map((m) => (
        <div key={m.member_id} onClick={() => (group ? setPick((s) => { const n = new Set(s); if (n.has(m.member_id)) n.delete(m.member_id); else n.add(m.member_id); return n; }) : direct(m.member_id))}
          style={{ display: "flex", gap: 12, padding: "12px 16px", background: "#fff", borderBottom: "1px solid var(--line)", alignItems: "center", cursor: "pointer" }}>
          <Avatar name={people[m.person_id]?.name ?? "?"} src={people[m.person_id]?.avatar} size={44} />
          <span style={{ flex: 1 }}>{people[m.person_id]?.name ?? "?"}</span>
          {group && <input type="checkbox" readOnly checked={pick.has(m.member_id)} style={{ width: 22, minHeight: 22 }} />}
        </div>))}
      {group && <div style={{ padding: 16 }}>
        {err && <p style={{ color: "var(--error)" }}>{err}</p>}
        <button className="primary big" disabled={!name.trim() || pick.size === 0} onClick={createGroup}>Créer le groupe</button></div>}
      {!group && err && <p style={{ color: "var(--error)", padding: 16 }}>{err}</p>}
    </div>
  </>);
}
