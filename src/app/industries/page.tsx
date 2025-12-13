import Header from '@/components/layout/Header'
import Footer from '@/components/layout/Footer'
import Link from 'next/link'
import PageHero from '@/components/shared/PageHero'
import ServiceCard from '@/components/shared/ServiceCard'

export default function Industries() {
  const industries = [
    {
      icon: '/icon/construction.webp',
      title: 'Construction',
      subtitle: 'You\'re managing remote crews, juggling multiple sites, and racing deadlines — and IT should never slow you down.',
      features: [
        'Secure project data and jobsite communications',
        'Automate onboarding for new employees and subcontractors',
        'Deploy rugged, reliable tech across mobile teams',
        'Streamline systems like estimating, scheduling, and compliance reporting'
      ],
      description: 'With Triple Cities Tech, your technology becomes as dependable as your crew.',
      gradient: 'from-orange-500 to-red-500',
      image: '/construction.webp'
    },
    {
      icon: '/icon/healthcare.webp',
      title: 'Healthcare',
      subtitle: 'From HIPAA compliance to EHR systems, IT in healthcare must be fast, secure, and dependable.',
      features: [
        'Protect patient data with proactive cybersecurity',
        'Improve uptime for scheduling and billing systems',
        'Automate onboarding for new clinicians and staff',
        'Simplify compliance with built-in documentation and alerts'
      ],
      description: 'We make sure your IT supports patient care — not distracts from it.',
      gradient: 'from-emerald-500 to-teal-500',
      image: '/medical.webp'
    },
    {
      icon: '/icon/manufacturing.webp',
      title: 'Manufacturing',
      subtitle: 'Your production lines rely on stability and precision — and so should your technology.',
      features: [
        'Protect critical infrastructure from downtime and cyber threats',
        'Secure IoT devices and shop-floor systems',
        'Implement compliance solutions for NIST, CMMC, and more',
        'Support IT environments that power ERP, MES, and design tools'
      ],
      description: 'Get IT that\'s built to move as fast as your operations.',
      gradient: 'from-blue-500 to-indigo-500',
      image: '/manufacturing.webp'
    },
    {
      icon: '/icon/proffesionalservices.webp',
      title: 'Professional Services',
      subtitle: 'Whether you\'re managing sensitive client data or ensuring business continuity, we help legal, accounting, architecture, and other service firms.',
      features: [
        'Protect confidential information with strong security practices',
        'Automate onboarding for new employees and clients',
        'Streamline workflows with the right mix of software and support',
        'Eliminate IT bottlenecks that slow down your day'
      ],
      description: 'We make sure your tools work as hard as you do — so you can focus on delivering results.',
      gradient: 'from-purple-500 to-pink-500',
      image: '/proservice.webp'
    }
  ]

  return (
    <main>
      <Header />
      
      <PageHero
        title="Industries We Serve"
        subtitle="Triple Cities Tech, we specialize in delivering right-sized, modern IT solutions to industries where stability, security, and speed matter most. We understand the challenges unique to your field — and we help you overcome them with clarity and confidence."
        imageBackground="/iws.webp"
        textAlign="center"
        verticalPosition="bottom"
        titleNoWrap={true}
      />

      {/* Industries Details */}
      {industries.map((industry, index) => (
        <div 
          key={index} 
          className={`relative py-0 ${
            index % 2 === 0 
              ? 'bg-gradient-to-br from-black via-gray-900 to-cyan-900' 
              : 'bg-gradient-to-br from-cyan-900 via-gray-900 to-black'
          }`}
        >
          <div className="relative z-10 max-w-7xl mx-auto px-6 py-24">
            <ServiceCard
              icon={industry.icon}
              title={industry.title}
              subtitle={industry.subtitle}
              features={industry.features}
              description={industry.description}
              gradient={industry.gradient}
              index={index}
              image={industry.image}
              darkBackground={true}
            />
          </div>
        </div>
      ))}

      {/* CTA Section */}
      <div className="relative">
        {/* Dark background */}
        <div className="absolute inset-0 bg-black"></div>
        
        {/* Subtle background elements */}
        <div className="absolute inset-0">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-cyan-500/5 rounded-full blur-3xl"></div>
          <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-blue-500/5 rounded-full blur-3xl"></div>
        </div>
        
        {/* Content */}
        <div className="relative z-10 text-center py-32">
          <div className="max-w-4xl mx-auto px-6">
            {/* Main Heading */}
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-6 leading-tight">
              Not sure if we serve your industry?
            </h2>
            
            {/* Description */}
            <p className="text-lg text-white mb-10 leading-relaxed max-w-2xl mx-auto">
              Contact us — we'd love to learn about your business and see how we can help.
            </p>
            
            {/* CTA Button */}
            <div className="flex justify-center">
              <Link 
                href="/contact" 
                className="group relative bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-400 hover:to-cyan-500 text-white px-8 py-3 rounded-full font-semibold text-lg shadow-lg hover:shadow-cyan-500/25 hover:scale-105 transition-all duration-300 inline-flex items-center space-x-3"
              >
                <span>Explore Our Solutions</span>
                <div className="w-2 h-2 bg-white rounded-full"></div>
              </Link>
            </div>
          </div>
        </div>
      </div>

      <Footer />
    </main>
  )
}
