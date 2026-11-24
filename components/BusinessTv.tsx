"use client";
// Business tab for a TV channel (P-014): ad contracts, ad spots aired, collections, incidents, newsroom. Approved records only.
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Ctx } from "./Chats";
import { Ask } from "./Business";
import SlotGrid from "./SlotGrid";

type Log = { d: Date; planned: number; aired: number; rows: { advertiser: string; planned: number; aired: number; missed: number }[] };
type Contract = { advertiser: string; spots: number; price: number };
type Pay = { at: Date; customer: string; amount: number; method: string };
type Incident = { date: string; start: string; minutes: number; cause: string };
type News = { at: Date; topic: string; journalist: string; slot: string };

const n0 = (v: number) => Math.round(v).toLocaleString("fr-FR");
const short = (d: Date) => d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
const parseDate = (s: string) => { const [d, m, y] = s.split("/").map(Number); return new Date(y, m - 1, d); };

export default function BusinessTv({ ctx }: { ctx: Ctx }) {
  const [logs, setLogs] = useState<Log[]>([]); const [contracts, setContracts] = useState<Contract[]>([]); const [pays, setPays] = useState<Pay[]>([]);
  const [inc, setInc] = useState<Incident[]>([]); const [news, setNews] = useState<News[]>([]); const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const since = new Date(Date.now() - 35 * 86400000).toISOString();
      const [{ data: rts }, { data: rs }] = await Promise.all([
        supabase.from("record_type").select("id, name").eq("business_id", ctx.business_id),
        supabase.from("current_record").select("record_type_id, fields, occurred_at").eq("business_id", ctx.business_id).gte("occurred_at", since).order("occurred_at"),
      ]);
      const name = new Map((rts ?? []).map((r) => [r.id, r.name]));
      const lg: Log[] = [], ct: Contract[] = [], py: Pay[] = [], ic: Incident[] = [], nw: News[] = [];
      for (const r of rs ?? []) {
        const t = name.get(r.record_type_id); const f = r.fields as Record<string, unknown>; const at = new Date(r.occurred_at);
        if (t === "ad_spot_log" && typeof f.date === "string") lg.push({ d: parseDate(f.date), planned: Number(f.total_planned ?? 0), aired: Number(f.total_aired ?? 0), rows: (f.rows as Log["rows"]) ?? [] });
        if (t === "ad_contract") ct.push({ advertiser: String(f.advertiser ?? ""), spots: Number(f.spots_per_month ?? 0), price: Number(f.price_per_spot_fcfa ?? 0) });
        if (t === "payment") py.push({ at, customer: String(f.customer ?? ""), amount: Number(f.amount_fcfa ?? 0), method: String(f.method ?? "") });
        if (t === "broadcast_incident") ic.push({ date: String(f.date ?? ""), start: String(f.start ?? ""), minutes: Number(f.duration_min ?? 0), cause: String(f.cause ?? "") });
        if (t === "news_assignment") nw.push({ at, topic: String(f.topic ?? ""), journalist: String(f.journalist ?? ""), slot: String(f.slot ?? "") });
      }
      lg.sort((a, b) => a.d.getTime() - b.d.getTime());
      setLogs(lg.slice(-14)); setContracts(ct); setPays(py.sort((a, b) => b.at.getTime() - a.at.getTime())); setInc(ic.reverse()); setNews(nw.reverse()); setLoaded(true);
    })();
  }, [ctx.business_id]);

  const k = useMemo(() => {
    const l7 = logs.slice(-7); const planned = l7.reduce((a, x) => a + x.planned, 0), aired = l7.reduce((a, x) => a + x.aired, 0);
    const mStart = new Date(); mStart.setDate(1); mStart.setHours(0, 0, 0, 0);
    const collected = pays.filter((p) => p.at >= mStart).reduce((a, p) => a + p.amount, 0);
    const due = contracts.reduce((a, c) => a + c.spots * c.price, 0);
    const toRerun = logs.reduce((a, x) => a + (x.planned - x.aired), 0);
    const mins = inc.reduce((a, x) => a + x.minutes, 0);
    const per = contracts.map((c) => {
      const aired = logs.filter((x) => x.d >= mStart).reduce((a, x) => a + (x.rows.find((r) => r.advertiser === c.advertiser)?.aired ?? 0), 0);
      const paid = pays.filter((p) => p.at >= mStart && p.customer === c.advertiser).reduce((a, p) => a + p.amount, 0);
      return { ...c, aired, paid, value: c.spots * c.price };
    });
    return { planned, aired, rate: planned ? (aired / planned) * 100 : 0, collected, due, toRerun, mins, per };
  }, [logs, pays, contracts, inc]);

  if (!loaded) return <div className="body muted">Chargement…</div>;
  if (!logs.length && !contracts.length) return <div className="body"><div className="card"><h3>Business</h3><p className="muted">Aucun chiffre approuvé pour l'instant. Approuvez des rapports dans l'onglet Rapports et ils apparaîtront ici.</p></div><Ask ctx={ctx} /></div>;

  const W = 340, H = 170, L = 30, B = 24, T = 8, bw = (W - L) / Math.max(logs.length, 1);
  const maxV = Math.max(1, ...logs.map((x) => x.planned)), top = Math.ceil(maxV / 5) * 5;
  const y = (v: number) => T + (H - T - B) * (1 - v / top);

  return (
    <div className="body">
      <div className="card">
        <h3 style={{ marginBottom: 2 }}>Antenne et publicité</h3>
        <div className="muted" style={{ marginBottom: 10 }}>7 derniers jours, chiffres approuvés uniquement</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Tile label="Passages diffusés" value={`${n0(k.aired)} / ${n0(k.planned)}`} />
          <Tile label="Taux de diffusion" value={`${k.rate.toFixed(1).replace(".", ",")} %`} note={k.planned - k.aired > 0 ? `${k.planned - k.aired} passage(s) manqué(s)` : "aucun passage manqué"} />
          <Tile label="Encaissé ce mois" value={`${n0(k.collected)} FCFA`} note={`sur ${n0(k.due)} FCFA de contrats`} />
          <Tile label="À rediffuser (14 j)" value={n0(k.toRerun)} note="passages dus aux annonceurs" />
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginBottom: 2 }}>Passages par jour</h3>
        <div className="muted" style={{ marginBottom: 6 }}>Prévus (gris) et diffusés (bleu)</div>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Passages prévus et diffusés par jour">
          {[0, top / 2, top].map((v) => <g key={v}><line x1={L} x2={W} y1={y(v)} y2={y(v)} stroke="var(--line)" /><text x={L - 4} y={y(v) + 4} fontSize="10" textAnchor="end" fill="currentColor" opacity=".6">{Math.round(v)}</text></g>)}
          {logs.map((x, i) => { const cx = L + i * bw + bw / 2, w = Math.max(4, bw - 6); return <g key={i}>
            <rect x={cx - w / 2} y={y(x.planned)} width={w} height={y(0) - y(x.planned)} rx="3" fill="currentColor" opacity=".15" />
            <rect x={cx - w / 2} y={y(x.aired)} width={w} height={y(0) - y(x.aired)} rx="3" fill={x.aired < x.planned ? "#eb6834" : "#2a78d6"} />
            {(i % 2 === 0 || logs.length < 8) && <text x={cx} y={H - 8} fontSize="9" textAnchor="middle" fill="currentColor" opacity=".6">{short(x.d)}</text>}</g>; })}
        </svg>
        <div className="muted" style={{ fontSize: 12 }}>Orange : au moins un passage manqué ce jour-là.</div>
      </div>

      <div className="card">
        <h3 style={{ marginBottom: 2 }}>Annonceurs ce mois</h3>
        <div className="muted" style={{ marginBottom: 8 }}>Passages diffusés, valeur du contrat et encaissé</div>
        <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13 }}>
          <thead><tr><th style={{ textAlign: "left", padding: 4 }}>Annonceur</th><th style={{ textAlign: "right", padding: 4 }}>Passages</th><th style={{ textAlign: "right", padding: 4 }}>Encaissé</th></tr></thead>
          <tbody>{k.per.map((c) => { const rest = c.value - c.paid; return <tr key={c.advertiser} style={{ borderTop: "1px solid var(--line)" }}>
            <td style={{ padding: 4 }}><b>{c.advertiser}</b><div className="muted" style={{ fontSize: 11 }}>contrat {n0(c.value)} FCFA</div></td>
            <td style={{ textAlign: "right", padding: 4 }}>{c.aired} / {c.spots}</td>
            <td style={{ textAlign: "right", padding: 4 }}>{n0(c.paid)}<div style={{ fontSize: 11, color: rest > 0 ? "#B7791F" : "var(--muted)" }}>{rest > 0 ? `reste ${n0(rest)}` : "soldé"}</div></td></tr>; })}</tbody>
        </table>
      </div>

      <div className="card">
        <h3 style={{ marginBottom: 6 }}>Incidents à l'antenne</h3>
        {inc.length === 0 && <p className="muted">Aucun incident sur la période.</p>}
        {inc.length > 0 && <div className="muted" style={{ marginBottom: 4 }}>{n0(k.mins)} minutes d'antenne perdues sur la période</div>}
        {inc.map((x, i) => <div key={i} style={{ padding: "8px 0", borderTop: "1px solid var(--line)" }}><b>{x.date}</b> à {x.start} · {x.minutes} min<div className="muted" style={{ fontSize: 12 }}>{x.cause}</div></div>)}
      </div>

      <div className="card">
        <h3 style={{ marginBottom: 6 }}>Rédaction</h3>
        <div className="muted" style={{ marginBottom: 4 }}>{news.filter((x) => Date.now() - x.at.getTime() < 7 * 86400000).length} reportages cette semaine</div>
        {news.slice(0, 4).map((x, i) => <div key={i} style={{ padding: "8px 0", borderTop: "1px solid var(--line)" }}>{x.topic}<div className="muted" style={{ fontSize: 12 }}>{short(x.at)} · {x.journalist} · {x.slot}</div></div>)}
      </div>

      <div className="card">
        <h3 style={{ marginBottom: 6 }}>Paiements reçus</h3>
        {pays.slice(0, 6).map((p, i) => <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "8px 0", borderTop: i ? "1px solid var(--line)" : undefined }}>
          <span>{p.customer}<div className="muted" style={{ fontSize: 12 }}>{short(p.at)} · {p.method}</div></span><b style={{ whiteSpace: "nowrap" }}>{n0(p.amount)} FCFA</b></div>)}
      </div>

      <SlotGrid ctx={ctx} />
      <Ask ctx={ctx} example="Ex. : combien de passages manqués cette semaine ?" hints={["Quels annonceurs n'ont pas tout payé ce mois ?", "Combien de passages manqués à rediffuser ?", "Combien de minutes d'antenne perdues ?"]} />
    </div>
  );
}

function Tile({ label, value, note }: { label: string; value: string; note?: string }) {
  return <div style={{ background: "var(--soft)", borderRadius: 12, padding: "10px 12px" }}>
    <div className="muted" style={{ fontSize: 12 }}>{label}</div><div style={{ fontSize: 20, fontWeight: 700 }}>{value}</div>
    {note && <div className="muted" style={{ fontSize: 11 }}>{note}</div>}</div>;
}
