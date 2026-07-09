"use client";
import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { theme, appConfig, getPackages, applyPricingOverrides } from "@/lib/sales-calculator/config";
import { defaultInput } from "@/lib/sales-calculator/defaults";
import { buildAllQuotes } from "@/lib/sales-calculator/calc";
import { recommend } from "@/lib/sales-calculator/recommend";
import { DiscoveryInput } from "@/lib/sales-calculator/types";
import { Discovery } from "@/components/sales-calculator/Discovery";
import { Dashboard, LineItemsTable } from "@/components/sales-calculator/Dashboard";
import { Comparison } from "@/components/sales-calculator/Comparison";
import { Catalog } from "@/components/sales-calculator/Catalog";
import { CostLedger } from "@/components/sales-calculator/CostLedger";
import { CostComparison } from "@/components/sales-calculator/CostComparison";
import { Recommendation } from "@/components/sales-calculator/Recommendation";
import { Summaries } from "@/components/sales-calculator/Summaries";
import { ExportBar } from "@/components/sales-calculator/ExportBar";
import { SavedQuotesBar, LoadedQuoteMeta } from "@/components/sales-calculator/SavedQuotes";
import { Button } from "@/components/sales-calculator/ui";
import { Lock, Eye, EyeOff, SlidersHorizontal } from "lucide-react";

type Tab = "recommend" | "dashboard" | "compare" | "vsspend" | "catalog" | "costs" | "summary";
type SummaryMode = "internal" | "customer" | "executive";

export default function Page() {
  const [input, setInput] = useState<DiscoveryInput>(defaultInput());
  const [showInternal, setShowInternal] = useState(true);
  const [tab, setTab] = useState<Tab>("recommend");
  const [summaryMode, setSummaryMode] = useState<SummaryMode>("internal");

  // Live pricing: layer saved overrides (edited at /admin/sales-calculator/pricing)
  // over the pricing.json defaults BEFORE any quote is shown. On fetch failure the
  // calculator still works on config defaults, with a visible warning.
  const [pricingStatus, setPricingStatus] = useState<"loading" | "live" | "defaults">("loading");
  const [pricingVersion, setPricingVersion] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/admin/sales-calculator/pricing", { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        applyPricingOverrides((data?.overrides as Record<string, number>) || {});
        setPricingVersion((v) => v + 1);
        setPricingStatus("live");
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setPricingStatus("defaults");
      });
    return () => controller.abort();
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const quotes = useMemo(() => buildAllQuotes(input), [input, pricingVersion]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const rec = useMemo(() => recommend(input), [input, pricingVersion]);
  const [selectedId, setSelectedId] = useState<string>("");
  const activeId = selectedId || rec.recommendedPackageId;
  const activeQuote = quotes.find((q) => q.packageId === activeId) || quotes[0];

  // Saved quote currently being edited (null = scratch quote). Loading swaps
  // the discovery inputs in; every price recomputes at current pricing.
  const [loadedQuote, setLoadedQuote] = useState<LoadedQuoteMeta | null>(null);

  const tabs: { id: Tab; label: string }[] = [
    { id: "recommend", label: "Recommendation" },
    { id: "dashboard", label: "Financial Dashboard" },
    { id: "compare", label: "Quote Comparison" },
    { id: "vsspend", label: "Current vs TCT" },
    { id: "catalog", label: "Service Catalog" },
    { id: "costs", label: "Line-Item Costs" },
    { id: "summary", label: "Summaries & Export" },
  ];

  // Hold quoting until the live-pricing check resolves so nobody quotes off
  // stale defaults without knowing it.
  if (pricingStatus === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-sm text-muted animate-pulse">Loading current pricing…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="no-print sticky top-0 z-20 border-b border-line" style={{ background: "linear-gradient(180deg,#0f172a,#020617)", backdropFilter: "blur(6px)" }}>
        <div className="max-w-[1500px] mx-auto px-5 py-3 flex items-center gap-4 text-ink">
          <div className="h-9 px-3 flex items-center rounded-[8px] bg-accent/15 text-accent font-extrabold tracking-[0.15em]">{theme.company.shortName}</div>
          <div className="flex-1">
            <div className="font-bold leading-tight tracking-tight">{appConfig.appName}</div>
            <div className="text-xs text-muted">{theme.company.name}</div>
          </div>
          {showInternal && (
            <Link href="/admin/sales-calculator/pricing"
              className="flex items-center gap-2 rounded-[12px] bg-white/8 ring-1 ring-white/10 hover:bg-white/15 px-3 py-1.5 text-sm text-body2">
              <SlidersHorizontal size={15} className="text-accent" /> Edit Pricing
            </Link>
          )}
          <button onClick={() => setShowInternal((v) => !v)}
            className="flex items-center gap-2 rounded-[12px] bg-white/8 ring-1 ring-white/10 hover:bg-white/15 px-3 py-1.5 text-sm text-body2">
            {showInternal ? <Eye size={15} className="text-accent" /> : <EyeOff size={15} />}
            {showInternal ? "Internal view (costs + margins)" : "Customer view (prices only)"}
          </button>
        </div>
        <div className="bg-bgdeep/70 border-t border-line">
          <div className="max-w-[1500px] mx-auto px-5 py-1.5 flex items-center gap-2.5 text-xs">
            <span className="inline-flex items-center gap-1 rounded-full bg-danger/15 text-danger ring-1 ring-danger/30 px-2 py-0.5 font-semibold tracking-wide">
              <Lock size={11} /> INTERNAL ONLY
            </span>
            <span className="text-muted">{appConfig.internalOnlyBanner}</span>
          </div>
        </div>
        {pricingStatus === "defaults" && (
          <div className="bg-danger/15 border-t border-danger/30">
            <div className="max-w-[1500px] mx-auto px-5 py-1.5 text-xs text-danger font-medium">
              Live pricing overrides could not be loaded — quotes below use the config defaults. Refresh to retry.
            </div>
          </div>
        )}
      </header>

      <main className="max-w-[1500px] mx-auto px-5 py-6 space-y-5">
        <SavedQuotesBar
          input={input}
          quotes={quotes}
          selectedPackageId={activeId}
          loadedQuote={loadedQuote}
          onLoadQuote={(meta, loadedInput, pkgId) => {
            setInput(loadedInput);
            setSelectedId(pkgId || "");
            setLoadedQuote(meta);
          }}
          onLoadedQuoteChange={setLoadedQuote}
        />

        <div className="grid lg:grid-cols-[minmax(380px,440px)_1fr] gap-6">
        {/* Discovery column */}
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-bold text-ink tracking-tight">Discovery</h1>
            <Button variant="ghost" onClick={() => { setInput(defaultInput()); setSelectedId(""); setLoadedQuote(null); }}>Reset</Button>
          </div>
          <Discovery input={input} set={setInput} onFinish={() => setTab("recommend")} />
        </div>

        {/* Results column */}
        <div className="space-y-5">
          {/* Tabs + package selector */}
          <div className="no-print flex flex-wrap items-center gap-2 justify-between">
            <div className="flex flex-wrap gap-1 bg-surface card p-1">
              {tabs.map((t) => (
                <button key={t.id} onClick={() => setTab(t.id)}
                  className={"rounded-md px-3 py-1.5 text-sm font-medium " + (tab === t.id ? "bg-accent text-white shadow-glow" : "text-body2 hover:bg-white/5")}>
                  {t.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm text-muted">Active package</label>
              <select value={activeId} onChange={(e) => setSelectedId(e.target.value)}
                className="rounded-[12px] border border-line bg-bgdeep text-ink px-2.5 py-1.5 text-sm focus:border-accent focus:ring-2 focus:ring-accent/30 outline-none">
                {getPackages().map((p) => <option key={p.id} value={p.id} className="bg-surface text-ink">{p.name}</option>)}
              </select>
            </div>
          </div>

          {tab === "recommend" && (
            <>
              <Recommendation rec={rec} quotes={quotes} onSelect={setSelectedId} />
              <LineItemsTable quote={activeQuote} showInternal={showInternal} />
            </>
          )}
          {tab === "dashboard" && (
            <>
              <Dashboard quote={activeQuote} />
              <LineItemsTable quote={activeQuote} showInternal={showInternal} />
            </>
          )}
          {tab === "compare" && <Comparison input={input} quotes={quotes} selectedId={activeId} onSelect={setSelectedId} showInternal={showInternal} />}
          {tab === "vsspend" && <CostComparison input={input} quote={activeQuote} />}
          {tab === "catalog" && <Catalog showInternal={showInternal} quote={activeQuote} />}
          {tab === "costs" && <CostLedger />}
          {tab === "summary" && (
            <>
              <div className="no-print flex flex-wrap items-center gap-3 justify-between">
                <div className="flex gap-1 bg-surface card p-1">
                  {(["internal", "customer", "executive"] as SummaryMode[]).map((m) => (
                    <button key={m} onClick={() => setSummaryMode(m)}
                      className={"rounded-md px-3 py-1.5 text-sm font-medium capitalize " + (summaryMode === m ? "bg-accent text-white shadow-glow" : "text-body2 hover:bg-white/5")}>
                      {m}
                    </button>
                  ))}
                </div>
                <ExportBar input={input} quotes={quotes} rec={rec} selectedId={activeId} summaryMode={summaryMode} />
              </div>
              <Summaries input={input} quote={activeQuote} rec={rec} mode={summaryMode} />
            </>
          )}
        </div>
        </div>
      </main>

      <footer className="no-print text-center text-xs text-muted py-6">
        {theme.company.name} · Internal Sales Calculator · Pricing configurable in <code>src/config/</code>
      </footer>
    </div>
  );
}
