'use client'

import { useEffect } from 'react'
import Header from '@/components/layout/Header'
import Footer from '@/components/layout/Footer'
import PageHero from '@/components/shared/PageHero'
import Breadcrumbs from '@/components/seo/Breadcrumbs'
import { CONTACT_INFO } from '@/constants/data'

interface ChatGenieWindow extends Window {
  chatgenie?: {
    default: {
      messenger: () => {
        show?: () => void;
      };
    };
  };
}

export default function LiveChat() {
  useEffect(() => {
    // Try multiple times to open the chat widget
    let attempts = 0
    const maxAttempts = 10

    const tryOpenChat = () => {
      attempts++

      // Try clicking the chat button directly
      const chatButton = document.querySelector('[data-testid="messenger-button"]') as HTMLElement ||
                        document.querySelector('.chatgenie-button') as HTMLElement ||
                        document.querySelector('[id*="chatgenie"]') as HTMLElement

      if (chatButton) {
        console.log('Found chat button, clicking...')
        chatButton.click()
        return
      }

      // Try API method
      const win = window as ChatGenieWindow
      if (win.chatgenie) {
        try {
          const messenger = win.chatgenie.default.messenger()
          if (messenger && messenger.show) {
            console.log('Opening chat via API...')
            messenger.show()
            return
          }
        } catch (e) {
          console.log('API method failed:', e)
        }
      }

      // Retry if not successful
      if (attempts < maxAttempts) {
        setTimeout(tryOpenChat, 500)
      } else {
        console.log('Could not auto-open chat after', maxAttempts, 'attempts')
      }
    }

    // Start trying after 1 second
    const timer = setTimeout(tryOpenChat, 1000)

    return () => clearTimeout(timer)
  }, [])

  return (
    <main>
      <Header />
      <Breadcrumbs />

      <PageHero
        title="Live Chat Support"
        subtitle="Get instant help from our team"
        textAlign="center"
        verticalPosition="center"
        imageBackground="/herobg.webp"
        showGradientTransition={false}
        titleClassName="text-3xl sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl"
      />

      <div className="relative bg-gradient-to-br from-black via-gray-900 to-cyan-900 py-16 -mt-8 md:-mt-16">
        <div className="max-w-7xl mx-auto px-6">

          {/* Chat Instructions */}
          <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-3xl p-12 shadow-xl text-center">
            <div className="max-w-2xl mx-auto">

              <h2 className="text-4xl font-bold text-white mb-4">Click the Chat Bubble to Start</h2>
              <p className="text-xl text-white/90 mb-4">
                Look for the <strong className="text-purple-300">chat bubble</strong> in the <strong className="text-purple-300">bottom-right corner</strong> of your screen and click it to start a conversation with our team.
              </p>
              <p className="text-lg text-white/70 mb-8">
                Limited availability after 5:00pm EST
              </p>

              {/* Features */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-12">
                <div className="bg-white/5 rounded-xl p-6">
                  <div className="w-12 h-12 bg-gradient-to-br from-cyan-500 to-blue-500 rounded-lg flex items-center justify-center mx-auto mb-3">
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-bold text-white mb-2">Fast Response</h3>
                  <p className="text-white/70 text-sm">Get answers in real-time during business hours</p>
                </div>

                <div className="bg-white/5 rounded-xl p-6">
                  <div className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-lg flex items-center justify-center mx-auto mb-3">
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-bold text-white mb-2">Secure & Private</h3>
                  <p className="text-white/70 text-sm">Your conversations are encrypted and confidential</p>
                </div>

                <div className="bg-white/5 rounded-xl p-6">
                  <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg flex items-center justify-center mx-auto mb-3">
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-bold text-white mb-2">Available Now</h3>
                  <p className="text-white/70 text-sm">Monday-Friday, 8:00am-5:00pm EST</p>
                </div>
              </div>

            </div>
          </div>

          {/* Alternative Contact Methods */}
          <div className="mt-8 text-center">
            <p className="text-white/70 text-base">
              Prefer a different method? You can also{' '}
              <a href={`tel:${CONTACT_INFO.phone}`} className="text-cyan-300 hover:text-cyan-200 transition-colors font-semibold">
                call us at {CONTACT_INFO.phone}
              </a>
              {' '}or{' '}
              <a href={`mailto:${CONTACT_INFO.email}`} className="text-cyan-300 hover:text-cyan-200 transition-colors font-semibold">
                send an email
              </a>
              .
            </p>
          </div>

        </div>
      </div>

      <Footer />
    </main>
  )
}
