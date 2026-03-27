'use client'

import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import {
  isDemoMode,
  toggleDemoMode as toggleStorage,
  anonCompany,
  anonPerson,
  anonEmail,
  anonTicketTitle,
  skewNumber,
  skewPercent,
} from '@/lib/demo-mode'

// ---------------------------------------------------------------------------
// Context shape
// ---------------------------------------------------------------------------

interface DemoCtx {
  /** Whether demo (anonymization) mode is currently active */
  active: boolean
  /** Toggle demo mode on/off */
  toggle: () => void
  // --- Anonymization helpers (no-op passthroughs when inactive) ---
  /** Anonymize a company display name */
  company: (name: string) => string
  /** Anonymize a person name */
  person: (name: string) => string
  /** Anonymize an email address */
  email: (addr: string) => string
  /** Anonymize a ticket title */
  title: (t: string) => string
  /** Skew an integer/float metric. Pass a stable key for consistency. */
  num: (value: number, key: string) => number
  /** Skew a percentage (0–100). */
  pct: (value: number | null, key: string) => number | null
}

const DemoContext = createContext<DemoCtx>({
  active: false,
  toggle: () => {},
  company: (n) => n,
  person: (n) => n,
  email: (e) => e,
  title: (t) => t,
  num: (v) => v,
  pct: (v) => v,
})

export function useDemoMode() {
  return useContext(DemoContext)
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export default function DemoModeProvider({ children }: { children: React.ReactNode }) {
  const [active, setActive] = useState(false)

  // Hydrate from localStorage on mount
  useEffect(() => {
    setActive(isDemoMode())
  }, [])

  const toggle = useCallback(() => {
    const next = toggleStorage()
    setActive(next)
  }, [])

  // Build context value with passthrough or anonymized helpers
  const company = useCallback(
    (name: string) => (active ? anonCompany(name) : name),
    [active]
  )
  const person = useCallback(
    (name: string) => (active ? anonPerson(name) : name),
    [active]
  )
  const email = useCallback(
    (addr: string) => (active ? anonEmail(addr) : addr),
    [active]
  )
  const title = useCallback(
    (t: string) => (active ? anonTicketTitle(t || '') : t),
    [active]
  )
  const num = useCallback(
    (value: number, key: string) => (active ? skewNumber(value, key) : value),
    [active]
  )
  const pct = useCallback(
    (value: number | null, key: string) => (active ? skewPercent(value, key) : value),
    [active]
  )

  return (
    <DemoContext.Provider value={{ active, toggle, company, person, email, title, num, pct }}>
      {children}
    </DemoContext.Provider>
  )
}
