'use client'

import Header from '@/components/layout/Header'
import Footer from '@/components/layout/Footer'
import Link from 'next/link'
import { CONTACT_INFO } from '@/constants/data'
import PageHero from '@/components/shared/PageHero'
import Breadcrumbs from '@/components/seo/Breadcrumbs'

import {
  BuildingIcon,
  ShieldCheckIcon,
  LayersIcon,
  HandshakeIcon,
  TargetIcon,
  BookOpenIcon,
  PhoneIcon,
  MailIcon,
  CalendarIcon,
  GlobeIcon
} from '@/components/icons/TechIcons'

export default function About() {

  const values = [
    {
      icon: <BuildingIcon size={24} className="text-white" />,
      title: 'Technology Built for Small Business',
      description: 'We specialize in supporting teams of 20–50 users with IT solutions designed for their size, budget, and growth plans. On many occasions, we\'ve enabled businesses to free themselves of local constraints, work and hire remotely, streamline communication, and include best-in-class security and business continuity — without compromise.',
      gradient: 'from-blue-500 to-cyan-500'
    },
    {
      icon: <ShieldCheckIcon size={24} className="text-white" />,
      title: 'Security That Works in the Real World',
      description: 'We implement strong cybersecurity and compliance practices without slowing your team down or burying you in technical jargon.',
      gradient: 'from-purple-500 to-pink-500'
    },
    {
      icon: <LayersIcon size={24} className="text-white" />,
      title: 'Automation with Intent',
      description: 'From onboarding to monitoring, our processes are designed to reduce errors, increase speed, and eliminate avoidable disruptions.',
      gradient: 'from-emerald-500 to-teal-500'
    },
    {
      icon: <HandshakeIcon size={24} className="text-white" />,
      title: 'Partnership Over Break-Fix',
      description: 'We don\'t just react to problems — we work proactively to prevent them and align your technology with long-term business goals.',
      gradient: 'from-orange-500 to-red-500'
    }
  ]

  return (
    <main>
      <Header />
      <Breadcrumbs />

      <PageHero
        title="About Us"
        subtitle="At Triple Cities Tech, we help small and mid-sized businesses run IT that actually works — without unnecessary complexity, bloated costs, or constant fire drills. We believe technology should support your business goals, not slow you down or get in the way."
        textAlign="center"
        verticalPosition="bottom"
        imageBackground="/herobg.webp"
      />

      {/* Why We Created Triple Cities Tech */}
      <div className="relative bg-gradient-to-br from-cyan-900 via-gray-900 to-black py-24">
        <div className="max-w-4xl mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">Why We Created Triple Cities Tech</h2>
          </div>
          <div className="space-y-6 text-lg leading-relaxed text-white/90">
            <p>
              Founded by Kurtis Florance, who brings more than two decades of IT experience, Triple Cities Tech was built to solve problems he witnessed repeatedly throughout his career at larger managed service providers.
            </p>
            <p>
              Time and again, he saw businesses being pushed into the wrong solutions: Frankenstein systems with no central management or reporting, expensive on-premises infrastructure that didn't scale, and improper timing and implementation of cloud migrations. Companies were paying for complexity they didn't need and couldn't manage effectively.
            </p>
            <p>
              In 2017, Kurtis set out to do things differently — to curate proper solutions tailored to each business, implement modern IT that's right-sized and manageable, and build long-term partnerships based on trust and results.
            </p>
            <p className="text-xl font-semibold text-cyan-400">
              Today, Triple Cities Tech supports 250+ satisfied businesses nationwide across construction, healthcare, manufacturing, and professional services — proving that IT can be secure, reliable, scalable, and straightforward.
            </p>
          </div>
        </div>
      </div>

      {/* What We Do */}
      <div className="relative bg-gradient-to-br from-black via-gray-900 to-cyan-900 py-24">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
              What We Do
            </h2>
            <p className="text-xl text-white/90 max-w-3xl mx-auto leading-relaxed">
              Our core principles guide everything we do, from client interactions to technology decisions.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 max-w-5xl mx-auto">
            {values.map((value, index) => (
              <div key={index} className="group">
                <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-3xl p-8 shadow-xl hover:shadow-2xl transition-all duration-500 hover:scale-105 h-full">
                  <div className="text-center">
                    <div className={`w-16 h-16 bg-gradient-to-br ${value.gradient} rounded-2xl flex items-center justify-center mb-6 mx-auto shadow-lg group-hover:scale-110 transition-transform duration-300`}>
                      {value.icon}
                    </div>
                    <h3 className="text-xl font-bold text-white mb-4 group-hover:text-cyan-200 transition-colors duration-300">
                      {value.title}
                    </h3>
                    <p className="text-white/90 leading-relaxed">
                      {value.description}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Expertise & Partnerships */}
      <div className="relative bg-gradient-to-br from-cyan-900 via-gray-900 to-black py-24">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
              Expertise & Partnerships
            </h2>
            <p className="text-xl text-white/90 max-w-3xl mx-auto leading-relaxed">
              Our team holds industry-leading certifications and partners with top technology vendors to deliver best-in-class solutions.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 lg:gap-12 max-w-7xl mx-auto">
            {/* Certifications */}
            <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-3xl p-8 shadow-xl">
              <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-2xl flex items-center justify-center mb-6 mx-auto shadow-lg">
                <ShieldCheckIcon size={32} className="text-white" />
              </div>
              <h3 className="text-2xl font-bold text-white mb-4 text-center">Team Certifications</h3>
              <div className="space-y-3 text-white/90 max-w-md mx-auto">
                <p className="flex items-start">
                  <span className="w-2 h-2 bg-cyan-400 rounded-full mr-3 mt-2 flex-shrink-0"></span>
                  <span>Certified Information Systems Security Professional (CISSP)</span>
                </p>
                <p className="flex items-start">
                  <span className="w-2 h-2 bg-cyan-400 rounded-full mr-3 mt-2 flex-shrink-0"></span>
                  <span>CompTIA A+ Certified</span>
                </p>
                <p className="flex items-start">
                  <span className="w-2 h-2 bg-cyan-400 rounded-full mr-3 mt-2 flex-shrink-0"></span>
                  <span>CompTIA Security+ Certified</span>
                </p>
                <p className="flex items-start">
                  <span className="w-2 h-2 bg-cyan-400 rounded-full mr-3 mt-2 flex-shrink-0"></span>
                  <span>CompTIA Network+ Certified</span>
                </p>
                <p className="flex items-start">
                  <span className="w-2 h-2 bg-cyan-400 rounded-full mr-3 mt-2 flex-shrink-0"></span>
                  <span>Vendor-Specific Certifications (Dell, HP, Lenovo, Kaseya, Microsoft)</span>
                </p>
              </div>
            </div>

            {/* Partnerships */}
            <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-3xl p-8 shadow-xl">
              <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-pink-500 rounded-2xl flex items-center justify-center mb-6 mx-auto shadow-lg">
                <HandshakeIcon size={32} className="text-white" />
              </div>
              <h3 className="text-2xl font-bold text-white mb-4 text-center">Technology Partners</h3>
              <div className="space-y-3 text-white/90 max-w-md mx-auto">
                <p className="flex items-start">
                  <span className="w-2 h-2 bg-purple-400 rounded-full mr-3 mt-2 flex-shrink-0"></span>
                  <span>Microsoft Partner</span>
                </p>
                <p className="flex items-start">
                  <span className="w-2 h-2 bg-purple-400 rounded-full mr-3 mt-2 flex-shrink-0"></span>
                  <span>Dell Technologies Partner</span>
                </p>
                <p className="flex items-start">
                  <span className="w-2 h-2 bg-purple-400 rounded-full mr-3 mt-2 flex-shrink-0"></span>
                  <span>HP Partner</span>
                </p>
                <p className="flex items-start">
                  <span className="w-2 h-2 bg-purple-400 rounded-full mr-3 mt-2 flex-shrink-0"></span>
                  <span>Lenovo Partner</span>
                </p>
                <p className="flex items-start">
                  <span className="w-2 h-2 bg-purple-400 rounded-full mr-3 mt-2 flex-shrink-0"></span>
                  <span>Kaseya Partner</span>
                </p>
              </div>
            </div>

            {/* Compliance & Frameworks */}
            <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-3xl p-8 shadow-xl">
              <div className="w-16 h-16 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-2xl flex items-center justify-center mb-6 mx-auto shadow-lg">
                <TargetIcon size={32} className="text-white" />
              </div>
              <h3 className="text-2xl font-bold text-white mb-4 text-center">Compliance & Frameworks</h3>
              <div className="space-y-3 text-white/90 max-w-md mx-auto">
                <p className="flex items-start">
                  <span className="w-2 h-2 bg-emerald-400 rounded-full mr-3 mt-2 flex-shrink-0"></span>
                  <span>CIS Controls v8</span>
                </p>
                <p className="flex items-start">
                  <span className="w-2 h-2 bg-emerald-400 rounded-full mr-3 mt-2 flex-shrink-0"></span>
                  <span>NIST Cybersecurity Framework</span>
                </p>
                <p className="flex items-start">
                  <span className="w-2 h-2 bg-emerald-400 rounded-full mr-3 mt-2 flex-shrink-0"></span>
                  <span>CMMC Compliance</span>
                </p>
                <p className="flex items-start">
                  <span className="w-2 h-2 bg-emerald-400 rounded-full mr-3 mt-2 flex-shrink-0"></span>
                  <span>HIPAA & ITAR Standards</span>
                </p>
                <p className="flex items-start">
                  <span className="w-2 h-2 bg-emerald-400 rounded-full mr-3 mt-2 flex-shrink-0"></span>
                  <span>ITIL Best Practices</span>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Our Motto */}
      <div className="relative bg-gradient-to-br from-black via-gray-900 to-cyan-900 py-16">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center">
            <p className="text-sm md:text-base text-cyan-400 font-semibold tracking-wider uppercase mb-3">
              Our Motto
            </p>
            <p className="text-3xl md:text-4xl lg:text-5xl text-white font-bold">
              Earn trust. Be impactful. Enjoy the ride.
            </p>
          </div>
        </div>
      </div>

      {/* CTA Section */}
      <div className="relative bg-black py-32">
        {/* Subtle background elements */}
        <div className="absolute inset-0">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-cyan-500/5 rounded-full blur-3xl"></div>
          <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-blue-500/5 rounded-full blur-3xl"></div>
        </div>

        {/* Content */}
        <div className="relative z-10 text-center max-w-6xl mx-auto px-6">
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
            Let's Talk Technology
          </h2>
          <p className="text-xl text-white mb-12 max-w-3xl mx-auto leading-relaxed">
            Let's discuss how we can help your business
            gain clarity, stability, and ROI from technology.
          </p>

          {/* Engagement Options */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8 max-w-5xl mx-auto">
            {/* Contact Form */}
            <div className="group">
              <div className="relative bg-white/10 backdrop-blur-sm border border-white/20 rounded-2xl md:rounded-3xl p-6 md:p-8 hover:border-white/30 transition-all duration-500 hover:scale-[1.02] hover:shadow-2xl hover:shadow-cyan-500/20 h-full flex flex-col">
                <div className="w-16 h-16 md:w-20 md:h-20 rounded-2xl bg-gradient-to-r from-cyan-500 to-cyan-600 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-300 mx-auto mb-6">
                  <MailIcon size={28} className="text-white" />
                </div>

                <div className="text-center mb-6 flex-grow">
                  <h4 className="text-xl md:text-2xl font-bold text-white mb-3 group-hover:text-cyan-200 transition-colors duration-300">
                    Have us reach out to you
                  </h4>
                  <p className="text-white/90 text-sm md:text-base leading-relaxed">
                    Fill out our contact form and one of our experts will reach out promptly.
                  </p>
                </div>

                <div>
                  <Link
                    href="/contact"
                    className="inline-flex items-center justify-center w-full text-center bg-gradient-to-r from-cyan-500 to-cyan-600 hover:opacity-90 text-white font-bold px-4 py-3 md:px-6 md:py-4 rounded-xl transition-all duration-300 hover:scale-105 shadow-lg"
                  >
                    Contact Us
                    <svg className="ml-2 w-4 h-4 transition-transform duration-300 group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                    </svg>
                  </Link>
                </div>
              </div>
            </div>

            {/* Schedule Meeting */}
            <div className="group">
              <div className="relative bg-white/10 backdrop-blur-sm border border-white/20 rounded-2xl md:rounded-3xl p-6 md:p-8 hover:border-white/30 transition-all duration-500 hover:scale-[1.02] hover:shadow-2xl hover:shadow-purple-500/20 h-full flex flex-col">
                <div className="w-16 h-16 md:w-20 md:h-20 rounded-2xl bg-gradient-to-r from-purple-500 to-purple-600 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-300 mx-auto mb-6">
                  <CalendarIcon size={28} className="text-white" />
                </div>

                <div className="text-center mb-6 flex-grow">
                  <h4 className="text-xl md:text-2xl font-bold text-white mb-3 group-hover:text-purple-200 transition-colors duration-300">
                    Schedule a Meeting
                  </h4>
                  <p className="text-white/90 text-sm md:text-base leading-relaxed">
                    Book a free consultation with our IT experts to discuss your needs.
                  </p>
                </div>

                <div>
                  <a
                    href="https://calendly.com/kurtis-tct"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center w-full text-center bg-gradient-to-r from-purple-500 to-purple-600 hover:opacity-90 text-white font-bold px-4 py-3 md:px-6 md:py-4 rounded-xl transition-all duration-300 hover:scale-105 shadow-lg"
                  >
                    Schedule Now
                    <svg className="ml-2 w-4 h-4 transition-transform duration-300 group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                    </svg>
                  </a>
                </div>
              </div>
            </div>

            {/* Call Directly */}
            <div className="group">
              <div className="relative bg-white/10 backdrop-blur-sm border border-white/20 rounded-2xl md:rounded-3xl p-6 md:p-8 hover:border-white/30 transition-all duration-500 hover:scale-[1.02] hover:shadow-2xl hover:shadow-orange-500/20 h-full flex flex-col">
                <div className="w-16 h-16 md:w-20 md:h-20 rounded-2xl bg-gradient-to-r from-orange-500 to-orange-600 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-300 mx-auto mb-6">
                  <PhoneIcon size={28} className="text-white" />
                </div>

                <div className="text-center mb-6 flex-grow">
                  <h4 className="text-xl md:text-2xl font-bold text-white mb-3 group-hover:text-orange-200 transition-colors duration-300">
                    Call Us Directly
                  </h4>
                  <p className="text-white/90 text-sm md:text-base leading-relaxed">
                    Call and speak with our sales team today.
                  </p>
                </div>

                <div>
                  <a
                    href={`tel:${CONTACT_INFO.phone}`}
                    className="inline-flex items-center justify-center w-full text-center bg-gradient-to-r from-orange-500 to-orange-600 hover:opacity-90 text-white font-bold px-4 py-3 md:px-6 md:py-4 rounded-xl transition-all duration-300 hover:scale-105 shadow-lg text-lg md:text-xl"
                  >
                    {CONTACT_INFO.phone}
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <Footer />
    </main>
  )
}
