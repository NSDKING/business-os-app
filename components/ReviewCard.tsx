"use client";
import { useState } from "react";
import { supabase, type Draft } from "@/lib/supabase";

const LABELS: Record<string, string> = {
  date: "Date", stock: "Stock", sorties_trays: "Sorties (alvéoles)", total_eggs_written: "Total œufs écrit",
  customer: "Client", vehicle: "Véhicule", items: "Articles",
};
function show(v: unknown): string {
  if (v == null) return "—";
  if (Array.isArray(v)) return `${v.length} lignes`;
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

export default function ReviewCard({ d, title, source, evidence, onDone }: {
  d: Draft; title: string; source: string; evidence: string; onDone: () => void;
}) {
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const pct = d.confidence == null ? null : Math.round(d.confidence * 100);
  const level = pct == null ? "" : pct >= 90 ? "High" : pct >= 70 ? "Medium" : "Low";
  async function approve() {
    setBusy(true); setErr("");
    const { error } = await supabase.rpc("approve_draft", { p_draft: d.id });
    setBusy(false); if (error) setErr("Impossible d'approuver (droits ?)."); else onDone();
  }
  async function reject() {
    setBusy(true); setErr("");
    const { error } = await supabase.rpc("reject_draft", { p_draft: d.id });
    setBusy(false); if (error) setErr("Impossible de rejeter."); else onDone();
  }
  return (
    <div className="card">
      <span className="pill pending">Needs approval</span>
      <h3>{title}</h3>
      <div className="muted">Extracted from {source}</div>
      <div style={{ marginTop: 8 }}>
        {Object.entries(d.fields).map(([k, v]) => (
          <div className="fact" key={k}><span className="muted">{LABELS[k] || k}</span><b>{show(v)}</b></div>
        ))}
      </div>
      {d.questions.length > 0 && <div className="quote" style={{ borderColor: "var(--pending)" }}>À vérifier : {d.questions.join(" · ")}</div>}
      <div className="muted" style={{ marginTop: 10 }}>Original evidence</div>
      <div className="quote">“{evidence}”</div>
      {pct != null && <div className="muted">AI confidence: {level} ({pct}%) · Verify before approving</div>}
      {err && <p style={{ color: "var(--error)" }}>{err}</p>}
      <p><button className="primary big" disabled={busy} onClick={approve}>Approve report</button></p>
      <div className="row"><button disabled>Edit</button><button disabled={busy} onClick={reject}>Reject</button></div>
    </div>
  );
}
