'use client'

import Header from '@/components/layout/Header'
import Footer from '@/components/layout/Footer'
import PageHero from '@/components/shared/PageHero'
import Breadcrumbs from '@/components/seo/Breadcrumbs'
import { CheckCircleIcon, ShieldCheckIcon, ClockIcon, PhoneIcon, CalendarIcon } from '@/components/icons/TechIcons'
import Link from 'next/link'
import { CONTACT_INFO } from '@/constants/data'
import Script from 'next/script'

export default function ManufacturingIT() {
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    'serviceType': 'Manufacturing IT Services',
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
    'description': 'Manufacturing IT services and CMMC compliance for manufacturers and fabricators in Central New York. ERP/MES support, production uptime, and cybersecurity.',
    'category': 'Manufacturing IT Services',
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
    'Production downtime costs thousands per hour',
    'ERP and MES systems need constant maintenance',
    'CMMC/NIST compliance required for defense contracts',
    'Shop-floor networks aren\'t secure or reliable',
    'IT and OT systems don\'t communicate properly',
    'Supply chain security is increasingly critical'
  ]

  const solutions = [
    {
      title: 'Production Uptime Guarantee',
      description: 'Proactive monitoring of manufacturing systems, rapid response to minimize downtime, and redundant infrastructure for critical production systems.',
      icon: ClockIcon
    },
    {
      title: 'ERP/MES Integration',
      description: 'Expert support for SAP, Oracle, Epicor, IQMS, and other manufacturing systems. Seamless integration between shop floor data collection and business systems.',
      icon: CheckCircleIcon
    },
    {
      title: 'CMMC/NIST Compliance',
      description: 'Complete compliance framework for defense contractors. Meet CMMC, NIST 800-171, and ITAR requirements with documented security controls and audit support.',
      icon: ShieldCheckIcon
    },
    {
      title: 'Shop-Floor IT Infrastructure',
      description: 'Rugged, reliable networking for harsh manufacturing environments. Support for industrial IoT, machine monitoring, and real-time production tracking.',
      icon: CheckCircleIcon
    },
    {
      title: 'OT/IT Convergence',
      description: 'Bridge the gap between operational technology and information technology. Secure integration of PLCs, SCADA systems, and industrial controls with business networks.',
      icon: ShieldCheckIcon
    },
    {
      title: 'Supply Chain Security',
      description: 'Protect intellectual property, production designs, and supplier relationships. Secure data sharing with customers and vendors while maintaining confidentiality.',
      icon: CheckCircleIcon
    }
  ]

  const benefits = [
    'Reduce production downtime and revenue loss',
    'Win defense contracts with CMMC certification',
    'Integrate shop-floor data with business systems',
    'Protect manufacturing IP and trade secrets',
    'Scale IT infrastructure as production grows',
    'Meet customer cybersecurity requirements'
  ]

  const faqs = [
    {
      question: 'Can you support our ERP system?',
      answer: 'Yes. We have experience with major manufacturing ERP platforms including SAP, Oracle, Epicor, IQMS, JobBOSS, and Plex. We handle infrastructure, integration, and provide expert support for your production systems.'
    },
    {
      question: 'Do you understand manufacturing environments?',
      answer: 'Absolutely. We work with manufacturers regularly and understand the unique demands of shop-floor IT, production uptime requirements, and the integration between business systems and operational technology.'
    },
    {
      question: 'What about CMMC compliance for defense work?',
      answer: 'We specialize in CMMC and NIST 800-171 compliance for defense contractors. This includes implementing required security controls, maintaining documentation, and providing ongoing compliance monitoring and audit support.'
    },
    {
      question: 'Can you work with our industrial equipment?',
      answer: 'Yes. We support integration with PLCs, SCADA systems, CNC machines, and other industrial controls. We understand OT/IT convergence and can bridge the gap between production equipment and business systems securely.'
    },
    {
      question: 'What happens if production systems go down?',
      answer: 'We provide rapid response with priority support for production-critical systems. Our proactive monitoring catches issues before they cause downtime, and we maintain redundant systems for critical manufacturing infrastructure.'
    },
    {
      question: 'How do you handle supply chain security?',
      answer: 'We implement secure data sharing platforms, protect intellectual property with encryption and access controls, and ensure your supplier and customer communications meet security requirements including ITAR and export control regulations.'
    }
  ]

  return (
    <main>
      <Script
        id="manufacturing-schema"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <Header />
      <Breadcrumbs />

      <PageHero
        title="Manufacturing IT Services"
        subtitle="Managed IT and CMMC compliance for manufacturers, fabricators, and industrial companies in Central New York"
        textAlign="center"
        verticalPosition="center"
      />

      <section className="relative bg-gradient-to-br from-gray-900 via-black to-blue-900 py-20">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">Manufacturing IT Challenges We Solve</h2>
            <p className="text-xl text-white/90 max-w-3xl mx-auto">Manufacturers face unique technology demands. Here's what we hear:</p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
            {painPoints.map((point, index) => (
              <div key={index} className="bg-white/10 backdrop-blur-sm border border-blue-500/30 rounded-xl p-6 hover:bg-white/15 transition-all">
                <p className="text-white/90 text-lg">{point}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="relative bg-gradient-to-br from-black via-gray-900 to-indigo-900 py-20">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">Our Manufacturing IT Solutions</h2>
            <p className="text-xl text-white/90 max-w-3xl mx-auto">Technology built for production uptime and manufacturing excellence</p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {solutions.map((solution, index) => (
              <div key={index} className="bg-white/10 backdrop-blur-sm border border-indigo-500/30 rounded-2xl p-8 hover:border-indigo-500 transition-all group">
                <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-indigo-500 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <solution.icon size={32} className="text-white" />
                </div>
                <h3 className="text-2xl font-bold text-white mb-4">{solution.title}</h3>
                <p className="text-white/80 leading-relaxed">{solution.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="relative bg-gradient-to-br from-blue-900 via-black to-gray-900 py-20">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">What You'll Achieve</h2>
            <p className="text-xl text-white/90 max-w-3xl mx-auto">Manufacturing firms who partner with us experience:</p>
          </div>

          <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
            {benefits.map((benefit, index) => (
              <div key={index} className="flex items-start space-x-4 bg-white/5 backdrop-blur-sm border border-blue-500/30 rounded-xl p-6">
                <CheckCircleIcon size={24} className="text-blue-400 flex-shrink-0 mt-1" />
                <p className="text-white text-lg">{benefit}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="relative bg-gradient-to-br from-black via-gray-900 to-blue-900 py-20">
        <div className="max-w-4xl mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">Frequently Asked Questions</h2>
            <p className="text-xl text-white/90">Common questions from manufacturers</p>
          </div>

          <div className="space-y-6">
            {faqs.map((faq, index) => (
              <div key={index} className="bg-white/10 backdrop-blur-sm border border-blue-500/30 rounded-xl p-8">
                <h3 className="text-xl font-bold text-blue-400 mb-4">{faq.question}</h3>
                <p className="text-white/90 leading-relaxed">{faq.answer}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="relative bg-gradient-to-br from-blue-600 to-indigo-700 py-20">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">Ready for IT That Supports Production Excellence?</h2>
          <p className="text-xl text-white/90 mb-10">Let's discuss how we can minimize downtime, secure your manufacturing systems, and help you win defense contracts.</p>

          <div className="flex flex-col sm:flex-row gap-6 justify-center">
            <Link href="/contact" className="inline-flex items-center justify-center bg-white hover:bg-gray-100 text-blue-700 font-bold px-10 py-4 rounded-xl transition-all duration-300 hover:scale-105 shadow-lg text-lg">
              Get Started Today
            </Link>
            <a href={`tel:${CONTACT_INFO.phone}`} className="inline-flex items-center justify-center bg-blue-800 hover:bg-blue-900 text-white font-bold px-10 py-4 rounded-xl transition-all duration-300 hover:scale-105 shadow-lg text-lg">
              <PhoneIcon size={20} className="mr-2" />
              {CONTACT_INFO.phone}
            </a>
          </div>

          <p className="text-white/80 mt-8">Or schedule a free CMMC consultation:</p>
          <a href="https://calendly.com/kurtis-tct" target="_blank" rel="noopener noreferrer" className="inline-flex items-center text-white hover:text-blue-200 font-semibold mt-4 text-lg">
            <CalendarIcon size={20} className="mr-2" />
            Book Your Consultation
          </a>
        </div>
      </section>

      <Footer />
    </main>
  )
}
