'use client'

import { usePathname } from 'next/navigation'

/**
 * The two third-party widgets that belong to the PUBLIC site only: the
 * ChatGenie messenger bubble and the Apollo website tracker.
 *
 * They used to be inlined straight into the root layout, which renders for
 * every route — including the Contractor Portal at /field, whose pages are
 * meant to be plain white with no site chrome. A subcontractor on
 * /field/login therefore got the marketing chat bubble and was tracked by
 * Apollo. The root layout is a server component and cannot read the request
 * path, so the gate lives here: a client component that renders the same
 * two inline scripts, byte-for-byte, and renders nothing under /field.
 *
 * Scope of the gate is deliberately narrow — exactly `/field` and anything
 * under `/field/` (the same rule as `isFieldPath` in the Contractor Portal's
 * edge helpers), so no other route's behaviour changes.
 *
 * Known edge: React never executes a <script> it inserts client-side, so a
 * soft navigation FROM a /field page TO a public page would not start the
 * widgets until the next full load. There is no link from /field to the
 * public site, and a full load is how every other page has always started
 * these scripts, so the public-site behaviour is unchanged.
 */

export const APOLLO_TRACKER_SCRIPT =
  `function initApollo(){var n=Math.random().toString(36).substring(7),o=document.createElement("script");o.src="https://assets.apollo.io/micro/website-tracker/tracker.iife.js?nocache="+n,o.async=!0,o.defer=!0,o.onload=function(){if(window.trackingFunctions&&typeof window.trackingFunctions.onLoad==="function"){window.trackingFunctions.onLoad({appId:"69ba1abb41bd780021e1be2f"})}},document.head.appendChild(o)}initApollo();`

export const CHATGENIE_MESSENGER_SCRIPT = `
              var chatgenieParams = {
                appId: "3de45b0b-6349-42fa-a1d7-5a299b4c5ab2"
              }
              function run(ch){ch.default.messenger().initialize(chatgenieParams);}!function(){var e=window.chatgenie;if(e)run(e);else{function t(){var t=document.createElement("script");t.type="text/javascript",t.async=true,t.readyState?t.onreadystatechange=function(){"loaded"!==t.readyState&&"complete"!==t.readyState||(t.onreadystatechange=null,window.chatgenie&&(e=window.chatgenie,run(e)))}:t.onload=function(){window.chatgenie&&(e=window.chatgenie,run(e))},t.src="https://messenger.chatgenie.io/widget.js";var n=document.getElementsByTagName("script")[0];n.parentNode.insertBefore(t,n)}window.attachEvent?window.attachEvent("onload",t):window.addEventListener("load",t,!1)}}();
            `

/** True for `/field` and every path under `/field/`; false for everything else. */
export function isMarketingScriptsSuppressed(pathname: string | null): boolean {
  if (!pathname) return false
  return pathname === '/field' || pathname.startsWith('/field/')
}

export default function MarketingScripts() {
  const pathname = usePathname()
  if (isMarketingScriptsSuppressed(pathname)) return null

  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: APOLLO_TRACKER_SCRIPT }} />
      <script dangerouslySetInnerHTML={{ __html: CHATGENIE_MESSENGER_SCRIPT }} />
    </>
  )
}
