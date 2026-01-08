import type { Metadata } from 'next'
import Header from '@/components/layout/Header'
import Footer from '@/components/layout/Footer'
import PageHero from '@/components/shared/PageHero'
import Breadcrumbs from '@/components/seo/Breadcrumbs'
import { CONTACT_INFO } from '@/constants/data'
import { PhoneIcon, MailIcon, ClockIcon } from '@/components/icons/TechIcons'

export const metadata: Metadata = {
  title: 'Live Chat Support | Triple Cities Tech',
  description: 'Chat with our support team in real-time. Get immediate answers to your IT questions from Triple Cities Tech.',
  openGraph: {
    title: 'Live Chat Support | Triple Cities Tech',
    description: 'Chat with our support team in real-time. Get immediate answers to your IT questions.',
    type: 'website',
  }
}

export default function LiveChat() {
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

          {/* Info Banner */}
          <div className="bg-white/10 backdrop-blur-sm border border-cyan-400/30 rounded-2xl p-6 mb-8">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 bg-gradient-to-br from-cyan-500 to-blue-500 rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg">
                  <ClockIcon size={20} className="text-white" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-white/70">Available</h3>
                  <p className="text-base font-bold text-white">{CONTACT_INFO.hours}</p>
                </div>
              </div>

              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg">
                  <PhoneIcon size={20} className="text-white" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-white/70">Call Us</h3>
                  <a href={`tel:${CONTACT_INFO.phone}`} className="text-base font-bold text-purple-300 hover:text-purple-200 transition-colors">
                    {CONTACT_INFO.phone}
                  </a>
                </div>
              </div>

              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg">
                  <MailIcon size={20} className="text-white" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-white/70">Email Us</h3>
                  <a href={`mailto:${CONTACT_INFO.email}`} className="text-base font-bold text-emerald-300 hover:text-emerald-200 transition-colors">
                    {CONTACT_INFO.email}
                  </a>
                </div>
              </div>

            </div>
          </div>

          {/* Chat Container */}
          <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-3xl p-8 shadow-xl min-h-[600px]">
            <div className="text-center mb-8">
              <h2 className="text-3xl font-bold text-white mb-3">Start a Conversation</h2>
              <p className="text-white/90 text-lg">
                Our team is here to help. Start a chat and we'll respond as soon as possible.
              </p>
            </div>

            {/* Thread Messenger Embed */}
            <div id="thread-messenger-container" className="min-h-[500px]">
              <script
                dangerouslySetInnerHTML={{
                  __html: `
                    var chatgenieParams = {
                      appId: "3de45b0b-6349-42fa-a1d7-5a299b4c5ab2"
                    }
                    function run(ch){ch.default.messenger().initialize(chatgenieParams);}!function(){var e=window.chatgenie;if(e)run(e);else{function t(){var t=document.createElement("script");t.type="text/javascript",t.async=true,t.readyState?t.onreadystatechange=function(){"loaded"!==t.readyState&&"complete"!==t.readyState||(t.onreadystatechange=null,window.chatgenie&&(e=window.chatgenie,run(e)))}:t.onload=function(){window.chatgenie&&(e=window.chatgenie,run(e))},t.src="https://messenger.chatgenie.io/widget.js";var n=document.getElementsByTagName("script")[0];n.parentNode.insertBefore(t,n)}window.attachEvent?window.attachEvent("onload",t):window.addEventListener("load",t,!1)}}();
                  `
                }}
              />
            </div>
          </div>

          {/* Alternative Contact Methods */}
          <div className="mt-8 text-center">
            <p className="text-white/70 text-sm">
              Prefer a different method? You can also{' '}
              <a href={`tel:${CONTACT_INFO.phone}`} className="text-cyan-300 hover:text-cyan-200 transition-colors font-semibold">
                call us
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
