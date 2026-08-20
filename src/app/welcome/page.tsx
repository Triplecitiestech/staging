import Header from '@/components/layout/Header'
import Footer from '@/components/layout/Footer'
import CalendlyEmbed from '@/components/shared/CalendlyEmbed'
import ContactForm from '@/components/shared/ContactForm'
import { PhoneIcon, MailIcon, CheckCircleIcon, ClockIcon } from '@/components/icons/TechIcons'
import { SERVICES } from '@/constants/services'
import { CONTACT_INFO } from '@/constants/data'

// Gift-basket campaign landing page (QR code on the flyer). Everything the
// visitor needs is on this one page — booking and inquiry both happen inline,
// with no navigation away. Not linked from anywhere; see layout.tsx for the
// noindex metadata.

const SUPPORT_EMAIL = 'support@triplecitiestech.com'
// Digits-only tel: target so the tap-to-call works reliably from a phone camera
// scan; the formatted number from CONTACT_INFO is what the visitor reads.
const PHONE_TEL = '+16073417500'

export default function Welcome() {
  return (
    <main>
      <Header />

      {/* 1 — Thank you */}
      <section className="relative pt-24 pb-10 md:pt-32 md:pb-14 bg-gradient-to-br from-black via-gray-900 to-cyan-900">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-cyan-900/30 via-transparent to-transparent" />
        <div className="relative max-w-3xl mx-auto px-4 text-center">
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-4">
            Thanks for scanning — enjoy the basket.
          </h1>
          <p className="text-base sm:text-lg md:text-xl text-white/90">
            It&apos;s a small hello from your neighbors at Triple Cities Tech. If your
            technology has been getting in the way lately, we&apos;d be glad to talk it through.
          </p>
          <a
            href="#book"
            className="mt-7 inline-flex items-center justify-center min-h-[44px] w-full sm:w-auto px-8 py-3 bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-400 hover:to-cyan-500 text-black font-bold rounded-xl transition-all duration-300 shadow-lg hover:shadow-cyan-500/50 text-base sm:text-lg"
          >
            Book a 30-minute meeting
          </a>
        </div>
      </section>

      {/* 2 — Who we are */}
      <section className="bg-gradient-to-b from-cyan-900 to-black py-10 md:py-14">
        <div className="max-w-3xl mx-auto px-4">
          <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-2xl p-5 sm:p-8 shadow-xl">
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-3">Who we are</h2>
            <p className="text-white/90 text-base md:text-lg leading-relaxed">
              Triple Cities Tech is an IT services company based in Endicott, New York. We
              support small and mid-sized businesses across Binghamton, Endicott, and the
              wider Southern Tier — handling the day-to-day technology so your team can stay
              focused, and planning what comes next.
            </p>
          </div>
        </div>
      </section>

      {/* 3 — Services overview */}
      <section className="bg-black py-10 md:py-14">
        <div className="max-w-5xl mx-auto px-4">
          <h2 className="text-2xl md:text-3xl font-bold text-white mb-2">What we do</h2>
          <p className="text-white/70 text-sm md:text-base mb-6">
            A quick look at where we help.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
            {SERVICES.map((service) => (
              <div
                key={service.title}
                className="bg-white/5 border border-white/10 rounded-xl p-4 md:p-5"
              >
                <h3 className="text-white font-semibold text-base md:text-lg mb-1">
                  {service.title}
                </h3>
                <p className="text-white/80 text-sm md:text-base leading-relaxed">
                  {service.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 4 — Primary CTA: book inline */}
      <section id="book" className="scroll-mt-20 bg-gradient-to-b from-black to-gray-900 py-10 md:py-14">
        <div className="max-w-5xl mx-auto px-4">
          <h2 className="text-2xl md:text-3xl font-bold text-white mb-2">Let&apos;s tech talk</h2>
          <p className="text-white/80 text-sm md:text-base mb-6">
            Pick a time that works for you. We&apos;ll review your current setup and recommend
            what makes sense for your business.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
            <div className="flex items-center gap-3 bg-gray-800/50 border border-gray-700/50 rounded-lg p-4">
              <ClockIcon size={20} className="text-cyan-400 shrink-0" />
              <div>
                <p className="text-white font-medium text-sm">Quick &amp; easy</p>
                <p className="text-gray-400 text-xs">30-minute discovery call</p>
              </div>
            </div>
            <div className="flex items-center gap-3 bg-gray-800/50 border border-gray-700/50 rounded-lg p-4">
              <CheckCircleIcon size={20} className="text-cyan-400 shrink-0" />
              <div>
                <p className="text-white font-medium text-sm">No obligation</p>
                <p className="text-gray-400 text-xs">Free assessment included</p>
              </div>
            </div>
          </div>

          {/* Booking happens inline — the visitor never leaves this page */}
          <CalendlyEmbed loadingClassName="py-20" />
        </div>
      </section>

      {/* 5 — Secondary CTA: send a note */}
      <section className="bg-gradient-to-br from-gray-900 via-black to-cyan-900 py-10 md:py-14">
        <div className="max-w-2xl mx-auto px-4">
          <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-2xl p-5 sm:p-8 shadow-xl">
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-2">
              Not ready for a meeting?
            </h2>
            <p className="text-white/90 text-sm md:text-base mb-6">
              Send us a note instead and we&apos;ll get back to you.
            </p>
            <ContactForm
              showCompany={false}
              messageRows={4}
              messageLabel={"What's on your mind?"}
              messagePlaceholder="A quick note about what you need — or just say hello."
              idPrefix="welcome-"
            />
          </div>
        </div>
      </section>

      {/* 6 — Direct contact fallback */}
      <section className="bg-black py-10 md:py-14">
        <div className="max-w-2xl mx-auto px-4">
          <h2 className="text-2xl md:text-3xl font-bold text-white mb-2">Prefer to reach us directly?</h2>
          <p className="text-white/80 text-sm md:text-base mb-6">
            {CONTACT_INFO.hours}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <a
              href={`tel:${PHONE_TEL}`}
              className="flex items-center gap-4 min-h-[44px] bg-white/5 hover:bg-white/10 border border-white/10 hover:border-cyan-400/50 rounded-xl p-4 transition-colors duration-300"
            >
              <div className="w-11 h-11 bg-gradient-to-br from-cyan-500 to-cyan-600 rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg">
                <PhoneIcon size={22} className="text-white" />
              </div>
              <div className="min-w-0">
                <p className="text-white font-semibold text-sm">Call us</p>
                <p className="text-cyan-300 text-base break-words">{CONTACT_INFO.phone}</p>
              </div>
            </a>
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="flex items-center gap-4 min-h-[44px] bg-white/5 hover:bg-white/10 border border-white/10 hover:border-emerald-400/50 rounded-xl p-4 transition-colors duration-300"
            >
              <div className="w-11 h-11 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg">
                <MailIcon size={22} className="text-white" />
              </div>
              <div className="min-w-0">
                <p className="text-white font-semibold text-sm">Email us</p>
                <p className="text-emerald-300 text-sm break-all">{SUPPORT_EMAIL}</p>
              </div>
            </a>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  )
}
