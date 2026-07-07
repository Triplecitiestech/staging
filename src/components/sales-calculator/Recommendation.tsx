"use client";
import React from "react";
import { PackageQuote, RecommendationResult } from "@/lib/sales-calculator/types";
import { getPackages } from "@/lib/sales-calculator/config";
import { currency, pct } from "@/lib/sales-calculator/format";
import { Card, Pill, Button } from "./ui";
import { Sparkles } from "lucide-react";

export function Recommendation({ rec, quotes, onSelect }:
  { rec: RecommendationResult; quotes: PackageQuote[]; onSelect: (id: string) => void }) {
  const recQuote = quotes.find((q) => q.packageId === rec.recommendedPackageId);
  const maxScore = Math.max(1, ...Object.values(rec.scores));
  return (
    <Card>
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-brand/10 p-2.5"><Sparkles className="text-brand-accent" size={22} /></div>
        <div className="flex-1">
          <div className="text-xs uppercase tracking-wide text-muted">Recommended Package</div>
          <div className="text-xl font-semibold text-ink">{rec.recommendedPackageName} <span className="text-brand-accent">Recommended</span></div>
          {recQuote && <div className="text-sm text-muted mt-0.5">{currency(recQuote.monthlyPrice)}/mo · {pct(recQuote.marginPct)} margin · {currency(recQuote.annualPrice)}/yr</div>}
          {(() => {
            const sm = getPackages().find((p) => p.id === rec.recommendedPackageId)?.supportModel;
            return sm ? <div className="text-xs text-accent mt-1" title={sm.detail}>Support model: {sm.label}</div> : null;
          })()}
          {rec.rationale.length > 0 && (
            <ul className="mt-3 space-y-1">
              {rec.rationale.map((r, i) => <li key={i} className="text-sm text-ink flex items-center gap-2"><span className="text-brand-accent">•</span>{r}</li>)}
            </ul>
          )}
        </div>
        <Button onClick={() => onSelect(rec.recommendedPackageId)}>Use this package</Button>
      </div>
      <div className="mt-5 border-t border-line pt-4">
        <div className="text-sm font-medium text-ink mb-2">Recommendation Scores</div>
        <div className="space-y-2">
          {quotes.map((q) => {
            const s = rec.scores[q.packageId] || 0;
            const isWin = q.packageId === rec.recommendedPackageId;
            return (
              <div key={q.packageId} className="flex items-center gap-3">
                <span className="w-44 text-sm text-ink shrink-0">{q.packageName}</span>
                <div className="flex-1 h-2.5 rounded-full bg-surfaceAlt overflow-hidden">
                  <div className={isWin ? "h-full bg-brand-accent" : "h-full bg-brand/40"} style={{ width: `${(s / maxScore) * 100}%` }} />
                </div>
                <span className="w-8 text-right text-sm font-medium">{s}</span>
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}
