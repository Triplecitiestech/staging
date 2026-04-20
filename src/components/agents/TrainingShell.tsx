import Link from 'next/link'

const TRAINING_NAV = [
  { href: '/agents/training', label: 'Overview' },
  { href: '/agents/training/about-tct', label: 'About TCT' },
  { href: '/agents/training/pitches', label: 'Elevator Pitches' },
  { href: '/agents/training/ideal-client', label: 'Ideal Client Profile' },
  { href: '/agents/training/objections', label: 'Objections & Handling' },
  { href: '/agents/training/services', label: 'Services Overview' },
  { href: '/agents/training/faq', label: 'Agent FAQ' },
]

interface Props {
  current: string
  title: string
  children: React.ReactNode
}

export default function TrainingShell({ current, title, children }: Props) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-6">
      <nav className="bg-slate-800/50 backdrop-blur-sm border border-white/10 rounded-lg p-4 h-fit">
        <h3 className="text-xs font-semibold text-cyan-300 uppercase tracking-wider mb-3 px-2">Training</h3>
        <ul className="space-y-1">
          {TRAINING_NAV.map(item => (
            <li key={item.href}>
              <Link
                href={item.href}
                className={`block px-2 py-1.5 text-sm rounded transition-colors ${
                  item.href === current
                    ? 'bg-cyan-500/20 text-cyan-200'
                    : 'text-slate-300 hover:text-white hover:bg-white/5'
                }`}
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <article className="bg-slate-800/50 backdrop-blur-sm border border-white/10 rounded-lg p-6 sm:p-8 prose-invert">
        <h1 className="text-2xl font-bold text-white mb-4">{title}</h1>
        <div className="text-slate-200 leading-relaxed space-y-4">{children}</div>
      </article>
    </div>
  )
}
