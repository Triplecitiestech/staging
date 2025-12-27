'use client'

import Header from '@/components/layout/Header'
import Footer from '@/components/layout/Footer'
import PageHero from '@/components/shared/PageHero'
import Breadcrumbs from '@/components/seo/Breadcrumbs'
import { CheckCircleIcon, ShieldCheckIcon, ClockIcon, PhoneIcon, CalendarIcon } from '@/components/icons/TechIcons'
import Link from 'next/link'
import { CONTACT_INFO } from '@/constants/data'
import Script from 'next/script'

export default function ConstructionIT() {
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    'serviceType': 'Construction IT Services',
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
    'description': 'Managed IT and CMMC compliance for construction companies, contractors, and builders in Central New York.',
    'category': 'Construction IT Services',
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
    'Remote jobsites lack reliable connectivity and IT support',
    'Project management systems don\'t sync across teams',
    'CMMC compliance required for government contracts',
    'Onboarding subcontractors and new crews takes too long',
    'Critical project data isn\'t secure or backed up',
    'Technology can\'t keep up with your project timelines'
  ]

  const solutions = [
    {
      title: 'Mobile Workforce Support',
      description: 'Deploy rugged, reliable technology that works in the field. Remote support for jobsite teams, mobile device management, and secure access to project data from anywhere.',
      icon: CheckCircleIcon
    },
    {
      title: 'Project System Integration',
      description: 'Streamline estimating, scheduling, and project management systems. Real-time sync across office and field teams with tools like Procore, Buildertrend, and Sage.',
      icon: ClockIcon
    },
    {
      title: 'CMMC Compliance',
      description: 'Meet CMMC and NIST 800-171 requirements for government contracts. Complete compliance framework with documentation, security controls, and audit support.',
      icon: ShieldCheckIcon
    },
    {
      title: 'Fast Crew Onboarding',
      description: 'Automated provisioning for new employees, subcontractors, and temporary workers. Get them access to systems and project data in minutes, not days.',
      icon: ClockIcon
    },
    {
      title: 'Project Data Security',
      description: 'Protect blueprints, estimates, and project data with encryption, access controls, and automated backups. Secure communication for sensitive bid information.',
      icon: ShieldCheckIcon
    },
    {
      title: 'Deadline-Driven Support',
      description: 'We understand construction deadlines. Rapid response when technology issues threaten project timelines or jobsite productivity.',
      icon: CheckCircleIcon
    }
  ]

  const benefits = [
    'Win government contracts with CMMC compliance',
    'Keep jobsite teams connected and productive',
    'Sync project data across office and field',
    'Onboard crews and subcontractors instantly',
    'Protect bid data and project information',
    'Scale technology as you take on more projects'
  ]

  const faqs = [
    {
      question: 'Can you support remote jobsites?',
      answer: 'Yes. We provide mobile device management, VPN access, and remote support for field teams. Our solutions work with cellular connectivity, mobile hotspots, and temporary site networks.'
    },
    {
      question: 'Do you have CMMC experience?',
      answer: 'Absolutely. We help construction firms achieve CMMC certification for Department of Defense contracts. This includes implementing required security controls, documentation, and ongoing compliance monitoring.'
    },
    {
      question: 'Which project management systems do you support?',
      answer: 'We work with all major construction platforms including Procore, Buildertrend, CoConstruct, Sage 300 CRE, Foundation, Viewpoint, and custom solutions. We ensure seamless integration between systems.'
    },
    {
      question: 'How quickly can you get new workers online?',
      answer: 'With our automated onboarding system, new employees and subcontractors can be provisioned in minutes. They get immediate access to the specific project systems and data they need based on their role.'
    },
    {
      question: 'What about cybersecurity for construction?',
      answer: 'Construction firms are increasingly targeted for ransomware and data theft. We provide multi-layered security including endpoint protection, email security, secure file sharing, and backup systems designed for project data.'
    },
    {
      question: 'Can you work with our office and field separately?',
      answer: 'Yes. We can support office-based teams, field crews, or both. Our solutions bridge the gap between office systems and mobile workers, ensuring everyone has the tools they need.'
    }
  ]

  return (
    <main>
      <Script
        id="construction-schema"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <Header />
      <Breadcrumbs />

      <PageHero
        title="Construction IT Services"
        subtitle="Managed IT and CMMC compliance for construction companies, contractors, and builders in Central New York"
        textAlign="center"
        verticalPosition="center"
      />

      <section className="relative bg-gradient-to-br from-gray-900 via-black to-yellow-600 py-20">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">Construction IT Challenges We Solve</h2>
            <p className="text-xl text-white/90 max-w-3xl mx-auto">Construction companies face unique technology demands. Here's what we hear:</p>
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

      <section className="relative bg-gradient-to-br from-black via-gray-900 to-yellow-700 py-20">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">Our Construction IT Solutions</h2>
            <p className="text-xl text-white/90 max-w-3xl mx-auto">Technology built for the pace and demands of construction projects</p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {solutions.map((solution, index) => (
              <div key={index} className="bg-white/10 backdrop-blur-sm border border-yellow-500/30 rounded-2xl p-8 hover:border-yellow-500 transition-all group">
                <div className="w-16 h-16 bg-gradient-to-br from-yellow-400 to-yellow-600 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <solution.icon size={32} className="text-black" />
                </div>
                <h3 className="text-2xl font-bold text-white mb-4">{solution.title}</h3>
                <p className="text-white/80 leading-relaxed">{solution.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="relative bg-gradient-to-br from-yellow-600 via-black to-gray-900 py-20">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">What You'll Achieve</h2>
            <p className="text-xl text-white/90 max-w-3xl mx-auto">Construction firms who partner with us experience:</p>
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

      <section className="relative bg-gradient-to-br from-black via-gray-900 to-yellow-600 py-20">
        <div className="max-w-4xl mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">Frequently Asked Questions</h2>
            <p className="text-xl text-white/90">Common questions from construction companies</p>
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

      <section className="relative bg-gradient-to-br from-yellow-500 to-yellow-600 py-20">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h2 className="text-4xl md:text-5xl font-bold text-black mb-6">Ready for IT That Keeps Up With Your Projects?</h2>
          <p className="text-xl text-black/90 mb-10">Let's discuss how we can support your field teams, secure your project data, and help you win more government contracts.</p>

          <div className="flex flex-col sm:flex-row gap-6 justify-center">
            <Link href="/contact" className="inline-flex items-center justify-center bg-black hover:bg-gray-900 text-yellow-400 font-bold px-10 py-4 rounded-xl transition-all duration-300 hover:scale-105 shadow-lg text-lg">
              Get Started Today
            </Link>
            <a href={`tel:${CONTACT_INFO.phone}`} className="inline-flex items-center justify-center bg-gray-900 hover:bg-black text-yellow-400 font-bold px-10 py-4 rounded-xl transition-all duration-300 hover:scale-105 shadow-lg text-lg">
              <PhoneIcon size={20} className="mr-2" />
              {CONTACT_INFO.phone}
            </a>
          </div>

          <p className="text-black/80 mt-8">Or schedule a free CMMC consultation:</p>
          <a href="https://calendly.com/kurtis-tct" target="_blank" rel="noopener noreferrer" className="inline-flex items-center text-black hover:text-gray-800 font-semibold mt-4 text-lg">
            <CalendarIcon size={20} className="mr-2" />
            Book Your Consultation
          </a>
        </div>
      </section>

      <Footer />
    </main>
  )
}
