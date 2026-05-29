'use client'

import { useEffect, useState } from 'react'

/**
 * Live countdown chip for branded documents (e.g. days remaining to a
 * project's internal target). Renders nothing meaningful until mounted to
 * avoid a server/client hydration mismatch on the day count.
 */
export default function Countdown({
  targetDate,
  labelSuffix = 'to target',
}: {
  targetDate: string
  labelSuffix?: string
}) {
  const [days, setDays] = useState<number | null>(null)

  useEffect(() => {
    const target = new Date(targetDate)
    const compute = () => {
      const ms = target.getTime() - Date.now()
      setDays(Math.ceil(ms / 86_400_000))
    }
    compute()
    const id = setInterval(compute, 60_000)
    return () => clearInterval(id)
  }, [targetDate])

  const value = days === null ? '—' : days > 0 ? String(days) : days === 0 ? '0' : '—'
  const label =
    days === null
      ? labelSuffix
      : days > 0
        ? `day${days === 1 ? '' : 's'} ${labelSuffix}`
        : days === 0
          ? 'due today'
          : 'past target'

  return (
    <span className="inline-flex items-baseline gap-2 rounded-full bg-gradient-to-r from-cyan-500 to-cyan-600 px-4 py-1.5 font-bold text-[#04222a] shadow-lg shadow-cyan-500/20 whitespace-nowrap">
      <b className="text-lg font-black leading-none">{value}</b>
      <span className="text-sm">{label}</span>
    </span>
  )
}
