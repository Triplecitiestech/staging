'use client'

import Header from '@/components/layout/Header'
import Footer from '@/components/layout/Footer'
import Link from 'next/link'
import { CONTACT_INFO } from '@/constants/data'
import PageHero from '@/components/shared/PageHero'

import {
  BuildingIcon,
  ShieldCheckIcon,
  LayersIcon,
  HandshakeIcon,
  TargetIcon,
  BookOpenIcon,
  UsersIcon,
  PhoneIcon,
  MailIcon,
  GlobeIcon
} from '@/components/icons/TechIcons'

export default function About() {

  const values = [
    {
      icon: <BuildingIcon size={24} className="text-white" />,
      title: 'Built for Small Business',
      description: 'We specialize in helping 20–50 person teams grow with technology that fits their size, budget, and goals.',
      gradient: 'from-blue-500 to-cyan-500'
    },
    {
      icon: <ShieldCheckIcon size={24} className="text-white" />,
      title: 'Security Without Headaches',
      description: 'We deliver strong cybersecurity and compliance solutions that don\'t slow you down or bury you in jargon.',
      gradient: 'from-purple-500 to-pink-500'
    },
    {
      icon: <LayersIcon size={24} className="text-white" />,
      title: 'Automation with Purpose',
      description: 'From onboarding to monitoring, our automated processes reduce errors, increase speed, and give you peace of mind.',
      gradient: 'from-emerald-500 to-teal-500'
    },
    {
      icon: <HandshakeIcon size={24} className="text-white" />,
      title: 'Partnership, Not Just Support',
      description: 'We don\'t just fix problems — we prevent them. We provide strategic guidance that aligns technology with your long-term vision.',
      gradient: 'from-orange-500 to-red-500'
    },
    {
      icon: <TargetIcon size={24} className="text-white" />,
      title: 'Trust, Impact, and the Ride',
      description: 'Our values are simple: Earn trust. Be impactful. Enjoy the ride. These guide every client interaction and decision we make.',
      gradient: 'from-indigo-500 to-purple-500'
    }
  ]

  const clients = [
    'Construction firms that need rugged, mobile-ready IT support',
    'Healthcare providers looking for HIPAA-compliant solutions',
    'Manufacturers requiring stable, secure infrastructure',
    'Professional service firms needing efficient, secure workflows'
  ]

  return (
    <main>
      <Header />

      <PageHero
        title="About Us"
        subtitle="At Triple Cities Tech, we believe small and mid-sized businesses deserve enterprise-grade IT without the complexity, cost, or frustration. We were founded on a simple idea: that technology should serve your business — not the other way around."
        textAlign="center"
        verticalPosition="bottom"
        imageBackground="/herobg.webp"
      />

      {/* Our Story */}
      <div className="relative bg-gradient-to-br from-black via-gray-900 to-cyan-900 py-24">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">Our Story</h2>
              <div className="space-y-4 text-lg leading-relaxed">
                <p className="text-white/90">
                  After years of working in larger MSPs, our founder saw a pattern: clients were being
                  sold one-size-fits-all solutions that didn't fit their needs. Systems were overcomplicated,
                  outdated, or slow to implement. There had to be a better way.
                </p>
                <p className="text-white/90">
                  In 2017, Triple Cities Tech was created to provide agile, right-sized, and modern IT
                  solutions for companies that want to work smarter — not harder — with their technology.
                </p>
                <p className="text-white/90">
                  Today, we help businesses in construction, healthcare, manufacturing, and professional
                  services gain clarity, stability, and performance from their IT.
                </p>
              </div>
            </div>
            <div className="relative">
              <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-3xl p-8 shadow-xl">
                <div className="text-center">
                  <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-2xl flex items-center justify-center mb-4 mx-auto shadow-lg">
                    <BookOpenIcon size={32} className="text-white" />
                  </div>
                  <h3 className="text-2xl font-bold text-white mb-3">Founded in 2017</h3>
                  <p className="text-white/90 leading-relaxed">
                    Born from the frustration of seeing businesses struggle with oversized,
                    overcomplicated IT solutions that didn't fit their needs.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* What We Stand For */}
      <div className="relative bg-gradient-to-br from-cyan-900 via-gray-900 to-black py-24">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
              What We Stand For
            </h2>
            <p className="text-xl text-white/90 max-w-3xl mx-auto leading-relaxed">
              Our core principles guide everything we do, from client interactions to technology decisions.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8 max-w-7xl mx-auto">
            {/* First 3 cards in top row */}
            {values.slice(0, 3).map((value, index) => (
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

          {/* Second row with 2 cards centered */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 max-w-4xl mx-auto mt-8">
            {values.slice(3, 5).map((value, index) => (
              <div key={index + 3} className="group">
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

      {/* Who We Serve */}
      <div className="relative bg-gradient-to-br from-black via-gray-900 to-cyan-900 py-24">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div className="relative order-2 lg:order-1">
              <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-3xl p-12 shadow-xl">
                <div className="text-center">
                  <div className="w-24 h-24 bg-gradient-to-br from-purple-500 to-pink-500 rounded-2xl flex items-center justify-center mb-6 mx-auto shadow-lg">
                    <UsersIcon size={36} className="text-white" />
                  </div>
                  <h3 className="text-2xl font-bold text-white mb-4">Our Clients</h3>
                  <p className="text-white/90 leading-relaxed">
                    Growing businesses ready to upgrade their IT experience and gain a competitive advantage.
                  </p>
                </div>
              </div>
            </div>
            <div className="order-1 lg:order-2">
              <h2 className="text-4xl md:text-5xl font-bold text-white mb-8">Who We Serve</h2>
              <p className="text-lg text-white/90 mb-8 leading-relaxed">
                Our clients include businesses across multiple industries, each with unique IT challenges
                and growth opportunities.
              </p>
              <ul className="space-y-4">
                {clients.map((client, index) => (
                  <li key={index} className="flex items-start group">
                    <div className="w-6 h-6 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-full flex items-center justify-center mr-4 mt-0.5 group-hover:scale-110 transition-transform duration-300">
                      <span className="text-white text-sm font-bold">✓</span>
                    </div>
                    <span className="text-white/90 leading-relaxed group-hover:text-cyan-200 transition-colors duration-300">
                      {client}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="text-lg text-white/90 mt-8 leading-relaxed">
                If you're a growing business ready to upgrade your IT experience, we're here to help.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Contact Section */}
      <div className="relative bg-gradient-to-br from-cyan-900 via-gray-900 to-black py-24">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center">
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-12">Based in Central New York</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8 max-w-4xl mx-auto">
              <div className="group">
                <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-3xl p-8 shadow-xl hover:shadow-2xl transition-all duration-500 hover:scale-105">
                  <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-xl flex items-center justify-center mb-4 mx-auto group-hover:scale-110 transition-transform duration-300">
                    <PhoneIcon size={24} className="text-white" />
                  </div>
                  <p className="font-semibold mb-2 text-white">Phone</p>
                  <a href={`tel:${CONTACT_INFO.phone}`} className="text-cyan-300 hover:text-cyan-200 transition-colors duration-300 text-lg">
                    {CONTACT_INFO.phone}
                  </a>
                </div>
              </div>
              <div className="group">
                <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-3xl p-8 shadow-xl hover:shadow-2xl transition-all duration-500 hover:scale-105">
                  <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl flex items-center justify-center mb-4 mx-auto group-hover:scale-110 transition-transform duration-300">
                    <MailIcon size={24} className="text-white" />
                  </div>
                  <p className="font-semibold mb-2 text-white">Email</p>
                  <a href={`mailto:${CONTACT_INFO.email}`} className="text-purple-300 hover:text-purple-200 transition-colors duration-300 text-lg break-all">
                    {CONTACT_INFO.email}
                  </a>
                </div>
              </div>
              <div className="group">
                <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-3xl p-8 shadow-xl hover:shadow-2xl transition-all duration-500 hover:scale-105">
                  <div className="w-16 h-16 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-xl flex items-center justify-center mb-4 mx-auto group-hover:scale-110 transition-transform duration-300">
                    <GlobeIcon size={24} className="text-white" />
                  </div>
                  <p className="font-semibold mb-2 text-white">Address</p>
                  <p className="text-white/90 text-base">{CONTACT_INFO.address}</p>
                </div>
              </div>
            </div>
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
        <div className="relative z-10 text-center max-w-4xl mx-auto px-6">
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-8">
            Let's Build Something Smarter, Together
          </h2>
          <p className="text-xl text-white mb-12 max-w-3xl mx-auto leading-relaxed">
            Ready to transform your IT experience? Let's discuss how we can help your business
            gain clarity, stability, and performance from technology.
          </p>
          <Link
            href="/contact"
            className="group relative bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-400 hover:to-cyan-500 text-white px-12 py-4 rounded-full font-semibold text-lg shadow-lg hover:shadow-cyan-500/25 hover:scale-105 transition-all duration-300 inline-flex items-center space-x-3"
          >
            <span>Schedule Meeting</span>
            <div className="w-2 h-2 bg-white rounded-full"></div>
          </Link>
        </div>
      </div>

      <Footer />
    </main>
  )
}
