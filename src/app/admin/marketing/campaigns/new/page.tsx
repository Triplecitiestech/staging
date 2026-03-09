'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import AdminHeader from '@/components/admin/AdminHeader';

interface Audience {
  id: string;
  name: string;
  description: string | null;
  recipientCount: number;
  providerType: string;
  source: { name: string };
}

const CONTENT_TYPES = [
  { value: 'CYBERSECURITY_ALERT', label: 'Cybersecurity Alert', description: 'Urgent security notices and threat advisories', icon: '🔒' },
  { value: 'SERVICE_UPDATE', label: 'Service Update', description: 'Changes to services, new features, improvements', icon: '🔄' },
  { value: 'MAINTENANCE_NOTICE', label: 'Maintenance Notice', description: 'Scheduled maintenance windows and downtimes', icon: '🔧' },
  { value: 'VENDOR_NOTICE', label: 'Vendor / Software Notice', description: 'Updates about third-party software and vendors', icon: '📦' },
  { value: 'BEST_PRACTICE', label: 'Best Practice', description: 'Educational tips and best practices', icon: '📘' },
  { value: 'COMPANY_ANNOUNCEMENT', label: 'Company Announcement', description: 'Company news, team updates, milestones', icon: '📢' },
  { value: 'GENERAL_COMMUNICATION', label: 'General Communication', description: 'Other customer communications', icon: '💬' },
];

const VISIBILITY_OPTIONS = [
  {
    value: 'PUBLIC',
    label: 'Public',
    description: 'Published to the public blog. Visible to anyone — no login required.',
    icon: '🌐',
    example: 'Security advisories, best practices, general IT tips',
    color: 'emerald',
  },
  {
    value: 'CUSTOMER',
    label: 'Customers Only',
    description: 'Visible only to authenticated customers on their portal. Not on the public blog.',
    icon: '🏢',
    example: 'Price changes, policy updates, service-specific notices',
    color: 'cyan',
  },
  {
    value: 'INTERNAL',
    label: 'Internal Team Only',
    description: 'Visible only to staff signed in with their M365 account. Not on any public page.',
    icon: '🔐',
    example: 'Team announcements, internal processes, company news',
    color: 'violet',
  },
];

const STEPS = [
  { id: 1, label: 'Audience' },
  { id: 2, label: 'Type' },
  { id: 3, label: 'Visibility' },
  { id: 4, label: 'Topic' },
  { id: 5, label: 'Review' },
];

export default function NewCampaignPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [audiences, setAudiences] = useState<Audience[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  // Form state
  const [selectedAudienceId, setSelectedAudienceId] = useState('');
  const [selectedContentType, setSelectedContentType] = useState('');
  const [selectedVisibility, setSelectedVisibility] = useState('');
  const [campaignName, setCampaignName] = useState('');
  const [topic, setTopic] = useState('');

  useEffect(() => {
    fetch('/api/marketing/audiences')
      .then((res) => res.json())
      .then((data) => {
        setAudiences(data.audiences || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const selectedAudience = audiences.find((a) => a.id === selectedAudienceId);
  const selectedType = CONTENT_TYPES.find((t) => t.value === selectedContentType);
  const selectedVis = VISIBILITY_OPTIONS.find((v) => v.value === selectedVisibility);

  const canProceed = () => {
    switch (step) {
      case 1: return !!selectedAudienceId;
      case 2: return !!selectedContentType;
      case 3: return !!selectedVisibility;
      case 4: return !!topic.trim() && !!campaignName.trim();
      default: return true;
    }
  };

  const handleCreate = async () => {
    setCreating(true);
    try {
      const res = await fetch('/api/marketing/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: campaignName,
          contentType: selectedContentType,
          visibility: selectedVisibility,
          topic,
          audienceId: selectedAudienceId,
          createdBy: 'admin@triplecitiestech.com',
        }),
      });

      if (res.ok) {
        const data = await res.json();
        router.push(`/admin/marketing/campaigns/${data.campaign.id}`);
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to create campaign');
        setCreating(false);
      }
    } catch {
      alert('Failed to create campaign');
      setCreating(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_rgba(6,182,212,0.08)_0%,_transparent_50%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,_rgba(139,92,246,0.08)_0%,_transparent_50%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(14,165,233,0.04)_0%,_transparent_60%)]" />
        <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)', backgroundSize: '60px 60px' }} />
      </div>
      <div className="relative z-10">
      <AdminHeader />
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-slate-400 mb-6">
        <Link href="/admin/marketing" className="hover:text-white transition-colors">Marketing</Link>
        <span>/</span>
        <span className="text-white">New Communication</span>
      </div>

      {/* Step Indicator */}
      <div className="flex items-center gap-1 sm:gap-2 mb-8 overflow-x-auto">
        {STEPS.map((s, idx) => (
          <div key={s.id} className="flex items-center shrink-0">
            <button
              onClick={() => s.id < step && setStep(s.id)}
              disabled={s.id > step}
              className={`flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                s.id === step
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                  : s.id < step
                  ? 'bg-emerald-500/10 text-emerald-400 cursor-pointer hover:bg-emerald-500/20'
                  : 'text-slate-500 cursor-not-allowed'
              }`}
            >
              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                s.id === step
                  ? 'bg-cyan-500 text-white'
                  : s.id < step
                  ? 'bg-emerald-500 text-white'
                  : 'bg-slate-700 text-slate-400'
              }`}>
                {s.id < step ? '✓' : s.id}
              </span>
              <span className="hidden sm:inline">{s.label}</span>
            </button>
            {idx < STEPS.length - 1 && (
              <div className={`w-4 sm:w-8 h-0.5 mx-0.5 sm:mx-1 ${s.id < step ? 'bg-emerald-500/50' : 'bg-slate-700'}`} />
            )}
          </div>
        ))}
      </div>

      {/* Step Content */}
      <div className="bg-slate-800/50 rounded-xl border border-white/10 p-6">
        {/* Step 1: Select Audience */}
        {step === 1 && (
          <div>
            <h2 className="text-xl font-bold text-white mb-2">Select Audience</h2>
            <p className="text-slate-400 mb-6">Choose who will receive this communication</p>

            {loading ? (
              <div className="text-slate-400 py-8 text-center">Loading audiences...</div>
            ) : audiences.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-slate-400 mb-4">No audiences created yet.</p>
                <Link
                  href="/admin/marketing/audiences"
                  className="text-cyan-400 hover:text-cyan-300 underline"
                >
                  Create an audience first
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {audiences.map((audience) => (
                  <button
                    key={audience.id}
                    onClick={() => setSelectedAudienceId(audience.id)}
                    className={`w-full text-left p-4 rounded-lg border transition-colors ${
                      selectedAudienceId === audience.id
                        ? 'border-cyan-500/50 bg-cyan-500/10'
                        : 'border-white/10 bg-slate-900/30 hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-white font-medium">{audience.name}</h3>
                        {audience.description && (
                          <p className="text-sm text-slate-400 mt-0.5">{audience.description}</p>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-white">{audience.recipientCount}</p>
                        <p className="text-xs text-slate-400">recipients</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-xs px-2 py-0.5 bg-slate-700/50 rounded text-slate-300">
                        {audience.source.name}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Step 2: Choose Content Type */}
        {step === 2 && (
          <div>
            <h2 className="text-xl font-bold text-white mb-2">Choose Communication Type</h2>
            <p className="text-slate-400 mb-6">Select the type of content you want to create</p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {CONTENT_TYPES.map((type) => (
                <button
                  key={type.value}
                  onClick={() => setSelectedContentType(type.value)}
                  className={`text-left p-4 rounded-lg border transition-colors ${
                    selectedContentType === type.value
                      ? 'border-cyan-500/50 bg-cyan-500/10'
                      : 'border-white/10 bg-slate-900/30 hover:border-white/20'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span className="text-2xl">{type.icon}</span>
                    <div>
                      <h3 className="text-white font-medium">{type.label}</h3>
                      <p className="text-sm text-slate-400 mt-0.5">{type.description}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 3: Visibility */}
        {step === 3 && (
          <div>
            <h2 className="text-xl font-bold text-white mb-2">Set Visibility</h2>
            <p className="text-slate-400 mb-6">Control who can see this content once published</p>

            <div className="space-y-3">
              {VISIBILITY_OPTIONS.map((vis) => {
                const borderColor = vis.color === 'emerald'
                  ? 'border-emerald-500/50 bg-emerald-500/10'
                  : vis.color === 'cyan'
                  ? 'border-cyan-500/50 bg-cyan-500/10'
                  : 'border-violet-500/50 bg-violet-500/10';
                const tagColor = vis.color === 'emerald'
                  ? 'bg-emerald-500/20 text-emerald-300'
                  : vis.color === 'cyan'
                  ? 'bg-cyan-500/20 text-cyan-300'
                  : 'bg-violet-500/20 text-violet-300';

                return (
                  <button
                    key={vis.value}
                    onClick={() => setSelectedVisibility(vis.value)}
                    className={`w-full text-left p-4 rounded-lg border transition-colors ${
                      selectedVisibility === vis.value
                        ? borderColor
                        : 'border-white/10 bg-slate-900/30 hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <span className="text-2xl">{vis.icon}</span>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="text-white font-medium">{vis.label}</h3>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${tagColor}`}>
                            {vis.value}
                          </span>
                        </div>
                        <p className="text-sm text-slate-400 mt-1">{vis.description}</p>
                        <p className="text-xs text-slate-500 mt-1.5">Examples: {vis.example}</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="mt-4 p-3 bg-slate-900/50 border border-white/5 rounded-lg">
              <p className="text-xs text-slate-400">
                <strong className="text-slate-300">How it works:</strong> Public content goes to your website blog. Customer-only content is visible in their portal after login. Internal content requires staff authentication via Microsoft 365. Email notifications always go out regardless of visibility.
              </p>
            </div>
          </div>
        )}

        {/* Step 4: Enter Topic */}
        {step === 4 && (
          <div>
            <h2 className="text-xl font-bold text-white mb-2">Define Your Communication</h2>
            <p className="text-slate-400 mb-6">Give your communication a name and describe what you want to say</p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Campaign Name</label>
                <input
                  type="text"
                  value={campaignName}
                  onChange={(e) => setCampaignName(e.target.value)}
                  placeholder={`e.g., ${selectedType?.label || 'Communication'} - March 2026`}
                  className="w-full px-4 py-2 bg-slate-900/50 border border-white/10 rounded-lg text-white placeholder-slate-500 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  Topic / Prompt
                  <span className="text-slate-500 font-normal ml-2">Tell the AI what to write about</span>
                </label>
                <textarea
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  rows={5}
                  placeholder={getTopicPlaceholder(selectedContentType)}
                  className="w-full px-4 py-3 bg-slate-900/50 border border-white/10 rounded-lg text-white placeholder-slate-500 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 outline-none resize-none"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Be specific — the more detail you provide, the better the AI output. You can always edit the result.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Step 5: Review */}
        {step === 5 && (
          <div>
            <h2 className="text-xl font-bold text-white mb-2">Review & Create</h2>
            <p className="text-slate-400 mb-6">Confirm the details before creating this campaign</p>

            <div className="space-y-4">
              <div className="p-4 bg-slate-900/30 rounded-lg border border-white/5">
                <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Campaign Name</p>
                <p className="text-white font-medium">{campaignName}</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-4 bg-slate-900/30 rounded-lg border border-white/5">
                  <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Audience</p>
                  <p className="text-white font-medium">{selectedAudience?.name}</p>
                  <p className="text-sm text-slate-400">{selectedAudience?.recipientCount} recipients</p>
                </div>

                <div className="p-4 bg-slate-900/30 rounded-lg border border-white/5">
                  <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Content Type</p>
                  <p className="text-white font-medium">{selectedType?.label}</p>
                </div>

                <div className="p-4 bg-slate-900/30 rounded-lg border border-white/5">
                  <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Visibility</p>
                  <p className="text-white font-medium">{selectedVis?.icon} {selectedVis?.label}</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {selectedVisibility === 'PUBLIC' && 'Visible on public blog'}
                    {selectedVisibility === 'CUSTOMER' && 'Customers only (portal)'}
                    {selectedVisibility === 'INTERNAL' && 'Staff only (M365 login)'}
                  </p>
                </div>
              </div>

              <div className="p-4 bg-slate-900/30 rounded-lg border border-white/5">
                <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Topic / Prompt</p>
                <p className="text-white whitespace-pre-wrap">{topic}</p>
              </div>

              {selectedVisibility === 'INTERNAL' && (
                <div className="p-4 bg-violet-500/10 border border-violet-500/20 rounded-lg">
                  <p className="text-violet-300 text-sm">
                    <strong>Internal only:</strong> This content will only be visible to staff who sign in with their Microsoft 365 account. The email will include instructions to visit the admin portal.
                  </p>
                </div>
              )}

              {selectedVisibility === 'CUSTOMER' && (
                <div className="p-4 bg-cyan-500/10 border border-cyan-500/20 rounded-lg">
                  <p className="text-cyan-300 text-sm">
                    <strong>Customer access:</strong> This content will be visible to customers in their portal after login. It will not appear on the public blog. The email will include a link to their customer portal.
                  </p>
                </div>
              )}

              {selectedVisibility === 'PUBLIC' && (
                <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
                  <p className="text-emerald-300 text-sm">
                    <strong>Public content:</strong> This will be published to the public blog and indexed by search engines. The email will include a direct link to the blog post.
                  </p>
                </div>
              )}

              <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                <p className="text-blue-300 text-sm">
                  After creating, you&apos;ll be able to generate AI content, review and edit it, then publish and send.
                  No content will be published or sent without your explicit approval.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between mt-8 pt-6 border-t border-white/10">
          <button
            onClick={() => setStep(Math.max(1, step - 1))}
            disabled={step === 1}
            className="px-4 py-2 text-slate-300 hover:text-white disabled:text-slate-600 disabled:cursor-not-allowed transition-colors"
          >
            Back
          </button>

          {step < 5 ? (
            <button
              onClick={() => setStep(step + 1)}
              disabled={!canProceed()}
              className="px-6 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-600 disabled:cursor-not-allowed text-white rounded-lg transition-colors text-sm font-medium"
            >
              Continue
            </button>
          ) : (
            <button
              onClick={handleCreate}
              disabled={creating}
              className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-600 disabled:cursor-not-allowed text-white rounded-lg transition-colors text-sm font-medium"
            >
              {creating ? 'Creating...' : 'Create Campaign'}
            </button>
          )}
        </div>
      </div>
      </div>
      </div>
    </div>
  );
}

function getTopicPlaceholder(contentType: string): string {
  const placeholders: Record<string, string> = {
    CYBERSECURITY_ALERT: 'e.g., A new ransomware variant is targeting SMBs through phishing emails. We need to warn our customers about the signs to watch for and the immediate steps they should take.',
    SERVICE_UPDATE: 'e.g., We just rolled out 24/7 monitoring for all managed services clients. Explain the benefits and what they can expect.',
    MAINTENANCE_NOTICE: 'e.g., Scheduled maintenance this Saturday 2am-6am EST for server upgrades. Most clients will see brief interruptions to email access.',
    VENDOR_NOTICE: 'e.g., Microsoft is deprecating basic authentication for Exchange Online. Our customers need to know what this means and what we are doing to help them transition.',
    BEST_PRACTICE: 'e.g., Write about password manager best practices for small businesses. Include why they matter, top recommendations, and how to get started.',
    COMPANY_ANNOUNCEMENT: 'e.g., We are expanding our team with two new senior engineers. Share the news and emphasize our commitment to customer service quality.',
    GENERAL_COMMUNICATION: 'e.g., End-of-year technology review and planning suggestions for 2026. Cover budget planning, security reviews, and hardware lifecycle.',
  };
  return placeholders[contentType] || 'Describe what you want to communicate to your audience...';
}
