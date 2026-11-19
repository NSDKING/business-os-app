"use client";
import { useEffect, useMemo, useState } from "react";
import { mediaUrl } from "@/lib/media";
import { supabase, type Draft } from "@/lib/supabase";

type Row = Record<string, unknown>;
type Fields = Record<string, unknown>;

const LABELS: Record<string, string> = {
  date: "Date", sorties_trays: "Sorties (alvéoles)", total_eggs_written: "Total œufs écrit",
  customer: "Client", vehicle: "Véhicule",
  size: "Taille", opening: "Début", production: "Prod.", sorties: "Sorties",
  closing_book: "Fin livre", closing_physical: "Fin réel", gap: "Écart",
  room: "Salle", eggs_8h: "8h", eggs_10h: "10h", eggs_12h: "12h", eggs_15h: "15h", eggs_total: "Total",
  quantity: "Qté", item: "Article", requested_by: "Demandé par", kind: "Type", payment: "Paiement", due: "Échéance",
  site: "Site", summary: "Résumé", mortality: "Poules mortes", present: "Présents", absent: "Absents", name: "Nom", status: "Statut", destination: "Destination", amount_fcfa: "Montant (FCFA)", method: "Moyen",
};
const label = (k: string) => LABELS[k] ?? k;
const num = (v: unknown) => (typeof v === "number" ? v : v === "" || v == null ? null : Number(v));

// Cells that do not add up. Rule: end of day (book) = opening + production - sorties; gap = physical - book.
function flags(rows: Row[]): Set<string> {
  const bad = new Set<string>();
  rows.forEach((r, i) => {
    const [o, p, s, b, ph, g] = ["opening", "production", "sorties", "closing_book", "closing_physical", "gap"].map((k) => num(r[k]));
    if (o != null && p != null && s != null && b != null && o + p - s !== b) { bad.add(`${i}.closing_book`); bad.add(`${i}.production`); bad.add(`${i}.sorties`); }
    if (b != null && ph != null && g != null && ph - b !== g) { bad.add(`${i}.gap`); bad.add(`${i}.closing_physical`); }
  });
  return bad;
}

function Evidence({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [big, setBig] = useState(false);
  useEffect(() => { let on = true; mediaUrl(path).then((u) => on && setUrl(u)).catch(() => {}); return () => { on = false; }; }, [path]);
  if (!url) return null;
  return (<>
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={url} alt="Document envoyé" onClick={() => setBig(true)} style={{ width: "100%", maxHeight: 260, objectFit: "cover", objectPosition: "top", borderRadius: 10, border: "1px solid var(--line)", cursor: "zoom-in" }} />
    {big && <div onClick={() => setBig(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.88)", zIndex: 50, overflow: "auto", cursor: "zoom-out" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="Document" style={{ width: "100%", display: "block" }} /></div>}
  </>);
}

function Table({ rows, editing, bad, field, onCell }: {
  rows: Row[]; editing: boolean; bad: Set<string>; field: string; onCell: (i: number, k: string, v: string) => void;
}) {
  const ORDER = ["size", "room", "customer", "vehicle", "item", "opening", "production", "sorties", "closing_book", "closing_physical", "gap"];
  const cols = useMemo(() => [...new Set(rows.flatMap((r) => Object.keys(r)))].sort((a, b) => (ORDER.indexOf(a) + 1 || 99) - (ORDER.indexOf(b) + 1 || 99)), [rows]);
  return (
    <div style={{ overflowX: "auto", margin: "6px -8px 0" }}>
      <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13 }}>
        <thead><tr>{cols.map((c) => (
          <th key={c} style={{ textAlign: c === "size" || c === "room" ? "left" : "right", padding: "6px 4px", color: "var(--muted)", fontWeight: 600, fontSize: 12, lineHeight: 1.2, verticalAlign: "bottom" }}>{label(c)}</th>))}</tr></thead>
        <tbody>{rows.map((r, i) => (
          <tr key={i} style={{ borderTop: "1px solid var(--line)" }}>{cols.map((c) => {
            const isBad = field === "stock" && bad.has(`${i}.${c}`);
            const textual = c === "size" || c === "room" || typeof r[c] === "string";
            return (
              <td key={c} style={{ padding: "6px 4px", textAlign: textual ? "left" : "right", background: isBad ? "#FCEFD6" : undefined, fontWeight: textual ? 700 : 500, whiteSpace: "nowrap" }}>
                {editing && !textual
                  ? <input inputMode="numeric" value={String(r[c] ?? "")} onChange={(e) => onCell(i, c, e.target.value)}
                      style={{ width: 54, minHeight: 40, padding: "4px 4px", fontSize: 14, textAlign: "right", borderColor: isBad ? "var(--pending)" : undefined }} />
                  : String(r[c] ?? "—")}
              </td>);
          })}</tr>))}
        </tbody>
      </table>
    </div>
  );
}

export default function ReviewCard({ d, title, source, evidence, photo, onDone }: {
  d: Draft; title: string; source: string; evidence: string; photo?: string; onDone: () => void;
}) {
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const [editing, setEditing] = useState(false);
  const [f, setF] = useState<Fields>(() => structuredClone(d.fields));
  const changed = JSON.stringify(f) !== JSON.stringify(d.fields);
  const stock = Array.isArray(f.stock) ? (f.stock as Row[]) : [];
  const bad = useMemo(() => flags(stock), [stock]);
  const pct = d.confidence == null ? null : Math.round(d.confidence * 100);
  const level = pct == null ? "" : pct >= 90 ? "élevée" : pct >= 70 ? "moyenne" : "faible";

  function setScalar(k: string, v: string) { setF((x) => ({ ...x, [k]: typeof d.fields[k] === "number" ? num(v) : v })); }
  function setCell(key: string, i: number, k: string, v: string) {
    setF((x) => {
      const rows = (x[key] as Row[]).map((r, j) => (j === i ? { ...r, [k]: v === "" ? null : Number(v.replace(/[^\d-]/g, "")) } : r));
      return { ...x, [key]: rows };
    });
  }
  async function approve() {
    setBusy(true); setErr("");
    const { error } = await supabase.rpc("approve_draft", { p_draft: d.id, p_fields: changed ? f : null });
    setBusy(false); if (error) setErr("Impossible d'approuver (droits ?)."); else onDone();
  }
  async function reject() {
    setBusy(true); setErr("");
    const { error } = await supabase.rpc("reject_draft", { p_draft: d.id });
    setBusy(false); if (error) setErr("Impossible de rejeter."); else onDone();
  }

  const scalars = Object.entries(f).filter(([, v]) => !Array.isArray(v));
  const tables = Object.entries(f).filter(([, v]) => Array.isArray(v) && (v as unknown[]).every((x) => typeof x === "object")) as [string, Row[]][];

  return (
    <div className="card">
      <span className="pill pending">{editing ? "Modification" : "À valider"}</span>
      <h3>{title}</h3>
      <div className="muted">Extrait de {source}</div>

      <div style={{ marginTop: 8 }}>
        {scalars.map(([k, v]) => (
          <div className="fact" key={k}>
            <span className="muted">{label(k)}</span>
            {editing
              ? <input inputMode={typeof v === "number" ? "numeric" : "text"} value={String(v ?? "")} onChange={(e) => setScalar(k, e.target.value)} style={{ width: 150, textAlign: "right" }} />
              : <b>{String(v ?? "—")}</b>}
          </div>))}
      </div>

      {tables.map(([k, rows]) => (
        <div key={k} style={{ marginTop: 12 }}>
          <div className="muted" style={{ fontWeight: 600 }}>{k === "stock" ? "Stock par taille" : k === "rooms" ? "Salles" : label(k)}</div>
          <Table rows={rows} editing={editing} bad={bad} field={k} onCell={(i, c, v) => setCell(k, i, c, v)} />
        </div>))}

      {bad.size > 0 && <div className="quote">Les cases en orange ne tombent pas juste : <b>début + production − sorties = fin (livre)</b> et <b>écart = fin (réel) − fin (livre)</b>. {editing ? "Corrigez-les." : "Touchez Modifier pour corriger."}</div>}
      {d.questions.length > 0 && <div className="quote">À vérifier : {d.questions.join(" · ")}</div>}

      <div className="muted" style={{ marginTop: 10 }}>Message d'origine</div>
      {photo ? <Evidence path={photo} /> : null}
      <div className="quote">“{evidence}”</div>
      {pct != null && <div className="muted">Confiance de l'IA : {level} ({pct}%) · Vérifiez avant d'approuver</div>}
      {err && <p style={{ color: "var(--error)" }}>{err}</p>}

      <p><button className="primary big" disabled={busy} onClick={approve}>{editing && changed ? "Approuver avec mes corrections" : "Approuver le rapport"}</button></p>
      <div className="row">
        {editing
          ? <button disabled={busy} onClick={() => { setF(structuredClone(d.fields)); setEditing(false); }}>Annuler</button>
          : <button disabled={busy} onClick={() => setEditing(true)}>Modifier</button>}
        <button disabled={busy} onClick={reject}>Rejeter</button>
      </div>
    </div>
  );
}
