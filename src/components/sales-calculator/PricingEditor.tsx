"use client";
import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import pricingBase from "@/config/sales-calculator/pricing.json";
import { validatePricingOverrides } from "@/lib/sales-calculator/config";
import { currency } from "@/lib/sales-calculator/format";
import { Button, Card } from "./ui";
import { ArrowLeft, RotateCcw, Search } from "lucide-react";

/**
 * Admin editor for sales-calculator pricing. Base values come from
 * src/config/sales-calculator/pricing.json; edits are saved as a flat
 * path→number overrides map (append-only audit rows in the DB) and layered
 * over the base when the calculator loads. Only values that already exist as
 * numbers in pricing.json are editable — the editor can never change the
 * shape of the pricing data.
 */

interface FieldDef {
  path: string;      // dot path into pricing.json, e.g. "packages.basic.perUser.price"
  label: string;     // readable breadcrumb, e.g. "basic › perUser › price"
  section: string;   // top-level key
  base: number;
}

const SECTION_TITLES: Record<string, string> = {
  packages: "Package per-unit rates",
  frontline: "Frontline user components",
  azureBackup: "Azure VM backup (TB bands)",
  serverAddOns: "Server add-ons (legacy reference — not auto-billed)",
  m365Licenses: "Microsoft 365 licenses",
  endpointBackup: "Workstation endpoint backup",
  sharedMailbox: "Shared mailboxes",
  comanagedToolAccess: "Co-Managed tool access",
  businessLine: "Business Line (cost to play)",
  dattoBackup: "Datto SIRIS / BCDR backup",
  entraBackup: "Entra ID backup",
};

function collectFields(node: unknown, pathParts: string[], labelParts: string[], out: FieldDef[]) {
  if (typeof node === "number") {
    const section = pathParts[0];
    out.push({
      path: pathParts.join("."),
      label: labelParts.slice(1).join(" › ") || pathParts[pathParts.length - 1],
      section,
      base: node,
    });
    return;
  }
  if (Array.isArray(node)) {
    node.forEach((el, i) => {
      const tag = (el && typeof el === "object" && ("label" in el || "model" in el))
        ? String((el as Record<string, unknown>).model ?? (el as Record<string, unknown>).label)
        : String(i);
      collectFields(el, [...pathParts, String(i)], [...labelParts, tag], out);
    });
    return;
  }
  if (node && typeof node === "object") {
    for (const [key, value] of Object.entries(node)) {
      if (key.startsWith("_")) continue; // comments / flags / sources — not money
      collectFields(value, [...pathParts, key], [...labelParts, key], out);
    }
  }
}

function buildFieldList(): FieldDef[] {
  const out: FieldDef[] = [];
  for (const [key, value] of Object.entries(pricingBase as Record<string, unknown>)) {
    if (key.startsWith("_")) continue;
    collectFields(value, [key], [key], out);
  }
  return out;
}

const moneyish = (path: string) =>
  /(price|cost|rate|msrp|floor|upcharge)/i.test(path) || /\.(1-year|7-year|Infinite|30 days|90 days|1 year|3 years|7 years)$/i.test(path);

export function PricingEditor() {
  const fields = useMemo(buildFieldList, []);
  const sections = useMemo(() => {
    const bySection: Record<string, FieldDef[]> = {};
    for (const f of fields) (bySection[f.section] = bySection[f.section] || []).push(f);
    return bySection;
  }, [fields]);

  const [overrides, setOverrides] = useState<Record<string, number>>({});
  const [edits, setEdits] = useState<Record<string, number>>({});
  const [meta, setMeta] = useState<{ updatedBy: string | null; updatedAt: string | null; canEdit: boolean; tableMissing: boolean }>({ updatedBy: null, updatedAt: null, canEdit: false, tableMissing: false });
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const [search, setSearch] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/admin/sales-calculator/pricing", { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setOverrides(data.overrides || {});
        setMeta({ updatedBy: data.updatedBy, updatedAt: data.updatedAt, canEdit: !!data.canEdit, tableMissing: !!data.tableMissing });
        setStatus("ready");
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setStatus("error");
      });
    return () => controller.abort();
  }, []);

  const effective = (f: FieldDef) => edits[f.path] ?? overrides[f.path] ?? f.base;
  const isOverridden = (f: FieldDef) => (overrides[f.path] !== undefined && overrides[f.path] !== f.base) || (edits[f.path] !== undefined && edits[f.path] !== f.base);
  const isDirty = (f: FieldDef) => edits[f.path] !== undefined && edits[f.path] !== (overrides[f.path] ?? f.base);
  const dirtyCount = fields.filter(isDirty).length;
  const overriddenCount = fields.filter((f) => overrides[f.path] !== undefined && overrides[f.path] !== f.base).length;

  function setField(f: FieldDef, raw: string) {
    const v = raw === "" ? NaN : Number(raw);
    setEdits((prev) => {
      const next = { ...prev };
      if (!isFinite(v)) { next[f.path] = NaN; return next; } // keep invalid marker while typing
      if (v === (overrides[f.path] ?? f.base)) delete next[f.path];
      else next[f.path] = v;
      return next;
    });
  }

  function resetField(f: FieldDef) {
    setEdits((prev) => {
      const next = { ...prev };
      if (overrides[f.path] !== undefined) next[f.path] = f.base; // stage a reset to default
      else delete next[f.path];
      return next;
    });
  }

  async function save() {
    setSaving(true);
    setSaveError(null);
    try {
      // Merge saved overrides + staged edits, then drop anything equal to base
      // so the stored doc stays minimal (equal-to-default = no override).
      const merged: Record<string, number> = { ...overrides };
      for (const f of fields) {
        const e = edits[f.path];
        if (e === undefined) continue;
        if (!isFinite(e)) throw new Error(`"${f.label}" is not a valid number`);
        if (e === f.base) delete merged[f.path];
        else merged[f.path] = e;
      }
      const validation = validatePricingOverrides(merged, pricingBase);
      if (!validation.ok) throw new Error(validation.errors[0]);

      const res = await fetch("/api/admin/sales-calculator/pricing", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ overrides: merged, note: note || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setOverrides(merged);
      setEdits({});
      setNote("");
      setMeta((m) => ({ ...m, updatedBy: "you", updatedAt: new Date().toISOString() }));
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2500);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const q = search.trim().toLowerCase();
  const matches = q ? fields.filter((f) => f.path.toLowerCase().includes(q) || f.label.toLowerCase().includes(q)) : [];

  if (status === "loading") {
    return <div className="text-sm text-muted py-10 text-center">Loading current pricing…</div>;
  }

  return (
    <div className="space-y-5">
      {status === "error" && (
        <div className="rounded-[12px] bg-danger/15 ring-1 ring-danger/30 text-danger text-sm p-3">
          Could not load saved pricing overrides — showing config defaults. Refresh to retry; saving is disabled.
        </div>
      )}
      {meta.tableMissing && (
        <div className="rounded-[12px] bg-danger/15 ring-1 ring-danger/30 text-danger text-sm p-3">
          The pricing overrides table has not been created yet. Run the one-time migration
          (<code className="text-xs">POST https://www.triplecitiestech.com/api/migrations/run</code> with the migration secret), then reload this page.
        </div>
      )}
      {status === "ready" && !meta.canEdit && !meta.tableMissing && (
        <div className="rounded-[12px] bg-accent/10 ring-1 ring-accent/25 text-body2 text-sm p-3">
          Read-only view — saving pricing changes requires the <span className="font-semibold">system_settings</span> permission.
        </div>
      )}

      <Card>
        <div className="flex flex-wrap items-center gap-3 justify-between">
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <Search size={14} className="absolute left-2.5 top-2.5 text-muted" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search a line item… (e.g. perUser, S6-6, Business Premium)"
              className="w-full rounded-[12px] border border-line bg-bgdeep text-ink pl-8 pr-3 py-1.5 text-sm focus:border-accent focus:ring-2 focus:ring-accent/30 outline-none"
            />
          </div>
          <div className="text-xs text-muted">
            {fields.length} editable values · {overriddenCount} overridden{dirtyCount ? ` · ${dirtyCount} unsaved` : ""}
            {meta.updatedAt && <> · last saved {new Date(meta.updatedAt).toLocaleString()} by {meta.updatedBy}</>}
          </div>
        </div>
      </Card>

      {q ? (
        <Card title={`Search results (${matches.length})`}>
          <FieldRows fields={matches.slice(0, 120)} effective={effective} isOverridden={isOverridden} isDirty={isDirty} setField={setField} resetField={resetField} disabled={!meta.canEdit || meta.tableMissing} />
          {matches.length > 120 && <p className="text-xs text-muted mt-2">Showing first 120 — narrow the search.</p>}
        </Card>
      ) : (
        Object.entries(sections).map(([section, sectionFields]) => {
          const sOverridden = sectionFields.filter((f) => overrides[f.path] !== undefined && overrides[f.path] !== f.base).length;
          return (
            <details key={section} className="card p-0 overflow-hidden" open={sectionFields.length <= 12}>
              <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold text-ink hover:bg-white/5 flex items-center justify-between">
                <span>{SECTION_TITLES[section] || section}</span>
                <span className="text-xs font-normal text-muted">{sectionFields.length} values{sOverridden ? ` · ${sOverridden} overridden` : ""}</span>
              </summary>
              <div className="px-4 pb-4">
                <FieldRows fields={sectionFields} effective={effective} isOverridden={isOverridden} isDirty={isDirty} setField={setField} resetField={resetField} disabled={!meta.canEdit || meta.tableMissing} />
              </div>
            </details>
          );
        })
      )}

      {/* Save bar */}
      <div className="sticky bottom-0 z-10 -mx-1 px-1 pb-1">
        <div className="card shadow-soft p-3 flex flex-wrap items-center gap-3 bg-surface">
          <div className="text-sm text-body2 flex-1 min-w-[180px]">
            {dirtyCount > 0
              ? <span className="text-ink font-medium">{dirtyCount} unsaved change{dirtyCount === 1 ? "" : "s"}</span>
              : savedFlash ? <span className="text-ok font-medium">Saved ✓ — calculators pick up changes on next load</span>
              : <span className="text-muted">No unsaved changes</span>}
            {saveError && <div className="text-danger text-xs mt-1">{saveError}</div>}
          </div>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Change note (optional, for the audit trail)"
            maxLength={500}
            className="flex-1 min-w-[200px] rounded-[12px] border border-line bg-bgdeep text-ink px-3 py-1.5 text-sm focus:border-accent focus:ring-2 focus:ring-accent/30 outline-none"
          />
          <Button variant="ghost" onClick={() => { setEdits({}); setSaveError(null); }} disabled={dirtyCount === 0 || saving}>Discard</Button>
          <Button variant="primary" onClick={save} disabled={dirtyCount === 0 || saving || !meta.canEdit || meta.tableMissing}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function FieldRows({ fields, effective, isOverridden, isDirty, setField, resetField, disabled }: {
  fields: FieldDef[];
  effective: (f: FieldDef) => number;
  isOverridden: (f: FieldDef) => boolean;
  isDirty: (f: FieldDef) => boolean;
  setField: (f: FieldDef, raw: string) => void;
  resetField: (f: FieldDef) => void;
  disabled: boolean;
}) {
  return (
    <div className="divide-y divide-line">
      {fields.map((f) => {
        const val = effective(f);
        return (
          <div key={f.path} className="flex items-center gap-3 py-1.5">
            <div className="flex-1 min-w-0">
              <div className="text-sm text-ink truncate" title={f.path}>
                {f.label}
                {isOverridden(f) && <span className="ml-2 rounded-full bg-accent/15 text-accent text-[10px] font-semibold px-1.5 py-0.5 align-middle">overridden</span>}
                {isDirty(f) && <span className="ml-1.5 text-accent align-middle" title="Unsaved change">•</span>}
              </div>
              <div className="text-[11px] text-faint">Default: {moneyish(f.path) ? currency(f.base, { cents: true }) : f.base}</div>
            </div>
            <input
              type="number"
              step="0.01"
              min="0"
              value={isFinite(val) ? val : ""}
              onChange={(e) => setField(f, e.target.value)}
              disabled={disabled}
              className="w-28 rounded-[8px] border border-line bg-bgdeep text-ink px-2 py-1 text-sm text-right focus:border-accent focus:ring-2 focus:ring-accent/30 outline-none disabled:opacity-50"
            />
            <button
              type="button"
              onClick={() => resetField(f)}
              disabled={disabled || !isOverridden(f)}
              title="Reset to default"
              className="text-muted hover:text-ink disabled:opacity-25"
            >
              <RotateCcw size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

export function PricingEditorHeader() {
  return (
    <div className="flex items-center justify-between mb-5">
      <div>
        <h1 className="text-lg font-bold text-ink tracking-tight">Pricing Editor</h1>
        <p className="text-sm text-muted mt-0.5">
          Live cost &amp; price for every calculator line item. Defaults come from <code className="text-xs">pricing.json</code>;
          saved changes apply to everyone on their next calculator load. The Line-Item Cost Ledger tab is a separate reference list.
        </p>
      </div>
      <Link href="/admin/sales-calculator" className="inline-flex items-center gap-1.5 rounded-[12px] bg-white/8 ring-1 ring-white/10 hover:bg-white/15 px-3 py-1.5 text-sm text-body2">
        <ArrowLeft size={14} /> Back to calculator
      </Link>
    </div>
  );
}
