"use client";
import React from "react";
import { PackageQuote } from "@/lib/sales-calculator/types";
import { getServices } from "@/lib/sales-calculator/config";
import { currency, pct } from "@/lib/sales-calculator/format";
import { Card, Pill, Button } from "./ui";
import { Check, X } from "lucide-react";

export function Comparison({ quotes, selectedId, onSelect, showInternal }:
  { quotes: PackageQuote[]; selectedId: string; onSelect: (id: string) => void; showInternal: boolean }) {
  const services = getServices().filter((s) => s.unit !== "service" || true);
  return (
    <Card title="Quote Comparison" subtitle="All five packages priced against the same customer inputs.">
      <div className="overflow-x-auto tct-scroll">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr>
              <th className="text-left py-2 pr-3 font-medium text-muted sticky left-0 bg-surface">Metric</th>
              {quotes.map((q) => (
                <th key={q.packageId} className={"py-2 px-3 text-center min-w-[150px] " + (q.packageId === selectedId ? "bg-brand/5" : "")}>
                  <div className="font-semibold text-ink">{q.packageName.replace("TCT ", "")}</div>
                  <Button variant={q.packageId === selectedId ? "primary" : "outline"} className="mt-1 !py-1 !px-2 text-xs" onClick={() => onSelect(q.packageId)}>
                    {q.packageId === selectedId ? "Selected" : "Select"}
                  </Button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <Row label="Monthly Price">{quotes.map((q) => <Cell key={q.packageId} sel={q.packageId === selectedId}><span className="font-semibold">{currency(q.monthlyPrice)}</span></Cell>)}</Row>
            <Row label="Annual Price">{quotes.map((q) => <Cell key={q.packageId} sel={q.packageId === selectedId}>{currency(q.annualPrice)}</Cell>)}</Row>
            {showInternal && <Row label="Monthly Cost">{quotes.map((q) => <Cell key={q.packageId} sel={q.packageId === selectedId}><span className="text-muted">{currency(q.monthlyCost)}</span></Cell>)}</Row>}
            {showInternal && <Row label="Gross Profit (mo)">{quotes.map((q) => <Cell key={q.packageId} sel={q.packageId === selectedId}><span className="text-ok">{currency(q.monthlyMargin)}</span></Cell>)}</Row>}
            {showInternal && <Row label="Margin %">{quotes.map((q) => <Cell key={q.packageId} sel={q.packageId === selectedId}>{pct(q.marginPct)}</Cell>)}</Row>}
            <Row label="M365 / mo (separate)">{quotes.map((q) => <Cell key={q.packageId} sel={q.packageId === selectedId}>{currency(q.m365MonthlyPrice)}</Cell>)}</Row>
            <Row label="Licensing Requirement">{quotes.map((q) => <Cell key={q.packageId} sel={q.packageId === selectedId}>{q.licenseRequirement}</Cell>)}</Row>
            <Row label="Meets Requirement?">{quotes.map((q) => <Cell key={q.packageId} sel={q.packageId === selectedId}>{q.meetsLicenseRequirement ? <Pill tone="ok">Yes</Pill> : <Pill tone="danger">Gap</Pill>}</Cell>)}</Row>
          </tbody>
        </table>
      </div>

      <p className="text-xs text-faint mt-2">
        &ldquo;Meets Requirement?&rdquo; compares the customer&rsquo;s current Microsoft 365 license to each package&rsquo;s minimum
        (Basic &rarr; Business Basic, Standard &rarr; Business Standard, Comprehensive / Complete / Co-Managed &rarr; Business Premium).
        &ldquo;Gap&rdquo; means an upgrade is needed before that package.
      </p>
      <div className="mt-6 text-sm font-medium text-ink mb-2">Included Services</div>
      <div className="overflow-x-auto tct-scroll">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr>
              <th className="text-left py-2 pr-3 font-medium text-muted sticky left-0 bg-surface">{showInternal ? "Product (internal)" : "Capability"}</th>
              {quotes.map((q) => <th key={q.packageId} className="py-2 px-2 text-center text-ink">{q.packageName.replace("TCT ", "")}</th>)}
            </tr>
          </thead>
          <tbody>
            {services.map((s) => (
              <tr key={s.id} className="border-b border-line">
                <td className="py-1.5 pr-3 text-ink sticky left-0 bg-surface">
                  {showInternal ? <>{s.internalName} <span className="text-xs text-muted">({s.externalName})</span></> : s.externalName}
                </td>
                {quotes.map((q) => (
                  <td key={q.packageId} className="py-1.5 px-2 text-center">
                    {s.include?.[q.packageId]
                      ? <Check className="inline text-ok" size={16} />
                      : <X className="inline text-line" size={14} />}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <tr className="border-b border-line">
      <td className="py-2 pr-3 text-ink sticky left-0 bg-surface">{label}</td>
      {children}
    </tr>
  );
}
function Cell({ children, sel }: { children: React.ReactNode; sel: boolean }) {
  return <td className={"py-2 px-3 text-center " + (sel ? "bg-brand/5" : "")}>{children}</td>;
}
