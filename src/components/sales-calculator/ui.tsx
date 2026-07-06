"use client";
import React from "react";
import clsx from "clsx";

export function Card({ title, subtitle, right, children, className }:
  { title?: string; subtitle?: string; right?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={clsx("card shadow-soft p-5", className)}>
      {(title || right) && (
        <div className="flex items-start justify-between mb-4 gap-3">
          <div>
            {title && <h2 className="text-base font-bold text-ink tracking-tight">{title}</h2>}
            {subtitle && <p className="text-sm text-muted mt-0.5">{subtitle}</p>}
          </div>
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  // Reserve a consistent two-line label height so inputs always align across a grid row,
  // regardless of whether a given label wraps to one or two lines.
  return (
    <label className="flex flex-col">
      <span className="flex items-start text-sm font-medium text-body2 mb-1.5 leading-snug min-h-[2.5rem]">{label}</span>
      {children}
      {hint && <span className="block text-xs text-faint mt-1">{hint}</span>}
    </label>
  );
}

const inputCls = "w-full rounded-[12px] border border-line bg-bgdeep px-3 py-2 text-sm text-ink outline-none transition-colors placeholder:text-faint focus:border-accent focus:ring-2 focus:ring-accent/30";

export function NumberField({ label, value, onChange, min = 0, hint }:
  { label: string; value: number; onChange: (n: number) => void; min?: number; hint?: string }) {
  return (
    <Field label={label} hint={hint}>
      <input type="number" min={min} value={Number.isFinite(value) ? value : 0}
        onChange={(e) => onChange(Math.max(min, parseInt(e.target.value || "0", 10)))}
        className={inputCls} />
    </Field>
  );
}

export function DecimalField({ label, value, onChange, min = 0, step = 0.1, hint, suffix }:
  { label: string; value: number; onChange: (n: number) => void; min?: number; step?: number; hint?: string; suffix?: string }) {
  return (
    <Field label={label} hint={hint}>
      <div className="relative">
        <input type="number" min={min} step={step} value={Number.isFinite(value) ? value : 0}
          onChange={(e) => onChange(Math.max(min, parseFloat(e.target.value || "0")))}
          className={inputCls + (suffix ? " pr-12" : "")} />
        {suffix && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-faint">{suffix}</span>}
      </div>
    </Field>
  );
}

export function TextField({ label, value, onChange, placeholder, hint }:
  { label: string; value: string; onChange: (s: string) => void; placeholder?: string; hint?: string }) {
  return (
    <Field label={label} hint={hint}>
      <input type="text" value={value} placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)} className={inputCls} />
    </Field>
  );
}

export function SelectField({ label, value, options, onChange, hint }:
  { label: string; value: string; options: string[]; onChange: (s: string) => void; hint?: string }) {
  return (
    <Field label={label} hint={hint}>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={inputCls}>
        {options.map((o) => <option key={o} value={o} className="bg-surface text-ink">{o}</option>)}
      </select>
    </Field>
  );
}

export function Toggle({ label, checked, onChange }:
  { label: string; checked: boolean; onChange: (b: boolean) => void }) {
  return (
    <button type="button" onClick={() => onChange(!checked)}
      className="flex items-center gap-3 w-full text-left py-1.5 group">
      <span className={clsx("relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors",
        checked ? "bg-accent" : "bg-white/15")}>
        <span className={clsx("absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform",
          checked ? "translate-x-4" : "translate-x-0.5")} />
      </span>
      <span className="text-sm text-body2">{label}</span>
    </button>
  );
}

export function Pill({ children, tone = "neutral" }:
  { children: React.ReactNode; tone?: "neutral" | "ok" | "warn" | "danger" | "brand" }) {
  const tones: Record<string, string> = {
    neutral: "bg-white/8 text-body2 ring-1 ring-white/10",
    ok: "bg-emerald2/15 text-emerald2 ring-1 ring-emerald2/30",
    warn: "bg-warn/15 text-warn ring-1 ring-warn/30",
    danger: "bg-danger/15 text-danger ring-1 ring-danger/30",
    brand: "bg-accent/15 text-accent ring-1 ring-accent/30",
  };
  return <span className={clsx("inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold", tones[tone])}>{children}</span>;
}

export function StatCard({ label, value, sub, tone }:
  { label: string; value: string; sub?: string; tone?: "ok" | "warn" | "brand" }) {
  const valueColor = tone === "ok" ? "text-emerald2" : tone === "warn" ? "text-warn" : tone === "brand" ? "text-accent" : "text-ink";
  return (
    <div className="card p-4">
      <div className="eyebrow">{label}</div>
      <div className={clsx("text-xl font-extrabold mt-1.5 tracking-tight", valueColor)}>{value}</div>
      {sub && <div className="text-xs text-faint mt-0.5">{sub}</div>}
    </div>
  );
}

export function Button({ children, onClick, variant = "primary", className, disabled }:
  { children: React.ReactNode; onClick?: () => void; variant?: "primary" | "ghost" | "outline"; className?: string; disabled?: boolean }) {
  const v: Record<string, string> = {
    primary: "bg-accent text-white hover:bg-accent-hover hover:shadow-glow active:bg-accent-deep active:scale-[.98]",
    ghost: "bg-transparent text-accent hover:bg-accent/10",
    outline: "border border-line bg-white/5 text-ink hover:bg-white/10 hover:border-lineStrong",
  };
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className={clsx("rounded-[12px] px-3.5 py-2 text-sm font-semibold transition-all disabled:opacity-40 disabled:shadow-none", v[variant], className)}>
      {children}
    </button>
  );
}
