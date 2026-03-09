'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'

// ---- Types ----

interface AutotaskSyncData {
  credentialsConfigured: boolean
  lastSuccessfulSync: {
    at: string
    type: string
    companiesCreated: number
    companiesUpdated: number
    projectsCreated: number
    projectsUpdated: number
    contactsCreated: number
    contactsUpdated: number
    tasksCreated: number
    tasksUpdated: number
    durationMs: number
  } | null
  recentSyncs: {
    id: string
    syncType: string
    status: string
    startedAt: string
    completedAt: string | null
    durationMs: number | null
    errors: string[]
  }[]
  totalSyncs: number
}

interface ReportingJob {
  jobName: string
  lastRunAt: string | null
  lastRunStatus: string | null
  lastRunDurationMs: number | null
  lastRunError: string | null
}

interface ReportingData {
  jobs: ReportingJob[]
  dataCoverage: {
    tickets: number
    lifecycleRecords: number
    timeEntries: number
    notes: number
    resources: number
    technicianMetricDays: number
    companyMetricDays: number
    healthScores: number
    activeTargets: number
  }
}

interface MarketingData {
  totalCampaigns: number
  activeCampaigns: number
  totalAudiences: number
}

interface AIUsageData {
  blogPostsGenerated: number
  publishedPosts: number
  draftPosts: number
  lastGenerationJob: {
    lastRun: string | null
    status: string | null
    durationMs: number | null
  } | null
  aiServiceStatus: string
}

// ---- Helpers ----

function timeAgo(iso: string | null): string {
  if (!iso) return 'Never'
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

function StatusDot({ status }: { status: 'healthy' | 'degraded' | 'down' | 'unknown' }) {
  const colors = {
    healthy: 'bg-emerald-500',
    degraded: 'bg-orange-500',
    down: 'bg-rose-500',
    unknown: 'bg-slate-500',
  }
  return <div className={`w-2 h-2 rounded-full ${colors[status]}`} />
}

function SystemBadge({ label }: { label: string }) {
  return (
    <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500 bg-slate-800/80 px-2 py-0.5 rounded border border-slate-700/50">
      {label}
    </span>
  )
}

// ---- Card Components ----

function AutotaskSyncCard() {
  const [data, setData] = useState<AutotaskSyncData | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/autotask/status')
      if (res.ok) setData(await res.json())
    } catch { /* handled by null state */ }
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  if (loading) return <CardSkeleton title="Autotask PSA" />

  const lastSync = data?.lastSuccessfulSync
  const recentFailures = data?.recentSyncs?.filter(s => s.status === 'failed').length ?? 0
  const recentTotal = data?.recentSyncs?.length ?? 0
  const overallStatus: 'healthy' | 'degraded' | 'down' | 'unknown' =
    !data?.credentialsConfigured ? 'down' :
    recentFailures > recentTotal / 2 ? 'degraded' :
    recentFailures === 0 ? 'healthy' : 'degraded'

  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <StatusDot status={overallStatus} />
          <h3 className="text-sm font-medium text-white">Autotask Sync Status</h3>
        </div>
        <SystemBadge label="Autotask PSA" />
      </div>

      {!data?.credentialsConfigured ? (
        <p className="text-xs text-rose-400">Credentials not configured</p>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-900/50 rounded-lg p-2.5">
              <p className="text-xs text-slate-500">Last Sync</p>
              <p className="text-sm font-medium text-white">{timeAgo(lastSync?.at ?? null)}</p>
            </div>
            <div className="bg-slate-900/50 rounded-lg p-2.5">
              <p className="text-xs text-slate-500">Duration</p>
              <p className="text-sm font-medium text-white">
                {lastSync?.durationMs ? `${(lastSync.durationMs / 1000).toFixed(1)}s` : '-'}
              </p>
            </div>
          </div>

          {lastSync && (
            <div className="text-xs text-slate-400 space-y-1">
              <div className="flex justify-between">
                <span>Companies synced</span>
                <span className="text-white">{lastSync.companiesCreated + lastSync.companiesUpdated}</span>
              </div>
              <div className="flex justify-between">
                <span>Projects synced</span>
                <span className="text-white">{lastSync.projectsCreated + lastSync.projectsUpdated}</span>
              </div>
              <div className="flex justify-between">
                <span>Tasks synced</span>
                <span className="text-white">{lastSync.tasksCreated + lastSync.tasksUpdated}</span>
              </div>
              <div className="flex justify-between">
                <span>Contacts synced</span>
                <span className="text-white">{lastSync.contactsCreated + lastSync.contactsUpdated}</span>
              </div>
            </div>
          )}

          {recentFailures > 0 && (
            <div className="bg-rose-500/10 border border-rose-500/20 rounded-lg p-2">
              <p className="text-xs text-rose-400">{recentFailures} of {recentTotal} recent syncs failed</p>
            </div>
          )}
        </div>
      )}

      <div className="mt-3 pt-3 border-t border-slate-700/50">
        <Link href="/admin" className="text-xs text-cyan-400 hover:text-cyan-300">
          View sync logs →
        </Link>
      </div>
    </div>
  )
}

function ReportingPipelineCard() {
  const [data, setData] = useState<ReportingData | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/reports/status')
      if (res.ok) setData(await res.json())
    } catch { /* handled by null state */ }
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  if (loading) return <CardSkeleton title="Reporting Pipeline" />

  const jobs = data?.jobs ?? []
  const healthyJobs = jobs.filter(j => j.lastRunStatus === 'success').length
  const failedJobs = jobs.filter(j => j.lastRunStatus === 'failed').length
  const totalJobs = jobs.length
  const overallStatus: 'healthy' | 'degraded' | 'down' | 'unknown' =
    totalJobs === 0 ? 'unknown' :
    failedJobs === 0 ? 'healthy' :
    failedJobs > totalJobs / 2 ? 'down' : 'degraded'

  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <StatusDot status={overallStatus} />
          <h3 className="text-sm font-medium text-white">Reporting Pipeline</h3>
        </div>
        <SystemBadge label="Analytics" />
      </div>

      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-slate-900/50 rounded-lg p-2.5 text-center">
            <p className="text-lg font-bold text-emerald-400">{healthyJobs}</p>
            <p className="text-[10px] text-slate-500">Passing</p>
          </div>
          <div className="bg-slate-900/50 rounded-lg p-2.5 text-center">
            <p className="text-lg font-bold text-rose-400">{failedJobs}</p>
            <p className="text-[10px] text-slate-500">Failed</p>
          </div>
          <div className="bg-slate-900/50 rounded-lg p-2.5 text-center">
            <p className="text-lg font-bold text-slate-400">{totalJobs - healthyJobs - failedJobs}</p>
            <p className="text-[10px] text-slate-500">Pending</p>
          </div>
        </div>

        {data?.dataCoverage && (
          <div className="text-xs text-slate-400 space-y-1">
            <div className="flex justify-between">
              <span>Tickets tracked</span>
              <span className="text-white">{data.dataCoverage.tickets.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span>Time entries</span>
              <span className="text-white">{data.dataCoverage.timeEntries.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span>Health scores</span>
              <span className="text-white">{data.dataCoverage.healthScores}</span>
            </div>
            <div className="flex justify-between">
              <span>Active SLA targets</span>
              <span className="text-white">{data.dataCoverage.activeTargets}</span>
            </div>
          </div>
        )}

        {failedJobs > 0 && (
          <div className="bg-rose-500/10 border border-rose-500/20 rounded-lg p-2">
            <p className="text-xs text-rose-400 font-medium mb-1">Failed jobs:</p>
            {jobs.filter(j => j.lastRunStatus === 'failed').slice(0, 3).map(j => (
              <p key={j.jobName} className="text-[11px] text-rose-300/70 truncate">
                {j.jobName}: {j.lastRunError || 'Unknown error'}
              </p>
            ))}
          </div>
        )}
      </div>

      <div className="mt-3 pt-3 border-t border-slate-700/50">
        <Link href="/admin/reporting/status" className="text-xs text-cyan-400 hover:text-cyan-300">
          Pipeline dashboard →
        </Link>
      </div>
    </div>
  )
}

function AIUsageCard() {
  const [data, setData] = useState<AIUsageData | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/system-health')
      if (!res.ok) return
      const health = await res.json()

      const aiService = health.services?.find((s: { name: string }) => s.name === 'AI (Anthropic)')
      const genJob = health.cronJobs?.find((j: { name: string }) => j.name === 'generate-blog')

      setData({
        blogPostsGenerated: health.metrics?.totalBlogPosts ?? 0,
        publishedPosts: 0, // Will show total from metrics
        draftPosts: 0,
        lastGenerationJob: genJob ? {
          lastRun: genJob.lastRun,
          status: genJob.status,
          durationMs: genJob.durationMs,
        } : null,
        aiServiceStatus: aiService?.status ?? 'unknown',
      })
    } catch { /* handled by null state */ }
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  if (loading) return <CardSkeleton title="AI Services" />

  const serviceStatus = (data?.aiServiceStatus ?? 'unknown') as 'healthy' | 'degraded' | 'down' | 'unknown'

  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <StatusDot status={serviceStatus} />
          <h3 className="text-sm font-medium text-white">AI Services</h3>
        </div>
        <SystemBadge label="Anthropic API" />
      </div>

      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-slate-900/50 rounded-lg p-2.5">
            <p className="text-xs text-slate-500">API Status</p>
            <p className={`text-sm font-medium capitalize ${
              serviceStatus === 'healthy' ? 'text-emerald-400' :
              serviceStatus === 'degraded' ? 'text-orange-400' :
              serviceStatus === 'down' ? 'text-rose-400' : 'text-slate-400'
            }`}>
              {serviceStatus === 'healthy' ? 'Connected' : serviceStatus}
            </p>
          </div>
          <div className="bg-slate-900/50 rounded-lg p-2.5">
            <p className="text-xs text-slate-500">Blog Posts</p>
            <p className="text-sm font-medium text-white">{data?.blogPostsGenerated ?? 0}</p>
          </div>
        </div>

        <div className="text-xs text-slate-400 space-y-1">
          <div className="flex justify-between">
            <span>Last generation</span>
            <span className="text-white">{timeAgo(data?.lastGenerationJob?.lastRun ?? null)}</span>
          </div>
          <div className="flex justify-between">
            <span>Job status</span>
            <span className={`font-medium ${
              data?.lastGenerationJob?.status === 'success' ? 'text-emerald-400' :
              data?.lastGenerationJob?.status === 'error' ? 'text-rose-400' : 'text-slate-400'
            }`}>
              {data?.lastGenerationJob?.status ?? 'No data'}
            </span>
          </div>
          {data?.lastGenerationJob?.durationMs && (
            <div className="flex justify-between">
              <span>Duration</span>
              <span className="text-white">{(data.lastGenerationJob.durationMs / 1000).toFixed(1)}s</span>
            </div>
          )}
        </div>

        <p className="text-[10px] text-slate-600">
          AI powers blog generation (Mon/Wed/Fri), support review, and admin chat
        </p>
      </div>

      <div className="mt-3 pt-3 border-t border-slate-700/50">
        <Link href="/admin/blog" className="text-xs text-cyan-400 hover:text-cyan-300">
          Manage blog →
        </Link>
      </div>
    </div>
  )
}

function MarketingCard() {
  const [data, setData] = useState<MarketingData | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    try {
      const [campaignsRes, audiencesRes] = await Promise.all([
        fetch('/api/marketing/campaigns'),
        fetch('/api/marketing/audiences'),
      ])

      let totalCampaigns = 0
      let activeCampaigns = 0
      let totalAudiences = 0

      if (campaignsRes.ok) {
        const campaigns = await campaignsRes.json()
        const list = Array.isArray(campaigns) ? campaigns : campaigns.campaigns ?? []
        totalCampaigns = list.length
        activeCampaigns = list.filter((c: { status: string }) =>
          c.status === 'ACTIVE' || c.status === 'APPROVED' || c.status === 'PUBLISHED'
        ).length
      }

      if (audiencesRes.ok) {
        const audiences = await audiencesRes.json()
        const list = Array.isArray(audiences) ? audiences : audiences.audiences ?? []
        totalAudiences = list.length
      }

      setData({ totalCampaigns, activeCampaigns, totalAudiences })
    } catch { /* handled by null state */ }
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  if (loading) return <CardSkeleton title="Marketing" />

  const hasData = (data?.totalCampaigns ?? 0) > 0 || (data?.totalAudiences ?? 0) > 0

  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <StatusDot status={hasData ? 'healthy' : 'unknown'} />
          <h3 className="text-sm font-medium text-white">Marketing Systems</h3>
        </div>
        <SystemBadge label="Email + CRM" />
      </div>

      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-slate-900/50 rounded-lg p-2.5 text-center">
            <p className="text-lg font-bold text-white">{data?.totalCampaigns ?? 0}</p>
            <p className="text-[10px] text-slate-500">Campaigns</p>
          </div>
          <div className="bg-slate-900/50 rounded-lg p-2.5 text-center">
            <p className="text-lg font-bold text-cyan-400">{data?.activeCampaigns ?? 0}</p>
            <p className="text-[10px] text-slate-500">Active</p>
          </div>
          <div className="bg-slate-900/50 rounded-lg p-2.5 text-center">
            <p className="text-lg font-bold text-white">{data?.totalAudiences ?? 0}</p>
            <p className="text-[10px] text-slate-500">Audiences</p>
          </div>
        </div>

        <div className="text-xs text-slate-400 space-y-1">
          <div className="flex justify-between">
            <span>Email provider</span>
            <span className="text-white">Resend</span>
          </div>
          <div className="flex justify-between">
            <span>Targeting</span>
            <span className="text-white">Company + Contact Groups</span>
          </div>
        </div>

        <p className="text-[10px] text-slate-600">
          Campaigns, audience targeting, and email delivery via Resend
        </p>
      </div>

      <div className="mt-3 pt-3 border-t border-slate-700/50">
        <Link href="/admin/marketing" className="text-xs text-cyan-400 hover:text-cyan-300">
          Marketing dashboard →
        </Link>
      </div>
    </div>
  )
}

function CardSkeleton({ title }: { title: string }) {
  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5 animate-pulse">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-2 h-2 rounded-full bg-slate-600" />
        <h3 className="text-sm font-medium text-slate-500">{title}</h3>
      </div>
      <div className="space-y-3">
        <div className="h-16 bg-slate-700/30 rounded-lg" />
        <div className="h-4 bg-slate-700/30 rounded w-3/4" />
        <div className="h-4 bg-slate-700/30 rounded w-1/2" />
      </div>
    </div>
  )
}

// ---- Main Export ----

export default function DashboardStatusCards() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <AutotaskSyncCard />
      <ReportingPipelineCard />
      <AIUsageCard />
      <MarketingCard />
    </div>
  )
}
