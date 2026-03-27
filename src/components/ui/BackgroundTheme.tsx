'use client'

import { createContext, useContext, useState, useEffect, useCallback } from 'react'

// ---------------------------------------------------------------------------
// Theme definitions
// ---------------------------------------------------------------------------

export type ThemeId = 'minimal' | 'grid' | 'aurora' | 'cyber' | 'constellation'

interface ThemeDef {
  id: ThemeId
  label: string
  description: string
}

export const THEMES: ThemeDef[] = [
  { id: 'minimal',       label: 'Minimal',       description: 'Clean dark gradient' },
  { id: 'grid',          label: 'Grid',           description: 'Glowing tech grid' },
  { id: 'aurora',        label: 'Aurora',         description: 'Flowing color waves' },
  { id: 'cyber',         label: 'Cyber',          description: 'Neon scan lines' },
  { id: 'constellation', label: 'Constellation',  description: 'Starfield & nebula' },
]

const STORAGE_KEY = 'tct-bg-theme'

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface ThemeCtx {
  theme: ThemeId
  setTheme: (t: ThemeId) => void
}

const ThemeContext = createContext<ThemeCtx>({ theme: 'grid', setTheme: () => {} })

export function useBackgroundTheme() {
  return useContext(ThemeContext)
}

// ---------------------------------------------------------------------------
// Provider (wrap admin layout or individual pages)
// ---------------------------------------------------------------------------

export function BackgroundThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>('grid')

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as ThemeId | null
    if (stored && THEMES.some(t => t.id === stored)) {
      setThemeState(stored)
    }
  }, [])

  const setTheme = useCallback((t: ThemeId) => {
    setThemeState(t)
    localStorage.setItem(STORAGE_KEY, t)
  }, [])

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

// ---------------------------------------------------------------------------
// Background renderer — place inside any page's root div (absolute positioned)
// ---------------------------------------------------------------------------

export function BackgroundLayer() {
  const { theme } = useBackgroundTheme()

  return (
    <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
      {/* Base gradient — always present */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-gray-900 to-slate-950" />

      {theme === 'minimal' && <MinimalBg />}
      {theme === 'grid' && <GridBg />}
      {theme === 'aurora' && <AuroraBg />}
      {theme === 'cyber' && <CyberBg />}
      {theme === 'constellation' && <ConstellationBg />}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Theme selector toggle (for AdminHeader or settings)
// ---------------------------------------------------------------------------

export function ThemeSelector() {
  const { theme, setTheme } = useBackgroundTheme()
  const [open, setOpen] = useState(false)

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:text-white hover:bg-white/5 rounded-md transition-colors"
        title="Background theme"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
        </svg>
        <span className="hidden sm:inline">Theme</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 w-52 bg-slate-900 border border-white/10 rounded-lg shadow-xl py-1 z-50">
            <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Background</div>
            {THEMES.map(t => (
              <button
                key={t.id}
                onClick={() => { setTheme(t.id); setOpen(false) }}
                className={`flex items-center gap-2.5 w-full px-3 py-2 text-sm transition-colors ${
                  theme === t.id
                    ? 'bg-cyan-500/10 text-cyan-400'
                    : 'text-slate-300 hover:text-white hover:bg-white/5'
                }`}
              >
                <ThemePreviewDot themeId={t.id} />
                <div className="text-left">
                  <div className="font-medium text-xs">{t.label}</div>
                  <div className="text-[10px] text-slate-500">{t.description}</div>
                </div>
                {theme === t.id && (
                  <svg className="w-3.5 h-3.5 ml-auto text-cyan-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function ThemePreviewDot({ themeId }: { themeId: ThemeId }) {
  const colors: Record<ThemeId, string> = {
    minimal: 'bg-slate-600',
    grid: 'bg-cyan-500/60',
    aurora: 'bg-gradient-to-br from-cyan-400 to-violet-500',
    cyber: 'bg-gradient-to-br from-emerald-400 to-cyan-500',
    constellation: 'bg-gradient-to-br from-blue-400 to-indigo-500',
  }
  return <div className={`w-3 h-3 rounded-full flex-shrink-0 ${colors[themeId]}`} />
}

// ---------------------------------------------------------------------------
// Individual theme backgrounds — BOLD versions
// ---------------------------------------------------------------------------

function MinimalBg() {
  return (
    <>
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_rgba(6,182,212,0.12)_0%,_transparent_50%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,_rgba(139,92,246,0.10)_0%,_transparent_50%)]" />
    </>
  )
}

function GridBg() {
  return (
    <>
      {/* Colored radial glows */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_rgba(6,182,212,0.15)_0%,_transparent_50%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,_rgba(139,92,246,0.12)_0%,_transparent_50%)]" />
      {/* Grid lines */}
      <div
        className="absolute inset-0 opacity-[0.08]"
        style={{
          backgroundImage: `
            linear-gradient(rgba(6,182,212,0.3) 1px, transparent 1px),
            linear-gradient(90deg, rgba(6,182,212,0.3) 1px, transparent 1px)
          `,
          backgroundSize: '60px 60px',
        }}
      />
      {/* Bright glow spots */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-cyan-500/[0.08] rounded-full blur-3xl" />
      <div className="absolute bottom-1/3 right-1/4 w-80 h-80 bg-violet-500/[0.07] rounded-full blur-3xl" />
    </>
  )
}

function AuroraBg() {
  return (
    <>
      <div className="absolute inset-0 overflow-hidden">
        {/* Large sweeping aurora blobs — much more visible */}
        <div className="absolute -top-1/2 -left-1/4 w-[120%] h-[80%] bg-gradient-to-br from-cyan-500/20 via-blue-500/15 to-transparent rounded-full blur-3xl animate-aurora-1" />
        <div className="absolute -bottom-1/3 -right-1/4 w-[100%] h-[70%] bg-gradient-to-tl from-violet-500/20 via-indigo-500/12 to-transparent rounded-full blur-3xl animate-aurora-2" />
        <div className="absolute top-1/3 left-1/3 w-[60%] h-[50%] bg-gradient-to-r from-cyan-400/10 via-blue-400/8 to-violet-400/10 rounded-full blur-3xl animate-aurora-3" />
        {/* Extra shimmer band */}
        <div className="absolute top-0 left-0 right-0 h-1/2 bg-gradient-to-b from-cyan-500/[0.06] to-transparent" />
      </div>
      {/* Faint grid for depth */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `
            linear-gradient(rgba(255,255,255,0.15) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.15) 1px, transparent 1px)
          `,
          backgroundSize: '80px 80px',
        }}
      />
    </>
  )
}

function CyberBg() {
  return (
    <>
      {/* Horizontal scan lines — more visible */}
      <div
        className="absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(6,182,212,0.3) 2px, rgba(6,182,212,0.3) 3px)',
          backgroundSize: '100% 6px',
        }}
      />
      {/* Tighter grid with more glow */}
      <div
        className="absolute inset-0 opacity-[0.08]"
        style={{
          backgroundImage: `
            linear-gradient(rgba(6,182,212,0.4) 1px, transparent 1px),
            linear-gradient(90deg, rgba(6,182,212,0.4) 1px, transparent 1px)
          `,
          backgroundSize: '40px 40px',
        }}
      />
      {/* Animated scan beam — brighter */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-cyan-400/40 to-transparent animate-cyber-scan" />
      </div>
      {/* Corner glows — much stronger */}
      <div className="absolute top-0 left-0 w-80 h-80 bg-cyan-500/[0.12] rounded-full blur-3xl" />
      <div className="absolute bottom-0 right-0 w-80 h-80 bg-emerald-500/[0.10] rounded-full blur-3xl" />
      {/* Center neon glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-cyan-500/[0.04] rounded-full blur-3xl" />
    </>
  )
}

function ConstellationBg() {
  return (
    <>
      {/* Nebula glows — bold */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(59,130,246,0.12)_0%,_transparent_70%)]" />
      <div className="absolute top-0 right-1/4 w-[600px] h-[400px] bg-gradient-to-b from-indigo-500/[0.10] via-blue-500/[0.06] to-transparent rounded-full blur-3xl" />
      <div className="absolute bottom-1/4 left-1/4 w-[500px] h-[300px] bg-gradient-to-r from-violet-500/[0.08] via-indigo-500/[0.06] to-cyan-500/[0.08] rounded-full blur-3xl" />
      {/* Star dots — brighter and more of them */}
      <div
        className="absolute inset-0 opacity-60"
        style={{
          backgroundImage: `
            radial-gradient(1.5px 1.5px at 10% 20%, rgba(255,255,255,0.5) 0%, transparent 100%),
            radial-gradient(1px 1px at 30% 45%, rgba(255,255,255,0.4) 0%, transparent 100%),
            radial-gradient(2px 2px at 55% 15%, rgba(255,255,255,0.6) 0%, transparent 100%),
            radial-gradient(1px 1px at 70% 60%, rgba(255,255,255,0.4) 0%, transparent 100%),
            radial-gradient(1.5px 1.5px at 85% 30%, rgba(255,255,255,0.5) 0%, transparent 100%),
            radial-gradient(1px 1px at 20% 70%, rgba(255,255,255,0.45) 0%, transparent 100%),
            radial-gradient(1px 1px at 45% 85%, rgba(255,255,255,0.35) 0%, transparent 100%),
            radial-gradient(1.5px 1.5px at 75% 80%, rgba(255,255,255,0.5) 0%, transparent 100%),
            radial-gradient(1px 1px at 90% 55%, rgba(255,255,255,0.4) 0%, transparent 100%),
            radial-gradient(1px 1px at 60% 40%, rgba(255,255,255,0.45) 0%, transparent 100%),
            radial-gradient(2px 2px at 15% 50%, rgba(6,182,212,0.7) 0%, transparent 100%),
            radial-gradient(2px 2px at 50% 25%, rgba(139,92,246,0.6) 0%, transparent 100%),
            radial-gradient(2px 2px at 80% 75%, rgba(6,182,212,0.6) 0%, transparent 100%),
            radial-gradient(2.5px 2.5px at 40% 65%, rgba(59,130,246,0.7) 0%, transparent 100%),
            radial-gradient(1px 1px at 25% 35%, rgba(255,255,255,0.35) 0%, transparent 100%),
            radial-gradient(1.5px 1.5px at 65% 90%, rgba(255,255,255,0.4) 0%, transparent 100%),
            radial-gradient(1px 1px at 95% 10%, rgba(255,255,255,0.45) 0%, transparent 100%),
            radial-gradient(1px 1px at 5% 90%, rgba(255,255,255,0.4) 0%, transparent 100%),
            radial-gradient(1px 1px at 35% 10%, rgba(255,255,255,0.3) 0%, transparent 100%),
            radial-gradient(1.5px 1.5px at 82% 48%, rgba(139,92,246,0.5) 0%, transparent 100%),
            radial-gradient(1px 1px at 12% 88%, rgba(6,182,212,0.4) 0%, transparent 100%),
            radial-gradient(2px 2px at 68% 22%, rgba(59,130,246,0.5) 0%, transparent 100%),
            radial-gradient(1px 1px at 48% 72%, rgba(255,255,255,0.35) 0%, transparent 100%),
            radial-gradient(1.5px 1.5px at 92% 82%, rgba(255,255,255,0.45) 0%, transparent 100%)
          `,
        }}
      />
    </>
  )
}
