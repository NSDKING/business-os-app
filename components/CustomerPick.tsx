"use client";
// Before approving a report that names a customer the list does not know (P-031):
// ask "is it one of these, or a new customer?" so typos never create a second card by themselves.
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export const CUSTOMER_KEYS = ["customer", "advertiser"] as const;
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
function dist(a: string, b: string) { // edit distance, small strings only
  const m = a.length, n = b.length; const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[m][n];
}
export type Party = { id: string; name: string };
export async function loadCustomers(business: string): Promise<Party[]> {
  const { data } = await supabase.from("party").select("id,name").eq("business_id", business).eq("kind", "customer").eq("active", true).order("name");
  return (data as Party[]) ?? [];
}
export const knows = (list: Party[], name: string) => list.some((p) => p.name.trim().toLowerCase() === name.trim().toLowerCase());
export function closest(list: Party[], name: string): Party[] {
  const n = norm(name); if (!n) return [];
  return list.map((p) => { const q = norm(p.name); const sc = q === n ? 0 : q.includes(n) || n.includes(q) ? 1 : dist(q, n); return { p, sc }; })
    .filter((x) => x.sc <= Math.max(2, Math.floor(n.length / 4))).sort((a, b) => a.sc - b.sc).slice(0, 3).map((x) => x.p);
}

export default function CustomerPick({ business, name, onPick, onCancel }: { business: string; name: string; onPick: (finalName: string) => void; onCancel: () => void }) {
  const [list, setList] = useState<Party[]>([]); const [other, setOther] = useState(""); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  useEffect(() => { loadCustomers(business).then(setList); }, [business]);
  const near = closest(list, name);
  const btn: React.CSSProperties = { display: "block", width: "100%", minHeight: 52, fontSize: 17, textAlign: "left", margin: "6px 0", padding: "0 14px" };
  async function addNew() {
    setBusy(true); setErr("");
    const { error } = await supabase.rpc("add_contact", { p_business: business, p_name: name, p_phone: null, p_stage: "customer", p_note: null, p_id: crypto.randomUUID() });
    setBusy(false);
    if (error && !/existe déjà/.test(error.message)) return setErr("Impossible : " + error.message);
    onPick(name.trim());
  }
  return (<div style={{ borderTop: "1px solid var(--line)", marginTop: 10, paddingTop: 10 }}>
    <b style={{ fontSize: 17 }}>Qui est « {name} » ?</b>
    <div className="muted" style={{ fontSize: 14, margin: "2px 0 6px" }}>Ce nom n&apos;est pas dans vos clients.</div>
    {near.map((p) => <button key={p.id} className="primary" style={btn} onClick={() => onPick(p.name)}>C&apos;est {p.name}</button>)}
    <button style={btn} disabled={busy} onClick={addNew}>+ Nouveau client : {name}</button>
    {list.length > 0 && <select value={other} onChange={(e) => { setOther(e.target.value); const p = list.find((x) => x.id === e.target.value); if (p) onPick(p.name); }}
      style={{ width: "100%", minHeight: 48, borderRadius: 10, border: "1px solid var(--line)", background: "var(--surface)", color: "var(--text)", margin: "6px 0" }}>
      <option value="">Autre client de la liste…</option>{list.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>}
    {err && <div style={{ color: "var(--error)" }}>{err}</div>}
    <button style={{ minHeight: 40 }} onClick={onCancel}>Retour</button>
  </div>);
}
