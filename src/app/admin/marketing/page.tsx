'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import AdminHeader from '@/components/admin/AdminHeader';

interface Campaign {
  id: string;
  name: string;
  contentType: string;
  status: string;
  createdAt: string;
  publishedAt: string | null;
  emailSentAt: string | null;
  emailTotalCount: number;
  emailSuccessCount: number;
  emailFailureCount: number;
  audience: {
    id: string;
    name: string;
    recipientCount: number;
    providerType: string;
  };
  _count: { recipients: number };
}

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-slate-500/20 text-slate-300',
  GENERATING: 'bg-violet-500/20 text-violet-300',
  CONTENT_READY: 'bg-blue-500/20 text-blue-300',
  APPROVED: 'bg-emerald-500/20 text-emerald-300',
  PUBLISHING: 'bg-cyan-500/20 text-cyan-300',
  PUBLISHED: 'bg-cyan-500/20 text-cyan-300',
  SENDING: 'bg-violet-500/20 text-violet-300',
  SENT: 'bg-green-500/20 text-green-300',
  FAILED: 'bg-red-500/20 text-red-300',
  CANCELLED: 'bg-slate-500/20 text-slate-400',
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

export default function MarketingDashboard() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/marketing/campaigns?limit=20')
      .then((res) => res.json())
      .then((data) => {
        setCampaigns(data.campaigns || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const stats = {
    total: campaigns.length,
    draft: campaigns.filter((c) => ['DRAFT', 'GENERATING', 'CONTENT_READY'].includes(c.status)).length,
    published: campaigns.filter((c) => ['PUBLISHED', 'SENDING', 'SENT'].includes(c.status)).length,
    totalSent: campaigns.reduce((sum, c) => sum + c.emailSuccessCount, 0),
  };

  return (
    <div className="min-h-screen bg-slate-950 relative overflow-hidden">
      {/* Ambient gradient grid background */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_rgba(6,182,212,0.08)_0%,_transparent_50%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,_rgba(139,92,246,0.08)_0%,_transparent_50%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(14,165,233,0.04)_0%,_transparent_60%)]" />
        <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)', backgroundSize: '60px 60px' }} />
      </div>
    <div className="relative z-10">
    <AdminHeader />
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Sales & Marketing</h1>
          <p className="text-slate-400 mt-1">Customer communications, campaigns, and audience management</p>
        </div>
        <div className="flex gap-3">
          <Link
            href="/admin/marketing/audiences"
            className="px-4 py-2 bg-slate-700/50 hover:bg-slate-600/50 text-slate-300 hover:text-white rounded-lg transition-colors text-sm font-medium border border-white/10"
          >
            Manage Audiences
          </Link>
          <Link
            href="/admin/marketing/campaigns/new"
            className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg transition-colors text-sm font-medium"
          >
            New Communication
          </Link>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Total Campaigns" value={stats.total} />
        <StatCard label="In Progress" value={stats.draft} />
        <StatCard label="Published" value={stats.published} />
        <StatCard label="Emails Sent" value={stats.totalSent} />
      </div>

      {/* Recent Campaigns */}
      <div className="bg-slate-800/50 rounded-xl border border-white/10 overflow-hidden">
        <div className="px-6 py-4 border-b border-white/10">
          <h2 className="text-lg font-semibold text-white">Recent Communications</h2>
        </div>

        {loading ? (
          <div className="px-6 py-12 text-center text-slate-400">Loading campaigns...</div>
        ) : campaigns.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-slate-400 mb-4">No communications yet</p>
            <Link
              href="/admin/marketing/campaigns/new"
              className="inline-flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg transition-colors text-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Create Your First Communication
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {campaigns.map((campaign) => (
              <Link
                key={campaign.id}
                href={`/admin/marketing/campaigns/${campaign.id}`}
                className="flex flex-col sm:flex-row sm:items-center gap-3 px-6 py-4 hover:bg-white/5 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1">
                    <h3 className="text-white font-medium truncate">{campaign.name}</h3>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[campaign.status] || STATUS_COLORS.DRAFT}`}>
                      {campaign.status.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-slate-400">
                    <span>{CONTENT_TYPE_LABELS[campaign.contentType] || campaign.contentType}</span>
                    <span>To: {campaign.audience.name}</span>
                    {campaign.emailSuccessCount > 0 && (
                      <span>{campaign.emailSuccessCount} emails sent</span>
                    )}
                  </div>
                </div>
                <div className="text-sm text-slate-500">
                  {new Date(campaign.createdAt).toLocaleDateString()}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
    </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-slate-800/50 rounded-xl border border-white/10 p-4">
      <p className="text-sm text-slate-400">{label}</p>
      <p className="text-2xl font-bold text-white mt-1">{value}</p>
    </div>
  );
}
