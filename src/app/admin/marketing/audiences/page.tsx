'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

interface AudienceSource {
  id: string;
  name: string;
  providerType: string;
}

interface TargetingOption {
  id: string;
  label: string;
  description?: string;
  contactCount?: number;
}

interface Audience {
  id: string;
  name: string;
  description: string | null;
  providerType: string;
  recipientCount: number;
  createdAt: string;
  source: { id: string; name: string; providerType: string };
}

export default function AudiencesPage() {
  const [audiences, setAudiences] = useState<Audience[]>([]);
  const [sources, setSources] = useState<AudienceSource[]>([]);
  const [targetingOptions, setTargetingOptions] = useState<TargetingOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  // Create form
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [selectedCompanies, setSelectedCompanies] = useState<string[]>([]);
  const [allCustomers, setAllCustomers] = useState(false);
  const [creating, setCreating] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [audRes, srcRes, tgtRes] = await Promise.all([
        fetch('/api/marketing/audiences'),
        fetch('/api/marketing/audiences/sources'),
        fetch('/api/marketing/audiences/targeting?provider=AUTOTASK'),
      ]);

      const [audData, srcData, tgtData] = await Promise.all([
        audRes.json(),
        srcRes.json(),
        tgtRes.json(),
      ]);

      setAudiences(audData.audiences || []);
      setSources(srcData.sources || []);
      setTargetingOptions(tgtData.options || []);
    } catch (err) {
      console.error('Failed to load audience data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Initialize default sources then load
    fetch('/api/marketing/audiences/sources', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'init-defaults' }),
    }).then(() => loadData());
  }, [loadData]);

  const handleCreate = async () => {
    if (!newName.trim()) return;

    const autotaskSource = sources.find((s) => s.providerType === 'AUTOTASK');
    if (!autotaskSource) {
      alert('No Autotask source configured');
      return;
    }

    setCreating(true);
    try {
      const filterCriteria = allCustomers
        ? { allActiveCustomers: true }
        : { companyIds: selectedCompanies };

      const res = await fetch('/api/marketing/audiences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName,
          description: newDescription || null,
          sourceId: autotaskSource.id,
          filterCriteria,
          createdBy: 'admin@triplecitiestech.com',
        }),
      });

      if (res.ok) {
        setShowCreate(false);
        setNewName('');
        setNewDescription('');
        setSelectedCompanies([]);
        setAllCustomers(false);
        await loadData();
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to create audience');
      }
    } catch (err) {
      console.error('Create failed:', err);
      alert('Failed to create audience');
    } finally {
      setCreating(false);
    }
  };

  const toggleCompany = (id: string) => {
    setSelectedCompanies((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
    if (allCustomers) setAllCustomers(false);
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-slate-400 text-center py-12">Loading audience data...</div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-2 text-sm text-slate-400 mb-2">
            <Link href="/admin/marketing" className="hover:text-white transition-colors">Marketing</Link>
            <span>/</span>
            <span className="text-white">Audiences</span>
          </div>
          <h1 className="text-2xl font-bold text-white">Audience Management</h1>
          <p className="text-slate-400 mt-1">Define and manage your target audiences for communications</p>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg transition-colors text-sm font-medium"
        >
          {showCreate ? 'Cancel' : 'Create Audience'}
        </button>
      </div>

      {/* Create Form */}
      {showCreate && (
        <div className="bg-slate-800/50 rounded-xl border border-white/10 p-6 mb-8">
          <h2 className="text-lg font-semibold text-white mb-4">Create New Audience</h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Audience Name</label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g., All Active Customers, Enterprise Clients"
                className="w-full px-4 py-2 bg-slate-900/50 border border-white/10 rounded-lg text-white placeholder-slate-500 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Description (optional)</label>
              <input
                type="text"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="Brief description of this audience"
                className="w-full px-4 py-2 bg-slate-900/50 border border-white/10 rounded-lg text-white placeholder-slate-500 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-3">Select Companies</label>

              <label className="flex items-center gap-3 mb-4 cursor-pointer">
                <input
                  type="checkbox"
                  checked={allCustomers}
                  onChange={(e) => {
                    setAllCustomers(e.target.checked);
                    if (e.target.checked) setSelectedCompanies([]);
                  }}
                  className="w-4 h-4 rounded border-white/20 bg-slate-900/50 text-cyan-500 focus:ring-cyan-500"
                />
                <span className="text-white font-medium">All Active Customers</span>
                <span className="text-slate-400 text-sm">
                  ({targetingOptions.reduce((sum, o) => sum + (o.contactCount || 0), 0)} contacts)
                </span>
              </label>

              {!allCustomers && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 max-h-64 overflow-y-auto pr-2">
                  {targetingOptions.map((option) => (
                    <label
                      key={option.id}
                      className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                        selectedCompanies.includes(option.id)
                          ? 'bg-cyan-500/10 border border-cyan-500/30'
                          : 'bg-slate-900/30 border border-white/5 hover:border-white/10'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedCompanies.includes(option.id)}
                        onChange={() => toggleCompany(option.id)}
                        className="w-4 h-4 rounded border-white/20 bg-slate-900/50 text-cyan-500 focus:ring-cyan-500"
                      />
                      <div className="min-w-0">
                        <p className="text-sm text-white truncate">{option.label}</p>
                        <p className="text-xs text-slate-400">{option.contactCount} contacts</p>
                      </div>
                    </label>
                  ))}
                </div>
              )}

              {targetingOptions.length === 0 && (
                <p className="text-sm text-slate-400">
                  No companies with contacts found. Sync contacts from Autotask first.
                </p>
              )}
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-white/10">
              <button
                onClick={() => setShowCreate(false)}
                className="px-4 py-2 text-slate-300 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={creating || (!allCustomers && selectedCompanies.length === 0) || !newName.trim()}
                className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-600 disabled:cursor-not-allowed text-white rounded-lg transition-colors text-sm font-medium"
              >
                {creating ? 'Creating...' : 'Create Audience'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Existing Audiences */}
      <div className="bg-slate-800/50 rounded-xl border border-white/10 overflow-hidden">
        <div className="px-6 py-4 border-b border-white/10">
          <h2 className="text-lg font-semibold text-white">Your Audiences</h2>
        </div>

        {audiences.length === 0 ? (
          <div className="px-6 py-12 text-center text-slate-400">
            <p>No audiences created yet. Create one to get started.</p>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {audiences.map((audience) => (
              <div key={audience.id} className="px-6 py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-white font-medium">{audience.name}</h3>
                    {audience.description && (
                      <p className="text-sm text-slate-400 mt-0.5">{audience.description}</p>
                    )}
                    <div className="flex items-center gap-4 mt-2 text-sm text-slate-500">
                      <span className="flex items-center gap-1">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        {audience.recipientCount} recipients
                      </span>
                      <span>Source: {audience.source.name}</span>
                      <span>{new Date(audience.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <span className="px-2 py-1 bg-slate-700/50 rounded text-xs text-slate-300">
                    {audience.providerType}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
