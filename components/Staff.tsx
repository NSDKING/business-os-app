"use client";
// Personnel (P-026): employees, daily attendance (from approved sheets or by hand), advances, simple monthly pay slips.
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Ctx } from "./Chats";
import { useCanMaintain } from "./useCan";
import { payslipPdf } from "@/lib/payslipPdf";

type Emp = { id: string; name: string; role: string | null; monthly_salary_fcfa: number; alias: string | null };
type Att = { employee_id: string; on_date: string; status: "present" | "absent" | "leave" };
type Adv = { employee_id: string; amount_fcfa: number };
type Slip = { id: string; employee_id: string; employee_name: string; month: string; number: string | null; base_fcfa: number; work_days: number; absent_days: number; absence_deduction_fcfa: number; advances_fcfa: number; bonus_fcfa: number; other_deduction_fcfa: number; net_fcfa: number; status: string; paid_at: string | null };
type Acc = { id: string; name: string };
const n0 = (v: number) => Math.round(v).toLocaleString("fr-FR");
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const sel: React.CSSProperties = { width: "100%", minHeight: 46, borderRadius: 10, border: "1px solid var(--line)", background: "var(--surface)", color: "var(--text)", padding: "0 10px" };
const ST: Record<string, string> = { present: "Présent", absent: "Absent", leave: "Congé" };

export default function Staff({ ctx }: { ctx: Ctx }) {
  const can = useCanMaintain(ctx);
  const [emps, setEmps] = useState<Emp[] | null>(null); const [att, setAtt] = useState<Att[]>([]); const [advs, setAdvs] = useState<Adv[]>([]);
  const [slips, setSlips] = useState<Slip[]>([]); const [accs, setAccs] = useState<Acc[]>([]); const [acct, setAcct] = useState("");
  const [date, setDate] = useState(iso(new Date())); const [monthBack, setMonthBack] = useState<0 | 1>(0);
  const [adding, setAdding] = useState(false); const [nw, setNw] = useState({ name: "", role: "", salary: "", alias: "" });
  const [open, setOpen] = useState(""); const [advAmt, setAdvAmt] = useState(""); const [bonus, setBonus] = useState<Record<string, string>>({}); const [other, setOther] = useState<Record<string, string>>({}); const [wdays, setWdays] = useState<Record<string, string>>({}); const [dedIn, setDedIn] = useState<Record<string, string>>({}); const [sal, setSal] = useState("");
  const [logo, setLogo] = useState<string | null>(null);
  const [msg, setMsg] = useState(""); const [busy, setBusy] = useState("");
  const now = new Date(); const mStart = new Date(now.getFullYear(), now.getMonth() - monthBack, 1); const mEnd = new Date(now.getFullYear(), now.getMonth() - monthBack + 1, 1);
  const monthLabel = mStart.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });

  const load = useCallback(async () => {
    const [{ data: e }, { data: a }, { data: ad }, { data: sl }, { data: ac }, { data: bz }] = await Promise.all([
      supabase.from("employee").select("id,name,role,monthly_salary_fcfa,alias").eq("business_id", ctx.business_id).eq("active", true).order("name"),
      supabase.from("attendance_day").select("employee_id,on_date,status").eq("business_id", ctx.business_id).gte("on_date", iso(new Date(now.getFullYear(), now.getMonth() - 1, 1))),
      supabase.from("staff_advance").select("employee_id,amount_fcfa").eq("business_id", ctx.business_id).is("payslip_id", null),
      supabase.from("payslip").select("*").eq("business_id", ctx.business_id).neq("status", "cancelled").order("month", { ascending: false }).limit(60),
      supabase.from("money_account").select("id,name").eq("business_id", ctx.business_id).eq("active", true).order("name"),
      supabase.from("business").select("logo").eq("id", ctx.business_id).single(),
    ]);
    setEmps((e as Emp[]) ?? []); setAtt((a as Att[]) ?? []); setAdvs((ad as Adv[]) ?? []); setSlips((sl as Slip[]) ?? []); setAccs((ac as Acc[]) ?? []); setAcct((c) => c || (ac?.[0]?.id ?? "")); setLogo(bz?.logo ?? null);
  }, [ctx.business_id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { (async () => { if (can && navigator.onLine) await supabase.rpc("sync_attendance", { p_business: ctx.business_id }); await load(); })(); }, [can, ctx.business_id, load]);

  async function act(key: string, fn: () => PromiseLike<{ error: { message: string } | null }>, ok: string) {
    setBusy(key); setMsg("");
    const { error } = await fn(); setBusy("");
    if (error) setMsg("Impossible : " + error.message); else setMsg(navigator.onLine ? ok : "Enregistré sur ce téléphone : envoi dès le retour du réseau.");
    await load();
  }
  const num = (s: string) => Math.round(Number((s || "").replace(/\s/g, "").replace(",", ".")));
  const statusOn = (id: string, d: string) => att.find((x) => x.employee_id === id && x.on_date === d)?.status;
  const absentIn = (id: string) => att.filter((x) => x.employee_id === id && x.status === "absent" && x.on_date >= iso(mStart) && x.on_date < iso(mEnd)).length;
  const pend = (id: string) => advs.filter((x) => x.employee_id === id).reduce((t, x) => t + x.amount_fcfa, 0);
  const slipOf = (id: string) => slips.find((s) => s.employee_id === id && s.month === iso(mStart));

  async function pdf(s: Slip) {
    try {
      const file = await payslipPdf({ number: s.number, employee: s.employee_name, role: emps?.find((e) => e.id === s.employee_id)?.role ?? null, month: new Date(s.month).toLocaleDateString("fr-FR", { month: "long", year: "numeric" }), base: s.base_fcfa, workDays: s.work_days, absentDays: s.absent_days, absence: s.absence_deduction_fcfa, advances: s.advances_fcfa, bonus: s.bonus_fcfa, other: s.other_deduction_fcfa, net: s.net_fcfa, status: s.status, paidOn: s.paid_at ? new Date(s.paid_at).toLocaleDateString("fr-FR") : null }, ctx.business, logo);
      if (navigator.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file], title: file.name }); return; } catch (e) { if ((e as Error).name === "AbortError") return; } }
      const url = URL.createObjectURL(file); const a = document.createElement("a"); a.href = url; a.download = file.name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch { setMsg("Impossible de créer le PDF."); }
  }

  if (!can) return <div className="body"><div className="card"><h3>Personnel</h3><p className="muted">Réservé aux personnes qui peuvent approuver.</p></div></div>;
  if (emps === null) return <div className="body muted">Chargement…</div>;
  const AccSelect = <select style={sel} value={acct} onChange={(e) => setAcct(e.target.value)}>{accs.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>;
  return (<div className="body">
    {msg && <div className="card" style={{ color: msg.startsWith("Impossible") ? "var(--error)" : undefined }}>{msg}</div>}

    <div className="card"><h3 style={{ marginBottom: 6 }}>Employés</h3>
      {emps.length === 0 && <p className="muted">Aucun employé. Ajoutez-les : le nom doit être celui qui est écrit sur la fiche de présence.</p>}
      {emps.map((e) => <div key={e.id} style={{ borderTop: "1px solid var(--line)", padding: "8px 0" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, cursor: "pointer" }} onClick={() => { setOpen(open === e.id ? "" : e.id); setSal(String(e.monthly_salary_fcfa)); setAdvAmt(""); }}>
          <span>{e.name}{e.role && <span className="muted" style={{ fontSize: 12 }}> · {e.role}</span>}</span><b>{n0(e.monthly_salary_fcfa)}</b></div>
        {open === e.id && <div style={{ marginTop: 8 }}>
          <div style={{ display: "flex", gap: 8 }}><input inputMode="numeric" style={{ flex: 1 }} value={sal} onChange={(x) => setSal(x.target.value)} />
            <button style={{ minHeight: 44 }} disabled={busy === e.id} onClick={() => act(e.id, () => supabase.rpc("update_employee", { p_id: e.id, p_salary: num(sal) || 0, p_role: null, p_active: null }), "Salaire mis à jour.")}>Salaire</button></div>
          {accs.length > 0 ? <div style={{ marginTop: 8 }}><div className="muted" style={{ fontSize: 13 }}>Avance sur salaire · compte :</div><p style={{ margin: "4px 0" }}>{AccSelect}</p>
            <div style={{ display: "flex", gap: 8 }}><input inputMode="numeric" style={{ flex: 1 }} placeholder="Montant (FCFA)" value={advAmt} onChange={(x) => setAdvAmt(x.target.value)} />
              <button className="primary" style={{ minHeight: 44 }} disabled={busy === "adv" || !num(advAmt)} onClick={() => act("adv", () => supabase.rpc("record_advance", { p_business: ctx.business_id, p_employee: e.id, p_amount: num(advAmt), p_account: acct, p_note: null, p_date: null, p_id: crypto.randomUUID() }), "Avance enregistrée : elle sera retirée de la prochaine paie.").then(() => setAdvAmt(""))}>Donner</button></div></div>
            : <p className="muted" style={{ fontSize: 13 }}>Créez un compte dans Argent pour donner une avance ou payer.</p>}
          <button style={{ minHeight: 36, marginTop: 8 }} onClick={() => { if (window.confirm(`Retirer ${e.name} de la liste ?`)) act(e.id, () => supabase.rpc("update_employee", { p_id: e.id, p_salary: null, p_role: null, p_active: false }), "Employé retiré."); }}>Retirer de la liste</button></div>}
      </div>)}
      {!adding ? <button className="big" style={{ marginTop: 8 }} onClick={() => setAdding(true)}>+ Nouvel employé</button> : <div style={{ marginTop: 8 }}>
        <p><input placeholder="Nom" value={nw.name} onChange={(x) => setNw({ ...nw, name: x.target.value })} /></p>
        <p><input placeholder="Poste (facultatif)" value={nw.role} onChange={(x) => setNw({ ...nw, role: x.target.value })} /></p>
        <p><input inputMode="numeric" placeholder="Salaire mensuel (FCFA)" value={nw.salary} onChange={(x) => setNw({ ...nw, salary: x.target.value })} /></p>
        <p><input placeholder="Nom écrit sur la fiche de présence (si différent)" value={nw.alias} onChange={(x) => setNw({ ...nw, alias: x.target.value })} /></p>
        <div style={{ display: "flex", gap: 8 }}><button className="primary" disabled={busy === "new" || !nw.name.trim()} onClick={() => act("new", () => supabase.rpc("create_employee", { p_business: ctx.business_id, p_name: nw.name, p_role: nw.role, p_salary: num(nw.salary) || 0, p_alias: nw.alias, p_phone: null, p_id: crypto.randomUUID() }), "Employé ajouté.").then(() => { setAdding(false); setNw({ name: "", role: "", salary: "", alias: "" }); })}>Ajouter</button><button onClick={() => setAdding(false)}>Annuler</button></div></div>}
    </div>

    {emps.length > 0 && <div className="card"><h3 style={{ marginBottom: 2 }}>Présence</h3>
      <div className="muted" style={{ marginBottom: 6 }}>Les fiches de présence approuvées remplissent les jours toutes seules. Corrigez ici si besoin.</div>
      <p><input type="date" value={date} onChange={(x) => setDate(x.target.value)} /></p>
      {emps.map((e) => { const cur = statusOn(e.id, date); return <div key={e.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6, padding: "6px 0", borderTop: "1px solid var(--line)" }}>
        <span style={{ minWidth: 80 }}>{e.name}</span>
        <span style={{ display: "flex", gap: 4 }}>{(["present", "absent", "leave"] as const).map((s) => <button key={s} className={cur === s ? "primary" : ""} style={{ minHeight: 36, padding: "0 10px", fontSize: 13 }} disabled={busy === e.id + date}
          onClick={() => act(e.id + date, () => supabase.rpc("set_attendance", { p_business: ctx.business_id, p_employee: e.id, p_date: date, p_status: s }), "Présence enregistrée.")}>{ST[s]}</button>)}</span></div>; })}</div>}

    {emps.length > 0 && <div className="card"><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><h3 style={{ margin: 0 }}>Paie · {monthLabel}</h3>
      <div className="chips" style={{ padding: 0 }}><button className={monthBack === 0 ? "on" : ""} onClick={() => setMonthBack(0)}>Ce mois</button><button className={monthBack === 1 ? "on" : ""} onClick={() => setMonthBack(1)}>Mois dernier</button></div></div>
      <div className="muted" style={{ fontSize: 12, margin: "4px 0 8px" }}>Partez du salaire de base et ajustez vous-même : jours du mois, retenue d&apos;absences (calculée par défaut), prime, autres retenues. Le net se met à jour. Sans cotisations ni impôts.</div>
      {emps.map((e) => { const s = slipOf(e.id); const ab = absentIn(e.id); const ad = pend(e.id); const wd = Math.max(1, num(wdays[e.id] ?? "") || 26); const auto = Math.round(e.monthly_salary_fcfa / wd * ab); const dRaw = dedIn[e.id]; const ded = dRaw !== undefined && dRaw !== "" ? (num(dRaw) || 0) : auto; const b = num(bonus[e.id] ?? "") || 0; const o = num(other[e.id] ?? "") || 0; const net = e.monthly_salary_fcfa + b - ded - ad - o; return (
        <div key={e.id} style={{ borderTop: "1px solid var(--line)", padding: "10px 0" }}>
          {s ? <>
            <div style={{ display: "flex", justifyContent: "space-between" }}><b>{e.name}</b><span className="muted">{s.status === "paid" ? `Payée le ${new Date(s.paid_at!).toLocaleDateString("fr-FR")}` : "À payer"}</span></div>
            <div className="muted" style={{ fontSize: 13 }}>{s.number} · net <b style={{ color: "var(--text)" }}>{n0(s.net_fcfa)} FCFA</b>{s.absent_days ? ` · ${s.absent_days} abs.` : ""}{s.advances_fcfa ? ` · avances ${n0(s.advances_fcfa)}` : ""}</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
              <button style={{ minHeight: 36 }} onClick={() => pdf(s)}>PDF</button>
              {s.status === "draft" && accs.length > 0 && <><div style={{ minWidth: 130, flex: 1 }}>{AccSelect}</div><button className="primary" style={{ minHeight: 44 }} disabled={busy === s.id} onClick={() => act(s.id, () => supabase.rpc("pay_payslip", { p_id: s.id, p_account: acct, p_date: null, p_entry: crypto.randomUUID() }), "Paie enregistrée : l'argent est sorti du compte.")}>Payer</button></>}
              {s.status === "draft" && <button style={{ minHeight: 36 }} disabled={busy === s.id} onClick={() => { if (window.confirm("Annuler cette fiche ?")) act(s.id, () => supabase.rpc("cancel_payslip", { p_id: s.id }), "Fiche annulée."); }}>Annuler</button>}</div></> : <>
            <div style={{ display: "flex", justifyContent: "space-between" }}><b>{e.name}</b><b>{n0(net)} FCFA</b></div>
            <div className="muted" style={{ fontSize: 13 }}>Salaire de base {n0(e.monthly_salary_fcfa)} · {ab} jour{ab > 1 ? "s" : ""} d&apos;absence · avances {n0(ad)}</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 6 }}>
              <label className="muted" style={{ fontSize: 12 }}>Jours du mois<input inputMode="numeric" placeholder="26" value={wdays[e.id] ?? ""} onChange={(x) => setWdays({ ...wdays, [e.id]: x.target.value })} /></label>
              <label className="muted" style={{ fontSize: 12 }}>Retenue absences<input inputMode="numeric" placeholder={String(auto)} value={dedIn[e.id] ?? ""} onChange={(x) => setDedIn({ ...dedIn, [e.id]: x.target.value })} /></label>
              <label className="muted" style={{ fontSize: 12 }}>Prime<input inputMode="numeric" value={bonus[e.id] ?? ""} onChange={(x) => setBonus({ ...bonus, [e.id]: x.target.value })} /></label>
              <label className="muted" style={{ fontSize: 12 }}>Autres retenues<input inputMode="numeric" value={other[e.id] ?? ""} onChange={(x) => setOther({ ...other, [e.id]: x.target.value })} /></label></div>
            <button className="primary" style={{ minHeight: 44, marginTop: 8, width: "100%" }} disabled={busy === e.id || net < 0} onClick={() => act(e.id, () => supabase.rpc("prepare_payslip_custom", { p_business: ctx.business_id, p_employee: e.id, p_month: iso(mStart), p_work_days: wd, p_absence_deduction: ded, p_bonus: b, p_other: o, p_note: null, p_id: crypto.randomUUID() }), "Fiche de paie préparée.")}>Préparer · net {n0(net)} FCFA</button></>}
        </div>); })}</div>}
  </div>);
}
