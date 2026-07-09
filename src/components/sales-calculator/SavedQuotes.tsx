"use client";
import React, { useEffect, useMemo, useState } from "react";
import { DiscoveryInput, PackageQuote } from "@/lib/sales-calculator/types";
import {
  SavedQuoteListItem,
  buildQuoteSummary,
  normalizeSavedInput,
} from "@/lib/sales-calculator/saved-quotes";
import { currency } from "@/lib/sales-calculator/format";
import { Button } from "./ui";
import { FolderOpen, Save, Search, Trash2, X } from "lucide-react";

/**
 * Saved quotes toolbar for the calculator: save the current discovery inputs
 * as a named quote, browse/reload/edit/delete existing ones. Quotes store
 * inputs only — loading recomputes every price with the current pricing
 * config + live overrides.
 */

export interface LoadedQuoteMeta {
  id: string;
  name: string;
  updatedAt: string;
}

interface SavedQuotesBarProps {
  input: DiscoveryInput;
  quotes: PackageQuote[];
  selectedPackageId: string;
  loadedQuote: LoadedQuoteMeta | null;
  onLoadQuote: (meta: LoadedQuoteMeta, input: DiscoveryInput, selectedPackageId: string | null) => void;
  onLoadedQuoteChange: (meta: LoadedQuoteMeta | null) => void;
}

interface ApiQuoteDetail extends SavedQuoteListItem {
  input: unknown;
}

async function readError(res: Response): Promise<string> {
  try {
    const data = await res.json();
    if (typeof data?.error === "string") return data.error;
  } catch {
    /* fall through */
  }
  return `HTTP ${res.status}`;
}

function fmtWhen(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function SavedQuotesBar({ input, quotes, selectedPackageId, loadedQuote, onLoadQuote, onLoadedQuoteChange }: SavedQuotesBarProps) {
  const [browseOpen, setBrowseOpen] = useState(false);
  const [saveMode, setSaveMode] = useState<"closed" | "new" | "copy">("closed");
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // JSON snapshot of the inputs at last save/load — drives the "unsaved changes" pill.
  const [savedSnapshot, setSavedSnapshot] = useState<string | null>(null);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 2500);
    return () => clearTimeout(t);
  }, [flash]);

  const dirty = useMemo(
    () => loadedQuote !== null && savedSnapshot !== null && JSON.stringify(input) !== savedSnapshot,
    [input, loadedQuote, savedSnapshot]
  );

  function writePayload() {
    return {
      customerName: input.company.name.trim() || null,
      input,
      selectedPackageId: selectedPackageId || null,
      summary: buildQuoteSummary(input, quotes, selectedPackageId || null),
    };
  }

  async function saveNew(name: string, note: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/sales-calculator/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, note: note || null, ...writePayload() }),
      });
      if (!res.ok) throw new Error(await readError(res));
      const data = await res.json();
      const q = data.quote as SavedQuoteListItem;
      onLoadedQuoteChange({ id: q.id, name: q.name, updatedAt: q.updatedAt });
      setSavedSnapshot(JSON.stringify(input));
      setSaveMode("closed");
      setFlash("Quote saved");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function updateExisting() {
    if (!loadedQuote) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/sales-calculator/quotes/${loadedQuote.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: loadedQuote.name, ...writePayload() }),
      });
      if (!res.ok) throw new Error(await readError(res));
      const data = await res.json();
      const q = data.quote as SavedQuoteListItem;
      onLoadedQuoteChange({ id: q.id, name: q.name, updatedAt: q.updatedAt });
      setSavedSnapshot(JSON.stringify(input));
      setFlash("Changes saved");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function handleLoaded(meta: LoadedQuoteMeta, loadedInput: DiscoveryInput, pkgId: string | null) {
    setSavedSnapshot(JSON.stringify(loadedInput));
    setError(null);
    setFlash(`Loaded “${meta.name}”`);
    setBrowseOpen(false);
    onLoadQuote(meta, loadedInput, pkgId);
  }

  function detach() {
    onLoadedQuoteChange(null);
    setSavedSnapshot(null);
  }

  return (
    <div className="no-print card shadow-soft px-4 py-3 flex flex-wrap items-center gap-x-3 gap-y-2">
      <div className="flex items-center gap-2 text-sm">
        <FolderOpen size={16} className="text-accent" />
        <span className="font-semibold text-ink">Saved Quotes</span>
      </div>

      {loadedQuote ? (
        <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 rounded-full bg-accent/10 ring-1 ring-accent/25 px-3 py-1 text-xs text-body2">
          Editing: <span className="font-semibold text-ink">{loadedQuote.name}</span>
          <span className="text-muted">saved {fmtWhen(loadedQuote.updatedAt)}</span>
          {dirty && <span className="rounded-full bg-danger/15 text-danger px-2 py-0.5 font-semibold">Unsaved changes</span>}
          <button type="button" onClick={detach} aria-label="Stop editing this saved quote" className="text-muted hover:text-ink">
            <X size={12} />
          </button>
        </span>
      ) : (
        <span className="text-xs text-muted">Save the current inputs as a quote you can reload and edit later.</span>
      )}

      {flash && <span className="text-xs font-medium text-ok">{flash}</span>}
      {error && <span className="text-xs font-medium text-danger">{error}</span>}

      <div className="ml-auto flex flex-wrap gap-2">
        <Button variant="outline" className="!py-1.5" onClick={() => { setBrowseOpen(true); setError(null); }} disabled={busy}>
          <FolderOpen size={14} className="inline -mt-0.5 mr-1.5" />Browse
        </Button>
        {loadedQuote && (
          <Button variant="outline" className="!py-1.5" onClick={() => { setSaveMode("copy"); setError(null); }} disabled={busy}>
            Save as new
          </Button>
        )}
        <Button
          variant="primary"
          className="!py-1.5"
          onClick={() => (loadedQuote ? updateExisting() : (setSaveMode("new"), setError(null)))}
          disabled={busy}
        >
          <Save size={14} className="inline -mt-0.5 mr-1.5" />
          {busy ? "Saving…" : loadedQuote ? "Save changes" : "Save quote"}
        </Button>
      </div>

      {saveMode !== "closed" && (
        <SaveDialog
          defaultName={
            saveMode === "copy" && loadedQuote
              ? `${loadedQuote.name} (copy)`
              : `${input.company.name.trim() || "New quote"} — ${new Date().toLocaleDateString()}`
          }
          busy={busy}
          error={error}
          onCancel={() => { setSaveMode("closed"); setError(null); }}
          onSave={saveNew}
        />
      )}

      {browseOpen && (
        <BrowseDialog
          loadedQuoteId={loadedQuote?.id ?? null}
          onClose={() => setBrowseOpen(false)}
          onLoaded={handleLoaded}
          onDeletedLoaded={detach}
        />
      )}
    </div>
  );
}

function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-40 flex items-start md:items-center justify-center p-4 overflow-y-auto" role="dialog" aria-modal="true" aria-label={title}>
      <div className="fixed inset-0 bg-black/60" onClick={onClose} />
      <div className={`relative card shadow-soft p-5 w-full ${wide ? "max-w-3xl" : "max-w-md"} max-h-[85vh] overflow-y-auto tct-scroll`}>
        <div className="flex items-center justify-between mb-4 gap-3">
          <h3 className="text-base font-bold text-ink tracking-tight">{title}</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="text-muted hover:text-ink">
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

const inputCls =
  "w-full rounded-[12px] border border-line bg-bgdeep px-3 py-2 text-sm text-ink outline-none transition-colors placeholder:text-faint focus:border-accent focus:ring-2 focus:ring-accent/30";

function SaveDialog({ defaultName, busy, error, onCancel, onSave }:
  { defaultName: string; busy: boolean; error: string | null; onCancel: () => void; onSave: (name: string, note: string) => void }) {
  const [name, setName] = useState(defaultName);
  const [note, setNote] = useState("");
  return (
    <Modal title="Save quote" onClose={onCancel}>
      <div className="space-y-3">
        <label className="block">
          <span className="text-sm font-medium text-body2 mb-1.5 block">Quote name</span>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoFocus className={inputCls} />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-body2 mb-1.5 block">Note <span className="text-faint font-normal">(optional)</span></span>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} rows={3} className={inputCls}
            placeholder="Context for whoever opens this next — deal stage, caveats, follow-ups…" />
        </label>
        {error && <p className="text-xs font-medium text-danger">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onCancel} disabled={busy}>Cancel</Button>
          <Button variant="primary" onClick={() => onSave(name.trim(), note.trim())} disabled={busy || !name.trim()}>
            {busy ? "Saving…" : "Save quote"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function BrowseDialog({ loadedQuoteId, onClose, onLoaded, onDeletedLoaded }:
  {
    loadedQuoteId: string | null;
    onClose: () => void;
    onLoaded: (meta: LoadedQuoteMeta, input: DiscoveryInput, selectedPackageId: string | null) => void;
    onDeletedLoaded: () => void;
  }) {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [tableMissing, setTableMissing] = useState(false);
  const [items, setItems] = useState<SavedQuoteListItem[]>([]);
  const [search, setSearch] = useState("");
  const [rowBusy, setRowBusy] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/admin/sales-calculator/quotes", { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(await readError(res));
        const data = await res.json();
        setItems((data.quotes as SavedQuoteListItem[]) || []);
        setTableMissing(!!data.tableMissing);
        setStatus("ready");
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setStatus("error");
      });
    return () => controller.abort();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) =>
      i.name.toLowerCase().includes(q) ||
      (i.customerName ?? "").toLowerCase().includes(q) ||
      (i.summary?.packageName ?? "").toLowerCase().includes(q)
    );
  }, [items, search]);

  async function load(item: SavedQuoteListItem) {
    setRowBusy(item.id);
    setRowError(null);
    try {
      const res = await fetch(`/api/admin/sales-calculator/quotes/${item.id}`);
      if (!res.ok) throw new Error(await readError(res));
      const data = await res.json();
      const detail = data.quote as ApiQuoteDetail;
      const normalized = normalizeSavedInput(detail.input);
      onLoaded({ id: detail.id, name: detail.name, updatedAt: detail.updatedAt }, normalized, detail.selectedPackageId);
    } catch (e) {
      setRowError((e as Error).message);
      setRowBusy(null);
    }
  }

  async function remove(item: SavedQuoteListItem) {
    setRowBusy(item.id);
    setRowError(null);
    try {
      const res = await fetch(`/api/admin/sales-calculator/quotes/${item.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await readError(res));
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      if (item.id === loadedQuoteId) onDeletedLoaded();
    } catch (e) {
      setRowError((e as Error).message);
    } finally {
      setRowBusy(null);
      setConfirmDelete(null);
    }
  }

  return (
    <Modal title="Saved quotes" onClose={onClose} wide>
      {status === "loading" && <p className="text-sm text-muted animate-pulse">Loading saved quotes…</p>}
      {status === "error" && (
        <p className="rounded-[12px] bg-danger/15 ring-1 ring-danger/30 text-danger text-sm p-3">
          Could not load saved quotes. Close and retry.
        </p>
      )}
      {status === "ready" && tableMissing && (
        <p className="rounded-[12px] bg-danger/15 ring-1 ring-danger/30 text-danger text-sm p-3">
          The saved-quotes table has not been created yet. Run the one-time migration
          (<code className="text-xs">POST https://www.triplecitiestech.com/api/migrations/run</code> with the migration secret), then reload this page.
        </p>
      )}
      {status === "ready" && !tableMissing && (
        <div className="space-y-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, customer or package…" className={inputCls + " !pl-9"} />
          </div>
          {rowError && <p className="text-xs font-medium text-danger">{rowError}</p>}
          {filtered.length === 0 && (
            <p className="text-sm text-muted py-4 text-center">
              {items.length === 0 ? "No saved quotes yet — use “Save quote” to create the first one." : "No quotes match the search."}
            </p>
          )}
          <ul className="divide-y divide-line">
            {filtered.map((item) => (
              <li key={item.id} className="py-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-ink text-sm">{item.name}</span>
                    {item.id === loadedQuoteId && (
                      <span className="rounded-full bg-accent/15 text-accent ring-1 ring-accent/30 px-2 py-0.5 text-[10px] font-semibold">Editing</span>
                    )}
                  </div>
                  <div className="text-xs text-muted mt-0.5">
                    {[
                      item.customerName,
                      item.summary?.packageName ?? null,
                      item.summary?.monthlyPrice != null ? `${currency(item.summary.monthlyPrice)}/mo` : null,
                      item.summary ? `${item.summary.users} users · ${item.summary.devices} PCs` : null,
                    ].filter(Boolean).join(" · ") || "—"}
                  </div>
                  <div className="text-[11px] text-faint mt-0.5">
                    Updated {fmtWhen(item.updatedAt)} by {item.updatedBy}
                    {item.note ? <span className="text-muted"> — {item.note}</span> : null}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {confirmDelete === item.id ? (
                    <>
                      <Button variant="ghost" className="!py-1 !px-2 text-xs" onClick={() => setConfirmDelete(null)} disabled={rowBusy === item.id}>Keep</Button>
                      <Button variant="outline" className="!py-1 !px-2 text-xs !text-danger !border-danger/40" onClick={() => remove(item)} disabled={rowBusy === item.id}>
                        {rowBusy === item.id ? "Deleting…" : "Confirm delete"}
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button variant="outline" className="!py-1 !px-2 text-xs" onClick={() => setConfirmDelete(item.id)} disabled={rowBusy !== null}
                        ariaLabel={`Delete ${item.name}`}>
                        <Trash2 size={13} />
                      </Button>
                      <Button variant="primary" className="!py-1 !px-3 text-xs" onClick={() => load(item)} disabled={rowBusy !== null}>
                        {rowBusy === item.id ? "Loading…" : "Load"}
                      </Button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Modal>
  );
}
