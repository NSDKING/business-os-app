"use client";
// CRM (P-030): one page per customer, unpaid reminders over WhatsApp, prospects by step, dated follow-ups.
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import Icon from "./Icon";
import type { Ctx } from "./Chats";
import { useCanMaintain } from "./useCan";

type Party = { id: string; name: string; phone: string | null; stage: string | null; note: string | null; active: boolean };
type Unpaid = { customer: string; party_id: string | null; phone: string | null; balance: number; numbers: string[]; oldest: string };
type Due = { id: string; party_id: string; party: string; title: string; due_on: string; who: string | null };
type File = { party: Party; invoiced: number; paid: number;
  invoices: { id: string; number: string | null; status: string; due: number; got: number; at: string }[];
  orders: { id: string; status: string; quote: string | null; order: string | null; total: number; at: string }[];
  payments: { amount: number; on: string; note: string | null }[];
  notes: { id: string; kind: string; text: string; at: string; by: string | null }[];
  followups: { id: string; title: string; due: string; status: string; who: string | null }[];
  threads: { id: string; at: string; status: string; last: string | null }[] };

const STAGES: [string, string][] = [["prospect", "Prospect"], ["contacted", "Contacté"], ["quote_sent", "Devis envoyé"], ["customer", "Client"], ["lost", "Perdu"]];
const stageLabel = (s: string | null) => STAGES.find(([k]) => k === (s ?? "customer"))?.[1] ?? "Client";
const n0 = (v: number) => Math.round(v).toLocaleString("fr-FR");
const day = (d: string) => new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const plusDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
// WhatsApp wants the full number with country code; Cameroon numbers are 9 digits starting with 6 or 2.
const waNumber = (ph: string | null) => { const d = (ph ?? "").replace(/\D/g, ""); if (!d) return ""; return d.length === 9 ? "237" + d : d.replace(/^00/, ""); };
const big: React.CSSProperties = { minHeight: 52, fontSize: 17, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, flex: 1 };

export default function Customers({ ctx }: { ctx: Ctx }) {
  const can = useCanMaintain(ctx);
  const [list, setList] = useState<Party[] | null>(null); const [unpaid, setUnpaid] = useState<Unpaid[]>([]); const [due, setDue] = useState<Due[]>([]);
  const [filter, setFilter] = useState<"customers" | "prospects" | "lost">("customers"); const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null); const [adding, setAdding] = useState(false);
  const [nw, setNw] = useState({ name: "", phone: "", stage: "customer" }); const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    const [{ data: ps }, { data: up }, { data: du }] = await Promise.all([
      supabase.from("party").select("id,name,phone,stage,note,active").eq("business_id", ctx.business_id).eq("kind", "customer").eq("active", true).order("name"),
      supabase.rpc("unpaid_customers", { p_business: ctx.business_id }),
      supabase.rpc("due_followups", { p_business: ctx.business_id }),
    ]);
    setList((ps as Party[]) ?? []); setUnpaid((up as Unpaid[]) ?? []); setDue((du as Due[]) ?? []);
  }, [ctx.business_id]);
  useEffect(() => { load(); }, [load]);

  async function remind(u: { customer: string; party_id: string | null; phone: string | null; balance: number; numbers: string[] }) {
    const num = waNumber(u.phone);
    const text = `Bonjour ${u.customer}, ici ${ctx.business}. Petit rappel : il reste ${n0(u.balance)} FCFA à régler (facture${u.numbers.length > 1 ? "s" : ""} ${u.numbers.filter(Boolean).join(", ")}). Merci beaucoup.`;
    window.open(`https://wa.me/${num}?text=${encodeURIComponent(text)}`, "_blank");
    if (u.party_id) await supabase.rpc("add_party_note", { p_party: u.party_id, p_text: `Rappel WhatsApp envoyé : ${n0(u.balance)} FCFA`, p_kind: "reminder_sent", p_id: crypto.randomUUID() });
  }
  async function done(id: string) { await supabase.rpc("set_followup_done", { p_id: id, p_done: true }); load(); }

  if (open) return <CustomerPage ctx={ctx} id={open} can={can} onBack={() => { setOpen(null); load(); }} remind={remind} />;
  if (list === null) return <div className="body muted">Chargement…</div>;
  const isP = (s: string | null) => ["prospect", "contacted", "quote_sent"].includes(s ?? "");
  const shown = list.filter((p) => filter === "prospects" ? isP(p.stage) : filter === "lost" ? p.stage === "lost" : !isP(p.stage) && p.stage !== "lost")
    .filter((p) => !q || p.name.toLowerCase().includes(q.toLowerCase()) || (p.phone ?? "").replace(/\D/g, "").includes(q.replace(/\D/g, "") || "§"));
  const owes = new Map(unpaid.map((u) => [u.party_id ?? "", u.balance]));

  return (<div className="body">
    {msg && <div className="card" style={{ color: msg.startsWith("Impossible") ? "var(--error)" : undefined }}>{msg}</div>}

    {due.length > 0 && <div className="card" style={{ borderLeft: "6px solid var(--pending)" }}>
      <h3 style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}><Icon name="bell" size={22} />À faire</h3>
      {due.map((d) => <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderTop: "1px solid var(--line)" }}>
        <div style={{ flex: 1, cursor: "pointer" }} onClick={() => setOpen(d.party_id)}><b>{d.party}</b> · {d.title}
          <div className="muted" style={{ fontSize: 14, color: d.due_on < today() ? "var(--error)" : undefined }}>{d.due_on < today() ? "En retard · " : d.due_on === today() ? "Aujourd'hui" : "Demain"}{d.due_on < today() ? day(d.due_on) : ""}</div></div>
        <button className="primary" style={{ minHeight: 44 }} onClick={() => done(d.id)}><Icon name="check" size={20} /> Fait</button></div>)}</div>}

    {unpaid.length > 0 && <div className="card"><h3 style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}><Icon name="money" size={22} />Ils vous doivent</h3>
      <div className="muted" style={{ fontSize: 14, marginBottom: 6 }}>Total : <b style={{ color: "var(--text)" }}>{n0(unpaid.reduce((t, u) => t + u.balance, 0))} FCFA</b></div>
      {unpaid.map((u) => <div key={u.customer} style={{ padding: "10px 0", borderTop: "1px solid var(--line)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, cursor: u.party_id ? "pointer" : undefined }} onClick={() => u.party_id && setOpen(u.party_id)}>
          <b>{u.customer}</b><b style={{ color: "var(--error)" }}>{n0(u.balance)} FCFA</b></div>
        <div className="muted" style={{ fontSize: 14 }}>Depuis le {day(u.oldest)}</div>
        {waNumber(u.phone) ? <button style={{ ...big, marginTop: 6, width: "100%" }} onClick={() => remind(u)}><Icon name="chat" size={22} />Envoyer un rappel WhatsApp</button>
          : <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>Pas de numéro : ajoutez-le sur sa page pour envoyer un rappel.</div>}</div>)}</div>}

    <div className="card">
      <div className="chips" style={{ padding: 0, marginBottom: 8 }}>
        {([["customers", "Clients"], ["prospects", "Prospects"], ["lost", "Perdus"]] as const).map(([k, t]) => <button key={k} className={filter === k ? "on" : ""} onClick={() => setFilter(k)}>{t}</button>)}</div>
      <input placeholder="Chercher un nom ou un numéro" value={q} onChange={(e) => setQ(e.target.value)} />
      {shown.length === 0 && <p className="muted">{filter === "prospects" ? "Aucun prospect. Ajoutez les personnes intéressées pour suivre où vous en êtes." : "Personne ici."}</p>}
      {shown.map((p) => <div key={p.id} onClick={() => setOpen(p.id)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderTop: "1px solid var(--line)", cursor: "pointer" }}>
        <span style={{ width: 42, height: 42, borderRadius: 21, background: "var(--primary)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, flex: "none" }}>{p.name.trim()[0]?.toUpperCase()}</span>
        <div style={{ flex: 1 }}><div style={{ fontSize: 17 }}>{p.name}</div><div className="muted" style={{ fontSize: 14 }}>{filter === "prospects" ? stageLabel(p.stage) : p.phone ?? "Pas de numéro"}</div></div>
        {owes.get(p.id) ? <b style={{ color: "var(--error)", fontSize: 14 }}>doit {n0(owes.get(p.id)!)}</b> : null}</div>)}
      {can && !adding && <button className="primary big" style={{ marginTop: 10 }} onClick={() => { setAdding(true); setNw({ name: "", phone: "", stage: filter === "prospects" ? "prospect" : "customer" }); }}><Icon name="plus" size={20} /> {filter === "prospects" ? "Nouveau prospect" : "Nouveau client"}</button>}
      {adding && <div style={{ marginTop: 10 }}>
        <p><input placeholder="Nom" value={nw.name} onChange={(e) => setNw({ ...nw, name: e.target.value })} /></p>
        <p><input inputMode="tel" placeholder="Téléphone (WhatsApp)" value={nw.phone} onChange={(e) => setNw({ ...nw, phone: e.target.value })} /></p>
        <div style={{ display: "flex", gap: 8 }}><button className="primary big" disabled={!nw.name.trim()} onClick={async () => {
          const { error } = await supabase.rpc("add_contact", { p_business: ctx.business_id, p_name: nw.name, p_phone: nw.phone, p_stage: nw.stage, p_note: null, p_id: crypto.randomUUID() });
          setMsg(error ? "Impossible : " + error.message : "Ajouté."); if (!error) { setAdding(false); load(); } }}>Enregistrer</button>
          <button className="big" onClick={() => setAdding(false)}>Annuler</button></div></div>}
    </div>
  </div>);
}

function CustomerPage({ ctx, id, can, onBack, remind }: { ctx: Ctx; id: string; can: boolean; onBack: () => void; remind: (u: { customer: string; party_id: string; phone: string | null; balance: number; numbers: string[] }) => Promise<void> }) {
  const [f, setF] = useState<File | null>(null); const [note, setNote] = useState(""); const [fu, setFu] = useState({ title: "", due: plusDays(1) }); const [phone, setPhone] = useState<string | null>(null); const [msg, setMsg] = useState("");
  const load = useCallback(async () => { const { data } = await supabase.rpc("customer_file", { p_party: id }); setF(data as File); }, [id]);
  useEffect(() => { load(); }, [load]);
  async function run(p: PromiseLike<{ error: { message: string } | null }>, ok: string) { const { error } = await p; setMsg(error ? "Impossible : " + error.message : navigator.onLine ? ok : "Enregistré sur ce téléphone : envoi dès le retour du réseau."); await load(); }
  if (!f) return <div className="body muted">Chargement…</div>;
  const p = f.party; const left = f.invoiced - f.paid; const wa = waNumber(p.phone);
  const unpaidNums = f.invoices.filter((i) => i.status === "issued" && i.got < i.due).map((i) => i.number ?? "");
  const history = [
    ...f.orders.map((o) => ({ at: o.at, icon: "doc" as const, t: o.status === "quote" ? `Devis ${o.quote ?? ""}` : `Commande ${o.order ?? o.quote ?? ""}`, s: `${n0(o.total)} FCFA · ${({ quote: "devis", confirmed: "confirmée", partial: "livrée en partie", delivered: "livrée", cancelled: "annulée" } as Record<string, string>)[o.status] ?? o.status}` })),
    ...f.invoices.map((i) => ({ at: i.at, icon: "doc" as const, t: `Facture ${i.number ?? "(brouillon)"}`, s: `${n0(i.due)} FCFA · ${i.status === "draft" ? "brouillon" : i.got >= i.due ? "payée ✓" : i.got > 0 ? `payée en partie (reste ${n0(i.due - i.got)})` : "à payer"}`, bad: i.status === "issued" && i.got < i.due })),
    ...f.payments.map((x) => ({ at: x.on, icon: "money" as const, t: "Paiement reçu", s: `${n0(x.amount)} FCFA${x.note ? " · " + x.note : ""}` })),
    ...f.notes.map((n) => ({ at: n.at, icon: (n.kind === "call" ? "phone" : n.kind === "reminder_sent" ? "chat" : "edit") as "phone" | "chat" | "edit", t: n.text, s: n.by ?? "" })),
    ...f.threads.map((t) => ({ at: t.at, icon: "chat" as const, t: "Discussion sur le lien client", s: t.last ?? "" })),
  ].sort((a, b) => (a.at < b.at ? 1 : -1));

  return (<div className="body">
    <button className="big" style={{ minHeight: 48, display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }} onClick={onBack}><Icon name="back" size={22} />Tous les clients</button>
    {msg && <div className="card" style={{ color: msg.startsWith("Impossible") ? "var(--error)" : undefined }}>{msg}</div>}
    <div className="card">
      <h2 style={{ margin: 0 }}>{p.name}</h2>
      <div className="muted" style={{ fontSize: 15 }}>{stageLabel(p.stage)}{p.phone ? ` · ${p.phone}` : ""}</div>
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        {p.phone && <a href={`tel:${p.phone.replace(/\s/g, "")}`} style={{ ...big, textDecoration: "none", border: "1px solid var(--line)", borderRadius: 12, color: "var(--text)" }}><Icon name="phone" size={22} />Appeler</a>}
        {wa && <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" style={{ ...big, textDecoration: "none", border: "1px solid var(--line)", borderRadius: 12, color: "var(--text)" }}><Icon name="chat" size={22} />WhatsApp</a>}</div>
      {!p.phone && can && <div style={{ display: "flex", gap: 8, marginTop: 10 }}><input inputMode="tel" placeholder="Ajouter son téléphone" value={phone ?? ""} onChange={(e) => setPhone(e.target.value)} style={{ flex: 1 }} />
        <button className="primary" disabled={!phone?.trim()} onClick={() => run(supabase.rpc("update_contact", { p_id: p.id, p_phone: phone, p_stage: null }), "Numéro ajouté.")}>OK</button></div>}
    </div>

    <div className="card" style={{ borderLeft: `6px solid ${left > 0 ? "var(--error)" : "var(--primary)"}` }}>
      {left > 0 ? <><div className="muted">Il vous doit</div><div style={{ fontSize: 28, fontWeight: 700, color: "var(--error)" }}>{n0(left)} FCFA</div>
        {wa && <button style={{ ...big, width: "100%", marginTop: 8 }} onClick={() => remind({ customer: p.name, party_id: p.id, phone: p.phone, balance: left, numbers: unpaidNums }).then(load)}><Icon name="chat" size={22} />Envoyer un rappel WhatsApp</button>}</>
        : <><div style={{ fontSize: 20, fontWeight: 700, color: "var(--primary)" }}>Rien à payer ✓</div><div className="muted" style={{ fontSize: 14 }}>Facturé {n0(f.invoiced)} · payé {n0(f.paid)} FCFA</div></>}
    </div>

    {can && <div className="card"><div className="muted" style={{ marginBottom: 6 }}>Où en est-on ?</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{STAGES.map(([k, t]) => <button key={k} className={(p.stage ?? "customer") === k ? "primary" : ""} style={{ minHeight: 44, padding: "0 12px" }} onClick={() => run(supabase.rpc("update_contact", { p_id: p.id, p_phone: null, p_stage: k }), "Étape mise à jour.")}>{t}</button>)}</div></div>}

    <div className="card"><h3 style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}><Icon name="bell" size={22} />Rappels</h3>
      {f.followups.filter((x) => x.status === "open").length === 0 && <p className="muted" style={{ margin: "0 0 6px" }}>Aucun rappel prévu.</p>}
      {f.followups.filter((x) => x.status === "open").map((x) => <div key={x.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderTop: "1px solid var(--line)" }}>
        <div style={{ flex: 1 }}>{x.title}<div className="muted" style={{ fontSize: 14, color: x.due < today() ? "var(--error)" : undefined }}>{x.due === today() ? "Aujourd'hui" : day(x.due)}{x.who ? ` · ${x.who}` : ""}</div></div>
        <button className="primary" style={{ minHeight: 44 }} onClick={() => run(supabase.rpc("set_followup_done", { p_id: x.id, p_done: true }), "Rappel fait.")}><Icon name="check" size={20} /> Fait</button></div>)}
      {can && <div style={{ marginTop: 8 }}>
        <input placeholder="Quoi ? (ex. le rappeler pour la commande)" value={fu.title} onChange={(e) => setFu({ ...fu, title: e.target.value })} />
        <div style={{ display: "flex", gap: 6, margin: "8px 0" }}>{([["Demain", 1], ["Dans 3 jours", 3], ["Dans 1 semaine", 7]] as const).map(([t, n]) => <button key={n} className={fu.due === plusDays(n) ? "primary" : ""} style={{ flex: 1, minHeight: 44, fontSize: 14 }} onClick={() => setFu({ ...fu, due: plusDays(n) })}>{t}</button>)}</div>
        <input type="date" value={fu.due} onChange={(e) => setFu({ ...fu, due: e.target.value })} />
        <button className="primary big" style={{ marginTop: 8 }} disabled={!fu.title.trim()} onClick={() => run(supabase.rpc("add_followup", { p_party: p.id, p_title: fu.title, p_due: fu.due, p_assignee: null, p_id: crypto.randomUUID() }), "Rappel ajouté : il apparaîtra dans « À faire » le jour venu.").then(() => setFu({ title: "", due: plusDays(1) }))}>Ajouter le rappel</button></div>}</div>

    {can && <div className="card"><h3 style={{ marginBottom: 6 }}>Ajouter une note</h3>
      <textarea rows={2} placeholder="Ce qui a été dit, ce qu'il veut…" value={note} onChange={(e) => setNote(e.target.value)} style={{ width: "100%", borderRadius: 10, border: "1px solid var(--line)", background: "var(--surface)", color: "var(--text)", padding: 10, fontSize: 16 }} />
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <button className="primary" style={big} disabled={!note.trim()} onClick={() => run(supabase.rpc("add_party_note", { p_party: p.id, p_text: note, p_kind: "note", p_id: crypto.randomUUID() }), "Note ajoutée.").then(() => setNote(""))}><Icon name="edit" size={20} />Note</button>
        <button style={big} disabled={!note.trim()} onClick={() => run(supabase.rpc("add_party_note", { p_party: p.id, p_text: "Appel : " + note, p_kind: "call", p_id: crypto.randomUUID() }), "Appel noté.").then(() => setNote(""))}><Icon name="phone" size={20} />C&apos;était un appel</button></div></div>}

    {can && <Merge ctx={ctx} party={p} onDone={onBack} />}

    <div className="card"><h3 style={{ marginBottom: 6 }}>Historique</h3>
      {history.length === 0 && <p className="muted">Rien encore.</p>}
      {history.map((h, i) => <div key={i} style={{ display: "flex", gap: 10, padding: "10px 0", borderTop: "1px solid var(--line)" }}>
        <span style={{ color: "var(--primary)", paddingTop: 2 }}><Icon name={h.icon} size={20} /></span>
        <div style={{ flex: 1 }}><div>{h.t}</div><div className="muted" style={{ fontSize: 14, color: "bad" in h && h.bad ? "var(--error)" : undefined }}>{h.s}</div></div>
        <span className="muted" style={{ fontSize: 13, whiteSpace: "nowrap" }}>{day(h.at)}</span></div>)}</div>
  </div>);
}

// Same person entered twice (e.g. a misspelt name): move everything onto the right card.
function Merge({ ctx, party, onDone }: { ctx: Ctx; party: Party; onDone: () => void }) {
  const [others, setOthers] = useState<{ id: string; name: string }[]>([]); const [pick, setPick] = useState(""); const [open, setOpen] = useState(false); const [err, setErr] = useState("");
  useEffect(() => { if (open) supabase.from("party").select("id,name").eq("business_id", ctx.business_id).eq("kind", "customer").eq("active", true).neq("id", party.id).order("name").then(({ data }) => setOthers(data ?? [])); }, [open, ctx.business_id, party.id]);
  if (!open) return <button style={{ minHeight: 44, width: "100%", marginBottom: 12 }} onClick={() => setOpen(true)}>Ce client est en double ?</button>;
  return (<div className="card"><h3 style={{ marginBottom: 4 }}>Client en double</h3>
    <div className="muted" style={{ fontSize: 14, marginBottom: 8 }}>Choisissez la bonne fiche : tout ce qui est ici (factures, commandes, paiements, notes) y sera déplacé, et « {party.name} » sera retiré de la liste.</div>
    <select value={pick} onChange={(e) => setPick(e.target.value)} style={{ width: "100%", minHeight: 46, borderRadius: 10, border: "1px solid var(--line)", background: "var(--surface)", color: "var(--text)" }}><option value="">La bonne fiche est…</option>{others.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select>
    {err && <div style={{ color: "var(--error)", marginTop: 6 }}>{err}</div>}
    <div style={{ display: "flex", gap: 8, marginTop: 8 }}><button className="primary big" disabled={!pick} onClick={async () => { const nm = others.find((o) => o.id === pick)?.name; if (!window.confirm(`Tout mettre sur « ${nm} » ?`)) return; const { error } = await supabase.rpc("merge_customer", { p_from: party.id, p_into: pick }); if (error) setErr("Impossible : " + error.message); else onDone(); }}>Regrouper</button>
      <button className="big" onClick={() => setOpen(false)}>Annuler</button></div></div>);
}
