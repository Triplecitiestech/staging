'use client'

import { useState, useEffect } from 'react'

interface SetupQuestion {
  id: string
  category: string
  question: string
  description: string
  options: Array<{
    toolId: string | null
    label: string
    description: string
  }>
}

interface SetupAnswer {
  questionId: string
  toolId: string | null
  notes: string
}

const SETUP_QUESTIONS: SetupQuestion[] = [
  // --- Endpoint Security ---
  {
    id: 'antivirus',
    category: 'Endpoint Security',
    question: 'How do you manage antivirus / anti-malware?',
    description: 'Which tool provides primary endpoint protection for your managed customers?',
    options: [
      { toolId: 'datto_edr', label: 'Datto EDR with Windows Defender', description: 'EDR agent manages Defender policies and provides threat detection' },
      { toolId: 'microsoft_graph', label: 'Microsoft Defender for Endpoint (standalone)', description: 'Managed directly through Intune/M365 without a separate EDR layer' },
      { toolId: 'datto_rmm', label: 'Third-party AV managed via RMM', description: 'AV product deployed and monitored through Datto RMM' },
      { toolId: null, label: 'Other / varies by customer', description: 'Different approach per customer or a tool not listed' },
    ],
  },
  {
    id: 'firewall_monitoring',
    category: 'Endpoint Security',
    question: 'How do you monitor firewall activity?',
    description: 'Do you ingest firewall logs into a SIEM or monitoring platform?',
    options: [
      { toolId: 'rocketcyber', label: 'RocketCyber (firewall log analyzer)', description: 'RocketCyber ingests logs from Ubiquiti, SonicWall, Fortinet, etc.' },
      { toolId: 'microsoft_graph', label: 'Microsoft Defender / Sentinel', description: 'Firewall logs sent to Microsoft security stack' },
      { toolId: null, label: 'No centralized firewall monitoring', description: 'Firewalls managed individually per customer' },
    ],
  },

  // --- Identity & Access ---
  {
    id: 'identity_management',
    category: 'Identity & Access',
    question: 'How do you manage user identities and access?',
    description: 'Primary platform for user accounts, groups, and access control.',
    options: [
      { toolId: 'microsoft_graph', label: 'Microsoft Entra ID (Azure AD)', description: 'User management, Conditional Access, MFA via Microsoft 365' },
      { toolId: null, label: 'On-premises Active Directory only', description: 'No cloud identity provider' },
      { toolId: null, label: 'Other identity provider', description: 'Okta, JumpCloud, Google Workspace, etc.' },
    ],
  },
  {
    id: 'saas_security',
    category: 'Identity & Access',
    question: 'How do you monitor SaaS application security?',
    description: 'Do you monitor for suspicious SaaS logins, data exfiltration, or permission changes?',
    options: [
      { toolId: 'saas_alerts', label: 'SaaS Alerts (Respond + Unify + Fortify)', description: 'Monitors M365, Google, Salesforce, Slack with auto-response and device binding' },
      { toolId: 'microsoft_graph', label: 'Microsoft Defender for Cloud Apps', description: 'Microsoft-native CASB for M365' },
      { toolId: null, label: 'No SaaS security monitoring', description: 'Not currently monitoring SaaS application security' },
    ],
  },

  // --- Network & Asset Discovery ---
  {
    id: 'network_discovery',
    category: 'Network & Assets',
    question: 'How do you discover devices on customer networks?',
    description: 'Active network scanning finds ALL devices including unmanaged, IoT, and BYOD. RMM agents only see managed endpoints.',
    options: [
      { toolId: 'domotz', label: 'Domotz (active + passive network scanning)', description: 'Scans every IP/MAC across VLANs — discovers unmanaged devices, IoT, printers, switches' },
      { toolId: 'datto_rmm', label: 'Datto RMM agent inventory only', description: 'Only sees devices with the RMM agent installed — NOT a network scanner' },
      { toolId: null, label: 'Manual network scans / no discovery tool', description: 'Use nmap, Angry IP Scanner, or manual inventory' },
    ],
  },
  {
    id: 'network_infrastructure',
    category: 'Network & Assets',
    question: 'What network hardware do you primarily deploy?',
    description: 'For firewall, switch, and AP management.',
    options: [
      { toolId: 'ubiquiti', label: 'Ubiquiti UniFi', description: 'UniFi switches, APs, gateways managed via UniFi controller' },
      { toolId: null, label: 'SonicWall / Fortinet / other', description: 'Non-Ubiquiti network stack' },
      { toolId: null, label: 'Mixed / varies by customer', description: 'Different hardware at different customer sites' },
    ],
  },

  // --- Patch & Software Management ---
  {
    id: 'patch_management',
    category: 'Patch & Software',
    question: 'How do you manage OS and application patches?',
    description: 'Primary tool for deploying and tracking patches across endpoints.',
    options: [
      { toolId: 'datto_rmm', label: 'Datto RMM patch management', description: 'Automated OS and third-party patching via RMM' },
      { toolId: 'microsoft_graph', label: 'Microsoft Intune / Windows Update for Business', description: 'Patches managed through Intune policies' },
      { toolId: null, label: 'Both RMM and Intune', description: 'Using both tools — RMM for third-party, Intune for OS' },
    ],
  },

  // --- Backup & Recovery ---
  {
    id: 'backup_onprem',
    category: 'Backup & Recovery',
    question: 'How do you handle server/endpoint backup?',
    description: 'On-premises and endpoint backup for disaster recovery.',
    options: [
      { toolId: 'datto_bcdr', label: 'Datto BCDR (SIRIS/ALTO)', description: 'Backup appliances with cloud replication and instant virtualization' },
      { toolId: null, label: 'Veeam / Acronis / other', description: 'Non-Datto backup solution' },
      { toolId: null, label: 'No on-prem backup', description: 'Cloud-only environment' },
    ],
  },
  {
    id: 'backup_saas',
    category: 'Backup & Recovery',
    question: 'How do you back up Microsoft 365 / cloud data?',
    description: 'SaaS backup for mailboxes, SharePoint, Teams, OneDrive.',
    options: [
      { toolId: 'datto_saas', label: 'Datto SaaS Protection', description: 'Backs up M365 mailboxes, SharePoint, Teams, OneDrive' },
      { toolId: null, label: 'Other SaaS backup', description: 'Veeam for M365, Spanning, etc.' },
      { toolId: null, label: 'No SaaS backup', description: 'Relying on Microsoft native retention only' },
    ],
  },

  // --- Security Operations ---
  {
    id: 'siem_soc',
    category: 'Security Operations',
    question: 'Do you use a SIEM or managed SOC?',
    description: 'Centralized security event monitoring and correlation.',
    options: [
      { toolId: 'rocketcyber', label: 'RocketCyber managed SOC', description: 'Aggregates events from endpoints, network, and cloud for threat detection' },
      { toolId: null, label: 'Microsoft Sentinel', description: 'Microsoft-native SIEM' },
      { toolId: null, label: 'No SIEM / SOC', description: 'No centralized security event monitoring' },
    ],
  },
  {
    id: 'dns_filtering',
    category: 'Security Operations',
    question: 'How do you handle DNS-level security?',
    description: 'DNS filtering blocks access to malicious domains at the network level.',
    options: [
      { toolId: 'dnsfilter', label: 'DNSFilter', description: 'DNS-layer threat filtering and content control' },
      { toolId: null, label: 'Cisco Umbrella / other', description: 'Non-DNSFilter DNS security' },
      { toolId: null, label: 'No DNS filtering', description: 'Not currently using DNS-level filtering' },
    ],
  },
  {
    id: 'security_training',
    category: 'Security Operations',
    question: 'How do you handle security awareness training?',
    description: 'Phishing simulation and user education.',
    options: [
      { toolId: 'bullphish_id', label: 'Bullphish ID', description: 'Phishing simulations and security awareness training campaigns' },
      { toolId: null, label: 'KnowBe4 / other platform', description: 'Non-Bullphish training platform' },
      { toolId: null, label: 'No formal training program', description: 'No automated security awareness training' },
    ],
  },
  {
    id: 'dark_web',
    category: 'Security Operations',
    question: 'Do you monitor for compromised credentials on the dark web?',
    description: 'Checks if employee credentials appear in data breaches.',
    options: [
      { toolId: 'dark_web_id', label: 'Dark Web ID', description: 'Monitors dark web for compromised employee credentials' },
      { toolId: null, label: 'Other monitoring service', description: 'Have I Been Pwned, SpyCloud, etc.' },
      { toolId: null, label: 'No dark web monitoring', description: 'Not currently monitoring' },
    ],
  },

  // --- Documentation ---
  {
    id: 'documentation',
    category: 'Documentation & Process',
    question: 'Where do you store IT documentation?',
    description: 'CMDB, passwords, runbooks, network diagrams, procedures.',
    options: [
      { toolId: 'it_glue', label: 'IT Glue', description: 'Centralized IT documentation with flexible assets, passwords, and configurations' },
      { toolId: null, label: 'Hudu / other CMDB', description: 'Non-IT Glue documentation platform' },
      { toolId: null, label: 'SharePoint / shared drives', description: 'Documentation in files and folders' },
      { toolId: null, label: 'No centralized documentation', description: 'Documentation is informal or scattered' },
    ],
  },
  {
    id: 'ticketing',
    category: 'Documentation & Process',
    question: 'What PSA / ticketing system do you use?',
    description: 'For incident tracking, SLA management, and service delivery.',
    options: [
      { toolId: 'autotask', label: 'Autotask PSA', description: 'Ticketing, projects, time tracking, SLA management' },
      { toolId: null, label: 'ConnectWise Manage / other', description: 'Non-Autotask PSA' },
      { toolId: null, label: 'No PSA', description: 'Using email or basic ticketing only' },
    ],
  },

  // --- Customer Environment ---
  {
    id: 'remote_access',
    category: 'Customer Environment',
    question: 'How do customers typically access corporate resources remotely?',
    description: 'This determines whether VPN-related controls apply.',
    options: [
      { toolId: null, label: 'Cloud-only — no VPN needed', description: 'All applications are SaaS/cloud. No on-premises resources requiring VPN.' },
      { toolId: null, label: 'VPN required for on-prem resources', description: 'Employees use VPN to access on-premises servers, file shares, or applications.' },
      { toolId: null, label: 'Hybrid — some cloud, some VPN', description: 'Mix of cloud apps and on-prem resources accessed via VPN.' },
    ],
  },
  {
    id: 'on_prem_servers',
    category: 'Customer Environment',
    question: 'Do customers typically have on-premises servers?',
    description: 'This affects server-specific controls like server firewalls and server backup.',
    options: [
      { toolId: null, label: 'No on-prem servers', description: 'Fully cloud — no servers on-site.' },
      { toolId: null, label: 'Yes — with BCDR backup', description: 'On-prem servers protected by Datto BCDR.' },
      { toolId: null, label: 'Yes — mixed backup', description: 'On-prem servers with various backup solutions.' },
    ],
  },
  {
    id: 'custom_apps',
    category: 'Customer Environment',
    question: 'Do customers develop custom software applications?',
    description: 'If no, application security development controls (CIS 16.x) would be not applicable.',
    options: [
      { toolId: null, label: 'No — standard business software only', description: 'Most SMBs do not develop custom apps. CIS 16.x would be N/A.' },
      { toolId: null, label: 'Yes — some custom development', description: 'Customer builds or maintains custom applications.' },
    ],
  },
  {
    id: 'byod_policy',
    category: 'Customer Environment',
    question: 'What is the typical BYOD (Bring Your Own Device) policy?',
    description: 'Affects device management and compliance enforcement scope.',
    options: [
      { toolId: null, label: 'Company-owned devices only', description: 'All devices are purchased and managed by the company.' },
      { toolId: null, label: 'BYOD allowed with management', description: 'Personal devices allowed but must enroll in Intune/MDM.' },
      { toolId: null, label: 'BYOD with no management', description: 'Personal devices used with no MDM enrollment. Higher risk.' },
    ],
  },
]

// Group questions by category
const CATEGORIES = Array.from(new Set(SETUP_QUESTIONS.map((q) => q.category)))

export default function ComplianceSetupWizard() {
  const [currentCategory, setCurrentCategory] = useState(0)
  const [answers, setAnswers] = useState<Map<string, SetupAnswer>>(new Map())
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [loaded, setLoaded] = useState(false)

  // Load existing setup
  useEffect(() => {
    fetch('/api/compliance/setup')
      .then((r) => r.json())
      .then((json) => {
        if (json.success && json.data.answers?.length > 0) {
          const map = new Map<string, SetupAnswer>()
          for (const a of json.data.answers) {
            map.set(a.questionId, a)
          }
          setAnswers(map)
        }
        setLoaded(true)
      })
      .catch(() => setLoaded(true))
  }, [])

  const currentQuestions = SETUP_QUESTIONS.filter((q) => q.category === CATEGORIES[currentCategory])
  const totalAnswered = answers.size
  const totalQuestions = SETUP_QUESTIONS.length
  const progress = Math.round((totalAnswered / totalQuestions) * 100)

  const setAnswer = (questionId: string, toolId: string | null, notes = '') => {
    setAnswers((prev) => {
      const next = new Map(prev)
      next.set(questionId, { questionId, toolId, notes })
      return next
    })
    setSaved(false)
  }

  const saveSetup = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/compliance/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers: Array.from(answers.values()) }),
      })
      const json = await res.json()
      if (json.success) setSaved(true)
    } catch { /* ignore */ }
    finally { setSaving(false) }
  }

  if (!loaded) {
    return (
      <div className="text-center py-12">
        <div className="animate-spin w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full mx-auto" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Compliance Engine Setup</h1>
          <p className="text-slate-400 mt-1">Tell us how your MSP operates so assessments use the right tools</p>
        </div>
        <a href="/admin/compliance" className="text-sm text-cyan-400 hover:text-cyan-300">Back to Compliance</a>
      </div>

      {/* Progress */}
      <div className="bg-slate-800/50 border border-white/10 rounded-lg p-4">
        <div className="flex items-center justify-between text-sm mb-2">
          <span className="text-slate-400">{totalAnswered} of {totalQuestions} answered</span>
          <span className={`font-medium ${progress === 100 ? 'text-green-400' : 'text-cyan-400'}`}>{progress}%</span>
        </div>
        <div className="w-full bg-slate-700 rounded-full h-2">
          <div
            className={`h-2 rounded-full transition-all ${progress === 100 ? 'bg-green-500' : 'bg-cyan-500'}`}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Category tabs */}
      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map((cat, i) => {
          const catQuestions = SETUP_QUESTIONS.filter((q) => q.category === cat)
          const catAnswered = catQuestions.filter((q) => answers.has(q.id)).length
          const isComplete = catAnswered === catQuestions.length
          return (
            <button
              key={cat}
              onClick={() => setCurrentCategory(i)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                currentCategory === i
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                  : isComplete
                    ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                    : 'bg-slate-800/50 text-slate-400 border border-white/10 hover:text-white'
              }`}
            >
              {isComplete && '✓ '}{cat} ({catAnswered}/{catQuestions.length})
            </button>
          )
        })}
      </div>

      {/* Questions */}
      <div className="space-y-6">
        {currentQuestions.map((q) => {
          const currentAnswer = answers.get(q.id)
          return (
            <div key={q.id} className="bg-slate-800/50 border border-white/10 rounded-lg p-5">
              <h3 className="text-base font-semibold text-white mb-1">{q.question}</h3>
              <p className="text-sm text-slate-400 mb-4">{q.description}</p>
              <div className="space-y-2">
                {q.options.map((opt, i) => {
                  const isSelected = currentAnswer?.toolId === opt.toolId &&
                    (opt.toolId !== null || currentAnswer?.notes === opt.label)
                  return (
                    <button
                      key={i}
                      onClick={() => setAnswer(q.id, opt.toolId, opt.toolId === null ? opt.label : '')}
                      className={`w-full text-left p-3 rounded-lg border transition-colors ${
                        isSelected
                          ? 'bg-cyan-500/10 border-cyan-500/30'
                          : 'bg-slate-900/30 border-white/5 hover:border-white/20'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                          isSelected ? 'border-cyan-400' : 'border-slate-600'
                        }`}>
                          {isSelected && <div className="w-2 h-2 rounded-full bg-cyan-400" />}
                        </div>
                        <div>
                          <span className="text-sm font-medium text-white">{opt.label}</span>
                          <p className="text-xs text-slate-500 mt-0.5">{opt.description}</p>
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between pt-4">
        <button
          onClick={() => setCurrentCategory(Math.max(0, currentCategory - 1))}
          disabled={currentCategory === 0}
          className="px-4 py-2 bg-slate-700/50 hover:bg-slate-600/50 text-slate-300 rounded-lg text-sm disabled:opacity-30"
        >
          Previous
        </button>

        <div className="flex items-center gap-3">
          {saved && <span className="text-sm text-green-400">Saved!</span>}
          <button
            onClick={saveSetup}
            disabled={saving || totalAnswered === 0}
            className="px-4 py-2 bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-400 hover:to-cyan-500 text-white rounded-lg text-sm font-medium disabled:opacity-40"
          >
            {saving ? 'Saving...' : 'Save Setup'}
          </button>
        </div>

        <button
          onClick={() => setCurrentCategory(Math.min(CATEGORIES.length - 1, currentCategory + 1))}
          disabled={currentCategory === CATEGORIES.length - 1}
          className="px-4 py-2 bg-slate-700/50 hover:bg-slate-600/50 text-slate-300 rounded-lg text-sm disabled:opacity-30"
        >
          Next
        </button>
      </div>
    </div>
  )
}
