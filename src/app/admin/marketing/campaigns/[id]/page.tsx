'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import AdminHeader from '@/components/admin/AdminHeader';

interface Campaign {
  id: string;
  name: string;
  contentType: string;
  visibility: string;
  topic: string;
  status: string;
  generatedTitle: string | null;
  generatedExcerpt: string | null;
  generatedContent: string | null;
  generatedMetaTitle: string | null;
  generatedMetaDescription: string | null;
  generatedKeywords: string[];
  emailSubject: string | null;
  emailPreviewText: string | null;
  aiModel: string | null;
  blogPostId: string | null;
  publishedAt: string | null;
  emailSentAt: string | null;
  emailTotalCount: number;
  emailSuccessCount: number;
  emailFailureCount: number;
  approvedAt: string | null;
  approvedBy: string | null;
  rejectionReason: string | null;
  createdBy: string;
  createdAt: string;
  audience: {
    id: string;
    name: string;
    recipientCount: number;
    providerType: string;
    source: { name: string };
  };
  recipients: Array<{
    id: string;
    name: string;
    email: string;
    companyName: string | null;
    emailStatus: string;
    sentAt: string | null;
    failureReason: string | null;
  }>;
  auditLogs: Array<{
    id: string;
    action: string;
    staffEmail: string;
    details: Record<string, unknown> | null;
    createdAt: string;
  }>;
  _count: { recipients: number };
}

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-slate-500/20 text-slate-300 border-slate-500/30',
  GENERATING: 'bg-violet-500/20 text-violet-300 border-violet-500/30',
  CONTENT_READY: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  APPROVED: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  PUBLISHING: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
  PUBLISHED: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
  SENDING: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
  SENT: 'bg-green-500/20 text-green-300 border-green-500/30',
  FAILED: 'bg-red-500/20 text-red-300 border-red-500/30',
  CANCELLED: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
};

const VISIBILITY_LABELS: Record<string, { label: string; color: string; icon: string }> = {
  PUBLIC: { label: 'Public', color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30', icon: '🌐' },
  CUSTOMER: { label: 'Customers Only', color: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30', icon: '🏢' },
  INTERNAL: { label: 'Internal Team', color: 'bg-violet-500/20 text-violet-300 border-violet-500/30', icon: '🔐' },
};

const CONTENT_TYPE_LABELS: Record<string, string> = {
  CYBERSECURITY_ALERT: 'Cybersecurity Alert',
  SERVICE_UPDATE: 'Service Update',
  MAINTENANCE_NOTICE: 'Maintenance Notice',
  VENDOR_NOTICE: 'Vendor Notice',
  BEST_PRACTICE: 'Best Practice',
  COMPANY_ANNOUNCEMENT: 'Announcement',
  GENERAL_COMMUNICATION: 'Communication',
};

export default function CampaignDetailPage() {
  const { id } = useParams();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editExcerpt, setEditExcerpt] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editEmailSubject, setEditEmailSubject] = useState('');
  const [editEmailPreview, setEditEmailPreview] = useState('');
  const [testEmail, setTestEmail] = useState('');
  const [showTestSend, setShowTestSend] = useState(false);
  const [activeTab, setActiveTab] = useState<'content' | 'recipients' | 'history'>('content');

  // AI refinement state
  const [showRefine, setShowRefine] = useState(false);
  const [refineInstruction, setRefineInstruction] = useState('');
  const [refining, setRefining] = useState(false);
  const [refinedContent, setRefinedContent] = useState<{
    title: string; excerpt: string; content: string; emailSubject: string; emailPreviewText: string;
  } | null>(null);

  const loadCampaign = useCallback(async () => {
    try {
      const res = await fetch(`/api/marketing/campaigns/${id}`);
      const data = await res.json();
      if (data.campaign) {
        setCampaign(data.campaign);
        // Initialize edit fields
        setEditTitle(data.campaign.generatedTitle || '');
        setEditExcerpt(data.campaign.generatedExcerpt || '');
        setEditContent(data.campaign.generatedContent || '');
        setEditEmailSubject(data.campaign.emailSubject || '');
        setEditEmailPreview(data.campaign.emailPreviewText || '');
      }
    } catch (err) {
      console.error('Failed to load campaign:', err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadCampaign();
  }, [loadCampaign]);

  const handleAction = async (action: string, endpoint: string, body: Record<string, unknown> = {}) => {
    setActionLoading(action);
    try {
      const res = await fetch(`/api/marketing/campaigns/${id}/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staffEmail: 'admin@triplecitiestech.com', ...body }),
      });

      const data = await res.json();
      if (!res.ok) {
        alert(data.error || `Action failed: ${action}`);
      } else {
        await loadCampaign();
      }
    } catch {
      alert(`Action failed: ${action}`);
    } finally {
      setActionLoading('');
    }
  };

  const handleSaveEdits = async () => {
    setActionLoading('save');
    try {
      const res = await fetch(`/api/marketing/campaigns/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          generatedTitle: editTitle,
          generatedExcerpt: editExcerpt,
          generatedContent: editContent,
          emailSubject: editEmailSubject,
          emailPreviewText: editEmailPreview,
          lastModifiedBy: 'admin@triplecitiestech.com',
        }),
      });

      if (res.ok) {
        setEditMode(false);
        await loadCampaign();
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to save edits');
      }
    } catch {
      alert('Failed to save edits');
    } finally {
      setActionLoading('');
    }
  };

  const handleTestSend = async () => {
    if (!testEmail.trim()) return;
    await handleAction('test', 'send', { action: 'test', testEmail: testEmail.trim() });
    setShowTestSend(false);
    setTestEmail('');
  };

  const handleRefine = async () => {
    if (!refineInstruction.trim()) return;
    setRefining(true);
    setRefinedContent(null);
    try {
      const res = await fetch(`/api/marketing/campaigns/${id}/refine`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instruction: refineInstruction,
          staffEmail: 'admin@triplecitiestech.com',
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Refinement failed');
        return;
      }
      setRefinedContent(data.refined);
    } catch {
      alert('Refinement failed — network error');
    } finally {
      setRefining(false);
    }
  };

  const handleAcceptRefinement = async () => {
    if (!refinedContent) return;
    setActionLoading('save');
    try {
      const res = await fetch(`/api/marketing/campaigns/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          generatedTitle: refinedContent.title,
          generatedExcerpt: refinedContent.excerpt,
          generatedContent: refinedContent.content,
          emailSubject: refinedContent.emailSubject,
          emailPreviewText: refinedContent.emailPreviewText,
          lastModifiedBy: 'admin@triplecitiestech.com',
        }),
      });
      if (res.ok) {
        setRefinedContent(null);
        setRefineInstruction('');
        setShowRefine(false);
        await loadCampaign();
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to apply refinement');
      }
    } catch {
      alert('Failed to apply refinement');
    } finally {
      setActionLoading('');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950"><div className="relative z-10"><AdminHeader /><div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8"><div className="text-slate-400 text-center py-12">Loading campaign...</div></div></div></div>
    );
  }

  if (!campaign) {
    return (
      <div className="min-h-screen bg-slate-950"><div className="relative z-10"><AdminHeader /><div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8"><div className="text-red-400 text-center py-12">Campaign not found</div></div></div></div>
    );
  }

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
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-slate-400 mb-4">
        <Link href="/admin/marketing" className="hover:text-white transition-colors">Marketing</Link>
        <span>/</span>
        <span className="text-white truncate">{campaign.name}</span>
      </div>

      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-2xl font-bold text-white">{campaign.name}</h1>
            <span className={`px-3 py-1 rounded-full text-sm font-medium border ${STATUS_COLORS[campaign.status] || ''}`}>
              {campaign.status.replace(/_/g, ' ')}
            </span>
            {campaign.visibility && VISIBILITY_LABELS[campaign.visibility] && (
              <span className={`px-3 py-1 rounded-full text-sm font-medium border ${VISIBILITY_LABELS[campaign.visibility].color}`}>
                {VISIBILITY_LABELS[campaign.visibility].icon} {VISIBILITY_LABELS[campaign.visibility].label}
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-4 text-sm text-slate-400">
            <span>{CONTENT_TYPE_LABELS[campaign.contentType]}</span>
            <span>Audience: {campaign.audience.name} ({campaign.audience.recipientCount} recipients)</span>
            <span>Created {new Date(campaign.createdAt).toLocaleDateString()}</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-2">
          {campaign.status === 'DRAFT' && (
            <button
              onClick={() => handleAction('generate', 'generate')}
              disabled={!!actionLoading}
              className="px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:bg-slate-600 text-white rounded-lg transition-colors text-sm font-medium"
            >
              {actionLoading === 'generate' ? 'Generating...' : 'Generate Content'}
            </button>
          )}

          {campaign.status === 'CONTENT_READY' && (
            <>
              <button
                onClick={() => setEditMode(!editMode)}
                className="px-4 py-2 bg-slate-700/50 hover:bg-slate-600/50 text-white rounded-lg transition-colors text-sm font-medium border border-white/10"
              >
                {editMode ? 'Cancel Edit' : 'Edit Content'}
              </button>
              <button
                onClick={() => { setShowRefine(!showRefine); setRefinedContent(null); }}
                className="px-4 py-2 bg-violet-600/80 hover:bg-violet-500 text-white rounded-lg transition-colors text-sm font-medium"
              >
                {showRefine ? 'Hide AI Refine' : 'Refine with AI'}
              </button>
              <button
                onClick={() => handleAction('generate', 'generate')}
                disabled={!!actionLoading}
                className="px-4 py-2 bg-slate-700/50 hover:bg-slate-600/50 text-slate-300 rounded-lg transition-colors text-sm font-medium border border-white/10"
              >
                Regenerate
              </button>
              <button
                onClick={() => handleAction('approve', 'approve', { action: 'approve' })}
                disabled={!!actionLoading}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-600 text-white rounded-lg transition-colors text-sm font-medium"
              >
                {actionLoading === 'approve' ? 'Approving...' : 'Approve'}
              </button>
            </>
          )}

          {campaign.status === 'APPROVED' && (
            <button
              onClick={() => handleAction('publish', 'publish')}
              disabled={!!actionLoading}
              className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-600 text-white rounded-lg transition-colors text-sm font-medium"
            >
              {actionLoading === 'publish' ? 'Publishing...' :
                campaign.visibility === 'INTERNAL' ? 'Publish (Internal Only)' :
                campaign.visibility === 'CUSTOMER' ? 'Publish (Customer Portal)' :
                'Publish to Blog'}
            </button>
          )}

          {campaign.status === 'PUBLISHED' && (
            <>
              <button
                onClick={() => setShowTestSend(!showTestSend)}
                className="px-4 py-2 bg-slate-700/50 hover:bg-slate-600/50 text-slate-300 rounded-lg transition-colors text-sm font-medium border border-white/10"
              >
                Test Email
              </button>
              <button
                onClick={() => {
                  if (confirm(`Send email to ${campaign._count.recipients} recipients?`)) {
                    handleAction('send', 'send', { action: 'send' });
                  }
                }}
                disabled={!!actionLoading}
                className="px-4 py-2 bg-orange-600 hover:bg-orange-500 disabled:bg-slate-600 text-white rounded-lg transition-colors text-sm font-medium"
              >
                {actionLoading === 'send' ? 'Sending...' : `Send to ${campaign._count.recipients} Recipients`}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Test Send Modal */}
      {showTestSend && (
        <div className="bg-slate-800/50 rounded-xl border border-white/10 p-4 mb-6">
          <h3 className="text-sm font-medium text-white mb-2">Send Test Email</h3>
          <div className="flex gap-2">
            <input
              type="email"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              placeholder="your@email.com"
              className="flex-1 px-3 py-2 bg-slate-900/50 border border-white/10 rounded-lg text-white text-sm placeholder-slate-500 focus:border-cyan-500 outline-none"
            />
            <button
              onClick={handleTestSend}
              disabled={!testEmail.trim() || !!actionLoading}
              className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-600 text-white rounded-lg text-sm font-medium"
            >
              Send Test
            </button>
          </div>
        </div>
      )}

      {/* AI Refinement Panel */}
      {showRefine && (
        <div className="bg-violet-500/5 rounded-xl border border-violet-500/20 p-6 mb-6">
          <h3 className="text-sm font-semibold text-violet-300 uppercase tracking-wide mb-3">AI Content Refinement</h3>
          <p className="text-sm text-slate-400 mb-4">
            Tell the AI what to change. Be specific — e.g. &ldquo;Make the tone more urgent&rdquo;, &ldquo;Shorten the intro paragraph&rdquo;, &ldquo;Add a call-to-action about upgrading their plan&rdquo;.
          </p>
          <div className="flex gap-2 mb-4">
            <textarea
              value={refineInstruction}
              onChange={(e) => setRefineInstruction(e.target.value)}
              rows={2}
              placeholder="What would you like to change?"
              className="flex-1 px-3 py-2 bg-slate-900/50 border border-white/10 rounded-lg text-white text-sm placeholder-slate-500 focus:border-violet-500 outline-none resize-none"
            />
            <button
              onClick={handleRefine}
              disabled={!refineInstruction.trim() || refining}
              className="px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:bg-slate-600 text-white rounded-lg text-sm font-medium self-end whitespace-nowrap"
            >
              {refining ? 'Refining...' : 'Refine'}
            </button>
          </div>

          {/* Show refined result if available */}
          {refinedContent && (
            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium text-violet-300">Refined Result</h4>
                <div className="flex gap-2">
                  <button
                    onClick={() => setRefinedContent(null)}
                    className="px-3 py-1.5 text-xs text-slate-400 hover:text-white transition-colors"
                  >
                    Discard
                  </button>
                  <button
                    onClick={handleAcceptRefinement}
                    disabled={!!actionLoading}
                    className="px-3 py-1.5 text-xs bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-600 text-white rounded-lg font-medium"
                  >
                    {actionLoading === 'save' ? 'Applying...' : 'Accept Changes'}
                  </button>
                </div>
              </div>

              <div className="bg-slate-900/50 rounded-lg p-4 space-y-3 border border-white/5">
                <div>
                  <span className="text-xs text-slate-500">Title:</span>
                  <p className="text-white text-sm">{refinedContent.title}</p>
                </div>
                <div>
                  <span className="text-xs text-slate-500">Excerpt:</span>
                  <p className="text-slate-300 text-sm">{refinedContent.excerpt}</p>
                </div>
                <div>
                  <span className="text-xs text-slate-500">Email Subject:</span>
                  <p className="text-slate-300 text-sm">{refinedContent.emailSubject}</p>
                </div>
                <div>
                  <span className="text-xs text-slate-500">Content preview:</span>
                  <pre className="text-slate-300 text-xs mt-1 whitespace-pre-wrap max-h-48 overflow-y-auto bg-slate-950/50 rounded p-3">
                    {refinedContent.content?.substring(0, 1000)}
                    {(refinedContent.content?.length || 0) > 1000 ? '\n...(truncated)' : ''}
                  </pre>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Rejection Notice */}
      {campaign.rejectionReason && campaign.status === 'DRAFT' && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 mb-6">
          <p className="text-red-300 text-sm font-medium">Content was rejected:</p>
          <p className="text-red-200/70 text-sm mt-1">{campaign.rejectionReason}</p>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-6">
        {(['content', 'recipients', 'history'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === tab
                ? 'bg-white/10 text-white'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            {tab === 'content' ? 'Content' : tab === 'recipients' ? `Recipients (${campaign._count.recipients})` : 'History'}
          </button>
        ))}
      </div>

      {/* Content Tab */}
      {activeTab === 'content' && (
        <div className="space-y-6">
          {/* Topic */}
          <div className="bg-slate-800/50 rounded-xl border border-white/10 p-6">
            <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wide mb-2">Original Topic / Prompt</h3>
            <p className="text-white whitespace-pre-wrap">{campaign.topic}</p>
          </div>

          {/* Generated Content */}
          {campaign.generatedContent ? (
            editMode ? (
              <div className="bg-slate-800/50 rounded-xl border border-white/10 p-6 space-y-4">
                <h3 className="text-lg font-semibold text-white">Edit Content</h3>

                <div>
                  <label className="block text-sm text-slate-300 mb-1">Title</label>
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900/50 border border-white/10 rounded-lg text-white focus:border-cyan-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm text-slate-300 mb-1">Excerpt</label>
                  <textarea
                    value={editExcerpt}
                    onChange={(e) => setEditExcerpt(e.target.value)}
                    rows={2}
                    className="w-full px-3 py-2 bg-slate-900/50 border border-white/10 rounded-lg text-white focus:border-cyan-500 outline-none resize-none"
                  />
                </div>

                <div>
                  <label className="block text-sm text-slate-300 mb-1">Content (Markdown)</label>
                  <textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    rows={16}
                    className="w-full px-3 py-2 bg-slate-900/50 border border-white/10 rounded-lg text-white font-mono text-sm focus:border-cyan-500 outline-none resize-y"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-slate-300 mb-1">Email Subject</label>
                    <input
                      type="text"
                      value={editEmailSubject}
                      onChange={(e) => setEditEmailSubject(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-900/50 border border-white/10 rounded-lg text-white focus:border-cyan-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-slate-300 mb-1">Email Preview Text</label>
                    <input
                      type="text"
                      value={editEmailPreview}
                      onChange={(e) => setEditEmailPreview(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-900/50 border border-white/10 rounded-lg text-white focus:border-cyan-500 outline-none"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-white/10">
                  <button
                    onClick={() => setEditMode(false)}
                    className="px-4 py-2 text-slate-300 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveEdits}
                    disabled={!!actionLoading}
                    className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-600 text-white rounded-lg text-sm font-medium"
                  >
                    {actionLoading === 'save' ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-slate-800/50 rounded-xl border border-white/10 overflow-hidden">
                <div className="p-6 border-b border-white/10">
                  <h2 className="text-xl font-bold text-white">{campaign.generatedTitle}</h2>
                  <p className="text-slate-400 mt-2">{campaign.generatedExcerpt}</p>
                  {campaign.generatedKeywords.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-3">
                      {campaign.generatedKeywords.map((kw) => (
                        <span key={kw} className="px-2 py-0.5 bg-slate-700/50 rounded text-xs text-slate-300">{kw}</span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="p-6">
                  <div className="prose prose-invert prose-slate max-w-none text-slate-200 text-sm leading-relaxed whitespace-pre-wrap">
                    {campaign.generatedContent}
                  </div>
                </div>
                {campaign.emailSubject && (
                  <div className="p-6 border-t border-white/10 bg-slate-900/30">
                    <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wide mb-3">Email Notification Preview</h3>
                    <div className="space-y-2">
                      <div>
                        <span className="text-xs text-slate-500">Subject: </span>
                        <span className="text-white text-sm">{campaign.emailSubject}</span>
                      </div>
                      <div>
                        <span className="text-xs text-slate-500">Preview: </span>
                        <span className="text-slate-300 text-sm">{campaign.emailPreviewText}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          ) : (
            <div className="bg-slate-800/50 rounded-xl border border-white/10 p-12 text-center">
              <p className="text-slate-400 mb-4">
                {campaign.status === 'GENERATING'
                  ? 'AI is generating content...'
                  : 'No content generated yet. Click "Generate Content" to create a draft.'}
              </p>
              {campaign.status === 'GENERATING' && (
                <div className="animate-pulse text-violet-400 text-sm">This may take up to 30 seconds</div>
              )}
            </div>
          )}

          {/* Send Results */}
          {campaign.emailSentAt && (
            <div className="bg-slate-800/50 rounded-xl border border-white/10 p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Send Results</h3>
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center">
                  <p className="text-2xl font-bold text-white">{campaign.emailTotalCount}</p>
                  <p className="text-sm text-slate-400">Total</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-green-400">{campaign.emailSuccessCount}</p>
                  <p className="text-sm text-slate-400">Sent</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-red-400">{campaign.emailFailureCount}</p>
                  <p className="text-sm text-slate-400">Failed</p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Recipients Tab */}
      {activeTab === 'recipients' && (
        <div className="bg-slate-800/50 rounded-xl border border-white/10 overflow-hidden">
          {campaign.recipients.length === 0 ? (
            <div className="p-8 text-center text-slate-400">
              Recipients will be snapshotted when the campaign is published.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left px-4 py-3 text-xs text-slate-400 font-medium uppercase">Name</th>
                    <th className="text-left px-4 py-3 text-xs text-slate-400 font-medium uppercase">Email</th>
                    <th className="text-left px-4 py-3 text-xs text-slate-400 font-medium uppercase">Company</th>
                    <th className="text-left px-4 py-3 text-xs text-slate-400 font-medium uppercase">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {campaign.recipients.map((r) => (
                    <tr key={r.id} className="hover:bg-white/5">
                      <td className="px-4 py-3 text-sm text-white">{r.name}</td>
                      <td className="px-4 py-3 text-sm text-slate-300">{r.email}</td>
                      <td className="px-4 py-3 text-sm text-slate-400">{r.companyName || '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          r.emailStatus === 'SENT' ? 'bg-green-500/20 text-green-300' :
                          r.emailStatus === 'FAILED' ? 'bg-red-500/20 text-red-300' :
                          r.emailStatus === 'DELIVERED' ? 'bg-emerald-500/20 text-emerald-300' :
                          'bg-slate-500/20 text-slate-300'
                        }`}>
                          {r.emailStatus}
                        </span>
                        {r.failureReason && (
                          <p className="text-xs text-red-400 mt-1">{r.failureReason}</p>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* History Tab */}
      {activeTab === 'history' && (
        <div className="bg-slate-800/50 rounded-xl border border-white/10 overflow-hidden">
          {campaign.auditLogs.length === 0 ? (
            <div className="p-8 text-center text-slate-400">No audit history yet.</div>
          ) : (
            <div className="divide-y divide-white/5">
              {campaign.auditLogs.map((log) => (
                <div key={log.id} className="px-6 py-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-white font-medium capitalize">{log.action.replace(/_/g, ' ')}</span>
                      <span className="text-slate-400 ml-2">by {log.staffEmail}</span>
                    </div>
                    <span className="text-sm text-slate-500">
                      {new Date(log.createdAt).toLocaleString()}
                    </span>
                  </div>
                  {log.details && Object.keys(log.details).length > 0 && (
                    <pre className="text-xs text-slate-500 mt-1 overflow-hidden">
                      {JSON.stringify(log.details, null, 2).substring(0, 200)}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      </div>
      </div>
    </div>
  );
}
