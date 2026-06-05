import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Lead, Body, H3, H4, Bullets, Callout, CalloutP } from '@/components/admin/documents/ai-playbook/primitives'

/**
 * Internal SOP: how TCT sets up Claude / Cowork so it builds the assessment kit +
 * report consistently. Referenced from Phase 1 ("Claude / Cowork set up to our
 * SOP") and the Action Items. Tailored for TCT internal use.
 */

function StepCard({ n, title, time, children }: { n: string; title: string; time?: string; children: React.ReactNode }) {
  return (
    <section className="relative grid grid-cols-[64px_1fr] gap-5 md:gap-6">
      <div
        className="flex-none w-14 h-14 rounded-2xl flex items-center justify-center font-mono text-[22px] font-black text-cyan-300 border border-cyan-400/30"
        style={{ background: 'linear-gradient(135deg, rgba(34,211,238,0.14), rgba(34,211,238,0.03))' }}
      >
        {n}
      </div>
      <div className="min-w-0">
        <div className="flex items-baseline gap-3 flex-wrap mb-2">
          <h3 className="text-xl font-extrabold text-white tracking-tight">{title}</h3>
          {time && <span className="text-[11px] font-bold uppercase tracking-wide text-cyan-400">{time}</span>}
        </div>
        {children}
      </div>
    </section>
  )
}

export default function CoworkSop() {
  return (
    <>
      {/* Page canvas — match the playbook's dark surface instead of the admin ambient. */}
      <div
        className="fixed inset-0 -z-10 pointer-events-none"
        aria-hidden
        style={{ background: 'radial-gradient(125% 90% at 50% -8%, #0b121c 0%, #07090e 55%, #050609 100%)' }}
      />

      <div className="max-w-[860px] mx-auto px-5 sm:px-8 pb-32">
        <div className="pt-6 pb-2">
          <Link
            href="/admin/documents/ai-playbook"
            className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-cyan-400 transition-colors"
          >
            <ArrowLeft size={14} /> AI Managed Services Playbook
          </Link>
        </div>

        {/* Masthead */}
        <header className="pt-10 pb-8 border-b border-white/10 mb-10">
          <div className="text-[12.5px] font-bold uppercase tracking-[0.22em] text-cyan-400 mb-2">Internal SOP · AI Enablement</div>
          <h1 className="text-[clamp(2.2rem,5vw,3.4rem)] font-black leading-[1.02] tracking-tight text-white">
            Claude / Cowork <span className="text-cyan-400">Setup</span>
          </h1>
          <Lead>
            The engine behind every assessment. Out of the box Cowork doesn't know who we are — it starts every session from zero. This is the 30-minute setup that turns it into a trained second employee that builds our kits and reports in our voice.
          </Lead>
        </header>

        <div className="flex flex-col gap-10">
          <div>
            <H3>What Cowork actually is</H3>
            <Body>
              Not a chatbot with a desktop wrapper — a desktop AI agent that reads your files, connects to your apps, learns your workflows, and runs tasks on a timer. The distinction that matters: <strong className="text-white font-semibold">Chat gives you answers; Cowork gives you finished files</strong> saved to your computer. You describe an outcome, Claude plans it, executes, and delivers a polished deliverable to the folder you specified.
            </Body>
            <Callout label="The standard for serious work">
              <CalloutP>
                Always run <strong className="text-white font-semibold">Opus 4.6 with Extended Thinking on</strong> for Cowork tasks where you want finished deliverables (kits, reports). Standard thinking is fine for quick questions in Chat.
              </CalloutP>
            </Callout>
          </div>

          <StepCard n="0" title="Give Claude a home base">
            <Body>Without a folder, Claude starts every session fresh. With one, it loads context automatically and gets sharper each session. Create a dedicated workspace — e.g. <code className="text-cyan-300">TCT-HQ</code>:</Body>
            <pre className="text-[13px] leading-relaxed text-slate-300 bg-white/[0.03] border border-white/10 rounded-lg p-4 overflow-x-auto">{`TCT-HQ/
├── context/        → who we are, how we sound, how we work
├── ground-rules/   → how Claude should behave in our workspace
├── projects/       → one subfolder per client engagement
└── outputs/        → where Claude delivers finished work`}</pre>
            <Callout warn label="Safety">
              <CalloutP>
                Never point Cowork at your home directory or all of Documents — it has real read/write/delete access. A dedicated workspace limits the blast radius. One folder per context (like separate phones for work vs. personal).
              </CalloutP>
            </Callout>
          </StepCard>

          <StepCard n="1" title="Set global instructions first">
            <Body>Settings → Cowork → Global Instructions. These fire on every session before you type. Write plain English: who we are, what we do, who we serve, preferred output format, and safety rules.</Body>
            <Callout label="The one rule to add now">
              <CalloutP>
                <strong className="text-white font-semibold">"Always show a step-by-step plan. Wait for my approval. Then execute."</strong> That's your quality control and safety net in one — Cowork moves fast; make it show the map before it drives.
              </CalloutP>
            </Callout>
          </StepCard>

          <StepCard n="2" title="Build your three context files" time="Highest-leverage 20 min">
            <Body>Create three <code className="text-cyan-300">.md</code> files in <code className="text-cyan-300">context/</code>. Don't write them from scratch — open Cowork, point it at the folder, and say <em>"Create these three files. Interview me to fill them out."</em></Body>
            <Bullets items={[
              <><strong className="text-white font-semibold">about-tct.md</strong> — who we are, what we sell (AI managed services + development), who we serve, current priorities. The onboarding packet a new hire would read every morning.</>,
              <><strong className="text-white font-semibold">brand-voice.md</strong> — how we sound: direct, no-nonsense, ROI-focused, no hype/fearmongering. Point it at existing emails/proposals and it extracts the patterns.</>,
              <><strong className="text-white font-semibold">working-style.md</strong> — how Claude should behave with us: ask-first vs. go, output formats, hard rules ("never delete without asking").</>,
            ]} />
          </StepCard>

          <StepCard n="3" title="Connect your tools">
            <Body>Settings → Connectors → Add. Start with <strong className="text-white font-semibold">Microsoft 365</strong> (Outlook, SharePoint, Teams) since that's our and our clients' stack, plus whatever we run daily. Toggle <strong className="text-white font-semibold">"Always Allow"</strong> on trusted tools so automated tasks don't stall on per-action approval.</Body>
            <Bullets items={[
              'Once connected, Claude reads tools mid-task — searches mail, pulls from SharePoint, checks the calendar — no copy-pasting between tabs.',
              'For anything without a native connector, Zapier MCP reaches 8,000+ apps: copy a URL, paste it into Cowork, done.',
            ]} />
          </StepCard>

          <StepCard n="4" title="Install skills">
            <Body>A skill is a markdown file telling Claude exactly how to do one thing, in our format, every time. Build it once, trigger it with one command. Claude only reads each skill's 3-line header until a task matches, so installing many barely touches the context window — don't underbuild.</Body>
            <H4>TCT skills worth building first</H4>
            <Bullets items={[
              <><strong className="text-white font-semibold">Discovery transcript → six zones</strong> — feed the call transcript, get pains mapped to Acquisition / Conversion / Fulfillment / Retention / Administration / Strategy.</>,
              <><strong className="text-white font-semibold">Assessment report builder</strong> — turn a mapped transcript into our report format (Profit Gap, Readiness, plays, 90-day roadmap, three paths).</>,
              <><strong className="text-white font-semibold">Proposal / deliverable generator</strong> — the format we always build to, in one command.</>,
              <><strong className="text-white font-semibold">Meeting notes → action items</strong>, <strong className="text-white font-semibold">research assistant</strong>, <strong className="text-white font-semibold">content repurposing</strong> (reads brand-voice.md), and the <strong className="text-white font-semibold">skill creator</strong> (a skill that builds skills).</>,
            ]} />
            <Callout label="How to build one">
              <CalloutP>
                <em>"Use the skill-creator to help me build a skill for [task]."</em> It interviews you, generates the SKILL.md, and after a result you love, tell it to update the skill based on what worked. It sharpens every use.
              </CalloutP>
            </Callout>
          </StepCard>

          <StepCard n="5" title="Set up scheduled tasks">
            <Body>Type <code className="text-cyan-300">/schedule</code> in Cowork. Skills handle the <em>how</em>, connectors the <em>access</em>, scheduled tasks the <em>when</em>. Build one, get it right, then add more.</Body>
            <Bullets items={[
              '7am weekday briefing — urgent email + the day\'s calendar + a priorities summary in outputs/.',
              '6pm wrap — what got done, what\'s unfinished, tomorrow\'s top priority.',
              'Weekly report — every Monday, last week summarized into outputs/.',
            ]} />
          </StepCard>

          <div>
            <H3>Keep the context files updated</H3>
            <Body>
              This is the long game and the actual moat. Every time Claude misses, update the relevant file. When priorities shift, update <code className="text-cyan-300">about-tct.md</code>. When you find a strong example of our best work, add it to <code className="text-cyan-300">brand-voice.md</code>. The longer it runs configured properly, the better it knows us — that's a better-documented version of how we work that Claude reads before every session.
            </Body>
          </div>

          <div>
            <H3>Cowork vs. Claude Code</H3>
            <Body>
              Same model, different tools. <strong className="text-white font-semibold">Claude Code</strong> is a terminal coding agent for builders shipping software. <strong className="text-white font-semibold">Cowork</strong> is the point-click-type middle ground for operators — file access, connectors, skills, scheduled tasks, no terminal. For assessment delivery, Cowork is where you live; reach for Claude Code on the AI Development build track.
            </Body>
          </div>

          <Callout label="The full sequence — ~30 minutes">
            <CalloutP>
              <strong className="text-white font-semibold">1.</strong> Connect tools (5m) · <strong className="text-white font-semibold">2.</strong> Build the three context files — let Claude interview you (10–15m) · <strong className="text-white font-semibold">3.</strong> Set Global Instructions incl. the plan-before-execute rule (5m) · <strong className="text-white font-semibold">4.</strong> Build your first skills (10m) · <strong className="text-white font-semibold">5.</strong> Set your first scheduled task (5m). Get one of each working before scaling. Stop thinking in prompts; start thinking in workspaces.
            </CalloutP>
          </Callout>
        </div>
      </div>
    </>
  )
}
