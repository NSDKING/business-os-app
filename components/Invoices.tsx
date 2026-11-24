"use client";
// Factures (P-015): an invoice is drafted from an approved order, then issued by someone who can approve.
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Ctx } from "./Chats";
import { invoicePdf } from "@/lib/invoicePdf";

type Line = { label: string; qty: number; unit_price: number; total: number };
type Inv = { id: string; number: string | null; customer: string; lines: Line[]; total_fcfa: number; vat_rate: number; vat_fcfa: number; ttc_fcfa: number | null; seller_niu: string | null; customer_niu: string | null; status: "draft" | "issued" | "void"; created_at: string; issued_at: string | null; source_record_id: string };
type Cand = { id: string; type: string; who: string; at: string };
const n0 = (v: number) => Math.round(v).toLocaleString("fr-FR");
const day = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
const BILLABLE: Record<string, string> = { chicken_order: "Vente de poulets", loading_order: "Chargement d'œufs", ad_contract: "Contrat publicitaire" };
const STATUS: Record<string, string> = { draft: "Brouillon", issued: "Émise", void: "Annulée" };

export default function Invoices({ ctx }: { ctx: Ctx }) {
  const [invs, setInvs] = useState<Inv[]>([]); const [cands, setCands] = useState<Cand[]>([]);
  const [tax, setTax] = useState({ on: false, rate: "19.25", niu: "" }); const [admin, setAdmin] = useState(false); const [saved, setSaved] = useState("");
  const [can, setCan] = useState(false); const [err, setErr] = useState(""); const [busy, setBusy] = useState(""); const [open, setOpen] = useState("");

  const load = useCallback(async () => {
    const since = new Date(Date.now() - 60 * 86400000).toISOString();
    const [{ data: iv }, { data: rts }, { data: rs }, { data: me }] = await Promise.all([
      supabase.from("invoice").select("id,number,customer,lines,total_fcfa,vat_rate,vat_fcfa,ttc_fcfa,seller_niu,customer_niu,status,created_at,issued_at,source_record_id").eq("business_id", ctx.business_id).order("created_at", { ascending: false }),
      supabase.from("record_type").select("id,name").eq("business_id", ctx.business_id),
      supabase.from("current_record").select("id,record_type_id,fields,occurred_at").eq("business_id", ctx.business_id).gte("occurred_at", since).order("occurred_at", { ascending: false }),
      supabase.from("member").select("id").eq("business_id", ctx.business_id).eq("person_id", ctx.person_id).limit(1),
    ]);
    const list = (iv as Inv[]) ?? []; setInvs(list);
    const live = new Set(list.filter((i) => i.status !== "void").map((i) => i.source_record_id));
    const tn = new Map((rts ?? []).map((r) => [r.id, r.name as string]));
    setCands((rs ?? []).filter((r) => BILLABLE[tn.get(r.record_type_id) ?? ""] && !live.has(r.id)).map((r) => {
      const t = tn.get(r.record_type_id)!; const f = r.fields as Record<string, unknown>;
      return { id: r.id, type: t, who: String(f.customer ?? f.destination ?? f.advertiser ?? "?"), at: r.occurred_at };
    }));
    const { data: bz } = await supabase.from("business").select("vat_enabled,vat_rate,niu").eq("id", ctx.business_id).single();
    if (bz) setTax({ on: bz.vat_enabled, rate: String(bz.vat_rate), niu: bz.niu ?? "" });
    if (me?.[0]) {
      const { data: ap } = await supabase.from("role_grant").select("id").eq("member_id", me[0].id).eq("permission", "appoint").is("revoked_at", null).limit(1);
      setAdmin(!!ap?.length);
      const { data: g } = await supabase.from("role_grant").select("id").eq("member_id", me[0].id).in("permission", ["approve", "appoint"]).is("revoked_at", null).limit(1);
      setCan(!!g?.length);
    }
  }, [ctx.business_id, ctx.person_id]);
  useEffect(() => { load(); }, [load]);

  async function run(key: string, fn: () => PromiseLike<{ error: { message: string } | null }>) {
    setErr(""); setBusy(key);
    const { error } = await fn(); setBusy("");
    if (error) setErr(error.message.startsWith("prix manquant") ? `${error.message}. Ajoutez le prix dans Répertoire → Produits.` : "Impossible pour le moment : " + error.message);
    await load();
  }
  async function saveTax() {
    const rate = Number(tax.rate.replace(",", "."));
    if (!Number.isFinite(rate) || rate < 0 || rate > 30) return setErr("Taux de TVA invalide.");
    const { error } = await supabase.rpc("set_business_tax", { p_business: ctx.business_id, p_enabled: tax.on, p_rate: rate, p_niu: tax.niu });
    setSaved(error ? "Échec" : "Enregistré");
  }
  async function share(i: Inv) {
    setErr("");
    try {
      const file = await invoicePdf({ ...i, date: day(i.issued_at ?? i.created_at) }, ctx.business);
      if (navigator.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file], title: file.name }); return; } catch (e) { if ((e as Error).name === "AbortError") return; } }
      const url = URL.createObjectURL(file); const a = document.createElement("a"); a.href = url; a.download = file.name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch { setErr("Impossible de créer le PDF."); }
  }

  return (<div className="body">
    {err && <div className="card" style={{ color: "var(--error)" }}>{err}</div>}
    {admin && <div className="card"><h3 style={{ marginBottom: 2 }}>TVA et identifiant</h3>
      <div className="muted" style={{ marginBottom: 8 }}>S'applique aux prochaines factures. Demandez à votre comptable si vous devez facturer la TVA. Taux général au Cameroun : 19,25 %.</div>
      <label style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}><input type="checkbox" style={{ width: 22, minHeight: 22 }} checked={tax.on} onChange={(e) => setTax({ ...tax, on: e.target.checked })} />Facturer la TVA</label>
      {tax.on && <p><input inputMode="decimal" placeholder="Taux (%)" value={tax.rate} onChange={(e) => setTax({ ...tax, rate: e.target.value })} /></p>}
      <p><input placeholder="Votre NIU (facultatif)" value={tax.niu} onChange={(e) => setTax({ ...tax, niu: e.target.value })} /></p>
      <button onClick={saveTax}>Enregistrer</button> {saved && <b>{saved}</b>}</div>}
    {can && cands.length > 0 && <div className="card">
      <h3 style={{ marginBottom: 2 }}>À facturer</h3>
      <div className="muted" style={{ marginBottom: 6 }}>Commandes approuvées des 60 derniers jours sans facture</div>
      {cands.slice(0, 15).map((c) => <div key={c.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "8px 0", borderTop: "1px solid var(--line)" }}>
        <span>{c.who}<div className="muted" style={{ fontSize: 12 }}>{BILLABLE[c.type]} · {day(c.at)}</div></span>
        <button disabled={busy === c.id} style={{ minHeight: 36 }} onClick={() => run(c.id, () => supabase.rpc("create_invoice", { p_record: c.id }))}>Créer la facture</button></div>)}
    </div>}
    {invs.length === 0 && <div className="card"><p className="muted">Aucune facture pour l'instant.{can ? " Créez-en une depuis « À facturer »." : ""}</p></div>}
    {invs.map((i) => <div key={i.id} className="card" style={{ opacity: i.status === "void" ? 0.55 : 1 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }} onClick={() => setOpen(open === i.id ? "" : i.id)}>
        <span><b>{i.number ?? "Brouillon"}</b><div className="muted" style={{ fontSize: 12 }}>{i.customer} · {day(i.issued_at ?? i.created_at)}</div></span>
        <span style={{ textAlign: "right" }}><b>{n0(i.ttc_fcfa ?? i.total_fcfa)} FCFA</b><div className={"pill " + (i.status === "issued" ? "ok" : "")} style={{ fontSize: 12 }}>{STATUS[i.status]}</div></span>
      </div>
      {open === i.id && <div style={{ marginTop: 8 }}>
        {i.lines.map((l, k) => <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 13 }}><span>{l.label} · {n0(l.qty)} × {n0(l.unit_price)}</span><b>{n0(l.total)}</b></div>)}
        {i.vat_rate > 0 && <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>Total HT {n0(i.total_fcfa)} · TVA {i.vat_rate} % {n0(i.vat_fcfa)} · <b>TTC {n0(i.ttc_fcfa ?? i.total_fcfa)} FCFA</b></div>}
        {(i.seller_niu || i.customer_niu) && <div className="muted" style={{ fontSize: 12 }}>{i.seller_niu && `NIU vendeur ${i.seller_niu}`}{i.seller_niu && i.customer_niu && " · "}{i.customer_niu && `NIU client ${i.customer_niu}`}</div>}
        <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
          {i.status !== "void" && <button style={{ minHeight: 36 }} onClick={() => share(i)}>PDF</button>}
          {can && i.status === "draft" && <button className="primary" style={{ minHeight: 36 }} disabled={busy === i.id} onClick={() => run(i.id, () => supabase.rpc("issue_invoice", { p_id: i.id }))}>Émettre</button>}
          {can && i.status !== "void" && <button style={{ minHeight: 36 }} disabled={busy === i.id} onClick={() => { if (window.confirm("Annuler cette facture ?")) run(i.id, () => supabase.rpc("void_invoice", { p_id: i.id })); }}>Annuler</button>}
        </div>
      </div>}
    </div>)}
  </div>);
}
