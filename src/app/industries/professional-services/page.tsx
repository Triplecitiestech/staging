'use client'

import Header from '@/components/layout/Header'
import Footer from '@/components/layout/Footer'
import Breadcrumbs from '@/components/seo/Breadcrumbs'
import { CheckCircleIcon, ShieldCheckIcon, ClockIcon, PhoneIcon, CalendarIcon } from '@/components/icons/TechIcons'
import Link from 'next/link'
import { CONTACT_INFO } from '@/constants/data'
import Script from 'next/script'

export default function ProfessionalServicesIT() {
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    'serviceType': 'Professional Services IT',
    'provider': {
      '@type': 'LocalBusiness',
      'name': 'Triple Cities Tech',
      'image': 'https://www.triplecitiestech.com/logo/tctlogo.webp',
      'telephone': CONTACT_INFO.phone,
      'email': CONTACT_INFO.email,
      'address': {
        '@type': 'PostalAddress',
        'addressRegion': 'NY',
        'addressLocality': 'Central New York'
      },
      'areaServed': {
        '@type': 'State',
        'name': 'New York'
      },
      'priceRange': '$$'
    },
    'description': 'Managed IT services for law firms, accounting practices, and professional service firms in Central New York. Client data protection, compliance, and practice management support.',
    'category': 'Professional Services IT',
    'offers': {
      '@type': 'Offer',
      'availability': 'https://schema.org/InStock',
      'availableAtOrFrom': {
        '@type': 'Place',
        'name': 'Central New York'
      }
    }
  }
  const painPoints = [
    'Client data confidentiality is non-negotiable',
    'Practice management systems need constant support',
    'Compliance requirements vary by industry',
    'Document security and retention is complex',
    'Remote work creates security challenges',
    'Technology can\'t keep up with client demands'
  ]

  const solutions = [
    {
      title: 'Client Data Protection',
      description: 'Multi-layered security to protect confidential client information. Encryption, access controls, audit trails, and secure file sharing that meets professional ethics requirements.',
      icon: ShieldCheckIcon
    },
    {
      title: 'Practice Management Support',
      description: 'Expert support for industry-specific platforms like Clio, TimeSolv, QuickBooks, CCH, Drake, Thomson Reuters, and other professional software. Integration with Office 365 and document systems.',
      icon: CheckCircleIcon
    },
    {
      title: 'Industry Compliance',
      description: 'Meet compliance requirements for your profession including SOC 2, legal ethics rules, CPA confidentiality standards, and financial services regulations.',
      icon: ShieldCheckIcon
    },
    {
      title: 'Secure Document Management',
      description: 'Enterprise document management with version control, retention policies, and secure client access. Integration with practice management and billing systems.',
      icon: ClockIcon
    },
    {
      title: 'Remote Work Enablement',
      description: 'Secure access to practice systems from anywhere. VPN, multi-factor authentication, and mobile device management for hybrid and remote teams.',
      icon: CheckCircleIcon
    },
    {
      title: 'Client Communication Security',
      description: 'Encrypted email, secure client portals, and compliant video conferencing. Maintain confidentiality across all client communications.',
      icon: ShieldCheckIcon
    }
  ]

  const benefits = [
    'Protect client confidentiality and trust',
    'Meet professional ethics and compliance requirements',
    'Enable secure remote and hybrid work',
    'Streamline practice operations and billing',
    'Reduce technology stress for professionals',
    'Scale IT as your practice grows'
  ]

  const faqs = [
    {
      question: 'Do you understand our compliance requirements?',
      answer: 'Yes. We work with law firms, accounting practices, financial advisors, and consulting firms. We understand profession-specific requirements including attorney-client privilege, CPA confidentiality, SOC 2 compliance, and financial services regulations.'
    },
    {
      question: 'Which practice management systems do you support?',
      answer: 'We support all major platforms including Clio, MyCase, PracticePanther, TimeSolv, QuickBooks, CCH, Drake, Thomson Reuters, and custom solutions. We ensure seamless integration with document management and billing systems.'
    },
    {
      question: 'Can you help with document security?',
      answer: 'Absolutely. We implement enterprise document management with encryption, access controls, version history, and automated retention policies. Secure sharing with clients while maintaining confidentiality and audit trails.'
    },
    {
      question: 'How do you handle remote work security?',
      answer: 'We provide secure remote access with VPN, multi-factor authentication, encrypted devices, and monitoring. Your team can work from anywhere while maintaining the same security standards as in the office.'
    },
    {
      question: 'What about client communication security?',
      answer: 'We implement encrypted email, secure client portals, compliant video conferencing, and secure file sharing. All client communications are protected and meet professional ethics requirements.'
    },
    {
      question: 'Can you work with our existing IT staff?',
      answer: 'Yes. We offer co-managed IT services where we augment your existing IT team with specialized expertise, enterprise tools, and additional capacity. We can handle everything or just specific areas where you need support.'
    }
  ]

  return (
    <main>
      <Script
        id="professional-services-schema"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <Header />
      <Breadcrumbs />

      {/* Hero */}
      <section className="relative min-h-[500px] flex items-center justify-center overflow-hidden bg-gradient-to-br from-gray-900 via-black to-purple-900">
        {/* Elegant diagonal waves */}
        <div className="absolute inset-0 opacity-15">
          <svg className="absolute inset-0 w-full h-full" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="diagonal-waves" x="0" y="0" width="100" height="100" patternUnits="userSpaceOnUse">
                <path d="M0,50 Q25,30 50,50 T100,50" stroke="#a855f7" strokeWidth="2" fill="none" />
                <path d="M0,70 Q25,50 50,70 T100,70" stroke="#d946ef" strokeWidth="2" fill="none" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#diagonal-waves)" />
          </svg>
        </div>

        {/* Professional geometric accents */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-24 right-20 w-40 h-40 border-2 border-purple-500 rounded-lg transform rotate-12"></div>
          <div className="absolute bottom-32 left-24 w-32 h-32 border-2 border-pink-500 rounded-lg transform -rotate-12"></div>
          <div className="absolute top-1/2 left-1/2 w-24 h-24 border-2 border-purple-400 rounded-full"></div>
        </div>

        {/* Subtle dot pattern */}
        <div className="absolute inset-0 opacity-5" style={{
          backgroundImage: 'radial-gradient(circle, #a855f7 1px, transparent 1px)',
          backgroundSize: '30px 30px'
        }}></div>

        <div className="relative z-10 max-w-5xl mx-auto px-6 py-20 text-center">
          <h1 className="text-5xl md:text-6xl font-bold text-white mb-6">
            Professional Services IT
          </h1>
          <p className="text-xl md:text-2xl text-white/90 max-w-4xl mx-auto">
            Managed IT services for law firms, accounting practices, and professional service firms in Central New York
          </p>
        </div>
      </section>

      <section className="relative bg-gradient-to-br from-gray-900 via-black to-purple-900 py-20">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">Professional Services IT Challenges We Solve</h2>
            <p className="text-xl text-white/90 max-w-3xl mx-auto">Professional firms face unique technology demands. Here's what we hear:</p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
            {painPoints.map((point, index) => (
              <div key={index} className="bg-white/10 backdrop-blur-sm border border-purple-500/30 rounded-xl p-6 hover:bg-white/15 transition-all">
                <p className="text-white/90 text-lg">{point}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="relative bg-gradient-to-br from-black via-gray-900 to-pink-900 py-20">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">Our Professional Services IT Solutions</h2>
            <p className="text-xl text-white/90 max-w-3xl mx-auto">Technology built for client confidentiality and professional excellence</p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {solutions.map((solution, index) => (
              <div key={index} className="bg-white/10 backdrop-blur-sm border border-pink-500/30 rounded-2xl p-8 hover:border-pink-500 transition-all group">
                <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <solution.icon size={32} className="text-white" />
                </div>
                <h3 className="text-2xl font-bold text-white mb-4">{solution.title}</h3>
                <p className="text-white/80 leading-relaxed">{solution.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="relative bg-gradient-to-br from-purple-900 via-black to-gray-900 py-20">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">What You'll Achieve</h2>
            <p className="text-xl text-white/90 max-w-3xl mx-auto">Professional firms who partner with us experience:</p>
          </div>

          <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
            {benefits.map((benefit, index) => (
              <div key={index} className="flex items-start space-x-4 bg-white/5 backdrop-blur-sm border border-purple-500/30 rounded-xl p-6">
                <CheckCircleIcon size={24} className="text-purple-400 flex-shrink-0 mt-1" />
                <p className="text-white text-lg">{benefit}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="relative bg-gradient-to-br from-black via-gray-900 to-purple-900 py-20">
        <div className="max-w-4xl mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">Frequently Asked Questions</h2>
            <p className="text-xl text-white/90">Common questions from professional service firms</p>
          </div>

          <div className="space-y-6">
            {faqs.map((faq, index) => (
              <div key={index} className="bg-white/10 backdrop-blur-sm border border-purple-500/30 rounded-xl p-8">
                <h3 className="text-xl font-bold text-purple-400 mb-4">{faq.question}</h3>
                <p className="text-white/90 leading-relaxed">{faq.answer}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="relative bg-gradient-to-br from-purple-600 to-pink-700 py-20">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">Ready for IT That Protects Client Confidentiality?</h2>
          <p className="text-xl text-white/90 mb-10">Let's discuss how we can secure your practice, support your team, and meet your compliance requirements.</p>

          <div className="flex flex-col sm:flex-row gap-6 justify-center">
            <Link href="/contact" className="inline-flex items-center justify-center bg-white hover:bg-gray-100 text-purple-700 font-bold px-10 py-4 rounded-xl transition-all duration-300 hover:scale-105 shadow-lg text-lg">
              Get Started Today
            </Link>
            <a href={`tel:${CONTACT_INFO.phone}`} className="inline-flex items-center justify-center bg-purple-800 hover:bg-purple-900 text-white font-bold px-10 py-4 rounded-xl transition-all duration-300 hover:scale-105 shadow-lg text-lg">
              <PhoneIcon size={20} className="mr-2" />
              {CONTACT_INFO.phone}
            </a>
          </div>

          <p className="text-white/80 mt-8">Or schedule a free IT consultation:</p>
          <a href="https://calendly.com/kurtis-tct" target="_blank" rel="noopener noreferrer" className="inline-flex items-center text-white hover:text-purple-200 font-semibold mt-4 text-lg">
            <CalendarIcon size={20} className="mr-2" />
            Book Your Consultation
          </a>
        </div>
      </section>

      <Footer />
    </main>
  )
}
