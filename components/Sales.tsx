"use client";
// Ventes (P-025): one document that moves quote -> order -> delivery -> invoice. Delivery takes stock out. Customer balances on top.
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Ctx } from "./Chats";
import { useCanMaintain } from "./useCan";
import { invoicePdf } from "@/lib/invoicePdf";

type SLine = { item_id?: string | null; label: string; unit?: string; qty: number; unit_price: number; total: number; delivered?: number; invoiced?: number };
type SO = { id: string; customer: string; status: string; quote_number: string | null; order_number: string | null; lines: SLine[]; total_fcfa: number; valid_until: string | null; source_record_id: string | null; created_at: string };
type Prod = { id: string; name: string; unit: string | null; price_fcfa: number | null };
type Party = { id: string; name: string };
type Level = { item_id: string; name: string };
type Bal = { customer: string; invoiced: number; paid: number; balance: number };
type Imp = { id: string; type: string; who: string; at: string };
const STATUS: Record<string, string> = { quote: "Devis", confirmed: "À livrer", partial: "Livrée en partie", delivered: "Livrée", cancelled: "Annulée" };
const TYPE: Record<string, string> = { chicken_order: "Vente de poulets", loading_order: "Chargement d'œufs" };
const n0 = (v: number) => Math.round(v).toLocaleString("fr-FR");
const day = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
const sel: React.CSSProperties = { width: "100%", minHeight: 46, borderRadius: 10, border: "1px solid var(--line)", background: "var(--surface)", color: "var(--text)", padding: "0 10px" };

export default function Sales({ ctx, openId }: { ctx: Ctx; openId?: string }) {
  const can = useCanMaintain(ctx);
  const [orders, setOrders] = useState<SO[]>([]); const [prods, setProds] = useState<Prod[]>([]); const [custs, setCusts] = useState<Party[]>([]);
  const [items, setItems] = useState<Level[]>([]); const [bals, setBals] = useState<Bal[]>([]); const [imps, setImps] = useState<Imp[]>([]);
  const [invOf, setInvOf] = useState<Record<string, string>>({});
  const [biz, setBiz] = useState<{ logo: string | null; vat: number; niu: string | null }>({ logo: null, vat: 0, niu: null });
  const [form, setForm] = useState<null | { party: string; name: string; days: string; note: string; lines: { prod: string; label: string; qty: string; price: string; unit: string; item: string }[] }>(null);
  const [dl, setDl] = useState<Record<string, string[]>>({}); const [bill, setBill] = useState<Record<string, string[] | undefined>>({});
  const [msg, setMsg] = useState(""); const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    const [{ data: o }, { data: p }, { data: c }, { data: it }, { data: bl }, { data: iv }, { data: bz }, { data: rts }] = await Promise.all([
      supabase.from("sales_order").select("id,customer,status,quote_number,order_number,lines,total_fcfa,valid_until,source_record_id,created_at").eq("business_id", ctx.business_id).order("created_at", { ascending: false }).limit(50),
      supabase.from("product").select("id,name,unit,price_fcfa").eq("business_id", ctx.business_id).eq("active", true).order("name"),
      supabase.from("party").select("id,name").eq("business_id", ctx.business_id).eq("kind", "customer").eq("active", true).order("name"),
      supabase.rpc("stock_levels", { p_business: ctx.business_id }),
      supabase.rpc("customer_balances", { p_business: ctx.business_id }),
      supabase.from("invoice").select("id,sales_order_id,source_record_id,status").eq("business_id", ctx.business_id).neq("status", "void"),
      supabase.from("business").select("logo,vat_enabled,vat_rate,niu").eq("id", ctx.business_id).single(),
      supabase.from("record_type").select("id,name").eq("business_id", ctx.business_id).in("name", ["chicken_order", "loading_order"]),
    ]);
    const list = (o as SO[]) ?? []; setOrders(list); setProds((p as Prod[]) ?? []); setCusts((c as Party[]) ?? []); setItems((it as Level[]) ?? []); setBals((bl as Bal[]) ?? []);
    const m: Record<string, string> = {}; const billed = new Set<string>();
    for (const i of (iv ?? []) as { id: string; sales_order_id: string | null; source_record_id: string | null }[]) { if (i.sales_order_id) m[i.sales_order_id] = i.id; if (i.source_record_id) billed.add(i.source_record_id); }
    setInvOf(m);
    if (bz) setBiz({ logo: bz.logo ?? null, vat: bz.vat_enabled ? Number(bz.vat_rate) : 0, niu: bz.niu ?? null });
    const tn = new Map((rts ?? []).map((r) => [r.id as string, r.name as string]));
    if (tn.size) {
      const since = new Date(Date.now() - 60 * 864e5).toISOString();
      const { data: cr } = await supabase.from("current_record").select("id,record_type_id,fields,occurred_at").eq("business_id", ctx.business_id).in("record_type_id", [...tn.keys()]).gte("occurred_at", since).order("occurred_at", { ascending: false });
      const inSo = new Set(list.filter((x) => x.status !== "cancelled").map((x) => x.source_record_id));
      setImps((cr ?? []).filter((r) => !inSo.has(r.id) && !billed.has(r.id)).map((r) => { const f = r.fields as Record<string, unknown>; return { id: r.id, type: tn.get(r.record_type_id)!, who: String(f.customer ?? f.destination ?? "?"), at: r.occurred_at as string }; }));
    }
  }, [ctx.business_id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (openId && orders.length) document.getElementById("so-" + openId)?.scrollIntoView({ block: "center" }); }, [openId, orders.length]);

  async function act(key: string, fn: () => PromiseLike<{ error: { message: string } | null }>, ok: string) {
    setBusy(key); setMsg("");
    const { error } = await fn(); setBusy("");
    if (error) setMsg(error.message.startsWith("prix manquant") ? `${error.message}. Ajoutez le prix dans Répertoire → Produits.` : "Impossible : " + error.message);
    else setMsg(navigator.onLine ? ok : "Enregistré sur ce téléphone : envoi dès le retour du réseau.");
    await load();
  }
  const num = (s: string) => Number((s || "").replace(/\s/g, "").replace(",", "."));
  const startForm = () => setForm({ party: "", name: "", days: "30", note: "", lines: [{ prod: "", label: "", qty: "", price: "", unit: "", item: "" }] });
  function setLine(i: number, patch: Partial<NonNullable<typeof form>["lines"][number]>) { setForm((f) => f && { ...f, lines: f.lines.map((l, j) => j === i ? { ...l, ...patch } : l) }); }
  function pickProduct(i: number, id: string) {
    const pr = prods.find((x) => x.id === id);
    if (!pr) return setLine(i, { prod: "", label: "", price: "", unit: "", item: "" });
    const guess = items.find((x) => x.name.toLowerCase().replace(/s\b/, "").includes(pr.name.toLowerCase().replace(/ \(.*/, "").replace(/s\b/, "")))?.item_id ?? "";
    setLine(i, { prod: id, label: pr.name, price: pr.price_fcfa ? String(pr.price_fcfa) : "", unit: pr.unit ?? "", item: guess });
  }
  async function createQuote() {
    if (!form) return;
    const lines = form.lines.filter((l) => l.label.trim() && num(l.qty) > 0).map((l) => ({ item_id: l.item || null, label: l.label.trim(), unit: l.unit || null, qty: num(l.qty), unit_price: num(l.price) || 0 }));
    if (!lines.length || !form.party || form.party === "__new") return setMsg("Choisissez un client dans la liste et ajoutez au moins une ligne.");
    const valid = new Date(Date.now() + (num(form.days) || 30) * 864e5).toISOString().slice(0, 10);
    await act("new", () => supabase.rpc("create_quote", { p_business: ctx.business_id, p_party: form.party, p_customer: "", p_lines: lines, p_valid_until: valid, p_note: form.note || null, p_id: crypto.randomUUID() }), "Devis créé.");
    setForm(null);
  }
  async function pdf(o: SO) {
    try {
      const isQuote = o.status === "quote"; const ht = o.total_fcfa; const vat = biz.vat > 0 ? Math.round(ht * biz.vat / 100) : 0;
      const file = await invoicePdf({ number: isQuote ? o.quote_number : o.order_number, customer: o.customer, lines: o.lines.map((l) => ({ label: l.label, qty: l.qty, unit_price: l.unit_price, total: l.total })), total_fcfa: ht, vat_rate: biz.vat, vat_fcfa: vat, ttc_fcfa: ht + vat, seller_niu: biz.niu, customer_niu: null, status: o.status === "cancelled" ? "void" : "issued", date: day(o.created_at), title: isQuote ? "DEVIS" : "COMMANDE", validUntil: isQuote && o.valid_until ? day(o.valid_until) : undefined }, ctx.business, biz.logo);
      if (navigator.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file], title: file.name }); return; } catch (e) { if ((e as Error).name === "AbortError") return; } }
      const url = URL.createObjectURL(file); const a = document.createElement("a"); a.href = url; a.download = file.name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch { setMsg("Impossible de créer le PDF."); }
  }

  const live = orders.filter((o) => o.status !== "cancelled");
  return (<div className="body">
    {msg && <div className="card" style={{ color: msg.startsWith("Impossible") || msg.includes("prix manquant") ? "var(--error)" : undefined }}>{msg}</div>}
    {bals.length > 0 && <div className="card"><h3 style={{ marginBottom: 6 }}>Soldes clients</h3>
      {bals.slice(0, 8).map((b) => <div key={b.customer} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderTop: "1px solid var(--line)" }}><span>{b.customer}<div className="muted" style={{ fontSize: 12 }}>facturé {n0(b.invoiced)} · payé {n0(b.paid)}</div></span><b>doit {n0(b.balance)}</b></div>)}</div>}
    {can && imps.length > 0 && <div className="card"><h3 style={{ marginBottom: 2 }}>Commandes du chat à suivre</h3>
      <div className="muted" style={{ marginBottom: 6 }}>Commandes approuvées (60 jours) : suivez-les ici, de la livraison à la facture.</div>
      {imps.slice(0, 10).map((c) => <div key={c.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "8px 0", borderTop: "1px solid var(--line)" }}>
        <span>{c.who}<div className="muted" style={{ fontSize: 12 }}>{TYPE[c.type]} · {day(c.at)}</div></span>
        <button style={{ minHeight: 36 }} disabled={busy === c.id} onClick={() => act(c.id, () => supabase.rpc("order_from_record", { p_record: c.id, p_id: crypto.randomUUID() }), "Commande ajoutée à Ventes.")}>Suivre</button></div>)}</div>}
    {can && !form && <button className="primary big" style={{ marginBottom: 10 }} onClick={startForm}>+ Nouveau devis</button>}
    {form && <div className="card"><h3>Nouveau devis</h3>
      <p><select style={sel} value={form.party} onChange={(e) => setForm({ ...form, party: e.target.value, name: "" })}><option value="">Choisir le client…</option>{custs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}<option value="__new">+ Nouveau client</option></select></p>
      {form.party === "__new" && <div style={{ display: "flex", gap: 8, marginBottom: 8 }}><input placeholder="Nom du nouveau client" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={{ flex: 1 }} />
        <button className="primary" disabled={!form.name.trim()} onClick={async () => { const id = crypto.randomUUID(); const { error } = await supabase.rpc("add_contact", { p_business: ctx.business_id, p_name: form.name, p_phone: null, p_stage: "customer", p_note: null, p_id: id }); if (error) return setMsg("Impossible : " + error.message); setCusts((c) => [...c, { id, name: form.name.trim() }].sort((a, b) => a.name.localeCompare(b.name))); setForm({ ...form, party: id, name: "" }); }}>Ajouter</button></div>}
      {form.lines.map((l, i) => <div key={i} style={{ borderTop: "1px solid var(--line)", paddingTop: 8, marginTop: 8 }}>
        {prods.length > 0 && <p style={{ margin: "0 0 6px" }}><select style={sel} value={l.prod} onChange={(e) => pickProduct(i, e.target.value)}><option value="">Produit de la liste…</option>{prods.map((x) => <option key={x.id} value={x.id}>{x.name}{x.price_fcfa ? ` · ${n0(x.price_fcfa)}` : ""}</option>)}</select></p>}
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 6 }}>
          <input placeholder="Article" value={l.label} onChange={(e) => setLine(i, { label: e.target.value })} />
          <input inputMode="decimal" placeholder="Qté" value={l.qty} onChange={(e) => setLine(i, { qty: e.target.value })} />
          <input inputMode="decimal" placeholder="Prix" value={l.price} onChange={(e) => setLine(i, { price: e.target.value })} /></div>
        {items.length > 0 && <p style={{ margin: "6px 0 0" }}><select style={sel} value={l.item} onChange={(e) => setLine(i, { item: e.target.value })}><option value="">Sort du stock : aucun</option>{items.map((x) => <option key={x.item_id} value={x.item_id}>Sort du stock : {x.name}</option>)}</select></p>}
      </div>)}
      <p><input placeholder="Valable (jours)" inputMode="numeric" value={form.days} onChange={(e) => setForm({ ...form, days: e.target.value })} /></p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button onClick={() => setForm({ ...form, lines: [...form.lines, { prod: "", label: "", qty: "", price: "", unit: "", item: "" }] })}>+ Ligne</button>
        <button className="primary" disabled={busy === "new"} onClick={createQuote}>Créer le devis</button><button onClick={() => setForm(null)}>Annuler</button></div></div>}
    {live.length === 0 && !form && <div className="card"><h3>Ventes</h3><p className="muted">Aucun devis ni commande pour l'instant.</p></div>}
    {orders.map((o) => { const rest = o.lines.map((l) => String(Math.max(0, l.qty - (l.delivered ?? 0)))); const d = dl[o.id] ?? rest; const invId = invOf[o.id]; const toBill = o.lines.map((l) => Math.max(0, Math.min(l.qty, l.delivered ?? 0) - (l.invoiced ?? 0))); const leftBill = o.lines.map((l) => Math.max(0, l.qty - (l.invoiced ?? 0))); const allBilled = leftBill.every((x) => x === 0); const b = bill[o.id]; return (
      <div className="card" key={o.id} id={"so-" + o.id} style={{ ...(o.status === "cancelled" ? { opacity: 0.6 } : {}), ...(o.id === openId ? { outline: "3px solid var(--primary)" } : {}) }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><b>{o.order_number ?? o.quote_number} · {o.customer}</b><span className="muted">{STATUS[o.status]}</span></div>
        {o.lines.map((l, i) => <div key={i} className="muted" style={{ fontSize: 13 }}>{l.label} : {n0(l.qty)}{l.delivered ? ` · livré ${n0(l.delivered)}` : ""}{l.invoiced ? ` · facturé ${n0(l.invoiced)}` : ""} × {n0(l.unit_price)}</div>)}
        <div style={{ marginTop: 4 }}><b>{n0(o.total_fcfa)} FCFA</b> <span className="muted">· {day(o.created_at)}{o.status === "quote" && o.valid_until ? ` · valable jusqu'au ${day(o.valid_until)}` : ""}</span></div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
          <button style={{ minHeight: 36 }} onClick={() => pdf(o)}>PDF</button>
          {can && o.status === "quote" && <button className="primary" style={{ minHeight: 36 }} disabled={busy === o.id} onClick={() => act(o.id, () => supabase.rpc("confirm_order", { p_id: o.id }), "Devis accepté : c'est maintenant une commande.")}>Client d'accord</button>}
          {can && ["confirmed", "partial", "delivered"].includes(o.status) && !allBilled && !b && <button style={{ minHeight: 36 }} onClick={() => setBill({ ...bill, [o.id]: toBill.map(String) })}>{toBill.some((x) => x > 0) ? "Facturer ce qui est livré" : "Facturer"}</button>}
          {invId && <span className="muted" style={{ alignSelf: "center", fontSize: 13 }}>{allBilled ? "Tout est facturé (voir Factures)" : "Facturée en partie (voir Factures)"}</span>}
          {can && ["quote", "confirmed"].includes(o.status) && <button style={{ minHeight: 36 }} disabled={busy === o.id} onClick={() => { if (window.confirm("Annuler ?")) act(o.id, () => supabase.rpc("cancel_order", { p_id: o.id }), "Annulée."); }}>Annuler</button>}
        </div>
        {can && b && <div style={{ marginTop: 10, borderTop: "1px solid var(--line)", paddingTop: 8 }}>
          <div className="muted" style={{ fontSize: 13, marginBottom: 4 }}>Quantités à mettre sur cette facture (proposé : livré et pas encore facturé)</div>
          {o.lines.map((l, i) => <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}><span style={{ flex: 1 }}>{l.label}<span className="muted" style={{ fontSize: 12 }}> · reste {n0(leftBill[i])}</span></span>
            <input inputMode="decimal" style={{ width: 90 }} value={b[i]} onChange={(e) => setBill({ ...bill, [o.id]: b.map((x, j) => j === i ? e.target.value : x) })} /></div>)}
          <div className="muted" style={{ fontSize: 14, margin: "4px 0 8px" }}>Montant : <b style={{ color: "var(--text)" }}>{n0(o.lines.reduce((t, l, i) => t + (num(b[i]) || 0) * l.unit_price, 0))} FCFA</b>{biz.vat ? " HT" : ""}</div>
          <div style={{ display: "flex", gap: 8 }}><button className="primary" style={{ minHeight: 44, flex: 1 }} disabled={busy === o.id || b.every((x) => !num(x))} onClick={() => act(o.id, () => supabase.rpc("invoice_order_part", { p_id: o.id, p_qty: b.map((q, index) => ({ index, qty: num(q) || 0 })), p_inv: crypto.randomUUID() }), "Facture créée : à émettre dans Factures.").then(() => setBill({ ...bill, [o.id]: undefined }))}>Créer la facture</button>
            <button style={{ minHeight: 44 }} onClick={() => setBill({ ...bill, [o.id]: undefined })}>Annuler</button></div></div>}
        {can && (o.status === "confirmed" || o.status === "partial") && <div style={{ marginTop: 10, borderTop: "1px solid var(--line)", paddingTop: 8 }}>
          <div className="muted" style={{ fontSize: 13, marginBottom: 4 }}>Quantités livrées maintenant (le stock baisse)</div>
          {o.lines.map((l, i) => <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}><span style={{ flex: 1 }}>{l.label}</span>
            <input inputMode="decimal" style={{ width: 90 }} value={d[i]} onChange={(e) => setDl({ ...dl, [o.id]: d.map((x, j) => j === i ? e.target.value : x) })} /></div>)}
          <button className="primary" style={{ minHeight: 38 }} disabled={busy === o.id} onClick={() => act(o.id, () => supabase.rpc("deliver_order", { p_id: o.id, p_delivered: d.map((q, index) => ({ index, qty: num(q) || 0 })) }), "Livraison enregistrée.")}>Enregistrer la livraison</button></div>}
      </div>); })}
  </div>);
}
