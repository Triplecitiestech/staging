'use client'

import Header from '@/components/layout/Header'
import Footer from '@/components/layout/Footer'
import PageHero from '@/components/shared/PageHero'
import Breadcrumbs from '@/components/seo/Breadcrumbs'
import { CheckCircleIcon, ShieldCheckIcon, ClockIcon, PhoneIcon, CalendarIcon } from '@/components/icons/TechIcons'
import Link from 'next/link'
import { CONTACT_INFO } from '@/constants/data'
import Script from 'next/script'

export default function CoManagedIT() {
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    'serviceType': 'Co-Managed IT Services',
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
    'description': 'Co-managed IT services for companies with existing IT teams in Central New York. Enterprise security tools, compliance automation, and expert support.',
    'category': 'Co-Managed IT Services',
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
    'Your IT team is stretched thin and needs support',
    'Enterprise security tools are too expensive for one company',
    'Compliance documentation is overwhelming your staff',
    'You lack specialized expertise in certain areas',
    'Onboarding and offboarding processes are manual',
    'Your backup and disaster recovery needs improvement'
  ]

  const solutions = [
    {
      title: 'Enterprise Security Tools',
      description: 'Access to the same advanced security platforms we use for our managed clients. EDR, SIEM, vulnerability scanning, and threat intelligence without the enterprise price tag.',
      icon: ShieldCheckIcon
    },
    {
      title: 'Automated Compliance',
      description: 'Automated compliance tracking, documentation, and reporting for CMMC, HIPAA, SOC 2, and other frameworks. Let technology handle the paperwork while your team focuses on results.',
      icon: CheckCircleIcon
    },
    {
      title: 'Specialized Expertise',
      description: 'On-demand access to specialized skills your team may not have in-house. Cloud architecture, cybersecurity, compliance, networking, and more.',
      icon: ClockIcon
    },
    {
      title: 'Workflow Automation',
      description: 'Streamlined onboarding, offboarding, and provisioning workflows. Automated user lifecycle management that reduces manual work and improves security.',
      icon: CheckCircleIcon
    },
    {
      title: 'Enterprise Backup & DR',
      description: 'Enterprise-grade backup and disaster recovery solutions. Automated backups, immutable storage, and tested recovery procedures that actually work.',
      icon: ShieldCheckIcon
    },
    {
      title: 'Strategic Partnership',
      description: 'We become an extension of your team. Regular strategy sessions, capacity planning, and access to our full technology stack and vendor relationships.',
      icon: ClockIcon
    }
  ]

  const benefits = [
    'Empower your IT team with enterprise tools',
    'Reduce costs through shared security platforms',
    'Automate compliance and documentation',
    'Access specialized expertise on demand',
    'Improve security without adding headcount',
    'Scale capabilities as your business grows'
  ]

  const faqs = [
    {
      question: 'How is co-managed IT different from fully managed?',
      answer: 'Co-managed IT means we work alongside your existing IT team, providing tools, expertise, and additional capacity. You maintain control and day-to-day operations while leveraging our enterprise platforms and specialized skills.'
    },
    {
      question: 'What tools and platforms do we get access to?',
      answer: 'You get access to our complete stack including EDR/XDR, SIEM, vulnerability scanning, backup platforms, compliance automation, monitoring tools, and documentation systems. The same enterprise tools we use for our fully managed clients.'
    },
    {
      question: 'Can you help with specific projects or just ongoing support?',
      answer: 'Both. We provide ongoing platform access and support, plus we can assist with specific projects like migrations, compliance certifications, security assessments, or infrastructure upgrades.'
    },
    {
      question: 'How does pricing work for co-managed services?',
      answer: 'Pricing is based on the number of users, devices, and specific platforms you need access to. It\'s significantly less expensive than licensing enterprise tools directly, because costs are shared across our client base.'
    },
    {
      question: 'Will this replace our IT staff?',
      answer: 'No. Co-managed IT is designed to empower and augment your existing team, not replace them. We provide the enterprise tools and specialized expertise that make your IT staff more effective and productive.'
    },
    {
      question: 'What if we need more help than co-managed provides?',
      answer: 'We can scale with you. If your needs grow beyond co-managed support, we can transition to a fully managed model. Or we can flex capacity up and down based on your current situation.'
    }
  ]

  return (
    <main>
      <Script
        id="co-managed-it-schema"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <Header />
      <Breadcrumbs />

      {/* Hero */}
      <section className="relative min-h-[500px] flex items-center justify-center overflow-hidden bg-gradient-to-br from-gray-900 via-black to-orange-900">
        {/* Tech hexagon pattern */}
        <div className="absolute inset-0 opacity-12">
          <svg className="absolute inset-0 w-full h-full" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="hexagons" x="0" y="0" width="100" height="87" patternUnits="userSpaceOnUse" patternTransform="scale(1.5)">
                <polygon points="50,0 93.3,25 93.3,75 50,100 6.7,75 6.7,25" fill="none" stroke="#f97316" strokeWidth="1.5"/>
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#hexagons)" />
          </svg>
        </div>

        {/* Circuit board style connections */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-1/4 left-1/4 w-20 h-20 border-2 border-orange-500 rounded-full"></div>
          <div className="absolute top-1/4 right-1/4 w-20 h-20 border-2 border-yellow-500 rounded-full"></div>
          <div className="absolute bottom-1/3 left-1/3 w-20 h-20 border-2 border-orange-400 rounded-full"></div>
          <svg className="absolute inset-0 w-full h-full" xmlns="http://www.w3.org/2000/svg">
            <line x1="25%" y1="25%" x2="75%" y2="25%" stroke="#f97316" strokeWidth="2" strokeDasharray="10,5" />
            <line x1="25%" y1="25%" x2="33%" y2="66%" stroke="#f97316" strokeWidth="2" strokeDasharray="10,5" />
            <line x1="75%" y1="25%" x2="33%" y2="66%" stroke="#f97316" strokeWidth="2" strokeDasharray="10,5" />
          </svg>
        </div>

        {/* Digital grid overlay */}
        <div className="absolute inset-0 opacity-5" style={{
          backgroundImage: `
            linear-gradient(90deg, #f97316 1px, transparent 1px),
            linear-gradient(0deg, #f97316 1px, transparent 1px)
          `,
          backgroundSize: '40px 40px'
        }}></div>

        <div className="relative z-10 max-w-5xl mx-auto px-6 py-20 text-center">
          <h1 className="text-5xl md:text-6xl font-bold text-white mb-6">
            Co-Managed IT Services
          </h1>
          <p className="text-xl md:text-2xl text-white/90 max-w-4xl mx-auto">
            Enterprise-grade tools and expertise that empower your IT team to do more
          </p>
        </div>
      </section>

      <section className="relative bg-gradient-to-br from-gray-900 via-black to-yellow-900 py-20">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">Co-Managed IT Challenges We Solve</h2>
            <p className="text-xl text-white/90 max-w-3xl mx-auto">Companies with existing IT teams tell us:</p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
            {painPoints.map((point, index) => (
              <div key={index} className="bg-white/10 backdrop-blur-sm border border-yellow-500/30 rounded-xl p-6 hover:bg-white/15 transition-all">
                <p className="text-white/90 text-lg">{point}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="relative bg-gradient-to-br from-black via-gray-900 to-orange-900 py-20">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">Our Co-Managed IT Solutions</h2>
            <p className="text-xl text-white/90 max-w-3xl mx-auto">Enterprise capabilities designed to augment your existing IT team</p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {solutions.map((solution, index) => (
              <div key={index} className="bg-white/10 backdrop-blur-sm border border-orange-500/30 rounded-2xl p-8 hover:border-orange-500 transition-all group">
                <div className="w-16 h-16 bg-gradient-to-br from-yellow-500 to-orange-500 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <solution.icon size={32} className="text-white" />
                </div>
                <h3 className="text-2xl font-bold text-white mb-4">{solution.title}</h3>
                <p className="text-white/80 leading-relaxed">{solution.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="relative bg-gradient-to-br from-yellow-900 via-black to-gray-900 py-20">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">What You'll Achieve</h2>
            <p className="text-xl text-white/90 max-w-3xl mx-auto">Organizations with co-managed IT experience:</p>
          </div>

          <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
            {benefits.map((benefit, index) => (
              <div key={index} className="flex items-start space-x-4 bg-white/5 backdrop-blur-sm border border-yellow-500/30 rounded-xl p-6">
                <CheckCircleIcon size={24} className="text-yellow-400 flex-shrink-0 mt-1" />
                <p className="text-white text-lg">{benefit}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="relative bg-gradient-to-br from-black via-gray-900 to-yellow-900 py-20">
        <div className="max-w-4xl mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">Frequently Asked Questions</h2>
            <p className="text-xl text-white/90">Common questions about co-managed IT</p>
          </div>

          <div className="space-y-6">
            {faqs.map((faq, index) => (
              <div key={index} className="bg-white/10 backdrop-blur-sm border border-yellow-500/30 rounded-xl p-8">
                <h3 className="text-xl font-bold text-yellow-400 mb-4">{faq.question}</h3>
                <p className="text-white/90 leading-relaxed">{faq.answer}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="relative bg-gradient-to-br from-yellow-600 to-orange-700 py-20">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">Ready to Empower Your IT Team?</h2>
          <p className="text-xl text-white/90 mb-10">Let's discuss how co-managed IT can give your team enterprise tools and expertise without the enterprise cost.</p>

          <div className="flex flex-col sm:flex-row gap-6 justify-center">
            <Link href="/contact" className="inline-flex items-center justify-center bg-white hover:bg-gray-100 text-orange-700 font-bold px-10 py-4 rounded-xl transition-all duration-300 hover:scale-105 shadow-lg text-lg">
              Get Started Today
            </Link>
            <a href={`tel:${CONTACT_INFO.phone}`} className="inline-flex items-center justify-center bg-orange-800 hover:bg-orange-900 text-white font-bold px-10 py-4 rounded-xl transition-all duration-300 hover:scale-105 shadow-lg text-lg">
              <PhoneIcon size={20} className="mr-2" />
              {CONTACT_INFO.phone}
            </a>
          </div>

          <p className="text-white/80 mt-8">Or schedule a free consultation:</p>
          <a href="https://calendly.com/kurtis-tct" target="_blank" rel="noopener noreferrer" className="inline-flex items-center text-white hover:text-yellow-200 font-semibold mt-4 text-lg">
            <CalendarIcon size={20} className="mr-2" />
            Book Your Consultation
          </a>
        </div>
      </section>

      <Footer />
    </main>
  )
}
