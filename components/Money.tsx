"use client";
// Argent (P-024): accounts, cash book, receipts against invoices, supplier payments, expenses, transfers, simple profit and loss (cash basis).
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Ctx } from "./Chats";
import { useCanMaintain } from "./useCan";

type Acc = { id: string; name: string; kind: string; balance: number };
type Summary = { accounts: Acc[]; income: number; expenses: { category: string; amount: number }[] };
type Inv = { id: string; number: string | null; customer: string; ttc: number; paid: number };
type PayRec = { id: string; customer: string; amount: number; method: string; at: string };
type Owe = { id: string; number: string | null; supplier: string; amount: number };
type Entry = { id: string; account_id: string; amount_fcfa: number; kind: string; category: string | null; party: string | null; note: string | null; occurred_on: string };
const KIND: Record<string, string> = { cash: "Caisse", mobile: "Mobile money", bank: "Banque", other: "Autre" };
const LABEL: Record<string, string> = { receipt: "Encaissement", supplier_payment: "Paiement fournisseur", expense: "Dépense", transfer: "Virement" };
const n0 = (v: number) => Math.round(v).toLocaleString("fr-FR");
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const sel: React.CSSProperties = { width: "100%", minHeight: 46, borderRadius: 10, border: "1px solid var(--line)", background: "var(--surface)", color: "var(--text)", padding: "0 10px" };

export default function Money({ ctx }: { ctx: Ctx }) {
  const can = useCanMaintain(ctx);
  const [month, setMonth] = useState<0 | 1>(0);
  const [sum, setSum] = useState<Summary | null>(null);
  const [invs, setInvs] = useState<Inv[]>([]); const [recs, setRecs] = useState<PayRec[]>([]); const [owes, setOwes] = useState<Owe[]>([]); const [entries, setEntries] = useState<Entry[]>([]);
  const [acct, setAcct] = useState(""); const [amt, setAmt] = useState<Record<string, string>>({});
  const [form, setForm] = useState<"" | "account" | "expense" | "transfer">("");
  const [f, setF] = useState({ name: "", kind: "cash", opening: "", amount: "", category: "", note: "", to: "" });
  const [msg, setMsg] = useState(""); const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    const now = new Date(); const from = new Date(now.getFullYear(), now.getMonth() - month, 1); const to = month ? new Date(now.getFullYear(), now.getMonth(), 0) : now;
    const [{ data: s }, { data: iv }, { data: pe }, { data: po }, { data: en }, { data: rt }] = await Promise.all([
      supabase.rpc("money_summary", { p_business: ctx.business_id, p_from: iso(from), p_to: iso(to) }),
      supabase.from("invoice").select("id,number,customer,total_fcfa,ttc_fcfa").eq("business_id", ctx.business_id).eq("status", "issued"),
      supabase.from("money_entry").select("invoice_id,source_record_id,amount_fcfa").eq("business_id", ctx.business_id).is("voided_at", null).or("invoice_id.not.is.null,source_record_id.not.is.null"),
      supabase.from("purchase_order").select("id,number,supplier_name,supplier_invoice_fcfa").eq("business_id", ctx.business_id).not("supplier_invoice_fcfa", "is", null).is("paid_at", null).neq("status", "cancelled"),
      supabase.from("money_entry").select("id,account_id,amount_fcfa,kind,category,party,note,occurred_on").eq("business_id", ctx.business_id).is("voided_at", null).order("occurred_on", { ascending: false }).order("created_at", { ascending: false }).limit(15),
      supabase.from("record_type").select("id").eq("business_id", ctx.business_id).eq("name", "payment").limit(1),
    ]);
    const sm = s as Summary | null; setSum(sm); if (sm?.accounts.length && !sm.accounts.some((a) => a.id === acct)) setAcct(sm.accounts[0].id);
    const paid = new Map<string, number>(); const used = new Set<string>();
    for (const e of (pe ?? []) as { invoice_id: string | null; source_record_id: string | null; amount_fcfa: number }[]) { if (e.invoice_id) paid.set(e.invoice_id, (paid.get(e.invoice_id) ?? 0) + e.amount_fcfa); if (e.source_record_id) used.add(e.source_record_id); }
    setInvs(((iv ?? []) as { id: string; number: string | null; customer: string; total_fcfa: number; ttc_fcfa: number | null }[]).map((i) => ({ id: i.id, number: i.number, customer: i.customer, ttc: i.ttc_fcfa ?? i.total_fcfa, paid: paid.get(i.id) ?? 0 })).filter((i) => i.paid < i.ttc));
    setOwes(((po ?? []) as { id: string; number: string | null; supplier_name: string; supplier_invoice_fcfa: number }[]).map((p) => ({ id: p.id, number: p.number, supplier: p.supplier_name, amount: p.supplier_invoice_fcfa })));
    setEntries((en ?? []) as Entry[]);
    if (rt?.[0]) {
      const since = new Date(Date.now() - 60 * 864e5).toISOString();
      const { data: cr } = await supabase.from("current_record").select("id,fields,occurred_at").eq("business_id", ctx.business_id).eq("record_type_id", rt[0].id).gte("occurred_at", since).order("occurred_at", { ascending: false });
      setRecs((cr ?? []).filter((r) => !used.has(r.id)).map((r) => { const x = r.fields as Record<string, unknown>; return { id: r.id, customer: String(x.customer ?? ""), amount: Number(x.amount_fcfa ?? 0), method: String(x.method ?? ""), at: r.occurred_at as string }; }).filter((r) => r.amount > 0));
    }
  }, [ctx.business_id, month, acct]);
  useEffect(() => { load(); }, [load]);

  async function act(key: string, fn: () => PromiseLike<{ error: { message: string } | null }>, ok: string) {
    setBusy(key); setMsg("");
    const { error } = await fn(); setBusy("");
    if (error) setMsg("Impossible : " + error.message); else setMsg(navigator.onLine ? ok : "Enregistré sur ce téléphone : envoi dès le retour du réseau.");
    await load();
  }
  const num = (s: string) => Math.round(Number((s || "").replace(/\s/g, "").replace(",", ".")));
  const accounts = sum?.accounts ?? [];
  const total = accounts.reduce((t, a) => t + a.balance, 0);
  const accName = (id: string) => accounts.find((a) => a.id === id)?.name ?? "";
  const AccSelect = <select style={sel} value={acct} onChange={(e) => setAcct(e.target.value)}>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>;

  if (sum === null) return <div className="body muted">Chargement…</div>;
  const expTotal = sum.expenses.reduce((t, e) => t + e.amount, 0);
  return (<div className="body">
    {msg && <div className="card" style={{ color: msg.startsWith("Impossible") ? "var(--error)" : undefined }}>{msg}</div>}
    <div className="card"><h3 style={{ marginBottom: 6 }}>Comptes</h3>
      {accounts.length === 0 && <p className="muted">Créez d'abord un compte (caisse, mobile money, banque) avec son solde de départ.</p>}
      {accounts.map((a) => <div key={a.id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderTop: "1px solid var(--line)" }}><span>{a.name} <span className="muted" style={{ fontSize: 12 }}>{KIND[a.kind]}</span></span><b>{n0(a.balance)} FCFA</b></div>)}
      {accounts.length > 1 && <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 6, borderTop: "1px solid var(--line)" }}><b>Total</b><b>{n0(total)} FCFA</b></div>}
      {can && <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
        <button style={{ minHeight: 38 }} onClick={() => setForm(form === "account" ? "" : "account")}>+ Compte</button>
        {accounts.length > 0 && <button style={{ minHeight: 38 }} onClick={() => setForm(form === "expense" ? "" : "expense")}>+ Dépense</button>}
        {accounts.length > 1 && <button style={{ minHeight: 38 }} onClick={() => setForm(form === "transfer" ? "" : "transfer")}>Virement</button>}</div>}
      {form === "account" && <div style={{ marginTop: 10 }}>
        <p><input placeholder="Nom (ex. Caisse, MTN MoMo)" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></p>
        <div className="chips">{Object.entries(KIND).map(([k, t]) => <button key={k} className={f.kind === k ? "on" : ""} onClick={() => setF({ ...f, kind: k })}>{t}</button>)}</div>
        <p><input inputMode="numeric" placeholder="Solde de départ (FCFA)" value={f.opening} onChange={(e) => setF({ ...f, opening: e.target.value })} /></p>
        <button className="primary" disabled={busy === "acc" || !f.name.trim()} onClick={() => act("acc", () => supabase.rpc("create_money_account", { p_business: ctx.business_id, p_name: f.name, p_kind: f.kind, p_opening: num(f.opening) || 0, p_id: crypto.randomUUID() }), "Compte créé.").then(() => { setForm(""); setF({ ...f, name: "", opening: "" }); })}>Créer</button></div>}
      {form === "expense" && <div style={{ marginTop: 10 }}>
        <p>{AccSelect}</p>
        <p><input inputMode="numeric" placeholder="Montant (FCFA)" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></p>
        <div className="chips">{["Carburant", "Salaires", "Réparations", "Transport", "Électricité et eau", "Autres dépenses"].map((c) => <button key={c} className={f.category === c ? "on" : ""} onClick={() => setF({ ...f, category: c })}>{c}</button>)}</div>
        <p><input placeholder="Note (facultatif)" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></p>
        <button className="primary" disabled={busy === "exp" || !num(f.amount)} onClick={() => act("exp", () => supabase.rpc("record_expense", { p_business: ctx.business_id, p_account: acct, p_amount: num(f.amount), p_category: f.category, p_party: null, p_note: f.note || null, p_date: null, p_id: crypto.randomUUID() }), "Dépense enregistrée.").then(() => { setForm(""); setF({ ...f, amount: "", note: "" }); })}>Enregistrer</button></div>}
      {form === "transfer" && <div style={{ marginTop: 10 }}>
        <p className="muted" style={{ margin: "0 0 4px" }}>De</p><p style={{ marginTop: 0 }}>{AccSelect}</p>
        <p className="muted" style={{ margin: "0 0 4px" }}>Vers</p><p style={{ marginTop: 0 }}><select style={sel} value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })}><option value="">Choisir…</option>{accounts.filter((a) => a.id !== acct).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></p>
        <p><input inputMode="numeric" placeholder="Montant (FCFA)" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></p>
        <button className="primary" disabled={busy === "tr" || !num(f.amount) || !f.to} onClick={() => act("tr", () => supabase.rpc("transfer_money", { p_business: ctx.business_id, p_from: acct, p_to: f.to, p_amount: num(f.amount), p_note: null, p_date: null, p_id: crypto.randomUUID() }), "Virement enregistré.").then(() => { setForm(""); setF({ ...f, amount: "", to: "" }); })}>Enregistrer</button></div>}
    </div>

    {can && accounts.length > 0 && recs.length > 0 && <div className="card"><h3 style={{ marginBottom: 2 }}>Paiements à enregistrer</h3>
      <div className="muted" style={{ marginBottom: 6 }}>Paiements approuvés (60 jours) pas encore dans un compte. Compte : {accName(acct)}</div>
      <p>{AccSelect}</p>
      {recs.slice(0, 10).map((r) => <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "8px 0", borderTop: "1px solid var(--line)" }}>
        <span>{r.customer || "Client"} · <b>{n0(r.amount)}</b><div className="muted" style={{ fontSize: 12 }}>{r.method} · {new Date(r.at).toLocaleDateString("fr-FR")}</div></span>
        <button style={{ minHeight: 36 }} disabled={busy === r.id} onClick={() => act(r.id, () => supabase.rpc("record_receipt", { p_business: ctx.business_id, p_account: acct, p_amount: r.amount, p_invoice: null, p_party: r.customer, p_note: r.method, p_date: null, p_source: r.id, p_id: crypto.randomUUID() }), "Encaissement enregistré.")}>Enregistrer</button></div>)}</div>}

    {can && accounts.length > 0 && invs.length > 0 && <div className="card"><h3 style={{ marginBottom: 2 }}>Factures à encaisser</h3>
      <div className="muted" style={{ marginBottom: 6 }}>Qui vous doit de l'argent · compte : {accName(acct)}</div>
      {invs.map((i) => { const left = i.ttc - i.paid; return <div key={i.id} style={{ padding: "8px 0", borderTop: "1px solid var(--line)" }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}><span>{i.customer} <span className="muted" style={{ fontSize: 12 }}>{i.number}</span></span><b>reste {n0(left)}</b></div>
        {i.paid > 0 && <div className="muted" style={{ fontSize: 12 }}>déjà payé {n0(i.paid)} sur {n0(i.ttc)}</div>}
        <div style={{ display: "flex", gap: 8, marginTop: 6 }}><input inputMode="numeric" style={{ flex: 1 }} placeholder={String(left)} value={amt[i.id] ?? ""} onChange={(e) => setAmt({ ...amt, [i.id]: e.target.value })} />
          <button className="primary" style={{ minHeight: 44 }} disabled={busy === i.id} onClick={() => act(i.id, () => supabase.rpc("record_receipt", { p_business: ctx.business_id, p_account: acct, p_amount: num(amt[i.id] ?? "") || left, p_invoice: i.id, p_party: null, p_note: null, p_date: null, p_id: crypto.randomUUID() }), "Encaissement enregistré.").then(() => setAmt({ ...amt, [i.id]: "" }))}>Encaisser</button></div></div>; })}</div>}

    {can && accounts.length > 0 && owes.length > 0 && <div className="card"><h3 style={{ marginBottom: 2 }}>À payer aux fournisseurs</h3>
      <div className="muted" style={{ marginBottom: 6 }}>Factures fournisseurs enregistrées, non payées · compte : {accName(acct)}</div>
      {owes.map((o) => <div key={o.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "8px 0", borderTop: "1px solid var(--line)" }}>
        <span>{o.supplier} <span className="muted" style={{ fontSize: 12 }}>{o.number}</span><div><b>{n0(o.amount)} FCFA</b></div></span>
        <button style={{ minHeight: 36 }} disabled={busy === o.id} onClick={() => act(o.id, () => supabase.rpc("pay_purchase", { p_id: o.id, p_account: acct, p_date: null, p_entry: crypto.randomUUID() }), "Paiement enregistré.")}>Payer</button></div>)}</div>}

    <div className="card"><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><h3 style={{ margin: 0 }}>Résultat</h3>
      <div className="chips" style={{ padding: 0 }}><button className={month === 0 ? "on" : ""} onClick={() => setMonth(0)}>Ce mois</button><button className={month === 1 ? "on" : ""} onClick={() => setMonth(1)}>Mois dernier</button></div></div>
      <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0" }}><span>Encaissé</span><b style={{ color: "var(--ok)" }}>{n0(sum.income)} FCFA</b></div>
      {sum.expenses.map((e) => <div key={e.category} style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}><span className="muted">{e.category}</span><span>− {n0(e.amount)}</span></div>)}
      <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderTop: "1px solid var(--line)", marginTop: 6 }}><b>Résultat</b><b style={{ color: sum.income - expTotal < 0 ? "var(--error)" : "var(--ok)" }}>{n0(sum.income - expTotal)} FCFA</b></div>
      <div className="muted" style={{ fontSize: 12 }}>Calcul sur l'argent réellement entré et sorti (hors virements entre comptes).</div></div>

    {entries.length > 0 && <div className="card"><h3 style={{ marginBottom: 6 }}>Journal</h3>
      {entries.map((e) => <div key={e.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "7px 0", borderTop: "1px solid var(--line)", fontSize: 14 }}>
        <span>{LABEL[e.kind]}{e.party ? ` · ${e.party}` : ""}{e.category && e.kind === "expense" ? ` · ${e.category}` : ""}<div className="muted" style={{ fontSize: 12 }}>{accName(e.account_id)} · {new Date(e.occurred_on).toLocaleDateString("fr-FR")}{e.note ? ` · ${e.note}` : ""}</div></span>
        <span style={{ textAlign: "right" }}><b style={{ color: e.amount_fcfa < 0 ? "var(--error)" : "var(--ok)" }}>{e.amount_fcfa > 0 ? "+" : ""}{n0(e.amount_fcfa)}</b>
          {can && <div><button style={{ minHeight: 28, fontSize: 12, padding: "0 8px" }} disabled={busy === e.id} onClick={() => { if (window.confirm("Annuler cette écriture ?")) act(e.id, () => supabase.rpc("void_money_entry", { p_id: e.id }), "Écriture annulée."); }}>Annuler</button></div>}</span></div>)}</div>}
  </div>);
}
