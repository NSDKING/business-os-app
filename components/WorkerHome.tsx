"use client";
// Home for people whose job is to send information, not to manage (P-029).
// Big buttons with pictures and plain words: take a photo of a sheet, send a voice note, read messages, see what happened to what I sent.
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { enqueue, flushQueue, readQueue } from "@/lib/queue";
import { toPhoto, startRecording, recorderSupported, MAX_VOICE_SECONDS, type Recording } from "@/lib/media";
import Icon from "./Icon";
import type { Ctx } from "./Chats";

type Group = { channel_id: string; name: string };
type Sent = { id: string; kind: string; sent_at: string; label: string; state: "waiting" | "reading" | "check" | "ok" | "no"; note?: string | null };
const STATE: Record<Sent["state"], { t: string; c: string }> = {
  waiting: { t: "Pas encore parti : il partira avec le réseau", c: "var(--pending)" },
  reading: { t: "Bien reçu", c: "var(--muted)" },
  check: { t: "Le responsable doit vérifier", c: "var(--pending)" },
  ok: { t: "Vérifié ✓", c: "var(--primary)" },
  no: { t: "Refusé", c: "var(--error)" },
};
const tile: React.CSSProperties = { display: "flex", alignItems: "center", gap: 16, width: "100%", minHeight: 88, padding: "14px 18px", margin: "0 0 12px", borderRadius: 18, fontSize: 20, fontWeight: 600, textAlign: "left", cursor: "pointer", border: "1px solid var(--line)", background: "var(--surface)", color: "var(--text)" };

export default function WorkerHome({ ctx, online, onMessages, onSettings }: { ctx: Ctx; online: boolean; onMessages: () => void; onSettings: () => void }) {
  const [groups, setGroups] = useState<Group[]>([]); const [to, setTo] = useState("");
  const [done, setDone] = useState(""); const [err, setErr] = useState("");
  const [rec, setRec] = useState<number | null>(null); const r = useRef<Recording | null>(null); const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const [sent, setSent] = useState<Sent[]>([]); const [unread, setUnread] = useState(0);

  const loadSent = useCallback(async () => {
    const { data: ms } = await supabase.from("message").select("id,kind,sent_at").eq("business_id", ctx.business_id).eq("person_id", ctx.person_id).in("kind", ["image", "audio"]).order("sent_at", { ascending: false }).limit(8);
    const ids = (ms ?? []).map((m) => m.id);
    const { data: src } = ids.length ? await supabase.from("draft_source").select("draft_id,message_id").in("message_id", ids) : { data: [] };
    const dids = (src ?? []).map((s) => s.draft_id);
    const { data: ds } = dids.length ? await supabase.from("draft").select("id,status,review_note,record_type_id").in("id", dids) : { data: [] };
    const { data: rts } = await supabase.from("record_type").select("id,label").eq("business_id", ctx.business_id);
    const lab = new Map((rts ?? []).map((x) => [x.id, x.label]));
    const local: Sent[] = readQueue().filter((p) => p.kind === "image" || p.kind === "audio").map((p) => ({ id: p.id, kind: p.kind!, sent_at: p.sent_at, label: p.kind === "image" ? "Photo" : "Message vocal", state: "waiting" }));
    const out: Sent[] = (ms ?? []).map((m) => {
      const s = (src ?? []).find((x) => x.message_id === m.id); const d = s && (ds ?? []).find((x) => x.id === s.draft_id);
      const base = m.kind === "image" ? "Photo" : "Message vocal";
      if (!d) return { id: m.id, kind: m.kind, sent_at: m.sent_at, label: base, state: "reading" };
      const state: Sent["state"] = d.status === "proposed" ? "check" : d.status === "rejected" ? "no" : "ok";
      return { id: m.id, kind: m.kind, sent_at: m.sent_at, label: lab.get(d.record_type_id) ?? base, state, note: d.review_note };
    });
    setSent([...local, ...out.filter((o) => !local.some((l) => l.id === o.id))]);
  }, [ctx.business_id, ctx.person_id]);

  useEffect(() => {
    supabase.rpc("chat_list", { p_business: ctx.business_id }).then(({ data }) => {
      const items = (data as { channel_id: string; kind: string; name: string; unread: number }[]) ?? [];
      const gs = items.filter((i) => i.kind === "group").map((i) => ({ channel_id: i.channel_id, name: i.name }));
      setGroups(gs); setUnread(items.reduce((t, i) => t + (i.unread || 0), 0));
      let saved = ""; try { saved = localStorage.getItem("bos.sendTo") ?? ""; } catch {}
      setTo(gs.find((g) => g.channel_id === saved)?.channel_id ?? gs[0]?.channel_id ?? "");
    });
    loadSent();
  }, [ctx.business_id, loadSent]);

  async function send(kind: "image" | "audio", media: string, seconds?: number) {
    if (!to) return setErr("Aucun groupe pour envoyer. Demandez au responsable de vous ajouter.");
    enqueue({ id: crypto.randomUUID(), business_id: ctx.business_id, channel_id: to, person_id: ctx.person_id, sender_label: ctx.name, text: "", sent_at: new Date().toISOString(), kind, media, seconds });
    setDone(online ? "Envoyé ✓  Le responsable va vérifier." : "Gardé sur le téléphone ✓  Il partira dès qu'il y aura du réseau.");
    if (online) await flushQueue();
    window.dispatchEvent(new Event("bos-offline-change")); await loadSent();
  }
  async function photo(f?: File) { if (!f) return; setErr(""); setDone(""); try { await send("image", await toPhoto(f)); } catch { setErr("La photo n'a pas pu être lue. Réessayez."); } }
  async function startVoice() {
    setErr(""); setDone("");
    try { r.current = await startRecording(); } catch { return setErr("Le téléphone a refusé le micro. Autorisez le micro puis réessayez."); }
    setRec(0); timer.current = setInterval(() => setRec((s) => { const n = (s ?? 0) + 1; if (n >= MAX_VOICE_SECONDS) stopVoice(true); return n; }), 1000);
  }
  async function stopVoice(keep: boolean) {
    if (timer.current) clearInterval(timer.current); timer.current = null; setRec(null);
    const x = r.current; r.current = null; if (!x) return;
    if (!keep) return x.cancel();
    const out = await x.stop(); if (out) await send("audio", out.dataUrl, out.seconds);
  }

  return (<div className="body" style={{ paddingTop: 16 }}>
    <h2 style={{ margin: "0 0 4px" }}>Bonjour {ctx.name.split(" ")[0]}</h2>
    <p className="muted" style={{ margin: "0 0 16px", fontSize: 17 }}>Que voulez-vous faire ?</p>
    {done && <div className="card" style={{ fontSize: 18, fontWeight: 600, color: "var(--primary)", borderLeft: "6px solid var(--primary)" }}>{done}</div>}
    {err && <div className="card" style={{ fontSize: 17, color: "var(--error)" }}>{err}</div>}

    {rec !== null ? <div className="card" style={{ textAlign: "center", padding: 24 }}>
      <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 6 }}><span style={{ display: "inline-block", width: 14, height: 14, borderRadius: "50%", background: "var(--error)", marginRight: 8 }} />Parlez maintenant</div>
      <div style={{ fontSize: 32, fontWeight: 700, marginBottom: 16 }}>{Math.floor(rec / 60)}:{String(rec % 60).padStart(2, "0")}</div>
      <button className="primary" style={{ ...tile, justifyContent: "center", background: "var(--primary)", color: "#fff", border: 0 }} onClick={() => stopVoice(true)}><Icon name="send" size={32} />Terminé : envoyer</button>
      <button style={{ ...tile, justifyContent: "center", minHeight: 64, fontSize: 18 }} onClick={() => stopVoice(false)}><Icon name="close" size={28} />Annuler</button></div> : <>
      <label style={tile}><span style={{ width: 56, height: 56, borderRadius: 16, background: "var(--primary)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}><Icon name="camera" size={34} /></span>
        <span>Photo d&apos;une fiche<div className="muted" style={{ fontSize: 15, fontWeight: 400 }}>Fiche de production, de présence, bon…</div></span>
        <input type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={(e) => { photo(e.target.files?.[0]); e.target.value = ""; }} /></label>
      {recorderSupported() && <button style={tile} onClick={startVoice}><span style={{ width: 56, height: 56, borderRadius: 16, background: "var(--primary)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}><Icon name="mic" size={34} /></span>
        <span>Message vocal<div className="muted" style={{ fontSize: 15, fontWeight: 400 }}>Dites ce qui s&apos;est passé</div></span></button>}
      <button style={tile} onClick={onMessages}><span style={{ width: 56, height: 56, borderRadius: 16, background: "var(--surface-2, #e8f0eb)", color: "var(--primary)", display: "flex", alignItems: "center", justifyContent: "center", flex: "none", position: "relative" }}><Icon name="chat" size={34} />
        {unread > 0 && <span style={{ position: "absolute", top: -6, right: -6, minWidth: 24, height: 24, borderRadius: 12, background: "var(--error)", color: "#fff", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 6px" }}>{unread}</span>}</span>
        <span>Messages<div className="muted" style={{ fontSize: 15, fontWeight: 400 }}>{unread > 0 ? `${unread} nouveau${unread > 1 ? "x" : ""}` : "Écrire et lire"}</div></span></button>
      {groups.length > 1 && <div className="muted" style={{ fontSize: 15, margin: "0 0 16px" }}>Les photos et vocaux vont dans :{" "}
        <select value={to} style={{ fontSize: 16, minHeight: 40, borderRadius: 10, border: "1px solid var(--line)", background: "var(--surface)", color: "var(--text)" }} onChange={(e) => { setTo(e.target.value); try { localStorage.setItem("bos.sendTo", e.target.value); } catch {} }}>
          {groups.map((g) => <option key={g.channel_id} value={g.channel_id}>{g.name}</option>)}</select></div>}
    </>}

    <div className="card"><h3 style={{ marginBottom: 6 }}>Ce que j&apos;ai envoyé</h3>
      {sent.length === 0 && <p className="muted">Rien pour l&apos;instant.</p>}
      {sent.map((s) => <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderTop: "1px solid var(--line)" }}>
        <Icon name={s.kind === "image" ? "camera" : "mic"} size={24} />
        <div style={{ flex: 1 }}><div style={{ fontSize: 16 }}>{s.label} · {new Date(s.sent_at).toLocaleString("fr-FR", { weekday: "short", hour: "2-digit", minute: "2-digit" })}</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: STATE[s.state].c }}>{STATE[s.state].t}{s.note ? ` : ${s.note}` : ""}</div></div></div>)}</div>

    <button style={{ minHeight: 48, width: "100%", marginTop: 4 }} onClick={onSettings}><Icon name="sliders" size={20} /> Réglages</button>
  </div>);
}
