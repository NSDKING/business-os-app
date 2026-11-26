"use client";
// Stock (P-023): a ledger of movements, corrected by physical counts. Every action carries an id made on the phone, so a replay after an offline spell never doubles it.
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Ctx } from "./Chats";
import { useCanMaintain } from "./useCan";

type Level = { item_id: string; name: string; unit: string; kind: string; reorder_level: number; on_hand: number };
type Move = { id: string; qty: number; reason: string; note: string | null; created_at: string };
const KIND: Record<string, string> = { egg: "Œufs", bird: "Volailles", feed: "Aliments", supply: "Fournitures", other: "Autres" };
const REASON: Record<string, string> = { production: "Production", sale: "Vente", purchase: "Achat reçu", loss: "Perte", use: "Consommation", count: "Comptage", adjust: "Ajustement" };
const n = (v: number) => (Math.round(v * 100) / 100).toLocaleString("fr-FR");

export default function Stock({ ctx }: { ctx: Ctx }) {
  const can = useCanMaintain(ctx);
  const [levels, setLevels] = useState<Level[] | null>(null);
  const [open, setOpen] = useState<string>("");
  const [moves, setMoves] = useState<Move[]>([]);
  const [mode, setMode] = useState<"" | "in" | "out" | "loss" | "count">("");
  const [qty, setQty] = useState(""); const [note, setNote] = useState("");
  const [adding, setAdding] = useState(false); const [nw, setNw] = useState({ name: "", unit: "unité", kind: "supply", reorder: "" });
  const [msg, setMsg] = useState(""); const [busy, setBusy] = useState(false);

  const [sugg, setSugg] = useState<{ id: string; item_name: string; qty: number; reason: string; note: string | null }[]>([]);
  const load = useCallback(async () => {
    const { data } = await supabase.rpc("stock_levels", { p_business: ctx.business_id });
    setLevels((data as Level[]) ?? []);
    const { data: sg } = await supabase.from("stock_suggestion").select("id,item_name,qty,reason,note").eq("business_id", ctx.business_id).eq("status", "pending").order("created_at", { ascending: false }).limit(30);
    setSugg((sg as typeof sugg) ?? []);
  }, [ctx.business_id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!open) return;
    supabase.from("stock_move").select("id,qty,reason,note,created_at").eq("item_id", open).order("created_at", { ascending: false }).limit(8).then(({ data }) => setMoves((data as Move[]) ?? []));
  }, [open, levels]);

  async function act(fn: () => PromiseLike<{ error: { message: string } | null }>, done: string) {
    setBusy(true); setMsg("");
    const { error } = await fn(); setBusy(false);
    if (error) return setMsg("Impossible : " + error.message);
    setMsg(navigator.onLine ? done : "Enregistré sur ce téléphone : envoi dès le retour du réseau.");
    setMode(""); setQty(""); setNote(""); await load();
  }
  const submitMove = (it: Level) => {
    const q = Number(qty.replace(",", "."));
    if (!(q >= 0) || (mode !== "count" && q === 0)) return setMsg("Entrez une quantité.");
    if (mode === "count") return act(() => supabase.rpc("record_stock_count", { p_business: ctx.business_id, p_item: it.item_id, p_counted: q, p_note: note || null, p_id: crypto.randomUUID() }), "Comptage enregistré.");
    const reason = mode === "in" ? "production" : mode === "loss" ? "loss" : "use";
    act(() => supabase.rpc("add_stock_move", { p_business: ctx.business_id, p_item: it.item_id, p_qty: q, p_reason: reason, p_note: note || null, p_id: crypto.randomUUID() }), "Mouvement enregistré.");
  };

  if (levels === null) return <div className="body muted">Chargement…</div>;
  const groups = [...new Set(levels.map((l) => l.kind))];
  return (<div className="body">
    {can && sugg.length > 0 && <div className="card"><h3 style={{ marginBottom: 2 }}>À confirmer ({sugg.length})</h3>
      <div className="muted" style={{ fontSize: 13, marginBottom: 6 }}>Tirés des fiches et rapports approuvés. Le stock ne bouge que si vous acceptez.</div>
      {sugg.map((g) => <div key={g.id} style={{ borderTop: "1px solid var(--line)", padding: "8px 0" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><b>{g.item_name}</b><b style={{ color: g.qty < 0 ? "var(--error)" : undefined }}>{g.qty > 0 ? "+" : ""}{Math.round(g.qty).toLocaleString("fr-FR")}</b></div>
        <div className="muted" style={{ fontSize: 13 }}>{g.note}</div>
        <div style={{ display: "flex", gap: 8, marginTop: 6 }}><button className="primary" style={{ minHeight: 44, flex: 1 }} disabled={busy} onClick={() => act(() => supabase.rpc("apply_stock_suggestion", { p_id: g.id }), "Stock mis à jour.")}>Accepter</button>
          <button style={{ minHeight: 44 }} disabled={busy} onClick={() => act(() => supabase.rpc("dismiss_stock_suggestion", { p_id: g.id }), "Suggestion refusée.")}>Refuser</button></div></div>)}</div>}
    {msg && <div className="card" style={{ color: msg.startsWith("Impossible") ? "var(--error)" : undefined }}>{msg}</div>}
    {levels.length === 0 && <div className="card"><h3>Stock</h3><p className="muted">Aucun article pour l'instant.</p>
      {can && <button className="primary big" disabled={busy} onClick={() => act(() => supabase.rpc("seed_stock_items", { p_business: ctx.business_id }), "Articles ajoutés.")}>Ajouter les articles habituels</button>}</div>}
    {groups.map((g) => <div className="card" key={g}><h3 style={{ marginBottom: 6 }}>{KIND[g] ?? g}</h3>
      {levels.filter((l) => l.kind === g).map((l) => { const low = l.reorder_level > 0 && l.on_hand <= l.reorder_level; return (
        <div key={l.item_id} style={{ borderTop: "1px solid var(--line)", padding: "10px 0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, cursor: "pointer" }} onClick={() => { setOpen(open === l.item_id ? "" : l.item_id); setMode(""); setMsg(""); }}>
            <span>{l.name}{low && <span style={{ marginLeft: 8, fontSize: 12, color: "var(--pending)", fontWeight: 600 }}>À recommander</span>}</span>
            <b>{n(l.on_hand)} <span className="muted" style={{ fontWeight: 400 }}>{l.unit}</span></b></div>
          {open === l.item_id && <div style={{ marginTop: 8 }}>
            {can && <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
              {([["in", "+ Entrée"], ["out", "− Sortie"], ["loss", "Perte"], ["count", "Compter"]] as const).map(([k, t]) => <button key={k} className={mode === k ? "primary" : ""} style={{ minHeight: 38 }} onClick={() => setMode(k)}>{t}</button>)}</div>}
            {mode && <div><p><input inputMode="decimal" placeholder={mode === "count" ? `Quantité comptée (${l.unit})` : `Quantité (${l.unit})`} value={qty} onChange={(e) => setQty(e.target.value)} /></p>
              <p><input placeholder="Note (facultatif)" value={note} onChange={(e) => setNote(e.target.value)} /></p>
              <button className="primary" disabled={busy} onClick={() => submitMove(l)}>Enregistrer</button></div>}
            <div className="muted" style={{ fontSize: 13, marginTop: 8 }}>{moves.length ? "Derniers mouvements" : "Aucun mouvement"}</div>
            {moves.map((m) => <div key={m.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "3px 0" }}>
              <span>{REASON[m.reason] ?? m.reason} · {new Date(m.created_at).toLocaleDateString("fr-FR")}{m.note ? ` · ${m.note}` : ""}</span><b style={{ color: m.qty < 0 ? "var(--error)" : "var(--ok)" }}>{m.qty > 0 ? "+" : ""}{n(m.qty)}</b></div>)}
          </div>}
        </div>); })}
    </div>)}
    {can && levels.length > 0 && <div className="card">
      {!adding ? <button className="big" onClick={() => setAdding(true)}>+ Nouvel article</button> : <>
        <h3>Nouvel article</h3>
        <p><input placeholder="Nom" value={nw.name} onChange={(e) => setNw({ ...nw, name: e.target.value })} /></p>
        <p><input placeholder="Unité (sac, œuf, litre…)" value={nw.unit} onChange={(e) => setNw({ ...nw, unit: e.target.value })} /></p>
        <p><input inputMode="decimal" placeholder="Seuil d'alerte (facultatif)" value={nw.reorder} onChange={(e) => setNw({ ...nw, reorder: e.target.value })} /></p>
        <div className="chips">{Object.entries(KIND).map(([k, t]) => <button key={k} className={nw.kind === k ? "on" : ""} onClick={() => setNw({ ...nw, kind: k })}>{t}</button>)}</div>
        <button className="primary" disabled={busy || !nw.name.trim()} onClick={() => act(() => supabase.rpc("create_stock_item", { p_business: ctx.business_id, p_name: nw.name, p_unit: nw.unit, p_kind: nw.kind, p_reorder: Number(nw.reorder.replace(",", ".")) || 0, p_id: crypto.randomUUID() }), "Article ajouté.").then(() => { setAdding(false); setNw({ name: "", unit: "unité", kind: "supply", reorder: "" }); })}>Ajouter</button></>}
    </div>}
  </div>);
}
