"use client";
// Répertoire (P-015): customers, suppliers and products of the business. Maintained by people who can approve something.
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Ctx } from "./Chats";

type Party = { id: string; kind: string; name: string; phone: string | null; note: string | null; source: string; active: boolean };
type Product = { id: string; name: string; unit: string; price_fcfa: number | null; source: string; active: boolean };
type View = "customer" | "supplier" | "product";
const n0 = (v: number) => Math.round(v).toLocaleString("fr-FR");
const TITLE: Record<View, string> = { customer: "Clients", supplier: "Fournisseurs", product: "Produits" };

export default function Catalogue({ ctx }: { ctx: Ctx }) {
  const [view, setView] = useState<View>("customer"); const [q, setQ] = useState("");
  const [parties, setParties] = useState<Party[]>([]); const [products, setProducts] = useState<Product[]>([]);
  const [can, setCan] = useState(false); const [adding, setAdding] = useState(false); const [err, setErr] = useState("");
  const [f, setF] = useState({ name: "", phone: "", note: "", unit: "", price: "" });

  const load = useCallback(async () => {
    const [{ data: ps }, { data: pr }, { data: me }] = await Promise.all([
      supabase.from("party").select("id,kind,name,phone,note,source,active").eq("business_id", ctx.business_id).order("name"),
      supabase.from("product").select("id,name,unit,price_fcfa,source,active").eq("business_id", ctx.business_id).order("name"),
      supabase.from("member").select("id").eq("business_id", ctx.business_id).eq("person_id", ctx.person_id).limit(1),
    ]);
    setParties((ps as Party[]) ?? []); setProducts((pr as Product[]) ?? []);
    if (me?.[0]) {
      const { data: g } = await supabase.from("role_grant").select("id").eq("member_id", me[0].id).in("permission", ["approve", "appoint"]).is("revoked_at", null).limit(1);
      setCan(!!g?.length);
    }
  }, [ctx.business_id, ctx.person_id]);
  useEffect(() => { load(); }, [load]);

  async function add() {
    setErr("");
    if (!f.name.trim()) return setErr("Le nom est obligatoire.");
    const price = f.price.trim() === "" ? null : Number(f.price.replace(/\s/g, ""));
    if (view === "product" && price !== null && (!Number.isFinite(price) || price < 0)) return setErr("Le prix doit être un nombre.");
    const { error } = view === "product"
      ? await supabase.rpc("add_product", { p_business: ctx.business_id, p_name: f.name, p_unit: f.unit, p_price: price })
      : await supabase.rpc("add_party", { p_business: ctx.business_id, p_kind: view, p_name: f.name, p_phone: f.phone, p_note: f.note });
    if (error) return setErr("Vous n'avez pas le droit d'ajouter.");
    setF({ name: "", phone: "", note: "", unit: "", price: "" }); setAdding(false); load();
  }
  async function archive(table: "party" | "product", id: string, active: boolean) { await supabase.rpc("set_catalogue_active", { p_table: table, p_id: id, p_active: active }); load(); }
  async function price(p: Product) {
    const v = window.prompt(`Nouveau prix de « ${p.name} » (FCFA par ${p.unit})`, p.price_fcfa?.toString() ?? ""); if (v === null) return;
    const n = Number(v.replace(/\s/g, "")); if (!Number.isFinite(n) || n < 0) return;
    await supabase.rpc("set_product_price", { p_id: p.id, p_price: n }); load();
  }

  const needle = q.trim().toLowerCase();
  const rows = view === "product" ? products.filter((p) => p.name.toLowerCase().includes(needle)) : parties.filter((p) => p.kind === view && p.name.toLowerCase().includes(needle));
  const count = (v: View) => v === "product" ? products.filter((p) => p.active).length : parties.filter((p) => p.kind === v && p.active).length;

  return (
    <div className="body">
      <div className="card">
        <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
          {(["customer", "supplier", "product"] as View[]).map((v) => <button key={v} className={view === v ? "primary" : ""} style={{ flex: 1, minHeight: 40, padding: "4px 6px" }} onClick={() => { setView(v); setAdding(false); setErr(""); }}>{TITLE[v]} ({count(v)})</button>)}
        </div>
        <input placeholder={`Chercher dans ${TITLE[view].toLowerCase()}`} value={q} onChange={(e) => setQ(e.target.value)} />
        {can && !adding && <button className="primary big" style={{ marginTop: 10 }} onClick={() => setAdding(true)}>Ajouter {view === "customer" ? "un client" : view === "supplier" ? "un fournisseur" : "un produit"}</button>}
        {!can && <p className="muted" style={{ marginTop: 8, fontSize: 12 }}>Seules les personnes qui peuvent approuver des rapports ajoutent ou modifient ici.</p>}
      </div>

      {adding && <div className="card">
        <h3>{view === "product" ? "Nouveau produit" : view === "customer" ? "Nouveau client" : "Nouveau fournisseur"}</h3>
        <p><input placeholder="Nom" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></p>
        {view === "product"
          ? <><p><input placeholder="Unité (alvéole, passage, sac…)" value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })} /></p>
              <p><input inputMode="numeric" placeholder="Prix en FCFA (facultatif)" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} /></p></>
          : <><p><input inputMode="tel" placeholder="Téléphone (facultatif)" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></p>
              <p><input placeholder="Note (facultatif)" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></p></>}
        {err && <p style={{ color: "var(--error)" }}>{err}</p>}
        <div style={{ display: "flex", gap: 8 }}><button className="primary big" onClick={add}>Enregistrer</button><button className="big" onClick={() => setAdding(false)}>Annuler</button></div>
      </div>}

      <div className="card">
        {rows.length === 0 && <p className="muted">Rien à afficher.</p>}
        {view === "product"
          ? (rows as Product[]).map((p, i) => <div key={p.id} style={{ padding: "10px 0", borderTop: i ? "1px solid var(--line)" : undefined, opacity: p.active ? 1 : 0.5 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><b>{p.name}</b><b style={{ whiteSpace: "nowrap" }}>{p.price_fcfa == null ? "—" : `${n0(p.price_fcfa)} FCFA`}</b></div>
              <div className="muted" style={{ fontSize: 12 }}>par {p.unit}{p.active ? "" : " · archivé"}</div>
              {can && <div style={{ display: "flex", gap: 8, marginTop: 6 }}><button style={{ minHeight: 34, fontSize: 13 }} onClick={() => price(p)}>Modifier le prix</button><button style={{ minHeight: 34, fontSize: 13 }} onClick={() => archive("product", p.id, !p.active)}>{p.active ? "Archiver" : "Rétablir"}</button></div>}
            </div>)
          : (rows as Party[]).map((p, i) => <div key={p.id} style={{ padding: "10px 0", borderTop: i ? "1px solid var(--line)" : undefined, opacity: p.active ? 1 : 0.5 }}>
              <b>{p.name}</b>{!p.active && <span className="muted"> · archivé</span>}
              <div className="muted" style={{ fontSize: 12 }}>{[p.phone, p.note, p.source === "backfill" ? "repris des rapports approuvés" : null].filter(Boolean).join(" · ") || "—"}</div>
              {can && <div style={{ marginTop: 6 }}><button style={{ minHeight: 34, fontSize: 13 }} onClick={() => archive("party", p.id, !p.active)}>{p.active ? "Archiver" : "Rétablir"}</button></div>}
            </div>)}
      </div>
    </div>
  );
}
