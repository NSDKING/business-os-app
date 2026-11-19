"use client";
import { toPhoto, startRecording, recorderSupported, mediaUrl, MAX_VOICE_SECONDS, type Recording } from "@/lib/media";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase, type Message } from "@/lib/supabase";
import { enqueue, flushQueue } from "@/lib/queue";
import Avatar from "./Avatar";
import Icon from "./Icon";
import { Collection, MessageSheet, TagPills, REACTIONS, snippet, type Tag } from "./MessageTools";

export type Ctx = { business_id: string; business: string; person_id: string; name: string };
type Item = {
  channel_id: string; kind: "group" | "direct"; name: string; other_person: string | null; other_name: string | null;
  other_avatar: string | null; last_kind: string | null; last_text: string | null; last_at: string | null;
  last_sender: string | null; unread: number; unit_name?: string | null; last_tags?: string[] | null;
};
type Person = { name: string; avatar: string | null };
type Screen = { s: "list" } | { s: "new" } | { s: "convo"; id: string; focus?: string } | { s: "info"; id: string };

const chipStyle = (on: boolean) => ({ flex: "none" as const, padding: "10px 18px", borderRadius: 22, border: 0, background: on ? "var(--soft)" : "var(--surface2)", color: on ? "var(--primary)" : "var(--text)", fontSize: 16, fontWeight: on ? 600 : 400, cursor: "pointer", minHeight: 0 });
const iconFor = (i: Item): Parameters<typeof Icon>[0]["name"] => i.kind === "direct" ? "user" : /charg|livr|supplier|fournis/i.test(i.name) ? "truck" : i.unit_name === "Administration" ? "briefcase" : i.unit_name === "Ponte" ? "egg" : i.unit_name === "Site Mankoulang" ? "home" : "group";
const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div style={{ padding: "6px 16px 12px", position: "relative" }}>
      <span aria-hidden style={{ position: "absolute", left: 32, top: 21, color: "var(--muted)", display: "flex" }}><Icon name="search" size={20} /></span>
      <input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        style={{ paddingLeft: 46, borderRadius: 26, background: "var(--surface2)", border: 0, minHeight: 50, fontSize: 17 }} />
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
  const body = i.last_kind === "image" ? <><Icon name="camera" size={15} /> Photo</> : i.last_kind === "audio" ? <><Icon name="mic" size={15} /> Message vocal</> : i.last_text ?? "";
  return i.kind === "group" && i.last_sender ? <>{i.last_sender.split(" ")[0]} : {body}</> : <>{body}</>;
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
  const [unit, setUnit] = useState<string>("");
  const [tab, setTab] = useState<"all" | "unread" | "groups" | "tagged" | "saved">("all");
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
    supabase.from("member").select("id, person_id, active").eq("business_id", ctx.business_id).then(({ data }) =>
      setMembers((data ?? []).filter((m) => m.active).map((m) => ({ member_id: m.id, person_id: m.person_id }))));
    const sub = supabase.channel("list")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "message" }, () => loadList())
      .subscribe();
    return () => { supabase.removeChannel(sub); };
  }, [loadList, ctx.business_id]);

  const go = (s: Screen) => { setScreen(s); onFull(s.s !== "list"); if (s.s === "list") loadList(); };
  const cur = screen.s === "convo" || screen.s === "info" ? items.find((i) => i.channel_id === screen.id) : undefined;

  if (screen.s === "new") return <NewChat ctx={ctx} isAdmin={isAdmin} people={people} members={members}
    onBack={() => go({ s: "list" })} onOpen={(id) => { loadList(); go({ s: "convo", id }); }} />;
  if ((screen.s === "convo" || screen.s === "info") && cur) {
    return screen.s === "info"
      ? <GroupInfo item={cur} people={people} onBack={() => go({ s: "convo", id: cur.channel_id })} onRenamed={loadList} />
      : <Convo ctx={ctx} item={cur} people={people} online={online} onQueue={onQueue} chats={items} focus={screen.s === "convo" ? screen.focus : undefined}
          onBack={() => go({ s: "list" })} onInfo={() => cur.kind === "group" && go({ s: "info", id: cur.channel_id })} />;
  }

  return (<>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 16px 4px" }}>
      <span style={{ fontSize: 34, fontWeight: 700, letterSpacing: -0.5 }}>Messages</span>
      <button onClick={() => go({ s: "new" })} aria-label="Nouvelle discussion" style={{ border: 0, background: "none", minWidth: 44, color: "var(--text)", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name="edit" size={27} /></button></div>
    <SearchBox value={q} onChange={setQ} placeholder="Rechercher une personne ou un groupe" />
    <div style={{ display: "flex", gap: 8, overflowX: "auto", padding: "2px 16px 12px" }}>
      {([["all", "Tout"], ["unread", "Non lus"], ["groups", "Groupes"], ["tagged", "Étiquetés"], ["saved", "Enregistrés"]] as const).map(([k, l]) =>
        <button key={k} style={chipStyle(tab === k)} onClick={() => setTab(k)}>{l}</button>)}
    </div>
    {tab !== "tagged" && tab !== "saved" && (() => {
      const units = [...new Set(items.map((i) => i.unit_name).filter(Boolean))] as string[];
      if (units.length < 2) return null;
      const chip = chipStyle;
      return <div style={{ display: "flex", gap: 8, overflowX: "auto", padding: "0 16px 12px" }}>
        <button style={chip(!unit)} onClick={() => setUnit("")}>Tout</button>
        {units.map((u) => <button key={u} style={chip(unit === u)} onClick={() => setUnit(unit === u ? "" : u)}>{u}</button>)}
      </div>;
    })()}
    <div className="body" style={{ padding: 0 }}>
      {(tab === "tagged" || tab === "saved") && <Collection mode={tab} businessId={ctx.business_id}
        chatName={(c) => { const it = items.find((x) => x.channel_id === c); return it ? title(it) : "Discussion"; }}
        onOpen={(c, m) => go({ s: "convo", id: c, focus: m })} />}
      {tab !== "tagged" && tab !== "saved" && loaded && items.length === 0 && !q && <p className="muted" style={{ padding: 16 }}>Aucune discussion. Touchez le bouton + ou cherchez une personne.</p>}
      {tab !== "tagged" && tab !== "saved" && (() => {
        const nq = norm(q.trim());
        const base = tab === "unread" ? items.filter((i) => i.unread > 0) : tab === "groups" ? items.filter((i) => i.kind === "group") : items;
        const byUnit = unit ? base.filter((i) => i.unit_name === unit) : base;
        const shown = nq ? byUnit.filter((i) => norm(title(i)).includes(nq) || norm(i.last_text ?? "").includes(nq)) : byUnit;
        const haveDm = new Set(items.filter((i) => i.kind === "direct").map((i) => i.other_person));
        const found = nq ? members.filter((m) => m.person_id !== ctx.person_id && !haveDm.has(m.person_id) && norm(people[m.person_id]?.name ?? "").includes(nq)) : [];
        return (<>
          {nq && shown.length > 0 && <div className="muted" style={{ padding: "10px 16px 4px", fontWeight: 600 }}>Discussions</div>}
          {shown.map((i) => (
            <div key={i.channel_id} onClick={() => go({ s: "convo", id: i.channel_id })} style={{ padding: "0 16px", cursor: "pointer" }}>
              <div style={{ display: "flex", gap: 14, padding: "16px 0", borderBottom: "1px solid var(--line)", alignItems: "flex-start" }}>
                <Avatar name={title(i)} src={i.kind === "direct" ? i.other_avatar : null} icon={iconFor(i)} size={58} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
                    <b style={{ fontSize: 20, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title(i)}</b>
                    <span className="muted" style={{ fontSize: 15, color: i.unread ? "var(--primary)" : undefined, flex: "none" }}>{when(i.last_at)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginTop: 4, alignItems: "center" }}>
                    <span style={{ color: "var(--muted)", fontSize: 16, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{preview(i)}</span>
                    {i.unread > 0 && <span style={{ background: "var(--soft)", color: "var(--primary)", borderRadius: 16, minWidth: 30, height: 30, padding: "0 9px", fontSize: 15, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>{i.unread}</span>}
                  </div>
                  {(i.last_tags?.length || (i.kind === "group" && i.unit_name)) ? <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
                    {(i.last_tags ?? []).map((t) => <span key={t} style={{ background: "var(--surface2)", borderRadius: 14, padding: "4px 14px", fontSize: 15 }}>{t}</span>)}
                    {i.kind === "group" && i.unit_name && !(i.last_tags?.length) && <span style={{ color: "var(--muted)", fontSize: 13, padding: "5px 0" }}>{i.unit_name}</span>}
                  </div> : null}
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
              style={{ display: "flex", gap: 12, padding: "12px 16px", borderBottom: "1px solid var(--line)", background: "var(--surface)", cursor: "pointer", alignItems: "center" }}>
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

function Convo({ ctx, item, people, online, onQueue, onBack, onInfo, chats, focus }: {
  ctx: Ctx; item: Item; people: Record<string, Person>; online: boolean; onQueue: () => void; onBack: () => void; onInfo: () => void; chats: Item[]; focus?: string;
}) {
  const [msgs, setMsgs] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const end = useRef<HTMLDivElement>(null);
  const id = item.channel_id;
  const rec = useRef<Recording | null>(null);
  const [recording, setRecording] = useState<number | null>(null); // seconds so far, null = not recording
  const [note, setNote] = useState("");
  const [tags, setTags] = useState<Tag[]>([]);
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [me, setMe] = useState<string | null>(null); // my member id
  const [menu, setMenu] = useState<string | null>(null);
  const [sheetNote, setSheetNote] = useState("");
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const press = useRef<number | undefined>(undefined);
  const focused = useRef(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from("message").select("*, message_tag(tag_id), message_reaction(member_id,kind), message_pin(message_id)").eq("channel_id", id).order("sent_at").limit(300);
    setMsgs((data as Message[]) ?? []);
  }, [id]);
  useEffect(() => {
    supabase.from("tag").select("id,name,color").eq("business_id", ctx.business_id).order("name").then(({ data }) => setTags((data as Tag[]) ?? []));
    supabase.from("saved_message").select("message_id").then(({ data }) => setSaved(new Set((data ?? []).map((r) => r.message_id as string))));
    supabase.from("member").select("id").eq("business_id", ctx.business_id).eq("person_id", ctx.person_id).maybeSingle().then(({ data }) => setMe(data?.id ?? null));
  }, [ctx.business_id, ctx.person_id]);

  useEffect(() => {
    load().then(() => { supabase.rpc("mark_read", { p_channel: id }); });
    const sub = supabase.channel("msg-" + id)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "message", filter: `channel_id=eq.${id}` },
        (p) => { setMsgs((m) => (m.some((x) => x.id === (p.new as Message).id) ? m : [...m, p.new as Message])); supabase.rpc("mark_read", { p_channel: id }); })
      .subscribe();
    return () => { supabase.removeChannel(sub); };
  }, [id, load]);
  useEffect(() => {
    if (focus && !focused.current) { const el = document.getElementById("m-" + focus); if (el) { focused.current = true; el.scrollIntoView({ block: "center" }); return; } }
    if (!focus || focused.current) end.current?.scrollIntoView();
  }, [msgs, focus]);
  const jump = (mid: string) => document.getElementById("m-" + mid)?.scrollIntoView({ block: "center", behavior: "smooth" });
  const isPinned = (m: Message) => (Array.isArray(m.message_pin) ? m.message_pin.length > 0 : !!m.message_pin);
  const patch = (mid: string, f: (m: Message) => Message) => setMsgs((ms) => ms.map((x) => (x.id === mid ? f(x) : x)));
  const fail = () => { setSheetNote("Action impossible pour le moment. Réessayez."); load(); };

  async function toggleTag(m: Message, tid: string) {
    setSheetNote("");
    const on = (m.message_tag ?? []).some((t) => t.tag_id === tid);
    patch(m.id, (x) => ({ ...x, message_tag: on ? (x.message_tag ?? []).filter((t) => t.tag_id !== tid) : [...(x.message_tag ?? []), { tag_id: tid }] }));
    const { error } = await supabase.rpc("toggle_tag", { p_message: m.id, p_tag: tid }); if (error) fail();
  }
  async function newTag(m: Message, name: string) {
    setSheetNote("");
    const { data, error } = await supabase.rpc("create_tag", { p_business: ctx.business_id, p_name: name });
    if (error || !data) return fail();
    const tid = data as string;
    setTags((t) => (t.some((x) => x.id === tid) ? t : [...t, { id: tid, name, color: "#6b7280" }].sort((a, b) => a.name.localeCompare(b.name))));
    if (!(m.message_tag ?? []).some((t) => t.tag_id === tid)) await toggleTag(m, tid);
  }
  async function react(m: Message, kind: string) {
    if (!me) return; setSheetNote("");
    const on = (m.message_reaction ?? []).some((r) => r.member_id === me && r.kind === kind);
    patch(m.id, (x) => ({ ...x, message_reaction: on ? (x.message_reaction ?? []).filter((r) => !(r.member_id === me && r.kind === kind)) : [...(x.message_reaction ?? []), { member_id: me, kind }] }));
    const { error } = await supabase.rpc("toggle_reaction", { p_message: m.id, p_kind: kind }); if (error) fail();
  }
  async function toggleSave(m: Message) {
    setSheetNote(""); const on = saved.has(m.id);
    setSaved((s) => { const n = new Set(s); if (on) n.delete(m.id); else n.add(m.id); return n; });
    const { error } = await supabase.rpc("toggle_saved", { p_message: m.id }); if (error) fail();
  }
  async function togglePin(m: Message) {
    setSheetNote(""); const on = isPinned(m);
    patch(m.id, (x) => ({ ...x, message_pin: on ? null : { message_id: m.id } }));
    const { error } = await supabase.rpc("toggle_pin", { p_message: m.id }); if (error) fail();
  }
  async function forward(m: Message, channel: string) {
    setSheetNote("");
    const { error } = await supabase.rpc("forward_message", { p_message: m.id, p_channel: channel });
    if (error) return setSheetNote("Impossible de transférer dans cette discussion.");
    setMenu(null); setNote("Message transféré.");
  }
  // Swipe a message to the right to tag it; long-press or the three dots open every action.
  const [drag, setDrag] = useState<{ id: string; dx: number } | null>(null);
  const [tagOnly, setTagOnly] = useState(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  const dxRef = useRef(0);
  const open = (mid: string, only = false) => { setSheetNote(""); setTagOnly(only); setMenu(mid); };
  const bind = (mid: string) => ({
    onPointerDown: (e: React.PointerEvent) => {
      if ((e.target as HTMLElement).closest("button,audio,input,a")) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      start.current = { x: e.clientX, y: e.clientY }; dxRef.current = 0;
      if (e.pointerType !== "mouse") press.current = window.setTimeout(() => { start.current = null; open(mid); }, 450);
    },
    onPointerMove: (e: React.PointerEvent) => {
      const s0 = start.current; if (!s0) return;
      const dx = e.clientX - s0.x, dy = e.clientY - s0.y;
      if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx) && dxRef.current === 0) { window.clearTimeout(press.current); start.current = null; return; }
      if (dx > 8) {
        window.clearTimeout(press.current);
        try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
        dxRef.current = Math.min(dx, 90); setDrag({ id: mid, dx: dxRef.current });
      }
    },
    onPointerUp: () => {
      window.clearTimeout(press.current);
      const done = dxRef.current >= 60 && start.current !== null;
      start.current = null; dxRef.current = 0; setDrag(null);
      if (done) open(mid, true);
    },
    onPointerCancel: () => { window.clearTimeout(press.current); start.current = null; dxRef.current = 0; setDrag(null); },
    onContextMenu: (e: React.MouseEvent) => { e.preventDefault(); open(mid); },
  });

  async function send() {
    const t = text.trim(); if (!t) return; setText("");
    const p = { id: crypto.randomUUID(), business_id: ctx.business_id, channel_id: id, person_id: ctx.person_id, sender_label: ctx.name, text: t, sent_at: new Date().toISOString(), reply_to: replyTo?.id ?? null };
    setReplyTo(null);
    setMsgs((m) => [...m, { ...p, kind: "text", attachment: null }]);
    enqueue(p); onQueue();
    if (online) { await flushQueue(); onQueue(); }
  }

  async function sendMedia(kind: "image" | "audio", media: string, seconds?: number) {
    const p = { id: crypto.randomUUID(), business_id: ctx.business_id, channel_id: id, person_id: ctx.person_id, sender_label: ctx.name, text: "", sent_at: new Date().toISOString(), kind, media, seconds, reply_to: replyTo?.id ?? null };
    setReplyTo(null);
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
      <button onClick={onBack} aria-label="Retour" style={{ border: 0, background: "none", minWidth: 40, padding: 0, display: "flex", alignItems: "center" }}><Icon name="back" size={26} /></button>
      <div onClick={onInfo} style={{ display: "flex", gap: 10, alignItems: "center", flex: 1, cursor: item.kind === "group" ? "pointer" : "default" }}>
        <Avatar name={name} src={item.kind === "direct" ? item.other_avatar : null} size={38} />
        <div><div>{name}</div>{item.kind === "group" && <div className="muted" style={{ fontSize: 12, fontWeight: 400 }}>Touchez pour les infos du groupe</div>}</div>
      </div>
    </div>
    {(() => { const pins = msgs.filter(isPinned); const last = pins[pins.length - 1];
      return last ? <div onClick={() => jump(last.id)} style={{ display: "flex", gap: 8, alignItems: "center", padding: "8px 16px", background: "var(--soft)", borderBottom: "1px solid var(--line)", cursor: "pointer", fontSize: 14 }}>
        <Icon name="pin" size={16} /><span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}><b>{last.sender_label}</b> : {snippet(last)}</span>{pins.length > 1 && <span className="muted">{pins.length}</span>}</div> : null; })()}
    <div className="body">
      {msgs.length === 0 && <p className="muted">Aucun message. Écrivez le premier.</p>}
      {msgs.map((m) => {
        const mine = m.person_id === ctx.person_id; const ai = m.sender_label === "Assistant";
        const who = (m.person_id && people[m.person_id]) || null; const n = who?.name ?? m.sender_label;
        const quoted = m.reply_to ? msgs.find((x) => x.id === m.reply_to) : null;
        const counts = REACTIONS.map((r) => ({ ...r, n: (m.message_reaction ?? []).filter((x) => x.kind === r.kind).length, mine: (m.message_reaction ?? []).some((x) => x.kind === r.kind && x.member_id === me) })).filter((r) => r.n > 0);
        const dragging = drag?.id === m.id ? drag.dx : 0;
        return (<div key={m.id} id={"m-" + m.id} style={{ position: "relative" }}>
          {dragging > 0 && <div style={{ position: "absolute", left: 6, top: "50%", transform: "translateY(-50%)", opacity: Math.min(1, dragging / 60), color: "var(--primary)" }}><Icon name="tag" size={24} /></div>}
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexDirection: mine ? "row-reverse" : "row", transform: dragging ? `translateX(${dragging}px)` : undefined, transition: dragging ? "none" : "transform .15s" }}>
          <Avatar name={ai ? "IA" : n} src={who?.avatar} size={32} />
          <div className={"bubble " + (mine ? "me " : "") + (ai ? "ai" : "")} style={{ margin: "6px 0", WebkitTouchCallout: "none", userSelect: "none", touchAction: "pan-y" }} {...bind(m.id)}>
            <div className="who" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <span>{ai ? "Assistant" : n}</span>
              <button onClick={() => open(m.id)} aria-label="Actions du message" style={{ border: 0, background: "none", padding: 0, minWidth: 28, minHeight: 20, color: "var(--muted)" }}><Icon name="more" size={18} /></button>
            </div>
            {m.forwarded_from && <div className="muted" style={{ fontSize: 12, marginBottom: 2 }}><Icon name="forward" size={13} /> Transféré</div>}
            {m.reply_to && <div onClick={() => jump(m.reply_to!)} style={{ borderLeft: "3px solid var(--primary)", background: "rgba(0,0,0,.05)", padding: "4px 8px", borderRadius: 6, marginBottom: 4, fontSize: 13, cursor: "pointer" }}>
              <b>{quoted?.sender_label ?? "Message"}</b>
              <div className="muted" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 220 }}>{quoted ? snippet(quoted) : "Message plus ancien"}</div></div>}
            {(m.kind === "image" || m.kind === "audio") ? <MediaView m={m} /> : <div>{m.text}</div>}
            <TagPills ids={(m.message_tag ?? []).map((t) => t.tag_id)} tags={tags} />
            {counts.length > 0 && <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
              {counts.map((r) => <button key={r.kind} onClick={() => react(m, r.kind)} aria-label={r.label} style={{ display: "flex", alignItems: "center", gap: 3, padding: "2px 8px", minHeight: 26, borderRadius: 12, border: "1px solid var(--line)", background: r.mine ? "var(--soft)" : "var(--surface)", color: r.mine ? "var(--primary)" : "inherit", fontSize: 12 }}><Icon name={r.icon} size={14} />{r.n}</button>)}
            </div>}
            <div className="t">{isPinned(m) && <Icon name="pin" size={12} />} {saved.has(m.id) && <Icon name="bookmark" size={12} />} {new Date(m.sent_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</div>
          </div></div></div>);
      })}
      <div ref={end} />
    </div>
    {replyTo && <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "6px 16px", background: "var(--surface)", borderTop: "1px solid var(--line)" }}>
      <Icon name="reply" size={18} /><div style={{ flex: 1, minWidth: 0, borderLeft: "3px solid var(--primary)", paddingLeft: 8, fontSize: 13 }}><b>{replyTo.sender_label}</b><div className="muted" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{snippet(replyTo)}</div></div>
      <button onClick={() => setReplyTo(null)} aria-label="Annuler la réponse" style={{ border: 0, background: "none", minWidth: 36 }}><Icon name="close" size={18} /></button></div>}
    {note && <div className="muted" style={{ padding: "6px 16px", background: "var(--surface)", color: note === "Message transféré." ? "var(--primary)" : "var(--error)" }}>{note}</div>}
    {(() => { const m = msgs.find((x) => x.id === menu); if (!m) return null;
      return <MessageSheet key={m.id + tagOnly} m={m} tags={tags} activeTags={new Set((m.message_tag ?? []).map((t) => t.tag_id))}
        myReactions={new Set((m.message_reaction ?? []).filter((r) => r.member_id === me).map((r) => r.kind))}
        saved={saved.has(m.id)} pinned={isPinned(m)} canForward={m.kind === "text"} note={sheetNote} tagOnly={tagOnly}
        targets={chats.filter((c) => c.channel_id !== id).map((c) => ({ id: c.channel_id, name: title(c) }))}
        onClose={() => setMenu(null)} onReply={() => { setReplyTo(m); setMenu(null); }}
        onTag={(t) => toggleTag(m, t)} onNewTag={(nm) => newTag(m, nm)} onReact={(k) => react(m, k)}
        onSave={() => toggleSave(m)} onPin={() => togglePin(m)} onForward={(c) => forward(m, c)}
        onCopy={() => { navigator.clipboard?.writeText(m.text).catch(() => {}); setMenu(null); }} />; })()}
    {recording !== null ? (
      <div className="composer" style={{ alignItems: "center" }}>
        <button onClick={() => finishVoice(false)} aria-label="Annuler" style={{ minWidth: 48, display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name="close" /></button>
        <div style={{ flex: 1, textAlign: "center", fontWeight: 600 }}><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", background: "var(--error)", marginRight: 6 }} /> {Math.floor(recording / 60)}:{String(recording % 60).padStart(2, "0")}</div>
        <button className="primary" onClick={() => finishVoice(true)}>Envoyer</button>
      </div>
    ) : (
      <div className="composer" style={{ alignItems: "center" }}>
        <label aria-label="Envoyer une photo" style={{ minWidth: 44, minHeight: 44, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "var(--primary)" }}><Icon name="camera" size={26} />
          <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => { pickPhoto(e.target.files?.[0]); e.target.value = ""; }} />
        </label>
        <input placeholder="Message" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} />
        {text.trim() || !recorderSupported()
          ? <button className="primary" onClick={send}>Envoyer</button>
          : <button className="primary" onClick={startVoice} aria-label="Message vocal" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name="mic" /></button>}
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
      <button onClick={onBack} aria-label="Retour" style={{ border: 0, background: "none", minWidth: 40, padding: 0, display: "flex", alignItems: "center" }}><Icon name="back" size={26} /></button><span>Infos du groupe</span>
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
      <button onClick={onBack} aria-label="Retour" style={{ border: 0, background: "none", minWidth: 40, padding: 0, display: "flex", alignItems: "center" }}><Icon name="back" size={26} /></button>
      <span>{group ? "Nouveau groupe" : "Nouvelle discussion"}</span>
    </div>
    <SearchBox value={q} onChange={setQ} placeholder="Rechercher une personne" />
    <div className="body" style={{ padding: 0 }}>
      {!group && isAdmin && !q && (
        <div onClick={() => setGroup(true)} style={{ display: "flex", gap: 12, padding: "12px 16px", background: "var(--surface)", borderBottom: "1px solid var(--line)", alignItems: "center", cursor: "pointer" }}>
          <div style={{ width: 48, height: 48, borderRadius: "50%", background: "var(--primary)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name="group" size={26} /></div><b>Nouveau groupe</b>
        </div>)}
      {group && <div style={{ padding: 16, background: "var(--surface)" }}>
        <input placeholder="Nom du groupe" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
        <p className="muted">Choisissez les participants :</p></div>}
      {others.length === 0 && <p className="muted" style={{ padding: 16 }}>Personne d'autre dans l'équipe pour l'instant. Invitez quelqu'un dans Réglages.</p>}
      {others.map((m) => (
        <div key={m.member_id} onClick={() => (group ? setPick((s) => { const n = new Set(s); if (n.has(m.member_id)) n.delete(m.member_id); else n.add(m.member_id); return n; }) : direct(m.member_id))}
          style={{ display: "flex", gap: 12, padding: "12px 16px", background: "var(--surface)", borderBottom: "1px solid var(--line)", alignItems: "center", cursor: "pointer" }}>
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
