'use client'

import Header from '@/components/layout/Header'
import Footer from '@/components/layout/Footer'
import { CheckCircleIcon } from '@/components/icons/TechIcons'

export default function RTP() {
  const technologies = [
    'Microsoft 365 – Enabling seamless collaboration and communication.',
    'Microsoft Azure – Delivering scalable and flexible cloud-based solutions.',
    'Microsoft Server Solutions – Providing a robust foundation for on-premises infrastructure.',
    'Dell Servers & Storage – Ensuring high-performance, reliable data storage and processing.',
    'Carbon Systems Desktops – Offering dependable and standardized desktop solutions for business use.',
    'Dell & Lenovo Business Laptops – Providing powerful, secure, and reliable mobility options.',
    'Networking Solutions – Featuring Meraki, Ubiquiti, and other industry-leading brands for optimal connectivity.',
    'HP Printers – Ensuring consistent, high-quality printing functionality.',
    'Modern Operating Systems – Supporting Microsoft Windows 10 and above for security and up-to-date compatibility.',
    'Unified Communication Systems – Featuring RingCentral and Yealink for seamless business communication.'
  ]

  return (
    <main className="bg-gradient-to-br from-black via-gray-900 to-cyan-500 min-h-screen">
      <Header />
      
      <div className="container mx-auto px-6 py-20 max-w-5xl">
        <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-3xl p-8 md:p-12 shadow-2xl">
          {/* Header */}
          <div className="text-center mb-10">
            <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
              Recommended Technology Platform
            </h1>
            <p className="text-xl text-cyan-200">
              Optimized Technology Solutions for Your Business
            </p>
          </div>

          {/* Introduction */}
          <div className="mb-10">
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-4">
              Optimizing IT Infrastructure with Our Recommended Technology Platform (RTP)
            </h2>
            <p className="text-white/90 text-lg leading-relaxed">
              In an ever-evolving technology landscape, choosing the right solutions can be overwhelming. 
              To ensure seamless operations, security, and efficiency, we adhere to a Recommended Technology 
              Platform (RTP)—a carefully curated suite of technologies designed to maximize reliability and 
              streamline IT management.
            </p>
          </div>

          {/* Our RTP Includes */}
          <div className="mb-10">
            <h3 className="text-2xl font-bold text-white mb-6">Our RTP Includes:</h3>
            <div className="space-y-3">
              {technologies.map((tech, index) => (
                <div key={index} className="flex items-start space-x-3">
                  <div className="w-5 h-5 bg-gradient-to-br from-cyan-500 to-blue-500 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                    <CheckCircleIcon size={12} className="text-white" />
                  </div>
                  <p className="text-white/90 leading-relaxed">
                    {tech}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Why Our RTP Matters */}
          <div>
            <h3 className="text-2xl font-bold text-white mb-6">Why Our RTP Matters</h3>
            <div className="space-y-4 mb-8">
              <div className="flex items-start space-x-3">
                <div className="text-cyan-400 text-xl font-bold flex-shrink-0">✔</div>
                <p className="text-white/90">
                  <span className="font-semibold text-white">Standardized Solutions</span> – Simplifies support and maintenance through a unified technology stack.
                </p>
              </div>
              <div className="flex items-start space-x-3">
                <div className="text-cyan-400 text-xl font-bold flex-shrink-0">✔</div>
                <p className="text-white/90">
                  <span className="font-semibold text-white">Deep Expertise</span> – Our team is highly proficient in every RTP component, ensuring efficient troubleshooting and proactive support.
                </p>
              </div>
              <div className="flex items-start space-x-3">
                <div className="text-cyan-400 text-xl font-bold flex-shrink-0">✔</div>
                <p className="text-white/90">
                  <span className="font-semibold text-white">Enhanced Integration</span> – Technologies are selected for their compatibility and seamless interaction within your IT environment.
                </p>
              </div>
              <div className="flex items-start space-x-3">
                <div className="text-cyan-400 text-xl font-bold flex-shrink-0">✔</div>
                <p className="text-white/90">
                  <span className="font-semibold text-white">World-Class Service</span> – By utilizing the RTP internally, we offer firsthand expertise and exceptional IT support.
                </p>
              </div>
            </div>

            <div className="bg-gradient-to-r from-cyan-500/10 to-blue-500/10 border border-cyan-500/30 rounded-2xl p-6">
              <p className="text-lg text-white font-semibold leading-relaxed">
                By sticking to our RTP, we ensure consistency, security, and efficiency—helping businesses 
                stay ahead with technology that is fully supported and optimized for success.
              </p>
            </div>
          </div>
        </div>
      </div>

      <Footer />
    </main>
  )
}

