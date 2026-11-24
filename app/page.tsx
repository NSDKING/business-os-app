"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase, type Channel, type Draft, type Message } from "@/lib/supabase";
import { enqueue, flushQueue, readQueue } from "@/lib/queue";
import ReviewCard from "@/components/ReviewCard";
import Approvers from "@/components/Approvers";
import Compliance from "@/components/Compliance";
import Notifications from "@/components/Notifications";
import Business from "@/components/Business";
import Catalogue from "@/components/Catalogue";
import AddSheet from "@/components/AddSheet";
import Discussions from "@/components/Discussions";
import Invoices from "@/components/Invoices";
import Chats from "@/components/Chats";
import Icon from "@/components/Icon";
import Avatar from "@/components/Avatar";
import { toAvatar } from "@/lib/image";

type Tab = "messages" | "drafts" | "documents" | "business" | "insights" | "settings";
type Ctx = { business_id: string; business: string; person_id: string; name: string; others?: { business_id: string; business: string }[] };

export default function Home() {
  // iPhone: the keyboard moves the page and it can stay shifted afterwards. Size the app to the visible area and keep the page at the top.
  useEffect(() => {
    const vv = window.visualViewport;
    const fit = () => { document.documentElement.style.setProperty("--app-h", (vv?.height ?? window.innerHeight) + "px"); if (window.scrollY !== 0) window.scrollTo(0, 0); };
    fit(); vv?.addEventListener("resize", fit); vv?.addEventListener("scroll", fit); window.addEventListener("orientationchange", fit); window.addEventListener("focusout", () => setTimeout(fit, 100));
    return () => { vv?.removeEventListener("resize", fit); vv?.removeEventListener("scroll", fit); window.removeEventListener("orientationchange", fit); };
  }, []);
  const [ctx, setCtx] = useState<Ctx | null | undefined>(undefined);
  const [tab, setTab] = useState<Tab>("messages");
  const [online, setOnline] = useState(true);
  const [pendingN, setPendingN] = useState(0);
  const [full, setFull] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: s } = await supabase.auth.getSession();
      if (!s.session) return setCtx(null);
      const { data: ms } = await supabase.from("member").select("business_id, person_id").eq("auth_user_id", s.session.user.id);
      if (!ms?.length) return setCtx(null);
      const { data: bs } = await supabase.from("business").select("id, name").in("id", ms.map((x) => x.business_id));
      const names = new Map((bs ?? []).map((x) => [x.id, x.name]));
      let saved = ""; try { saved = localStorage.getItem("bos.business") ?? ""; } catch {}
      const m = ms.find((x) => x.business_id === saved) ?? ms[0];
      const { data: p } = await supabase.from("person").select("display_name").eq("id", m.person_id).single();
      setCtx({ business_id: m.business_id, person_id: m.person_id, business: names.get(m.business_id) ?? "", name: p?.display_name ?? "",
        others: ms.map((x) => ({ business_id: x.business_id, business: names.get(x.business_id) ?? "" })) });
      const { data: me } = await supabase.from("member").select("id").eq("business_id", m.business_id).eq("person_id", m.person_id).limit(1);
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

  const TABS: { t: Tab; label: string; icon: "chat" | "clipboard" | "doc" | "briefcase" | "chart" }[] = [
    { t: "messages", label: "Messages", icon: "chat" }, { t: "drafts", label: "Drafts", icon: "clipboard" }, { t: "documents", label: "Documents", icon: "doc" },
    { t: "business", label: "Business", icon: "briefcase" }, { t: "insights", label: "Insights", icon: "chart" }];
  const hideBar = tab === "messages" && full;
  const gear = <button className="iconbtn" aria-label="Réglages" onClick={() => setTab("settings")}><Icon name="sliders" size={22} /></button>;
  return (
    <div className="shell">
      <div className="main">
      {tab !== "messages" && <div className="top"><span>{tab === "settings" ? "Réglages" : ctx.business}</span><span style={{ display: "flex", alignItems: "center", gap: 8 }}><span className="muted" style={{ fontSize: 14, fontWeight: 400 }}>{ctx.name}</span>{tab !== "settings" && gear}</span></div>}
      {!online && <div className="offline">Hors ligne · vos messages partiront dès le retour du réseau{pendingN ? ` (${pendingN})` : ""}</div>}
      {tab === "messages" && <MessagesArea ctx={ctx} online={online} isAdmin={isAdmin} onQueue={() => setPendingN(readQueue().length)} onFull={setFull} full={full} gear={gear} />}
      {tab === "drafts" && <Reports ctx={ctx} />}
      {tab === "documents" && <Invoices ctx={ctx} />}
      {tab === "business" && <Catalogue ctx={ctx} />}
      {tab === "insights" && <Business ctx={ctx} />}
      {tab === "settings" && <Settings ctx={ctx} />}
      </div>
      <div className={"tabs" + (hideBar ? " narrow-hide" : "")}>
        <div className="brand">{ctx.business}</div>
        {TABS.map(({ t, label, icon }) => (
          <button key={t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}><Icon name={icon} size={22} />{label}</button>))}
        <div className="grow" />
        <button className={tab === "settings" ? "on" : ""} onClick={() => setTab("settings")}><Icon name="sliders" size={22} />Réglages</button>
      </div>
    </div>
  );
}

function MessagesArea({ ctx, online, isAdmin, onQueue, onFull, full, gear }: { ctx: Ctx; online: boolean; isAdmin: boolean; onQueue: () => void; onFull: (v: boolean) => void; full: boolean; gear: React.ReactNode }) {
  const [v, setV] = useState<"team" | "customers">("team");
  return (<>
    {!full && <div style={{ display: "flex", gap: 6, padding: "8px 12px 0", alignItems: "center" }}>
      <button className={v === "team" ? "primary" : ""} style={{ flex: 1, minHeight: 38 }} onClick={() => setV("team")}>Équipe</button>
      <button className={v === "customers" ? "primary" : ""} style={{ flex: 1, minHeight: 38 }} onClick={() => setV("customers")}>Clients</button>
      {gear}
    </div>}
    {v === "team" || full ? <Chats ctx={ctx} online={online} isAdmin={isAdmin} onQueue={onQueue} onFull={onFull} /> : <Discussions ctx={ctx} />}
  </>);
}

function Reports({ ctx }: { ctx: Ctx }) {
  const [adding, setAdding] = useState(false);
  const [drafts, setDrafts] = useState<(Draft & { rt?: string; src?: string; ev?: string; photo?: string })[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [rights, setRights] = useState<{ all: boolean; types: Set<string>; byType: Map<string, string[]>; everyone: string[] }>({ all: false, types: new Set(), byType: new Map(), everyone: [] });
  const load = useCallback(async () => {
    // who may approve what (set by the owner in Réglages)
    const [{ data: me }, { data: gs }, { data: ms }, { data: ps }] = await Promise.all([
      supabase.from("member").select("id").eq("business_id", ctx.business_id).eq("person_id", ctx.person_id).limit(1),
      supabase.from("role_grant").select("member_id,scope_record_type_id,scope_unit_id").eq("business_id", ctx.business_id).eq("permission", "approve").is("revoked_at", null),
      supabase.from("member").select("id,person_id").eq("business_id", ctx.business_id),
      supabase.from("person").select("id,display_name"),
    ]);
    const nm = new Map((ms ?? []).map((m) => [m.id, (ps ?? []).find((p) => p.id === m.person_id)?.display_name ?? "?"]));
    const mine = me?.[0]?.id; const byType = new Map<string, string[]>(); const everyone: string[] = [];
    for (const g of gs ?? []) {
      if (!g.scope_record_type_id && !g.scope_unit_id) everyone.push(nm.get(g.member_id) ?? "?");
      else if (g.scope_record_type_id) byType.set(g.scope_record_type_id, [...(byType.get(g.scope_record_type_id) ?? []), nm.get(g.member_id) ?? "?"]);
    }
    setRights({ all: (gs ?? []).some((g) => g.member_id === mine && !g.scope_record_type_id && !g.scope_unit_id),
      types: new Set((gs ?? []).filter((g) => g.member_id === mine && g.scope_record_type_id).map((g) => g.scope_record_type_id as string)), byType, everyone });
    const { data: ds } = await supabase.from("draft").select("*").eq("business_id", ctx.business_id).eq("status", "proposed").order("created_at", { ascending: false });
    const out = [];
    for (const d of ds ?? []) {
      const [{ data: rt }, { data: s }] = await Promise.all([
        supabase.from("record_type").select("label").eq("id", d.record_type_id).single(),
        supabase.from("draft_source").select("message_id").eq("draft_id", d.id).limit(1),
      ]);
      let src = "chat", ev = "", photo: string | undefined;
      if (d.model === "manual") { src = "Saisie manuelle"; ev = "Information saisie à la main : aucune photo ni message à comparer."; }
      if (s?.length) {
        const { data: m } = await supabase.from("message").select("text, kind, attachment, sender_label, sent_at").eq("id", s[0].message_id).single();
        if (m) { src = `${m.sender_label} · ${new Date(m.sent_at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}`; ev = m.kind === "deleted" ? "Message supprimé depuis : vérifiez avant d'approuver." : m.kind === "image" ? (m.text || "Photo envoyée dans le chat") : m.text; if (m.kind === "image") photo = m.attachment ?? undefined; }
      }
      out.push({ ...d, rt: rt?.label, src, ev, photo });
    }
    setDrafts(out); setLoaded(true);
  }, [ctx.business_id]);
  useEffect(() => {
    load();
    // New proposals appear as soon as the AI has read a message.
    const sub = supabase.channel("drafts-" + ctx.business_id)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "draft", filter: `business_id=eq.${ctx.business_id}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(sub); };
  }, [load, ctx.business_id]);
  return (<div className="body">
    <button className="primary big" onClick={() => setAdding(true)}>+ Ajouter une information</button>
    {adding && <AddSheet ctx={ctx} onClose={() => setAdding(false)} onDone={load} />}
    {loaded && drafts.length === 0 && <div className="card"><span className="pill ok">Tout est à jour</span><p className="muted">Aucun rapport à approuver.</p></div>}
    {drafts.map((d) => <ReviewCard key={d.id} d={d} canApprove={rights.all || rights.types.has(d.record_type_id)} approvers={[...new Set([...rights.everyone, ...(rights.byType.get(d.record_type_id) ?? [])])]} title={d.rt ?? "Rapport"} source={d.src ?? ""} evidence={d.ev ?? ""} photo={d.photo} onDone={load} />)}
  </div>);
}

function Settings({ ctx }: { ctx: Ctx }) {
  const [name, setName] = useState(""); const [link, setLink] = useState(""); const [err, setErr] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [me, setMe] = useState<{ avatar: string | null }>({ avatar: null });
  const [channels, setChannels] = useState<Channel[]>([]);
  const [team, setTeam] = useState<{ member_id: string; name: string; avatar: string | null; chans: Set<string> }[]>([]);
  const [saved, setSaved] = useState("");
  const [theme, setTheme] = useState("light");
  useEffect(() => { try { setTheme(localStorage.getItem("bos.theme") ?? "light"); } catch {} }, []);

  const loadTeam = useCallback(async () => {
    const [{ data: ms }, { data: ps }, { data: cm }, { data: cs }, { data: me2 }] = await Promise.all([
      supabase.from("member").select("id, person_id, active").eq("business_id", ctx.business_id),
      supabase.from("person").select("id, display_name, avatar"),
      supabase.from("channel_member").select("channel_id, member_id").eq("business_id", ctx.business_id),
      supabase.from("channel").select("*").eq("business_id", ctx.business_id).order("name"),
      supabase.from("member").select("id").eq("business_id", ctx.business_id).eq("person_id", ctx.person_id).limit(1),
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
  }, [ctx.person_id, ctx.business_id]);
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
    <Notifications businessId={ctx.business_id} />
    <div className="card"><h3>Apparence</h3>
      <p className="muted">Clair par défaut. Le mode sombre repose les yeux le soir.</p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {([["light", "Clair"], ["dark", "Sombre"], ["system", "Comme le téléphone"]] as const).map(([k, l]) => <button key={k} className={theme === k ? "primary" : ""}
          onClick={() => { try { localStorage.setItem("bos.theme", k); } catch {} setTheme(k); document.documentElement.dataset.theme = k === "system" ? (matchMedia("(prefers-color-scheme:dark)").matches ? "dark" : "light") : k; }}>{l}</button>)}
      </div></div>
    {(ctx.others?.length ?? 0) > 1 && <div className="card"><h3>Entreprise</h3>
      <p className="muted">Passez de votre entreprise réelle à la démonstration.</p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {ctx.others!.map((o) => <button key={o.business_id} className={o.business_id === ctx.business_id ? "primary" : ""} disabled={o.business_id === ctx.business_id}
          onClick={() => { try { localStorage.setItem("bos.business", o.business_id); } catch {} location.reload(); }}>{o.business}</button>)}
      </div></div>}
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
      <Approvers businessId={ctx.business_id} />
      <Compliance businessId={ctx.business_id} />
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
