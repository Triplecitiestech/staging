import { DiscoveryInput, PackageQuote, RecommendationResult } from "./types";
import { theme } from "./config";
import { currentSpendTotals } from "./calc";
import { currency, pct } from "./format";

function download(filename: string, data: BlobPart, mime: string) {
  const blob = new Blob([data], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function stamp(): string {
  return new Date().toISOString().slice(0, 10);
}
function safeName(s: string): string {
  return (s || "Customer").replace(/[^A-Za-z0-9_-]+/g, "_");
}

// ---------------- JSON ----------------
export function exportJSON(input: DiscoveryInput, quotes: PackageQuote[], rec: RecommendationResult) {
  const payload = { generatedAt: new Date().toISOString(), company: input.company, input, recommendation: rec, quotes };
  download(`TCT_Quote_${safeName(input.company.name)}_${stamp()}.json`, JSON.stringify(payload, null, 2), "application/json");
}

// ---------------- CSV ----------------
export function exportCSV(input: DiscoveryInput, quotes: PackageQuote[]) {
  const rows: string[][] = [];
  rows.push(["Triple Cities Tech — Internal Quote Export"]);
  rows.push(["Customer", input.company.name, "Generated", stamp()]);
  rows.push([]);
  rows.push(["Package", "Line Item", "Unit", "Qty", "Unit Cost", "Unit Price", "Monthly Cost", "Monthly Price", "Monthly Margin", "Margin %"]);
  for (const q of quotes) {
    for (const l of q.lineItems) {
      rows.push([q.packageName, l.label, l.unit, String(l.quantity), l.unitCost.toFixed(2), l.unitPrice.toFixed(2), l.cost.toFixed(2), l.price.toFixed(2), l.margin.toFixed(2), (l.marginPct * 100).toFixed(1) + "%"]);
    }
    rows.push([q.packageName, "TOTAL (Managed, monthly)", "", "", "", "", q.monthlyCost.toFixed(2), q.monthlyPrice.toFixed(2), q.monthlyMargin.toFixed(2), (q.marginPct * 100).toFixed(1) + "%"]);
    rows.push([q.packageName, "Microsoft 365 (separate)", "", "", "", "", q.m365MonthlyCost.toFixed(2), q.m365MonthlyPrice.toFixed(2), "", ""]);
    rows.push([]);
  }
  const csv = rows.map((r) => r.map((c) => `"${(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
  download(`TCT_Quote_${safeName(input.company.name)}_${stamp()}.csv`, csv, "text/csv");
}

// ---------------- Excel (SheetJS) ----------------
export async function exportExcel(input: DiscoveryInput, quotes: PackageQuote[], rec: RecommendationResult) {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();

  const summary: any[][] = [
    ["Triple Cities Tech — Managed Services Quote (INTERNAL)"],
    ["Customer", input.company.name, "Industry", input.company.industry],
    ["Generated", stamp(), "Recommended", rec.recommendedPackageName],
    [],
    ["Package", "Monthly Price", "Annual Price", "Monthly Cost", "Monthly Margin", "Margin %", "M365 / mo (sep.)", "License Req.", "Meets Req?"],
  ];
  for (const q of quotes) {
    summary.push([q.packageName, q.monthlyPrice, q.annualPrice, q.monthlyCost, q.monthlyMargin, q.marginPct, q.m365MonthlyPrice, q.licenseRequirement, q.meetsLicenseRequirement ? "Yes" : "NO"]);
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summary), "Comparison");

  for (const q of quotes) {
    const aoa: any[][] = [["Line Item", "Unit", "Qty", "Unit Cost", "Unit Price", "Monthly Cost", "Monthly Price", "Margin", "Margin %"]];
    for (const l of q.lineItems) aoa.push([l.label, l.unit, l.quantity, l.unitCost, l.unitPrice, l.cost, l.price, l.margin, l.marginPct]);
    aoa.push([]);
    aoa.push(["TOTAL (Managed)", "", "", "", "", q.monthlyCost, q.monthlyPrice, q.monthlyMargin, q.marginPct]);
    aoa.push(["Microsoft 365 (separate)", "", "", "", "", q.m365MonthlyCost, q.m365MonthlyPrice, "", ""]);
    const sheetName = q.packageName.replace("TCT ", "").slice(0, 28);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), sheetName);
  }
  XLSX.writeFile(wb, `TCT_Quote_${safeName(input.company.name)}_${stamp()}.xlsx`);
}

// ---------------- PDF (jsPDF + autotable) ----------------
export async function exportPDF(
  input: DiscoveryInput, quotes: PackageQuote[], rec: RecommendationResult,
  mode: "internal" | "customer" | "executive", selectedPackageId: string
) {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const primary = theme.brand.bg;       // slate header
  const accent = theme.brand.accent;
  const W = doc.internal.pageSize.getWidth();
  const co = theme.company;

  // Header band
  doc.setFillColor(primary);
  doc.rect(0, 0, W, 64, "F");
  doc.setTextColor("#FFFFFF");
  doc.setFontSize(16); doc.setFont("helvetica", "bold");
  doc.text(co.name, 40, 30);
  doc.setFontSize(10); doc.setFont("helvetica", "normal");
  const titleMap = { internal: "Internal Quote Summary", customer: "Service Proposal", executive: "Executive Summary" };
  doc.text(titleMap[mode], 40, 48);
  doc.setFontSize(9);
  doc.text(`${co.phone}   ${co.website}`, W - 40, 30, { align: "right" });
  doc.text(`Prepared: ${stamp()}`, W - 40, 48, { align: "right" });

  let y = 90;
  doc.setTextColor("#111111");
  doc.setFontSize(12); doc.setFont("helvetica", "bold");
  doc.text(`Prepared for: ${input.company.name || "(customer)"}`, 40, y);
  y += 16;
  doc.setFontSize(10); doc.setFont("helvetica", "normal");
  doc.text(`Industry: ${input.company.industry}   Locations: ${input.company.locations}   Users: ${input.users.standard + input.users.frontline}`, 40, y);
  y += 24;

  const sel = quotes.find((q) => q.packageId === selectedPackageId) || quotes[0];

  if (mode === "executive") {
    doc.setFont("helvetica", "bold"); doc.setFontSize(12);
    doc.setTextColor(accent);
    doc.text(`Recommended: ${rec.recommendedPackageName}`, 40, y); y += 18;
    doc.setTextColor("#111111"); doc.setFont("helvetica", "normal"); doc.setFontSize(10);
    for (const r of rec.rationale.slice(0, 8)) { doc.text(`•  ${r}`, 50, y); y += 14; }
    y += 6;
    doc.setFont("helvetica", "bold"); doc.text("Investment", 40, y); y += 6;
    autoTable(doc, {
      startY: y + 4,
      head: [["Package", "Monthly", "Annual"]],
      body: quotes.map((q) => [q.packageName, currency(q.monthlyPrice), currency(q.annualPrice)]),
      headStyles: { fillColor: primary }, styles: { fontSize: 9 },
    });
    y = (doc as any).lastAutoTable.finalY + 18;
    // Current IT spend vs TCT
    if (input.currentSpend?.enabled) {
      const cur = currentSpendTotals(input).total;
      if (cur > 0) {
        const tctTot = Math.round((sel.monthlyPrice + sel.m365MonthlyPrice) * 100) / 100;
        const d = Math.round((cur - tctTot) * 100) / 100;
        doc.setFont("helvetica", "bold"); doc.text("Current IT Spend vs TCT", 40, y); y += 14;
        doc.setFont("helvetica", "normal"); doc.setFontSize(10);
        doc.text(`Current: ${currency(cur)}/mo    TCT: ${currency(tctTot)}/mo    ${d >= 0 ? "Savings" : "Increase"}: ${currency(Math.abs(d))}/mo`, 50, y);
        y += 18;
      }
    }
    // Risk / gaps
    const gaps = quotes.filter((q) => q.licenseGapMessage).map((q) => `${q.packageName}: ${q.licenseRequirement} required`);
    const compliance = input.company.compliance.filter((c) => c !== "None");
    doc.setFont("helvetica", "bold"); doc.text("Risk & Gap Observations", 40, y); y += 14;
    doc.setFont("helvetica", "normal"); doc.setFontSize(10);
    const notes = [
      compliance.length ? `Compliance scope: ${compliance.join(", ")}.` : "No compliance requirements indicated.",
      sel.meetsLicenseRequirement ? "Microsoft licensing meets the recommended package requirement." : `Licensing gap: ${sel.licenseRequirement} required for ${sel.packageName}.`,
      input.servers.length ? `${input.servers.length} server(s) in scope; verify backup/DR coverage.` : "No servers in scope.",
    ];
    for (const n of notes) { const lines = doc.splitTextToSize(`•  ${n}`, W - 90); doc.text(lines, 50, y); y += 14 * lines.length; }
  } else {
    // internal/customer: line item table for the selected package
    const showInternal = mode === "internal";
    const head = showInternal
      ? [["Line Item", "Qty", "Unit Cost", "Unit Price", "Monthly Cost", "Monthly Price", "Margin %"]]
      : [["Service Component", "Qty", "Monthly Price"]];
    const body = sel.lineItems.map((l) => {
      if (l.informational) {
        const rate = `${currency(l.unitPrice, { cents: true })}/hr`;
        return showInternal
          ? [l.label, "—", "—", rate, "—", "—", "—"]
          : [l.label, "—", rate];
      }
      return showInternal
        ? [l.label, String(l.quantity), currency(l.unitCost, { cents: true }), currency(l.unitPrice, { cents: true }), currency(l.cost), currency(l.price), pct(l.marginPct)]
        : [l.label, String(l.quantity), currency(l.price)];
    });

    doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.setTextColor(primary);
    doc.text(sel.packageName, 40, y); y += 6;
    autoTable(doc, {
      startY: y + 6, head, body,
      headStyles: { fillColor: primary }, styles: { fontSize: 9 },
      foot: showInternal
        ? [["TOTAL (Managed)", "", "", "", currency(sel.monthlyCost), currency(sel.monthlyPrice), pct(sel.marginPct)]]
        : [["Total Monthly Investment", "", currency(sel.monthlyPrice)]],
      footStyles: { fillColor: accent, textColor: "#FFFFFF" },
    });
    y = (doc as any).lastAutoTable.finalY + 16;
    doc.setTextColor("#111111"); doc.setFontSize(10); doc.setFont("helvetica", "normal");
    doc.text(`Microsoft 365 licensing (billed separately): ${currency(sel.m365MonthlyPrice)} / mo`, 40, y); y += 14;
    if (sel.licenseGapMessage) {
      doc.setTextColor(theme.brand.danger);
      const lines = doc.splitTextToSize(sel.licenseGapMessage, W - 80);
      doc.text(lines, 40, y); y += 14 * lines.length;
    }
    if (!showInternal) {
      y += 6; doc.setTextColor("#111111"); doc.setFont("helvetica", "bold");
      doc.text("Included Services", 40, y); y += 14;
      doc.setFont("helvetica", "normal"); doc.setFontSize(9);
      const cols = sel.includedServices;
      const half = Math.ceil(cols.length / 2);
      cols.forEach((s, i) => {
        const x = i < half ? 50 : W / 2 + 10;
        const yy = y + (i % half) * 13;
        doc.text(`✓  ${s}`, x, yy);
      });
      y += half * 13 + 10;
    }
  }

  // Footer
  const ph = doc.internal.pageSize.getHeight();
  doc.setFontSize(8); doc.setTextColor(theme.brand.textMuted);
  const footer = mode === "internal" ? "INTERNAL USE ONLY — contains costs & margins. Not for customer distribution." : `${co.name}  •  ${co.address}`;
  doc.text(footer, 40, ph - 24);

  const fname = `TCT_${mode}_${safeName(input.company.name)}_${stamp()}.pdf`;
  doc.save(fname);
}
