"use client";
// Manual entry (P-015): a form built from a report type. It makes a draft that follows the same approval as the AI's proposals.
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Ctx } from "./Chats";

type FieldDef = { name: string; type: string };
type RType = { id: string; name: string; label: string; fields: FieldDef[] };
const LABEL: Record<string, string> = {
  customer: "Client", advertiser: "Annonceur", amount_fcfa: "Montant (FCFA)", method: "Mode de paiement", date: "Date (JJ/MM/AAAA)", item: "Article", quantity: "Quantité",
  requested_by: "Demandé par", topic: "Sujet", journalist: "Journaliste", status: "Statut", slot: "Passage (ex. JT 20h)", start: "Heure de début (ex. 19h42)", duration_min: "Durée (minutes)",
  cause: "Cause", spots_per_month: "Passages par mois", price_per_spot_fcfa: "Prix par passage (FCFA)", site: "Site", summary: "Résumé", mortality: "Poules mortes", kind: "Type",
  payment: "Paiement (paid ou on_credit)", due: "Échéance", present: "Présents", absent: "Absents", vehicle: "Véhicule", destination: "Destination", total_planned: "Passages prévus", total_aired: "Passages diffusés",
};
const PEOPLE_FIELDS = new Set(["customer", "advertiser", "destination"]);
const OPTIONAL = new Set(["due"]);

export default function AddSheet({ ctx, onClose, onDone }: { ctx: Ctx; onClose: () => void; onDone: () => void }) {
  const [types, setTypes] = useState<RType[]>([]); const [names, setNames] = useState<string[]>([]);
  const [mine, setMine] = useState<{ all: boolean; types: Set<string> }>({ all: false, types: new Set() });
  const [sel, setSel] = useState<RType | null>(null); const [v, setV] = useState<Record<string, string>>({});
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const [{ data: rt }, { data: ps }, { data: me }] = await Promise.all([
        supabase.from("record_type").select("id,name,label,fields").eq("business_id", ctx.business_id).eq("active", true).order("label"),
        supabase.from("party").select("name").eq("business_id", ctx.business_id).eq("active", true).order("name"),
        supabase.from("member").select("id").eq("business_id", ctx.business_id).eq("person_id", ctx.person_id).limit(1),
      ]);
      setTypes((rt as RType[]) ?? []); setNames([...new Set((ps ?? []).map((p) => p.name as string))]);
      if (me?.[0]) {
        const { data: g } = await supabase.from("role_grant").select("scope_record_type_id,scope_unit_id").eq("member_id", me[0].id).eq("permission", "approve").is("revoked_at", null);
        setMine({ all: (g ?? []).some((x) => !x.scope_record_type_id && !x.scope_unit_id), types: new Set((g ?? []).filter((x) => x.scope_record_type_id).map((x) => x.scope_record_type_id as string)) });
      }
    })();
  }, [ctx.business_id, ctx.person_id]);

  const simple = (t: RType) => t.fields.every((f) => f.type !== "list");
  const canApprove = useMemo(() => !!sel && (mine.all || mine.types.has(sel.id)), [sel, mine]);

  async function send(approve: boolean) {
    if (!sel) return; setErr("");
    const out: Record<string, unknown> = {};
    for (const f of sel.fields) {
      const raw = (v[f.name] ?? "").trim();
      if (!raw) { if (OPTIONAL.has(f.name)) { out[f.name] = null; continue; } return setErr(`Il manque : ${LABEL[f.name] ?? f.name}.`); }
      if (f.type === "integer") { const n = Number(raw.replace(/\s/g, "")); if (!Number.isFinite(n) || !Number.isInteger(n)) return setErr(`${LABEL[f.name] ?? f.name} doit être un nombre entier.`); out[f.name] = n; }
      else out[f.name] = raw;
    }
    if (approve) for (const k of ["customer", "advertiser"]) {
      const nm = typeof out[k] === "string" ? (out[k] as string) : "";
      if (nm && !names.some((n) => n.trim().toLowerCase() === nm.toLowerCase()) && !window.confirm(`« ${nm} » n'est pas dans vos clients. L'ajouter comme nouveau client ?\n\nSi c'est un client existant mal écrit, faites Annuler et choisissez-le dans la liste.`)) return;
    }
    setBusy(true);
    const { data: id, error } = await supabase.rpc("create_manual_draft", { p_business: ctx.business_id, p_type: sel.id, p_fields: out });
    if (error || !id) { setBusy(false); return setErr("Impossible d'enregistrer."); }
    if (approve) {
      const { error: e2 } = await supabase.rpc("approve_draft", { p_draft: id, p_fields: null });
      if (e2) { setBusy(false); onDone(); return setErr("Le brouillon est créé, mais vous ne pouvez pas l'approuver."); }
    }
    setBusy(false); onDone(); onClose();
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", zIndex: 50, display: "flex", alignItems: "flex-end" }} onClick={onClose}>
      <div className="card" style={{ width: "100%", maxHeight: "88%", overflowY: "auto", borderRadius: "18px 18px 0 0", margin: 0 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><h3>{sel ? sel.label : "Ajouter une information"}</h3><button style={{ minHeight: 34 }} onClick={onClose}>Fermer</button></div>
        {!sel && <>
          <p className="muted">Choisissez ce que vous voulez enregistrer. Cela devient un brouillon, vérifié comme les propositions de l'assistant.</p>
          {types.map((t) => <button key={t.id} className="big" style={{ display: "block", width: "100%", textAlign: "left", margin: "6px 0", opacity: simple(t) ? 1 : 0.5 }} disabled={!simple(t)} onClick={() => { setSel(t); setV({}); setErr(""); }}>
            {t.label}{!simple(t) && <span className="muted" style={{ fontSize: 12 }}> · envoyez plutôt la photo ou un message</span>}</button>)}
        </>}
        {sel && <>
          <datalist id="parties">{names.map((n) => <option key={n} value={n} />)}</datalist>
          {sel.fields.map((f) => <p key={f.name}><label className="muted" style={{ fontSize: 12 }}>{LABEL[f.name] ?? f.name}{OPTIONAL.has(f.name) ? " (facultatif)" : ""}</label>
            <input inputMode={f.type === "integer" ? "numeric" : undefined} list={PEOPLE_FIELDS.has(f.name) ? "parties" : undefined} value={v[f.name] ?? ""} onChange={(e) => setV({ ...v, [f.name]: e.target.value })} /></p>)}
          {err && <p style={{ color: "var(--error)" }}>{err}</p>}
          <button className="primary big" disabled={busy} onClick={() => send(false)}>Envoyer pour approbation</button>
          {canApprove && <button className="big" style={{ marginTop: 8 }} disabled={busy} onClick={() => send(true)}>Enregistrer et approuver</button>}
          <button className="big" style={{ marginTop: 8 }} onClick={() => setSel(null)}>Retour</button>
        </>}
      </div>
    </div>
  );
}
