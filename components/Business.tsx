"use client";
// Business tab: figures built only from approved records (the trusted layer), plus a question box.
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Ctx } from "./Chats";

type Row = { size: string; opening: number; production: number; sorties: number; closing_book: number; closing_physical: number; gap: number };
type Sheet = { date: string; d: Date; rows: Row[]; trays: number };
type Pay = { at: Date; customer: string; amount: number; method: string };

// Same colour for the same size everywhere (reference categorical palette, slots 1 to 3).
const SIZE_COLOR: Record<string, string> = { G: "#2a78d6", M: "#eb6834", P: "#1baf7a" };
const SIZE_NAME: Record<string, string> = { G: "Gros (G)", M: "Moyen (M)", P: "Petit (P)" };
const SIZES = ["G", "M", "P"];
const n0 = (v: number) => Math.round(v).toLocaleString("fr-FR");
const parseDate = (s: string) => { const [d, m, y] = s.split("/").map(Number); return new Date(y, m - 1, d); };
const short = (d: Date) => d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
const dayName = (d: Date) => d.toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "2-digit" });

function roundedTop(x: number, y: number, w: number, h: number, r: number) {
  const k = Math.min(r, h, w / 2);
  return `M${x},${y + h} V${y + k} Q${x},${y} ${x + k},${y} H${x + w - k} Q${x + w},${y} ${x + w},${y + k} V${y + h} Z`;
}

function Icon({ kind }: { kind: "warn" }) {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ verticalAlign: "-3px" }}><path d="M12 3l10 18H2z" /><path d="M12 10v5M12 18.5v.5" /></svg>;
}

export default function Business({ ctx }: { ctx: Ctx }) {
  const [sheets, setSheets] = useState<Sheet[]>([]); const [pays, setPays] = useState<Pay[]>([]);
  const [loaded, setLoaded] = useState(false); const [sel, setSel] = useState<number | null>(null); const [table, setTable] = useState(false);

  const load = useCallback(async () => {
    const since = new Date(Date.now() - 16 * 86400000).toISOString();
    const [{ data: rts }, { data: rs }] = await Promise.all([
      supabase.from("record_type").select("id, name").eq("business_id", ctx.business_id),
      supabase.from("current_record").select("record_type_id, fields, occurred_at").eq("business_id", ctx.business_id).gte("occurred_at", since).order("occurred_at"),
    ]);
    const name = new Map((rts ?? []).map((r) => [r.id, r.name]));
    const sh: Sheet[] = [], py: Pay[] = [];
    for (const r of rs ?? []) {
      const t = name.get(r.record_type_id); const f = r.fields as Record<string, unknown>;
      if (t === "daily_production_sheet" && typeof f.date === "string") sh.push({ date: f.date, d: parseDate(f.date), rows: (f.stock as Row[]) ?? [], trays: Number(f.sorties_trays ?? 0) });
      if (t === "payment") py.push({ at: new Date(r.occurred_at), customer: String(f.customer ?? ""), amount: Number(f.amount_fcfa ?? 0), method: String(f.method ?? "") });
    }
    sh.sort((a, b) => a.d.getTime() - b.d.getTime());
    setSheets(sh.slice(-14)); setPays(py.sort((a, b) => b.at.getTime() - a.at.getTime())); setLoaded(true);
  }, [ctx.business_id]);
  useEffect(() => { load(); }, [load]);

  const last7 = sheets.slice(-7);
  const kpi = useMemo(() => {
    const sum = (f: (r: Row) => number, s: Sheet[]) => s.reduce((a, x) => a + x.rows.reduce((b, r) => b + f(r), 0), 0);
    return { prod: sum((r) => r.production, last7), trays: last7.reduce((a, x) => a + x.trays, 0), gap: sum((r) => r.gap, last7), paid: pays.reduce((a, p) => a + p.amount, 0) };
  }, [last7, pays]);
  const alerts = useMemo(() => sheets.flatMap((s) => s.rows.filter((r) => Math.abs(r.gap) >= 20).map((r) => ({ d: s.d, size: r.size, gap: r.gap }))).reverse(), [sheets]);
  const now = sheets[sheets.length - 1];

  if (!loaded) return <div className="body muted">Chargement…</div>;
  if (!sheets.length) return <div className="body"><div className="card"><h3>Business</h3><p className="muted">Aucun chiffre approuvé pour l'instant. Approuvez des rapports dans l'onglet Rapports et ils apparaîtront ici.</p></div><Ask ctx={ctx} /></div>;

  // chart geometry
  const W = 340, H = 190, L = 34, B = 24, T = 8, bw = (W - L) / sheets.length;
  const totals = sheets.map((s) => s.rows.reduce((a, r) => a + r.production, 0));
  const maxV = Math.max(...totals), step = maxV > 6000 ? 2000 : 1000, top = Math.ceil(maxV / step) * step;
  const y = (v: number) => T + (H - T - B) * (1 - v / top);
  const cur = sel != null ? sheets[sel] : null;

  return (
    <div className="body">
      <div className="card">
        <h3 style={{ marginBottom: 2 }}>7 derniers jours</h3>
        <div className="muted" style={{ marginBottom: 10 }}>Chiffres approuvés uniquement</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Tile label="Œufs produits" value={n0(kpi.prod)} />
          <Tile label="Alvéoles sorties" value={n0(kpi.trays)} />
          <Tile label="Écart de stock" value={(kpi.gap > 0 ? "+" : "") + n0(kpi.gap)} note={kpi.gap < 0 ? "œufs en moins que dans le livre" : "œufs en plus que dans le livre"} />
          <Tile label="Encaissé (14 j)" value={n0(kpi.paid) + " FCFA"} />
        </div>
      </div>

      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ margin: 0 }}>Production par jour</h3>
          <button onClick={() => setTable((t) => !t)} style={{ minHeight: 36, padding: "4px 12px" }}>{table ? "Graphique" : "Tableau"}</button>
        </div>
        <div style={{ display: "flex", gap: 14, margin: "8px 0", flexWrap: "wrap" }}>
          {SIZES.map((s) => <span key={s} style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--muted)", fontSize: 13 }}><span style={{ width: 12, height: 12, borderRadius: 3, background: SIZE_COLOR[s], display: "inline-block" }} />{SIZE_NAME[s]}</span>)}
        </div>
        {!table ? (<>
          <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Œufs produits par jour et par taille" style={{ display: "block" }}>
            {Array.from({ length: top / step + 1 }, (_, i) => i * step).map((v) => (
              <g key={v}><line x1={L} x2={W} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeWidth={1} />
                <text x={L - 6} y={y(v) + 4} textAnchor="end" fontSize="10" fill="var(--muted)">{v / 1000} k</text></g>))}
            {sheets.map((s, i) => {
              const x = L + i * bw + (bw - 15) / 2; let acc = 0;
              return (<g key={s.date}>
                {SIZES.map((sz, k) => {
                  const v = s.rows.find((r) => r.size === sz)?.production ?? 0; const y0 = y(acc + v), h = y(acc) - y0 - 2; acc += v;
                  if (h <= 0) return null;
                  return k === SIZES.length - 1
                    ? <path key={sz} d={roundedTop(x, y0, 15, h, 4)} fill={SIZE_COLOR[sz]} opacity={sel == null || sel === i ? 1 : 0.35} />
                    : <rect key={sz} x={x} y={y0} width={15} height={h} fill={SIZE_COLOR[sz]} opacity={sel == null || sel === i ? 1 : 0.35} />;
                })}
                {(i % 2 === 0 || sheets.length < 8) && <text x={x + 7.5} y={H - 8} textAnchor="middle" fontSize="10" fill="var(--muted)">{s.d.getDate()}</text>}
                <rect x={L + i * bw} y={T} width={bw} height={H - T - B} fill="transparent" onClick={() => setSel(sel === i ? null : i)} onMouseEnter={() => setSel(i)} style={{ cursor: "pointer" }} />
              </g>);
            })}
          </svg>
          <div className="muted" style={{ minHeight: 40, fontSize: 13 }}>
            {cur ? <><b style={{ color: "var(--text)" }}>{dayName(cur.d)}</b> : {SIZES.map((s) => `${s} ${n0(cur.rows.find((r) => r.size === s)?.production ?? 0)}`).join(" · ")} = <b style={{ color: "var(--text)" }}>{n0(totals[sel!])}</b> œufs, {cur.trays} alvéoles sorties</> : "Touchez une colonne pour voir le détail du jour."}
          </div>
        </>) : (
          <div style={{ overflowX: "auto" }}><table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13 }}>
            <thead><tr><th style={{ textAlign: "left", padding: 4 }}>Jour</th>{SIZES.map((s) => <th key={s} style={{ textAlign: "right", padding: 4 }}>{s}</th>)}<th style={{ textAlign: "right", padding: 4 }}>Sorties</th></tr></thead>
            <tbody>{[...sheets].reverse().map((s) => <tr key={s.date} style={{ borderTop: "1px solid var(--line)" }}>
              <td style={{ padding: 4 }}>{dayName(s.d)}</td>{SIZES.map((z) => <td key={z} style={{ textAlign: "right", padding: 4 }}>{n0(s.rows.find((r) => r.size === z)?.production ?? 0)}</td>)}<td style={{ textAlign: "right", padding: 4 }}>{s.trays}</td></tr>)}</tbody>
          </table></div>)}
      </div>

      {now && <div className="card">
        <h3 style={{ marginBottom: 2 }}>Stock réel</h3><div className="muted" style={{ marginBottom: 8 }}>Fin de journée du {short(now.d)}, en œufs</div>
        {(() => { const mx = Math.max(...now.rows.map((r) => r.closing_physical)); return now.rows.map((r) => (
          <div key={r.size} style={{ display: "grid", gridTemplateColumns: "84px 1fr 56px", alignItems: "center", gap: 8, margin: "8px 0" }}>
            <span>{SIZE_NAME[r.size] ?? r.size}</span>
            <div style={{ background: "var(--soft)", borderRadius: 6, height: 14 }}><div style={{ width: `${(r.closing_physical / mx) * 100}%`, height: 14, borderRadius: 6, background: SIZE_COLOR[r.size] }} /></div>
            <b style={{ textAlign: "right" }}>{n0(r.closing_physical)}</b></div>)); })()}
      </div>}

      <div className="card">
        <h3 style={{ marginBottom: 2 }}>Écarts à surveiller</h3>
        <div className="muted" style={{ marginBottom: 6 }}>Écart de 20 œufs ou plus entre le comptage et le livre</div>
        {alerts.length === 0 && <p className="muted">Aucun écart important sur la période.</p>}
        {alerts.map((a, i) => <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderTop: "1px solid var(--line)" }}>
          <span><span style={{ color: "#B7791F" }}><Icon kind="warn" /></span> {short(a.d)} · {SIZE_NAME[a.size] ?? a.size}</span>
          <span><b>{a.gap > 0 ? "+" : ""}{n0(a.gap)}</b> <span className="muted">à vérifier</span></span></div>)}
      </div>

      <div className="card">
        <h3 style={{ marginBottom: 6 }}>Paiements reçus</h3>
        {pays.slice(0, 6).map((p, i) => <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "8px 0", borderTop: i ? "1px solid var(--line)" : undefined }}>
          <span>{p.customer}<div className="muted" style={{ fontSize: 12 }}>{short(p.at)} · {p.method}</div></span><b style={{ whiteSpace: "nowrap" }}>{n0(p.amount)} FCFA</b></div>)}
      </div>

      <Ask ctx={ctx} />
    </div>
  );
}

function Tile({ label, value, note }: { label: string; value: string; note?: string }) {
  return <div style={{ background: "var(--soft)", borderRadius: 12, padding: "10px 12px" }}>
    <div className="muted" style={{ fontSize: 12 }}>{label}</div><div style={{ fontSize: 22, fontWeight: 700 }}>{value}</div>
    {note && <div className="muted" style={{ fontSize: 11 }}>{note}</div>}</div>;
}

function Ask({ ctx }: { ctx: Ctx }) {
  const [q, setQ] = useState(""); const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<{ answer: string; sources: string[] } | null>(null); const [err, setErr] = useState("");
  async function ask(text?: string) {
    const question = (text ?? q).trim(); if (!question) return;
    setQ(question); setBusy(true); setErr(""); setOut(null);
    const { data, error } = await supabase.functions.invoke("ask", { body: { business_id: ctx.business_id, question } });
    setBusy(false);
    if (error || !data) return setErr("L'assistant ne répond pas pour le moment. Réessayez dans un instant.");
    if (data.error === "no_key") return setErr("L'assistant n'est pas encore activé : la clé Claude doit être ajoutée dans Supabase (Edge Functions, Secrets).");
    if (data.error) return setErr("L'assistant n'a pas pu répondre.");
    setOut({ answer: data.answer, sources: data.sources ?? [] });
  }
  return (
    <div className="card">
      <h3 style={{ marginBottom: 2 }}>Poser une question</h3>
      <div className="muted" style={{ marginBottom: 8 }}>L'assistant répond uniquement avec les chiffres approuvés et dit d'où ils viennent.</div>
      <input placeholder="Ex. : combien d'œufs M cette semaine ?" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && ask()} />
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "8px 0" }}>
        {["Quel est le plus gros écart de stock ?", "Combien a-t-on encaissé cette semaine ?", "Quels clients ont reçu le plus d'alvéoles ?"].map((s) => <button key={s} onClick={() => ask(s)} style={{ minHeight: 36, padding: "4px 10px", fontSize: 13 }}>{s}</button>)}
      </div>
      <button className="primary big" disabled={busy || !q.trim()} onClick={() => ask()}>{busy ? "Je cherche…" : "Demander"}</button>
      {err && <p style={{ color: "var(--error)" }}>{err}</p>}
      {out && <div className="quote" style={{ marginTop: 10 }}><div style={{ whiteSpace: "pre-wrap" }}>{out.answer}</div>
        {out.sources.length > 0 && <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>Sources : {out.sources.join(", ")}</div>}</div>}
    </div>
  );
}
