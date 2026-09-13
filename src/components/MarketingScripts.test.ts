import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

// usePathname is a Next.js hook; drive it directly so the component can be
// rendered with react-dom/server for any path.
const pathnameMock = vi.fn<() => string | null>(() => '/')
vi.mock('next/navigation', () => ({
  usePathname: () => pathnameMock(),
}))

import MarketingScripts, {
  APOLLO_TRACKER_SCRIPT,
  CHATGENIE_MESSENGER_SCRIPT,
  isMarketingScriptsSuppressed,
} from './MarketingScripts'

function renderAt(pathname: string | null): string {
  pathnameMock.mockReturnValue(pathname)
  return renderToStaticMarkup(createElement(MarketingScripts))
}

const FIELD_PATHS = ['/field', '/field/', '/field/login', '/field/login/code', '/field/admin', '/field/playbook']
const PUBLIC_PATHS = ['/', '/about', '/contact', '/services', '/blog/some-post', '/welcome', '/rtp', '/admin', '/admin/soc', '/onboarding/acme']

describe('isMarketingScriptsSuppressed', () => {
  it('suppresses exactly /field and everything under /field/', () => {
    for (const p of FIELD_PATHS) expect(isMarketingScriptsSuppressed(p), p).toBe(true)
  })

  it('does not suppress any other route', () => {
    for (const p of PUBLIC_PATHS) expect(isMarketingScriptsSuppressed(p), p).toBe(false)
  })

  it('is a path-segment match, not a string-prefix match', () => {
    // A hypothetical /fieldwork route is NOT the Contractor Portal.
    expect(isMarketingScriptsSuppressed('/fieldwork')).toBe(false)
    expect(isMarketingScriptsSuppressed('/fields')).toBe(false)
  })

  it('treats an unknown pathname as public (never hides the widgets by accident)', () => {
    expect(isMarketingScriptsSuppressed(null)).toBe(false)
    expect(isMarketingScriptsSuppressed('')).toBe(false)
  })
})

describe('<MarketingScripts />', () => {
  beforeEach(() => pathnameMock.mockReset())

  it('renders nothing at all on every /field route', () => {
    for (const p of FIELD_PATHS) expect(renderAt(p), p).toBe('')
  })

  it('renders both third-party scripts on public and staff routes', () => {
    for (const p of PUBLIC_PATHS) {
      const html = renderAt(p)
      expect(html, p).toContain('https://assets.apollo.io/micro/website-tracker/tracker.iife.js')
      expect(html, p).toContain('https://messenger.chatgenie.io/widget.js')
      expect(html.match(/<script>/g)?.length, p).toBe(2)
    }
  })

  it('renders the Apollo script before the ChatGenie script, matching the previous layout order', () => {
    const html = renderAt('/')
    expect(html.indexOf('assets.apollo.io')).toBeLessThan(html.indexOf('messenger.chatgenie.io'))
  })

  it('renders the script bodies verbatim (no escaping, no rewriting)', () => {
    const html = renderAt('/')
    expect(html).toContain(APOLLO_TRACKER_SCRIPT)
    expect(html).toContain(CHATGENIE_MESSENGER_SCRIPT)
  })

  it('keeps the production app ids', () => {
    expect(APOLLO_TRACKER_SCRIPT).toContain('appId:"69ba1abb41bd780021e1be2f"')
    expect(CHATGENIE_MESSENGER_SCRIPT).toContain('appId: "3de45b0b-6349-42fa-a1d7-5a299b4c5ab2"')
  })
})
