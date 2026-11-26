"use client";
// Achats (P-023): need, purchase order, reception into stock, supplier invoice, paid. Orders get their id on the phone, so a replay never doubles one.
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Ctx } from "./Chats";
import { useCanMaintain } from "./useCan";

type PLine = { item_id?: string | null; label: string; qty: number; unit_price: number; unit?: string; received?: number };
type PO = { id: string; number: string | null; supplier_name: string; lines: PLine[]; total_fcfa: number; status: string; supplier_invoice_no: string | null; supplier_invoice_fcfa: number | null; paid_at: string | null; source_record_id: string | null; created_at: string };
type Need = { id: string; item: string; qty: number; by: string; at: string };
type Party = { id: string; name: string };
const STATUS: Record<string, string> = { draft: "À commander", ordered: "Commandée", partial: "Reçue en partie", received: "Reçue", cancelled: "Annulée" };
const n0 = (v: number) => Math.round(v).toLocaleString("fr-FR");
const day = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });

export default function Purchases({ ctx }: { ctx: Ctx }) {
  const can = useCanMaintain(ctx);
  const [pos, setPos] = useState<PO[]>([]); const [needs, setNeeds] = useState<Need[]>([]); const [sups, setSups] = useState<Party[]>([]);
  const [form, setForm] = useState<null | { source: string | null; supplier: string; name: string; lines: { label: string; qty: string; price: string }[] }>(null);
  const [recv, setRecv] = useState<Record<string, string[]>>({}); const [inv, setInv] = useState<Record<string, { no: string; amt: string }>>({});
  const [msg, setMsg] = useState(""); const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    const [{ data: p }, { data: s }, { data: rt }] = await Promise.all([
      supabase.from("purchase_order").select("id,number,supplier_name,lines,total_fcfa,status,supplier_invoice_no,supplier_invoice_fcfa,paid_at,source_record_id,created_at").eq("business_id", ctx.business_id).order("created_at", { ascending: false }).limit(40),
      supabase.from("party").select("id,name").eq("business_id", ctx.business_id).eq("kind", "supplier").eq("active", true).order("name"),
      supabase.from("record_type").select("id").eq("business_id", ctx.business_id).eq("name", "supply_request").limit(1),
    ]);
    const list = (p as PO[]) ?? []; setPos(list); setSups((s as Party[]) ?? []);
    if (rt?.[0]) {
      const since = new Date(Date.now() - 60 * 864e5).toISOString();
      const { data: cr } = await supabase.from("current_record").select("id,fields,occurred_at").eq("business_id", ctx.business_id).eq("record_type_id", rt[0].id).gte("occurred_at", since).order("occurred_at", { ascending: false });
      const used = new Set(list.filter((x) => x.status !== "cancelled").map((x) => x.source_record_id));
      setNeeds((cr ?? []).filter((r) => !used.has(r.id)).map((r) => { const f = r.fields as Record<string, unknown>; return { id: r.id, item: String(f.item ?? ""), qty: Number(f.quantity ?? 0), by: String(f.requested_by ?? ""), at: r.occurred_at as string }; }));
    }
  }, [ctx.business_id]);
  useEffect(() => { load(); }, [load]);

  async function act(key: string, fn: () => PromiseLike<{ error: { message: string } | null }>, ok = "") {
    setBusy(key); setMsg("");
    const { error } = await fn(); setBusy("");
    if (error) setMsg("Impossible : " + error.message); else if (!navigator.onLine) setMsg("Enregistré sur ce téléphone : envoi dès le retour du réseau."); else if (ok) setMsg(ok);
    await load();
  }
  const startForm = (nd?: Need) => setForm({ source: nd?.id ?? null, supplier: "", name: "", lines: [{ label: nd?.item ?? "", qty: nd ? String(nd.qty) : "", price: "" }] });
  async function create() {
    if (!form) return;
    const lines = form.lines.filter((l) => l.label.trim() && Number(l.qty) > 0).map((l) => ({ label: l.label.trim(), qty: Number(l.qty.replace(",", ".")), unit_price: Number(l.price.replace(",", ".")) || 0 }));
    if (!lines.length || (!form.supplier && !form.name.trim())) return setMsg("Choisissez un fournisseur et ajoutez au moins une ligne.");
    await act("new", () => supabase.rpc("create_purchase_order", { p_business: ctx.business_id, p_supplier: form.supplier || null, p_supplier_name: form.name || "", p_lines: lines, p_source: form.source, p_id: crypto.randomUUID() }), "Commande créée.");
    setForm(null);
  }

  return (<div className="body">
    {msg && <div className="card" style={{ color: msg.startsWith("Impossible") ? "var(--error)" : undefined }}>{msg}</div>}
    {can && needs.length > 0 && <div className="card"><h3 style={{ marginBottom: 2 }}>Besoins à commander</h3>
      <div className="muted" style={{ marginBottom: 6 }}>Demandes approuvées des 60 derniers jours sans commande</div>
      {needs.slice(0, 10).map((d) => <div key={d.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "8px 0", borderTop: "1px solid var(--line)" }}>
        <span>{d.qty} × {d.item}<div className="muted" style={{ fontSize: 12 }}>{d.by} · {day(d.at)}</div></span>
        <button style={{ minHeight: 36 }} onClick={() => startForm(d)}>Commander</button></div>)}</div>}
    {can && !form && <button className="primary big" style={{ marginBottom: 10 }} onClick={() => startForm()}>+ Nouvelle commande</button>}
    {form && <div className="card"><h3>Nouvelle commande</h3>
      {sups.length > 0 && <p><select value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} style={{ width: "100%", minHeight: 46, borderRadius: 10, border: "1px solid var(--line)", background: "var(--surface)", color: "var(--text)", padding: "0 10px" }}>
        <option value="">Fournisseur…</option>{sups.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></p>}
      {!form.supplier && <p><input placeholder="Ou nom du fournisseur" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></p>}
      {form.lines.map((l, i) => <div key={i} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 6, marginBottom: 6 }}>
        <input placeholder="Article" value={l.label} onChange={(e) => setForm({ ...form, lines: form.lines.map((x, j) => j === i ? { ...x, label: e.target.value } : x) })} />
        <input inputMode="decimal" placeholder="Qté" value={l.qty} onChange={(e) => setForm({ ...form, lines: form.lines.map((x, j) => j === i ? { ...x, qty: e.target.value } : x) })} />
        <input inputMode="decimal" placeholder="Prix" value={l.price} onChange={(e) => setForm({ ...form, lines: form.lines.map((x, j) => j === i ? { ...x, price: e.target.value } : x) })} /></div>)}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button onClick={() => setForm({ ...form, lines: [...form.lines, { label: "", qty: "", price: "" }] })}>+ Ligne</button>
        <button className="primary" disabled={busy === "new"} onClick={create}>Créer</button><button onClick={() => setForm(null)}>Annuler</button></div></div>}
    {pos.length === 0 && !form && <div className="card"><h3>Achats</h3><p className="muted">Aucune commande pour l'instant.</p></div>}
    {pos.map((p) => { const r = recv[p.id] ?? p.lines.map((l) => String(Math.max(0, l.qty - (l.received ?? 0)))); const iv = inv[p.id] ?? { no: p.supplier_invoice_no ?? "", amt: p.supplier_invoice_fcfa != null ? String(p.supplier_invoice_fcfa) : "" }; return (
      <div className="card" key={p.id}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><b>{p.number ?? "Commande"} · {p.supplier_name}</b><span className="muted">{STATUS[p.status]}</span></div>
        {p.lines.map((l, i) => <div key={i} className="muted" style={{ fontSize: 13 }}>{l.label} : {n0(l.qty)}{l.received ? ` (reçu ${n0(l.received)})` : ""}{l.unit_price ? ` × ${n0(l.unit_price)}` : ""}</div>)}
        <div style={{ marginTop: 4 }}><b>{n0(p.total_fcfa)} FCFA</b> <span className="muted">· {day(p.created_at)}</span></div>
        {can && <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
          {p.status === "draft" && <button className="primary" style={{ minHeight: 36 }} disabled={busy === p.id} onClick={() => act(p.id, () => supabase.rpc("order_purchase", { p_id: p.id }), "Commande passée.")}>Passer la commande</button>}
          {(p.status === "draft" || p.status === "ordered") && <button style={{ minHeight: 36 }} disabled={busy === p.id} onClick={() => { if (window.confirm("Annuler cette commande ?")) act(p.id, () => supabase.rpc("cancel_purchase", { p_id: p.id })); }}>Annuler</button>}
        </div>}
        {can && (p.status === "ordered" || p.status === "partial") && <div style={{ marginTop: 10, borderTop: "1px solid var(--line)", paddingTop: 8 }}>
          <div className="muted" style={{ fontSize: 13, marginBottom: 4 }}>Quantités arrivées maintenant</div>
          {p.lines.map((l, i) => <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}><span style={{ flex: 1 }}>{l.label}</span>
            <input inputMode="decimal" style={{ width: 90 }} value={r[i]} onChange={(e) => setRecv({ ...recv, [p.id]: r.map((x, j) => j === i ? e.target.value : x) })} /></div>)}
          <button className="primary" style={{ minHeight: 38 }} disabled={busy === p.id} onClick={() => act(p.id, () => supabase.rpc("receive_purchase", { p_id: p.id, p_received: r.map((q, index) => ({ index, qty: Number(q.replace(",", ".")) || 0 })) }), "Réception enregistrée : le stock a augmenté.")}>Enregistrer la réception</button></div>}
        {can && p.status !== "cancelled" && p.status !== "draft" && <div style={{ marginTop: 10, borderTop: "1px solid var(--line)", paddingTop: 8 }}>
          {p.paid_at ? <div className="muted">Facture fournisseur {p.supplier_invoice_no ? `n° ${p.supplier_invoice_no} ` : ""}de {n0(p.supplier_invoice_fcfa ?? 0)} FCFA · <b>payée le {day(p.paid_at)}</b></div> : <>
            <div className="muted" style={{ fontSize: 13, marginBottom: 4 }}>Facture du fournisseur</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 6 }}>
              <input placeholder="N° facture" value={iv.no} onChange={(e) => setInv({ ...inv, [p.id]: { ...iv, no: e.target.value } })} />
              <input inputMode="numeric" placeholder="Montant FCFA" value={iv.amt} onChange={(e) => setInv({ ...inv, [p.id]: { ...iv, amt: e.target.value } })} /></div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button style={{ minHeight: 36 }} disabled={busy === p.id || !iv.amt} onClick={() => act(p.id, () => supabase.rpc("record_supplier_invoice", { p_id: p.id, p_no: iv.no, p_amount: Math.round(Number(iv.amt.replace(/\s/g, "").replace(",", "."))) }), "Facture enregistrée.")}>Enregistrer la facture</button>
              {p.supplier_invoice_fcfa != null && <button className="primary" style={{ minHeight: 36 }} disabled={busy === p.id} onClick={() => act(p.id, () => supabase.rpc("mark_purchase_paid", { p_id: p.id }), "Marquée payée.")}>Marquer payée</button>}</div></>}
        </div>}
      </div>); })}
  </div>);
}
