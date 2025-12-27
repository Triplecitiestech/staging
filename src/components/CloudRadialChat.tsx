'use client'

import { useEffect } from 'react'
import Script from 'next/script'

// Extend Window interface for CloudRadial
declare global {
  interface Window {
    CloudRadialUserInit?: (email: string, displayname: string, companyname: string) => void
  }
}

export default function CloudRadialChat() {
  const isEnabled = process.env.NEXT_PUBLIC_ENABLE_CHATBOT === 'true'

  useEffect(() => {
    // Only run if chatbot is enabled
    if (!isEnabled) return

    // Define the CloudRadialUserInit function on window
    // This allows Cloud Radial to initialize user info if needed
    if (typeof window !== 'undefined') {
      window.CloudRadialUserInit = function(email: string, displayname: string, companyname: string) {
        const chatbox = document.querySelector('#chatbox') as HTMLElement & {
          userInfo?: {
            email: string
            displayName: string
            companyName: string
          }
        }
        if (chatbox) {
          chatbox.userInfo = {
            email,
            displayName: displayname,
            companyName: companyname
          }
        }
      }
    }
  }, [isEnabled])

  // Don't render anything if chatbot is disabled
  if (!isEnabled) {
    return null
  }

  return (
    <>
      {/* Cloud Radial Chat Widget Styles */}
      <link rel='stylesheet' href='https://cdn.chatstyle.ai/chatbox/crchat-chatwidget.css' />

      {/* Cloud Radial Chat Widget Script */}
      <Script
        src='https://cdn.chatstyle.ai/chatbox/crchat-chatwidget.js'
        strategy="lazyOnload"
      />

      {/* Chat Widget Element */}
      <crchat-chatwidget
        id='chatbox'
        channel='fa448a9b-ca96-4c29-95bc-5faa24c75d02'
        version=''
        options='{"isOpen":"false", "authRequired": "false", "autoStart":"true"}'
      />
    </>
  )
}
