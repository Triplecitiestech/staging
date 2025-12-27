'use client'

import Header from '@/components/layout/Header'
import Footer from '@/components/layout/Footer'
import PageHero from '@/components/shared/PageHero'
import Breadcrumbs from '@/components/seo/Breadcrumbs'
import { CheckCircleIcon, ShieldCheckIcon, ClockIcon, PhoneIcon, MailIcon, CalendarIcon } from '@/components/icons/TechIcons'
import Link from 'next/link'
import { CONTACT_INFO } from '@/constants/data'
import Script from 'next/script'

export default function HealthcareIT() {
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    'serviceType': 'Healthcare IT Services',
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
    'description': 'HIPAA-compliant managed IT and cybersecurity services for medical practices, clinics, and healthcare providers in Central New York.',
    'category': 'Healthcare IT Services',
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
    'HIPAA compliance requirements feel overwhelming and expensive',
    'EHR system downtime disrupts patient care and revenue',
    'Patient data security keeps you up at night',
    'Your IT staff is stretched thin and needs support',
    'Technology vendors don\'t understand healthcare workflows',
    'Onboarding new clinical staff takes too long'
  ]

  const solutions = [
    {
      title: 'HIPAA Compliance Made Simple',
      description: 'Complete compliance framework with automated documentation, regular risk assessments, and built-in security controls that meet OCR requirements.',
      icon: ShieldCheckIcon
    },
    {
      title: 'EHR System Reliability',
      description: '24/7 monitoring and support for your electronic health records system. We ensure uptime during critical patient care hours.',
      icon: ClockIcon
    },
    {
      title: 'Patient Data Protection',
      description: 'Multi-layered security including encryption, access controls, audit logging, and breach prevention monitoring.',
      icon: ShieldCheckIcon
    },
    {
      title: 'Co-Managed IT Support',
      description: 'We work alongside your existing IT staff, providing enterprise-grade tools and expertise without replacing your team.',
      icon: CheckCircleIcon
    },
    {
      title: 'Fast Staff Onboarding',
      description: 'Automated provisioning gets new doctors, nurses, and staff up and running in minutes instead of days.',
      icon: ClockIcon
    },
    {
      title: 'Healthcare-Focused Support',
      description: 'Our team understands medical practice workflows, terminology, and the urgency of patient care.',
      icon: CheckCircleIcon
    }
  ]

  const benefits = [
    'Pass HIPAA audits with confidence',
    'Reduce EHR downtime and revenue loss',
    'Protect patient data from breaches',
    'Support your IT staff without replacing them',
    'Onboard clinical staff in minutes, not days',
    'Focus on patient care, not IT problems'
  ]

  const faqs = [
    {
      question: 'Are you HIPAA compliant?',
      answer: 'Yes. We maintain HIPAA compliance for all healthcare clients and will sign a Business Associate Agreement (BAA). Our systems include encryption, access controls, audit logging, and regular security assessments required by HIPAA.'
    },
    {
      question: 'Can you work with our existing IT staff?',
      answer: 'Absolutely. Our co-managed IT services are designed to enhance your current team with enterprise-grade tools, security platforms, and expertise—not replace them.'
    },
    {
      question: 'Which EHR systems do you support?',
      answer: 'We support all major EHR platforms including Epic, Cerner, athenahealth, eClinicalWorks, and more. Our team has experience with both cloud-based and on-premise systems.'
    },
    {
      question: 'What happens if our EHR goes down?',
      answer: 'We provide 24/7 monitoring and rapid response for critical systems. Our team will work immediately to restore service and minimize downtime during patient care hours.'
    },
    {
      question: 'How do you handle data breaches?',
      answer: 'We have a comprehensive incident response plan that includes immediate containment, forensic investigation, OCR notification assistance, and remediation—all while maintaining HIPAA compliance.'
    },
    {
      question: 'Can you help us become HIPAA compliant?',
      answer: 'Yes. We conduct complete HIPAA risk assessments, implement required security controls, create policies and procedures, and provide ongoing compliance monitoring and documentation.'
    }
  ]

  return (
    <main>
      <Script
        id="healthcare-schema"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <Header />
      <Breadcrumbs />

      {/* Hero */}
      <PageHero
        title="Healthcare IT Services"
        subtitle="HIPAA-compliant managed IT and cybersecurity for medical practices, clinics, and healthcare providers in Central New York"
        textAlign="center"
        verticalPosition="center"
      />

      {/* Pain Points */}
      <section className="relative bg-gradient-to-br from-gray-900 via-black to-emerald-900 py-20">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">Healthcare IT Challenges We Solve</h2>
            <p className="text-xl text-white/90 max-w-3xl mx-auto">Medical practices face unique technology challenges. Here's what our healthcare clients tell us:</p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
            {painPoints.map((point, index) => (
              <div key={index} className="bg-white/10 backdrop-blur-sm border border-emerald-500/30 rounded-xl p-6 hover:bg-white/15 transition-all">
                <p className="text-white/90 text-lg">{point}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Solutions */}
      <section className="relative bg-gradient-to-br from-black via-gray-900 to-cyan-900 py-20">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">Our Healthcare IT Solutions</h2>
            <p className="text-xl text-white/90 max-w-3xl mx-auto">Purpose-built technology services for healthcare providers</p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {solutions.map((solution, index) => (
              <div key={index} className="bg-white/10 backdrop-blur-sm border border-cyan-500/30 rounded-2xl p-8 hover:border-cyan-500 transition-all group">
                <div className="w-16 h-16 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <solution.icon size={32} className="text-white" />
                </div>
                <h3 className="text-2xl font-bold text-white mb-4">{solution.title}</h3>
                <p className="text-white/80 leading-relaxed">{solution.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="relative bg-gradient-to-br from-emerald-900 via-black to-gray-900 py-20">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">What You'll Achieve</h2>
            <p className="text-xl text-white/90 max-w-3xl mx-auto">Healthcare providers who partner with us experience:</p>
          </div>

          <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
            {benefits.map((benefit, index) => (
              <div key={index} className="flex items-start space-x-4 bg-white/5 backdrop-blur-sm border border-emerald-500/30 rounded-xl p-6">
                <CheckCircleIcon size={24} className="text-emerald-400 flex-shrink-0 mt-1" />
                <p className="text-white text-lg">{benefit}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="relative bg-gradient-to-br from-black via-gray-900 to-emerald-900 py-20">
        <div className="max-w-4xl mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">Frequently Asked Questions</h2>
            <p className="text-xl text-white/90">Common questions from healthcare providers</p>
          </div>

          <div className="space-y-6">
            {faqs.map((faq, index) => (
              <div key={index} className="bg-white/10 backdrop-blur-sm border border-emerald-500/30 rounded-xl p-8">
                <h3 className="text-xl font-bold text-emerald-400 mb-4">{faq.question}</h3>
                <p className="text-white/90 leading-relaxed">{faq.answer}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="relative bg-gradient-to-br from-emerald-600 to-teal-700 py-20">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">Ready for IT That Supports Patient Care?</h2>
          <p className="text-xl text-white/90 mb-10">Let's discuss how we can secure your practice, ensure HIPAA compliance, and keep your systems running smoothly.</p>

          <div className="flex flex-col sm:flex-row gap-6 justify-center">
            <Link href="/contact" className="inline-flex items-center justify-center bg-white hover:bg-gray-100 text-emerald-700 font-bold px-10 py-4 rounded-xl transition-all duration-300 hover:scale-105 shadow-lg text-lg">
              Get Started Today
            </Link>
            <a href={`tel:${CONTACT_INFO.phone}`} className="inline-flex items-center justify-center bg-emerald-800 hover:bg-emerald-900 text-white font-bold px-10 py-4 rounded-xl transition-all duration-300 hover:scale-105 shadow-lg text-lg">
              <PhoneIcon size={20} className="mr-2" />
              {CONTACT_INFO.phone}
            </a>
          </div>

          <p className="text-white/80 mt-8">Or schedule a free HIPAA compliance assessment:</p>
          <a href="https://calendly.com/kurtis-tct" target="_blank" rel="noopener noreferrer" className="inline-flex items-center text-white hover:text-emerald-200 font-semibold mt-4 text-lg">
            <CalendarIcon size={20} className="mr-2" />
            Book Your Assessment
          </a>
        </div>
      </section>

      <Footer />
    </main>
  )
}
