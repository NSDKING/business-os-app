// Invoice as a PDF file (P-020). jsPDF is loaded only when someone taps the button, so phones that never use it do not download it.
export type PdfLine = { label: string; qty: number; unit_price: number; total: number };
export type PdfInvoice = { number: string | null; customer: string; lines: PdfLine[]; total_fcfa: number; vat_rate: number; vat_fcfa: number; ttc_fcfa: number | null; seller_niu: string | null; customer_niu: string | null; status: string; date: string; title?: string; validUntil?: string; paid?: number };

// Plain spaces between thousands: the PDF's built-in font cannot draw the narrow space that toLocaleString uses.
const money = (v: number) => String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");

export async function invoicePdf(i: PdfInvoice, business: string, logo?: string | null): Promise<File> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = 210, M = 18; let y = 24;
  const green: [number, number, number] = [20, 92, 67];
  let nameY = y;
  if (logo) {
    try { const pr = doc.getImageProperties(logo); const h = Math.min(22, (pr.height / pr.width) * 45), w = h * (pr.width / pr.height); doc.addImage(logo, "PNG", M, 14, w, h); nameY = 14 + h + 6; y = Math.max(y, nameY); } catch { /* bad logo: skip */ }
  }
  doc.setTextColor(...green); doc.setFont("helvetica", "bold"); doc.setFontSize(18); doc.text(business, M, nameY);
  doc.setFontSize(22); doc.text(i.title ?? "FACTURE", W - M, y, { align: "right" });
  doc.setTextColor(32, 41, 35); doc.setFont("helvetica", "normal"); doc.setFontSize(10); y += 8;
  doc.text(`N° ${i.number ?? "(brouillon)"}`, W - M, y, { align: "right" }); y += 5;
  doc.text(`Date : ${i.date}`, W - M, y, { align: "right" });
  if (i.validUntil) { y += 5; doc.text(`Valable jusqu'au ${i.validUntil}`, W - M, y, { align: "right" }); y -= 5; }
  if (i.seller_niu) { doc.text(`NIU : ${i.seller_niu}`, M, y); }
  y += 14;
  doc.setFont("helvetica", "bold"); doc.text("Facturé à", M, y); doc.setFont("helvetica", "normal"); y += 6;
  doc.text(i.customer, M, y); y += 5;
  if (i.customer_niu) { doc.text(`NIU : ${i.customer_niu}`, M, y); y += 5; }
  y += 8;
  // table
  doc.setFillColor(234, 243, 238); doc.rect(M, y - 5, W - 2 * M, 8, "F"); doc.setFont("helvetica", "bold");
  doc.text("Désignation", M + 2, y); doc.text("Qté", 115, y, { align: "right" }); doc.text("Prix unitaire", 150, y, { align: "right" }); doc.text("Total (FCFA)", W - M - 2, y, { align: "right" });
  doc.setFont("helvetica", "normal"); y += 8;
  for (const l of i.lines) {
    const label = doc.splitTextToSize(l.label, 80) as string[];
    doc.text(label, M + 2, y); doc.text(money(l.qty), 115, y, { align: "right" }); doc.text(money(l.unit_price), 150, y, { align: "right" }); doc.text(money(l.total), W - M - 2, y, { align: "right" });
    y += 6 * label.length;
    doc.setDrawColor(226, 231, 226); doc.line(M, y - 3, W - M, y - 3); y += 1;
    if (y > 260) { doc.addPage(); y = 24; }
  }
  y += 4;
  const row = (k: string, v: string, bold = false) => { doc.setFont("helvetica", bold ? "bold" : "normal"); doc.text(k, 130, y); doc.text(v, W - M - 2, y, { align: "right" }); y += 6; };
  if (i.vat_rate > 0) { row("Total HT", `${money(i.total_fcfa)} FCFA`); row(`TVA ${String(i.vat_rate).replace(".", ",")} %`, `${money(i.vat_fcfa)} FCFA`); }
  doc.setFontSize(12); row(i.vat_rate > 0 ? "Total TTC" : "Total", `${money(i.ttc_fcfa ?? i.total_fcfa)} FCFA`, true);
  const due = i.ttc_fcfa ?? i.total_fcfa; const paid = Math.max(0, i.paid ?? 0);
  if (i.status === "issued" && paid > 0 && paid < due) { doc.setFontSize(11); row("Déjà payé", `${money(paid)} FCFA`); row("Reste à payer", `${money(due - paid)} FCFA`, true); }
  if (i.status === "issued" && paid >= due && due > 0) { doc.setTextColor(30, 130, 80); doc.setFontSize(40); doc.text("PAYÉE", W / 2, 150, { align: "center", angle: 30 }); doc.setTextColor(32, 41, 35); }
  if (i.status === "void") { doc.setTextColor(199, 71, 71); doc.setFontSize(40); doc.text("ANNULÉE", W / 2, 150, { align: "center", angle: 30 }); }
  if (i.status === "draft") { doc.setTextColor(150, 150, 150); doc.setFontSize(40); doc.text("BROUILLON", W / 2, 150, { align: "center", angle: 30 }); }
  const name = `${(i.title ?? "Facture").charAt(0) + (i.title ?? "Facture").slice(1).toLowerCase()}-${(i.number ?? "brouillon").replace(/[^\w-]+/g, "_")}.pdf`;
  return new File([doc.output("blob")], name, { type: "application/pdf" });
}
