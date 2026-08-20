'use client'

import Header from '@/components/layout/Header'
import Footer from '@/components/layout/Footer'
import PageHero from '@/components/shared/PageHero'
import ContactForm from '@/components/shared/ContactForm'
import Breadcrumbs from '@/components/seo/Breadcrumbs'
import { Button } from '@/components/ui'
import { CONTACT_INFO } from '@/constants/data'
import { CalendarIcon, ClockIcon, PhoneIcon, MailIcon, GlobeIcon, UsersIcon, ShieldCheckIcon } from '@/components/icons/TechIcons'
import Link from 'next/link'

export default function Contact() {
  return (
    <main>
      <Header />
      <Breadcrumbs />

      <PageHero
        title="Contact Us"
        subtitle="Choose how we can help you today"
        textAlign="center"
        verticalPosition="center"
        imageBackground="/herobg.webp"
        showGradientTransition={false}
        titleClassName="text-3xl sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl"
      />

      {/* Hero Choice Cards - Side by Side on Mobile */}
      <div className="relative bg-gradient-to-br from-black via-gray-900 to-cyan-900 py-8 md:py-16 -mt-8 md:-mt-16">
        <div className="max-w-4xl mx-auto px-4">
          <div className="grid grid-cols-2 gap-3 md:gap-8">

            {/* New Customer / Sales Card */}
            <Link
              href="#sales"
              className="group relative bg-white/10 backdrop-blur-sm border-2 border-cyan-400/50 hover:border-cyan-400 rounded-2xl md:rounded-3xl p-4 md:p-10 shadow-xl transition-all duration-300 hover:scale-105 hover:shadow-2xl hover:shadow-cyan-500/30"
            >
              <div className="text-center">
                <div className="w-12 h-12 md:w-20 md:h-20 mx-auto mb-3 md:mb-6 bg-gradient-to-br from-cyan-500 to-blue-500 rounded-xl md:rounded-2xl flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-300">
                  <UsersIcon size={24} className="md:hidden text-white" />
                  <UsersIcon size={40} className="hidden md:block text-white" />
                </div>
                <h2 className="text-sm md:text-3xl font-bold text-white mb-2 md:mb-4">New to Triple Cities Tech?</h2>
                <p className="hidden md:block text-white/90 text-lg mb-6">
                  Interested in our services? Let's discuss how we can use technology to help your business succeed.
                </p>
                <div className="inline-flex items-center justify-center w-full md:w-auto bg-cyan-500 hover:bg-cyan-400 text-white text-xs md:text-lg font-semibold md:font-bold px-3 md:px-0 py-2 md:py-0 rounded-lg md:rounded-none md:bg-transparent transition-colors">
                  Get in Touch
                  <svg className="hidden md:inline ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                  </svg>
                </div>
              </div>
            </Link>

            {/* Existing Customer / Support Card */}
            <Link
              href="#customer-support"
              className="group relative bg-white/10 backdrop-blur-sm border-2 border-emerald-400/50 hover:border-emerald-400 rounded-2xl md:rounded-3xl p-4 md:p-10 shadow-xl transition-all duration-300 hover:scale-105 hover:shadow-2xl hover:shadow-emerald-500/30"
            >
              <div className="text-center">
                <div className="w-12 h-12 md:w-20 md:h-20 mx-auto mb-3 md:mb-6 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-xl md:rounded-2xl flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-300">
                  <ShieldCheckIcon size={24} className="md:hidden text-white" />
                  <ShieldCheckIcon size={40} className="hidden md:block text-white" />
                </div>
                <h2 className="text-sm md:text-3xl font-bold text-white mb-2 md:mb-4">Existing Customer?</h2>
                <p className="hidden md:block text-white/90 text-lg mb-6">
                  Need support, access your portal, or to make a payment?
                </p>
                <div className="inline-flex items-center justify-center w-full md:w-auto bg-emerald-500 hover:bg-emerald-400 text-white text-xs md:text-lg font-semibold md:font-bold px-3 md:px-0 py-2 md:py-0 rounded-lg md:rounded-none md:bg-transparent transition-colors">
                  Access Support
                  <svg className="hidden md:inline ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                  </svg>
                </div>
              </div>
            </Link>

          </div>
        </div>
      </div>

      {/* Sales Section */}
      <div id="sales" className="scroll-mt-24 relative bg-gradient-to-br from-black via-gray-900 to-cyan-900 py-24">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-4">Let's Talk About Your IT Needs</h2>
            <p className="text-xl text-white/90">Ready to transform your IT experience? We're here to help.</p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">

            {/* Contact Form */}
            <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-3xl p-8 shadow-xl">
              <div className="mb-8">
                <h3 className="text-3xl font-bold text-white mb-4">Send us a message</h3>
                <p className="text-white/90 text-lg">
                  Have a question about our services? Want to discuss your IT needs?
                  We'd love to hear from you.
                </p>
              </div>

              <ContactForm />
            </div>

            {/* Sales Contact Information */}
            <div className="space-y-8">
              <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-3xl p-8 shadow-xl">
                <div className="mb-8">
                  <h3 className="text-3xl font-bold text-white mb-4">Sales Contact Information</h3>
                  <p className="text-white/90 text-lg">
                    Prefer to reach out directly? Here's how you can get in touch with our sales team.
                  </p>
                </div>

                <div className="space-y-6">
                  <div className="flex items-start space-x-4 group">
                    <div className="w-14 h-14 bg-gradient-to-br from-cyan-500 to-cyan-600 rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg group-hover:scale-110 transition-transform duration-300">
                      <PhoneIcon size={24} className="text-white" />
                    </div>
                    <div>
                      <h4 className="text-lg font-bold text-white mb-1">Phone</h4>
                      <a href={`tel:${CONTACT_INFO.phone}`} className="text-cyan-300 hover:text-cyan-200 transition-colors text-base">
                        {CONTACT_INFO.phone}
                      </a>
                    </div>
                  </div>

                  <div className="flex items-start space-x-4 group">
                    <div className="w-14 h-14 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg group-hover:scale-110 transition-transform duration-300">
                      <MailIcon size={24} className="text-white" />
                    </div>
                    <div>
                      <h4 className="text-lg font-bold text-white mb-1">Email</h4>
                      <a href={`mailto:${CONTACT_INFO.email}`} className="text-purple-300 hover:text-purple-200 transition-colors text-base">
                        {CONTACT_INFO.email}
                      </a>
                    </div>
                  </div>

                  <div className="flex items-start space-x-4 group">
                    <div className="w-14 h-14 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg group-hover:scale-110 transition-transform duration-300">
                      <GlobeIcon size={24} className="text-white" />
                    </div>
                    <div>
                      <h4 className="text-lg font-bold text-white mb-1">Address</h4>
                      <p className="text-white/90 text-base">{CONTACT_INFO.address}</p>
                    </div>
                  </div>

                  <div className="flex items-start space-x-4 group">
                    <div className="w-14 h-14 bg-gradient-to-br from-rose-500 to-red-500 rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg group-hover:scale-110 transition-transform duration-300">
                      <ClockIcon size={24} className="text-white" />
                    </div>
                    <div>
                      <h4 className="text-lg font-bold text-white mb-1">Business Hours</h4>
                      <p className="text-white/90 text-base">{CONTACT_INFO.hours}</p>
                    </div>
                  </div>

                  <div className="flex items-start space-x-4 group">
                    <div className="w-14 h-14 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg group-hover:scale-110 transition-transform duration-300">
                      <CalendarIcon size={24} className="text-white" />
                    </div>
                    <div>
                      <h4 className="text-lg font-bold text-white mb-1">Schedule a Sales Meeting</h4>
                      <p className="text-white/90 text-sm mb-2">Book a free consultation to discuss your IT needs</p>
                      <a
                        href="/schedule"
                        className="inline-flex items-center text-indigo-300 hover:text-indigo-200 transition-colors text-base font-semibold"
                      >
                        Schedule Now
                        <svg className="ml-1.5 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                        </svg>
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Customer Support Section */}
      <div id="customer-support" className="scroll-mt-24 relative bg-gradient-to-br from-gray-900 via-black to-emerald-900 py-24">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-4">Customer Support</h2>
            <p className="text-xl text-white/90">We're here to help our valued clients succeed</p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

            {/* Support Contact Info */}
            <div className="bg-white/10 backdrop-blur-sm border border-emerald-400/30 rounded-3xl p-8 shadow-xl">
              <h3 className="text-2xl font-bold text-white mb-6">Get Support</h3>

              <div className="space-y-6">
                <Link href="/livechat" className="flex items-start justify-start space-x-4 group">
                  <div className="w-14 h-14 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg group-hover:scale-110 transition-transform duration-300">
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                  </div>
                  <div>
                    <h4 className="text-lg font-bold text-white mb-1 group-hover:text-purple-300 transition-colors duration-300">Live Chat Support</h4>
                    <p className="text-purple-300 group-hover:text-purple-200 transition-colors text-base">
                      Chat with us in real-time
                    </p>
                  </div>
                </Link>

                <div className="flex items-start space-x-4 group">
                  <div className="w-14 h-14 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg group-hover:scale-110 transition-transform duration-300">
                    <MailIcon size={24} className="text-white" />
                  </div>
                  <div>
                    <h4 className="text-lg font-bold text-white mb-1">Email Support</h4>
                    <a href="mailto:support@triplecitiestech.com" className="text-emerald-300 hover:text-emerald-200 transition-colors text-base">
                      support@triplecitiestech.com
                    </a>
                  </div>
                </div>

                <div className="flex items-start space-x-4 group">
                  <div className="w-14 h-14 bg-gradient-to-br from-cyan-500 to-blue-500 rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg group-hover:scale-110 transition-transform duration-300">
                    <PhoneIcon size={24} className="text-white" />
                  </div>
                  <div>
                    <h4 className="text-lg font-bold text-white mb-1">Phone Support</h4>
                    <a href={`tel:${CONTACT_INFO.phone}`} className="text-cyan-300 hover:text-cyan-200 transition-colors text-base block">
                      {CONTACT_INFO.phone}
                    </a>
                  </div>
                </div>
              </div>
            </div>

            {/* Client Portals */}
            <div className="bg-white/10 backdrop-blur-sm border border-emerald-400/30 rounded-3xl p-8 shadow-xl">
              <h3 className="text-2xl font-bold text-white mb-6">Client Portals</h3>

              <div className="space-y-6">
                <Link
                  href="/portal"
                  className="flex items-start justify-start space-x-4 group"
                >
                  <div className="w-14 h-14 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg group-hover:scale-110 transition-transform duration-300">
                    <GlobeIcon size={24} className="text-white" />
                  </div>
                  <div>
                    <h4 className="text-lg font-bold text-white mb-1 group-hover:text-indigo-300 transition-colors duration-300">Support Portal</h4>
                    <p className="text-white/90 text-sm group-hover:text-white transition-colors duration-300">Create and review tickets, documentation, training resources, and more.</p>
                  </div>
                </Link>

                <a
                  href="https://triplecitiestech.connectboosterportal.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-start justify-start space-x-4 group"
                >
                  <div className="w-14 h-14 bg-gradient-to-br from-rose-500 to-red-500 rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg group-hover:scale-110 transition-transform duration-300">
                    <GlobeIcon size={24} className="text-white" />
                  </div>
                  <div>
                    <h4 className="text-lg font-bold text-white mb-1 group-hover:text-rose-300 transition-colors duration-300">Payment Portal</h4>
                    <p className="text-white/90 text-sm group-hover:text-white transition-colors duration-300">View invoices and make payments securely</p>
                  </div>
                </a>
              </div>
            </div>

          </div>

          {/* Emergency Support Card */}
          <div className="mt-8 bg-gradient-to-br from-emerald-600 to-teal-700 rounded-3xl p-8 md:p-12 shadow-xl border border-emerald-400/30">
            <div className="text-center md:text-left md:flex md:items-center md:justify-between">
              <div className="mb-6 md:mb-0">
                <h3 className="text-2xl md:text-3xl font-bold text-white mb-3">Need Immediate Assistance?</h3>
                <p className="text-white/90 text-base md:text-lg">
                  {CONTACT_INFO.emergencySupport}
                </p>
              </div>
              <Button
                asChild
                className="bg-white hover:bg-gray-100 text-emerald-700 font-bold px-8 py-4 rounded-xl transition-all duration-300 hover:scale-105 shadow-lg text-lg whitespace-nowrap"
              >
                <a href={`tel:${CONTACT_INFO.phone}`}>
                  Call {CONTACT_INFO.phone}
                </a>
              </Button>
            </div>
          </div>
        </div>
      </div>

      <Footer />
    </main>
  )
}
