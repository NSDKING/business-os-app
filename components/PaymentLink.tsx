"use client";
// After a payment is approved: link it to an order (or to goods bought without an order).
// The goods then move from "available" to "pending delivery" until someone marks them delivered.
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Line = { item: string; quantity: number; unit: "alvéole" | "pièce" };
type Order = { id: string; kind: "oeufs" | "poulets"; customer: string; when: Date; lines: Line[] };
const ITEMS = ["G", "M", "P", "poulet"];
const unitOf = (item: string): Line["unit"] => (item === "poulet" ? "pièce" : "alvéole");
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const text = (ls: Line[]) => ls.map((l) => `${l.quantity} ${l.item === "poulet" ? "poulets" : l.item + " (alvéoles)"}`).join(" · ");

export default function PaymentLink({ businessId, paymentId, customer, onDone }: {
  businessId: string; paymentId: string; customer: string; onDone: () => void;
}) {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [pick, setPick] = useState<string | "alone" | null>(null);
  const [lines, setLines] = useState<Line[]>([{ item: "G", quantity: 1, unit: "alvéole" }]);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");

  useEffect(() => {
    (async () => {
      const since = new Date(Date.now() - 45 * 86400000).toISOString();
      const [{ data: rts }, { data: rs }, { data: used }] = await Promise.all([
        supabase.from("record_type").select("id, name").eq("business_id", businessId),
        supabase.from("current_record").select("id, record_type_id, fields, occurred_at").eq("business_id", businessId).gte("occurred_at", since).order("occurred_at", { ascending: false }),
        supabase.from("stock_hold").select("order_record_id").eq("business_id", businessId).not("order_record_id", "is", null),
      ]);
      const name = new Map((rts ?? []).map((r) => [r.id, r.name]));
      const taken = new Set((used ?? []).map((u) => u.order_record_id));
      const out: Order[] = [];
      for (const r of rs ?? []) {
        const t = name.get(r.record_type_id); const f = r.fields as Record<string, unknown>;
        if (taken.has(r.id)) continue;
        if (t === "loading_order") {
          const ls = (Array.isArray(f.lines) ? f.lines : []) as { size: string; quantity: number }[];
          out.push({ id: r.id, kind: "oeufs", customer: String(f.destination ?? "—"), when: new Date(r.occurred_at), lines: ls.map((l) => ({ item: l.size, quantity: Number(l.quantity), unit: "alvéole" })) });
        } else if (t === "chicken_order" && f.payment !== "paid") {
          out.push({ id: r.id, kind: "poulets", customer: String(f.customer ?? "—"), when: new Date(r.occurred_at), lines: [{ item: "poulet", quantity: Number(f.quantity), unit: "pièce" }] });
        }
      }
      out.sort((a, b) => Number(same(b.customer, customer)) - Number(same(a.customer, customer)) || b.when.getTime() - a.when.getTime());
      setOrders(out.slice(0, 12));
      if (out[0] && same(out[0].customer, customer)) setPick(out[0].id);
    })();
  }, [businessId, customer]);

  const order = orders?.find((o) => o.id === pick);
  const chosen: Line[] = pick === "alone" ? lines.filter((l) => l.quantity > 0) : order?.lines ?? [];

  async function link() {
    setBusy(true); setErr("");
    const { error } = await supabase.rpc("link_payment", { p_payment: paymentId, p_order: order?.id ?? null, p_lines: chosen.map((l) => ({ item: l.item, quantity: l.quantity, unit: l.unit })) });
    setBusy(false); if (error) setErr("Impossible de lier (droits ?)."); else onDone();
  }

  return (
    <div className="card">
      <span className="pill ok">Paiement approuvé</span>
      <h3>À quelle commande correspond ce paiement ?</h3>
      <div className="muted">Client : <b>{customer || "—"}</b>. La marchandise passera de « disponible » à « en attente de livraison ».</div>
      {orders === null && <p className="muted">Chargement…</p>}
      {orders?.map((o) => (
        <label key={o.id} className="fact" style={{ cursor: "pointer", alignItems: "flex-start", gap: 8 }}>
          <input type="radio" name="o" checked={pick === o.id} onChange={() => setPick(o.id)} style={{ marginTop: 4 }} />
          <span style={{ flex: 1 }}>
            <b>{o.kind === "oeufs" ? "Chargement" : "Poulets"} · {o.customer}</b>{same(o.customer, customer) && <span className="muted"> · même client</span>}
            <div className="muted">{o.when.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })} · {text(o.lines)}</div>
          </span>
        </label>))}
      <label className="fact" style={{ cursor: "pointer", alignItems: "flex-start", gap: 8 }}>
        <input type="radio" name="o" checked={pick === "alone"} onChange={() => setPick("alone")} style={{ marginTop: 4 }} />
        <span style={{ flex: 1 }}><b>Paiement seul</b><div className="muted">Pas de commande : indiquez ce qui a été acheté.</div></span>
      </label>
      {pick === "alone" && lines.map((l, i) => (
        <div className="row" key={i} style={{ marginTop: 6 }}>
          <select value={l.item} onChange={(e) => setLines((x) => x.map((y, j) => (j === i ? { ...y, item: e.target.value, unit: unitOf(e.target.value) } : y)))} style={{ minHeight: 44 }}>
            {ITEMS.map((it) => <option key={it} value={it}>{it === "poulet" ? "Poulets" : `Œufs ${it}`}</option>)}</select>
          <input inputMode="numeric" value={String(l.quantity)} onChange={(e) => setLines((x) => x.map((y, j) => (j === i ? { ...y, quantity: Number(e.target.value.replace(/\D/g, "")) } : y)))} style={{ width: 80, textAlign: "right" }} />
          <span className="muted">{l.unit === "alvéole" ? "alvéoles" : "pièces"}</span>
        </div>))}
      {pick === "alone" && <p><button onClick={() => setLines((x) => [...x, { item: "G", quantity: 1, unit: "alvéole" }])}>+ Ajouter un article</button></p>}
      {err && <p style={{ color: "var(--error)" }}>{err}</p>}
      <p><button className="primary big" disabled={busy || !pick || chosen.length === 0} onClick={link}>Lier et mettre en attente de livraison</button></p>
      <div className="row"><button disabled={busy} onClick={onDone}>Plus tard</button></div>
    </div>
  );
}
