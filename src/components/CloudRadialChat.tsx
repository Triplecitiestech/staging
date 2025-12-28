'use client'

import { useEffect } from 'react'

// Extend Window interface for CloudRadial
declare global {
  interface Window {
    CloudRadialUserInit?: (email: string, displayname: string, companyname: string) => void
  }
}

export default function CloudRadialChat() {
  useEffect(() => {
    // Load the CSS
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = 'https://cdn.chatstyle.ai/chatbox/crchat-chatwidget.css'
    document.head.appendChild(link)

    // Load the script
    const script = document.createElement('script')
    script.src = 'https://cdn.chatstyle.ai/chatbox/crchat-chatwidget.js'
    script.async = true
    document.body.appendChild(script)

    // Define the CloudRadialUserInit function on window
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

    // Create the chatbot element
    const chatWidget = document.createElement('crchat-chatwidget')
    chatWidget.setAttribute('id', 'chatbox')
    chatWidget.setAttribute('channel', 'fa448a9b-ca96-4c29-95bc-5faa24c75d02')
    chatWidget.setAttribute('version', '')
    chatWidget.setAttribute('options', '{"isOpen":"false", "authRequired": "false", "autoStart":"true"}')
    document.body.appendChild(chatWidget)

    return () => {
      // Cleanup
      if (link.parentNode) link.parentNode.removeChild(link)
      if (script.parentNode) script.parentNode.removeChild(script)
      if (chatWidget.parentNode) chatWidget.parentNode.removeChild(chatWidget)
    }
  }, [])

  return null
}
