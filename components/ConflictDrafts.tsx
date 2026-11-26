"use client";
// Offline conflicts as drafts (P-028): an action done offline was refused because the situation changed.
// The person sees what they tried, why it was refused, and chooses to redo it on the current situation or drop it.
import { useEffect, useState } from "react";
import { readConflicts, redoConflict, dropConflict, type Conflict } from "@/lib/offline";

const NAMES: Record<string, string> = {
  approve_draft: "Approbation d'un rapport", reject_draft: "Rejet d'un rapport", add_stock_move: "Mouvement de stock", record_stock_count: "Comptage de stock",
  apply_stock_suggestion: "Suggestion de stock", dismiss_stock_suggestion: "Suggestion de stock", record_payment: "Paiement", create_invoice: "Facture",
  pay_payslip: "Paie", prepare_payslip_custom: "Fiche de paie", prepare_payslip: "Fiche de paie", record_advance: "Avance sur salaire", set_attendance: "Présence",
  create_employee: "Nouvel employé", cancel_payslip: "Annulation de fiche",
};
const nice = (n: string) => NAMES[n] ?? n.replace(/_/g, " ");

export default function ConflictDrafts() {
  const [list, setList] = useState<Conflict[]>([]); const [busy, setBusy] = useState(""); const [err, setErr] = useState<Record<string, string>>({});
  useEffect(() => { const f = () => setList(readConflicts()); f(); window.addEventListener("bos-offline-change", f); return () => window.removeEventListener("bos-offline-change", f); }, []);
  if (list.length === 0) return null;
  return (<>{list.map((c) => <div key={c.id} className="card" style={{ borderLeft: "4px solid var(--pending)" }}>
    <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><b>{nice(c.name)} · non appliqué</b><span className="muted" style={{ fontSize: 12 }}>{new Date(c.at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}</span></div>
    <p className="muted" style={{ margin: "6px 0" }}>Vous l&apos;avez fait hors ligne. Quelqu&apos;un l&apos;a fait avant vous ou la situation a changé : la première action est gardée.</p>
    <div style={{ fontSize: 14 }}>Réponse du système : <i>{c.reason}</i></div>
    {err[c.id] && <div style={{ color: "var(--error)", fontSize: 13, marginTop: 4 }}>Toujours refusé : {err[c.id]}</div>}
    <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
      {c.url && <button className="primary" style={{ minHeight: 44, flex: 1 }} disabled={busy === c.id} onClick={async () => { setBusy(c.id); const e = await redoConflict(c.id); setBusy(""); if (e) setErr({ ...err, [c.id]: e }); }}>Refaire avec la situation actuelle</button>}
      <button style={{ minHeight: 44 }} onClick={() => dropConflict(c.id)}>Abandonner</button></div></div>)}</>);
}
