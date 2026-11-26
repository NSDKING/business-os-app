"use client";
// One search for everything (P-033): customers and suppliers, invoices, quotes and orders, team messages.
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import Icon from "./Icon";

export type Jump = { to: "customer"; id: string } | { to: "supplier" } | { to: "invoice"; id: string } | { to: "order"; id: string } | { to: "message"; channel: string; message: string };
type Hit = { key: string; icon: "user" | "truck" | "doc" | "chat"; title: string; sub: string; jump: Jump };
const n0 = (v: number) => Math.round(v).toLocaleString("fr-FR");
const day = (d: string) => new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });

export default function GlobalSearch({ businessId, onClose, onJump }: { businessId: string; onClose: () => void; onJump: (j: Jump) => void }) {
  const [q, setQ] = useState(""); const [hits, setHits] = useState<{ title: string; items: Hit[] }[] | null>(null); const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { input.current?.focus(); }, []);
  useEffect(() => {
    const term = q.trim().replace(/[%_,()*]/g, " ").trim();
    if (term.length < 2) { setHits(null); return; }
    let on = true; setBusy(true);
    const t = setTimeout(async () => {
      const like = `%${term}%`; const ql = `"${like.replace(/"/g, "")}"`; const digits = term.replace(/\D/g, "");
      const [{ data: ps }, { data: iv }, { data: so }, { data: ms }, { data: ch }] = await Promise.all([
        supabase.from("party").select("id,kind,name,phone").eq("business_id", businessId).eq("active", true).or(`name.ilike.${ql}${digits.length >= 3 ? `,phone.ilike.%${digits}%` : ""}`).limit(10),
        supabase.from("invoice").select("id,number,customer,ttc_fcfa,total_fcfa,status,created_at").eq("business_id", businessId).or(`number.ilike.${ql},customer.ilike.${ql}`).order("created_at", { ascending: false }).limit(8),
        supabase.from("sales_order").select("id,quote_number,order_number,customer,total_fcfa,status,created_at").eq("business_id", businessId).or(`quote_number.ilike.${ql},order_number.ilike.${ql},customer.ilike.${ql}`).order("created_at", { ascending: false }).limit(8),
        supabase.from("message").select("id,channel_id,text,sender_label,sent_at").eq("business_id", businessId).ilike("text", like).order("sent_at", { ascending: false }).limit(10),
        supabase.rpc("chat_list", { p_business: businessId }),
      ]);
      if (!on) return;
      const chatName = new Map(((ch as { channel_id: string; name: string; other_name: string | null; kind: string }[]) ?? []).map((c) => [c.channel_id, c.kind === "direct" ? c.other_name ?? c.name : c.name]));
      const groups = [
        { title: "Clients et fournisseurs", items: (ps ?? []).map((p): Hit => ({ key: "p" + p.id, icon: p.kind === "supplier" ? "truck" : "user", title: p.name, sub: `${p.kind === "supplier" ? "Fournisseur" : "Client"}${p.phone ? " · " + p.phone : ""}`, jump: p.kind === "supplier" ? { to: "supplier" } : { to: "customer", id: p.id } })) },
        { title: "Factures", items: (iv ?? []).map((i): Hit => ({ key: "i" + i.id, icon: "doc", title: `${i.number ?? "Brouillon"} · ${i.customer}`, sub: `${n0(i.ttc_fcfa ?? i.total_fcfa)} FCFA · ${i.status === "void" ? "annulée" : i.status === "draft" ? "brouillon" : "émise"} · ${day(i.created_at)}`, jump: { to: "invoice", id: i.id } })) },
        { title: "Devis et commandes", items: (so ?? []).map((o): Hit => ({ key: "o" + o.id, icon: "doc", title: `${o.order_number ?? o.quote_number} · ${o.customer}`, sub: `${n0(o.total_fcfa)} FCFA · ${day(o.created_at)}`, jump: { to: "order", id: o.id } })) },
        { title: "Messages", items: (ms ?? []).map((m): Hit => ({ key: "m" + m.id, icon: "chat", title: m.text ?? "", sub: `${m.sender_label} · ${chatName.get(m.channel_id) ?? "Discussion"} · ${day(m.sent_at)}`, jump: { to: "message", channel: m.channel_id, message: m.id } })) },
      ].filter((g) => g.items.length);
      setHits(groups); setBusy(false);
    }, 300);
    return () => { on = false; clearTimeout(t); };
  }, [q, businessId]);

  return (<div style={{ position: "fixed", inset: 0, zIndex: 50, background: "var(--bg)", display: "flex", flexDirection: "column" }}>
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 12px", borderBottom: "1px solid var(--line)", maxWidth: 820, width: "100%", margin: "0 auto" }}>
      <Icon name="search" size={24} />
      <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nom, numéro de téléphone, de facture, ou un mot…" style={{ flex: 1, fontSize: 18, minHeight: 50 }} />
      <button aria-label="Fermer" onClick={onClose} style={{ minWidth: 48, minHeight: 48, display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name="close" size={24} /></button></div>
    <div className="body" style={{ maxWidth: 820, width: "100%", margin: "0 auto" }}>
      {hits === null && <p className="muted" style={{ fontSize: 16 }}>Tapez au moins 2 lettres. Exemples : « Kamga », « 699 », « FAC-2026 », « alvéoles ».</p>}
      {hits !== null && !busy && hits.length === 0 && <p className="muted" style={{ fontSize: 16 }}>Rien trouvé pour « {q} ».</p>}
      {hits?.map((g) => <div key={g.title} className="card"><h3 style={{ marginBottom: 4 }}>{g.title}</h3>
        {g.items.map((h) => <div key={h.key} onClick={() => onJump(h.jump)} style={{ display: "flex", gap: 12, alignItems: "center", padding: "10px 0", borderTop: "1px solid var(--line)", cursor: "pointer", minHeight: 52 }}>
          <span style={{ color: "var(--primary)" }}><Icon name={h.icon} size={22} /></span>
          <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 16, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.title}</div><div className="muted" style={{ fontSize: 14 }}>{h.sub}</div></div></div>)}</div>)}
    </div></div>);
}
