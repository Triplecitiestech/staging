import { requireFieldSession } from '@/lib/field/session'
import { FIELD_PLAYBOOK_PATH } from '@/lib/field/edge'

/**
 * /field — the portal. One tab ("Playbook") whose content is
 * content/field/playbook.html served verbatim by /field/playbook inside a
 * sandboxed same-origin iframe. The iframe is what keeps the file's own
 * search, accordions, checklist and Print button working untouched: its
 * script runs in its own document, and window.print() inside an iframe prints
 * that document only. Phase 2/3 add tabs beside "Playbook".
 */
export default async function FieldPortalPage() {
  await requireFieldSession()

  return (
    <div className="flex h-[100dvh] flex-col">
      <header className="shrink-0 border-b border-slate-200">
        <div className="flex items-center justify-between px-4 py-3">
          <h1 className="text-base font-semibold sm:text-lg">Triple Cities Tech — Field Playbook</h1>
          <a
            href="/field/logout"
            className="inline-flex min-h-11 items-center rounded-md px-3 text-sm text-slate-600 underline-offset-2 hover:underline"
          >
            Sign out
          </a>
        </div>
        <nav aria-label="Portal sections" className="flex px-2">
          <span
            aria-current="page"
            className="inline-flex min-h-11 items-center border-b-2 border-slate-900 px-3 text-sm font-medium"
          >
            Playbook
          </span>
        </nav>
      </header>
      <iframe
        src={FIELD_PLAYBOOK_PATH}
        title="Field Playbook"
        sandbox="allow-scripts allow-same-origin allow-modals allow-popups allow-popups-to-escape-sandbox"
        className="w-full flex-1 border-0 bg-white"
      />
    </div>
  )
}
