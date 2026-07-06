"use client";
import React, { useState } from "react";
import { DiscoveryInput, PackageQuote, RecommendationResult } from "@/lib/sales-calculator/types";
import { exportJSON, exportCSV, exportExcel, exportPDF } from "@/lib/sales-calculator/exporters";
import { Button } from "./ui";
import { FileJson, FileSpreadsheet, FileText, Printer, Table } from "lucide-react";

export function ExportBar({ input, quotes, rec, selectedId, summaryMode }:
  { input: DiscoveryInput; quotes: PackageQuote[]; rec: RecommendationResult; selectedId: string; summaryMode: "internal" | "customer" | "executive" }) {
  const [busy, setBusy] = useState<string | null>(null);
  async function run(name: string, fn: () => void | Promise<void>) {
    try { setBusy(name); await fn(); } catch (e) { console.error(e); alert("Export failed: " + (e as Error).message); } finally { setBusy(null); }
  }
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="primary" onClick={() => run("pdf", () => exportPDF(input, quotes, rec, summaryMode, selectedId))} disabled={busy !== null}>
        <FileText size={15} className="inline -mt-0.5 mr-1.5" />{busy === "pdf" ? "..." : `PDF (${summaryMode})`}
      </Button>
      <Button variant="outline" onClick={() => run("xlsx", () => exportExcel(input, quotes, rec))} disabled={busy !== null}>
        <FileSpreadsheet size={15} className="inline -mt-0.5 mr-1.5" />Excel
      </Button>
      <Button variant="outline" onClick={() => run("csv", () => exportCSV(input, quotes))} disabled={busy !== null}>
        <Table size={15} className="inline -mt-0.5 mr-1.5" />CSV
      </Button>
      <Button variant="outline" onClick={() => run("json", () => exportJSON(input, quotes, rec))} disabled={busy !== null}>
        <FileJson size={15} className="inline -mt-0.5 mr-1.5" />JSON
      </Button>
      <Button variant="outline" onClick={() => window.print()} disabled={busy !== null}>
        <Printer size={15} className="inline -mt-0.5 mr-1.5" />Print
      </Button>
    </div>
  );
}
