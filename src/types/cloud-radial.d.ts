// Type definitions for Cloud Radial chat widget custom element
import 'react'

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'crchat-chatwidget': React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement>,
        HTMLElement
      > & {
        id?: string
        channel?: string
        version?: string
        options?: string
      }
    }
  }
}

export {}
