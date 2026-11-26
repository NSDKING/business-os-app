// Pay slip as a PDF (P-026). jsPDF is loaded only when the button is tapped.
export type Slip = { number: string | null; employee: string; role: string | null; month: string; base: number; workDays: number; absentDays: number; absence: number; advances: number; bonus: number; other: number; net: number; status: string; paidOn?: string | null };
const money = (v: number) => String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");

export async function payslipPdf(s: Slip, business: string, logo?: string | null): Promise<File> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = 210, M = 18; let y = 24; let nameY = y;
  if (logo) { try { const pr = doc.getImageProperties(logo); const h = Math.min(22, (pr.height / pr.width) * 45), w = h * (pr.width / pr.height); doc.addImage(logo, "PNG", M, 14, w, h); nameY = 14 + h + 6; y = Math.max(y, nameY); } catch { /* skip bad logo */ } }
  doc.setTextColor(20, 92, 67); doc.setFont("helvetica", "bold"); doc.setFontSize(18); doc.text(business, M, nameY);
  doc.setFontSize(20); doc.text("FICHE DE PAIE", W - M, 24, { align: "right" });
  doc.setTextColor(32, 41, 35); doc.setFont("helvetica", "normal"); doc.setFontSize(10);
  doc.text(`N° ${s.number ?? ""}`, W - M, 32, { align: "right" }); doc.text(`Mois : ${s.month}`, W - M, 37, { align: "right" });
  y = Math.max(y, 40) + 12;
  doc.setFont("helvetica", "bold"); doc.text("Employé", M, y); doc.setFont("helvetica", "normal"); y += 6;
  doc.text(s.employee + (s.role ? ` · ${s.role}` : ""), M, y); y += 12;
  doc.setFillColor(234, 243, 238); doc.rect(M, y - 5, W - 2 * M, 8, "F"); doc.setFont("helvetica", "bold");
  doc.text("Désignation", M + 2, y); doc.text("Montant (FCFA)", W - M - 2, y, { align: "right" }); doc.setFont("helvetica", "normal"); y += 9;
  const row = (k: string, v: number, sign: "" | "+" | "-" = "") => { doc.text(k, M + 2, y); doc.text(`${sign ? sign + " " : ""}${money(v)}`, W - M - 2, y, { align: "right" }); doc.setDrawColor(226, 231, 226); doc.line(M, y + 2.5, W - M, y + 2.5); y += 8; };
  row("Salaire mensuel", s.base);
  if (s.bonus) row("Prime", s.bonus, "+");
  if (s.absentDays) row(`Absences non payées (${s.absentDays} jour${s.absentDays > 1 ? "s" : ""} sur ${s.workDays})`, s.absence, "-");
  if (s.advances) row("Avances déjà versées", s.advances, "-");
  if (s.other) row("Autres retenues", s.other, "-");
  y += 2; doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.text("Net à payer", M + 2, y); doc.text(`${money(s.net)} FCFA`, W - M - 2, y, { align: "right" });
  y += 12; doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(104, 115, 108);
  doc.text(s.status === "paid" ? `Payée${s.paidOn ? ` le ${s.paidOn}` : ""}.` : "Non payée.", M, y); y += 5;
  doc.text("Fiche simple : cotisations sociales et impôts non calculés (à ajouter par le comptable).", M, y);
  return new File([doc.output("blob")], `Paie-${(s.number ?? "fiche").replace(/[^\w-]+/g, "_")}.pdf`, { type: "application/pdf" });
}
