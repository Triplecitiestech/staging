'use client'

import { useAnimation, useParallax } from '@/hooks/useAnimation'
import { useState, useEffect } from 'react'
import { Button } from '@/components/ui'
import Link from 'next/link'

export default function Industries() {
  const { isVisible, elementRef } = useAnimation(0.1)
  const parallaxOffset = useParallax(0.15)
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 })
  const [hoveredIndustry, setHoveredIndustry] = useState<number | null>(null)

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePosition({ x: e.clientX, y: e.clientY })
    }

    window.addEventListener('mousemove', handleMouseMove)
    return () => window.removeEventListener('mousemove', handleMouseMove)
  }, [])

  const industries = [
    {
      icon: '🏗️',
      title: 'Construction',
      description: 'Streamlined project management, secure document sharing, and mobile workforce solutions.',
      gradient: 'from-orange-500 to-red-500',
      color: 'orange',
      features: ['Project Management', 'Document Control', 'Mobile Solutions']
    },
    {
      icon: '🏥',
      title: 'Healthcare',
      description: 'HIPAA-compliant systems, patient data security, and seamless clinical workflow integration.',
      gradient: 'from-emerald-500 to-teal-500',
      color: 'emerald',
      features: ['HIPAA Compliance', 'Patient Security', 'Clinical Workflows']
    },
    {
      icon: '🏭',
      title: 'Manufacturing',
      description: 'Industrial IoT integration, supply chain optimization, and production monitoring systems.',
      gradient: 'from-blue-500 to-indigo-500',
      color: 'blue',
      features: ['IoT Integration', 'Supply Chain', 'Production Monitoring']
    },
    {
      icon: '💼',
      title: 'Professional Services',
      description: 'Client relationship management, billing automation, and secure collaboration tools.',
      gradient: 'from-purple-500 to-pink-500',
      color: 'purple',
      features: ['CRM Systems', 'Billing Automation', 'Collaboration Tools']
    },
    {
      icon: '🏪',
      title: 'Retail & E-commerce',
      description: 'Point-of-sale systems, inventory management, and customer experience optimization.',
      gradient: 'from-teal-500 to-cyan-500',
      color: 'teal',
      features: ['POS Systems', 'Inventory Management', 'Customer Experience']
    },
    {
      icon: '🏢',
      title: 'Financial Services',
      description: 'Regulatory compliance, secure transactions, and advanced fraud detection systems.',
      gradient: 'from-indigo-500 to-blue-500',
      color: 'indigo',
      features: ['Regulatory Compliance', 'Secure Transactions', 'Fraud Detection']
    }
  ]

  return (
    <section className="relative py-24 bg-gradient-to-br from-slate-100 via-blue-50/50 to-indigo-50/50 overflow-hidden">
      {/* Enhanced 3D Background Elements */}
      <div className="absolute inset-0">
        {/* Floating 3D Geometric Shapes */}
        <div 
          className="absolute top-20 right-20 w-80 h-80 bg-gradient-to-br from-orange-200/20 to-red-200/20 rounded-full blur-3xl animate-pulse"
          style={{ 
            transform: `translateY(${parallaxOffset * 0.1}px) translateZ(0px) rotate(${parallaxOffset * 0.1}deg)`,
            filter: 'blur(40px)'
          }}
        ></div>
        <div 
          className="absolute bottom-20 left-20 w-96 h-96 bg-gradient-to-br from-emerald-200/20 to-teal-200/20 rounded-full blur-3xl animate-pulse delay-1000"
          style={{ 
            transform: `translateY(${parallaxOffset * 0.15}px) translateZ(0px) rotate(-${parallaxOffset * 0.1}deg)`,
            filter: 'blur(35px)'
          }}
        ></div>
        <div 
          className="absolute top-1/2 left-1/2 w-64 h-64 bg-gradient-to-br from-blue-200/20 to-indigo-200/20 rounded-full blur-3xl animate-pulse delay-2000"
          style={{ 
            transform: `translateY(${parallaxOffset * 0.2}px) translateZ(0px) rotate(${parallaxOffset * 0.15}deg)`,
            filter: 'blur(30px)'
          }}
        ></div>
        
        {/* Additional 3D Elements */}
        <div 
          className="absolute top-1/4 left-1/4 w-32 h-32 bg-gradient-to-br from-purple-200/15 to-pink-200/15 rounded-full blur-2xl animate-pulse delay-1500"
          style={{ 
            transform: `translateY(${parallaxOffset * 0.25}px) translateZ(0px) rotate(${parallaxOffset * 0.2}deg)`,
            filter: 'blur(25px)'
          }}
        ></div>
        <div 
          className="absolute bottom-1/4 right-1/4 w-40 h-40 bg-gradient-to-br from-cyan-200/15 to-blue-200/15 rounded-full blur-2xl animate-pulse delay-2500"
          style={{ 
            transform: `translateY(${parallaxOffset * 0.3}px) translateZ(0px) rotate(-${parallaxOffset * 0.15}deg)`,
            filter: 'blur(30px)'
          }}
        ></div>
      </div>

      {/* 3D Grid Pattern Overlay */}
      <div className="absolute inset-0 opacity-5">
        <div className="absolute inset-0" style={{
          backgroundImage: `linear-gradient(rgba(59, 130, 246, 0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(59, 130, 246, 0.1) 1px, transparent 1px)`,
          backgroundSize: '100px 100px',
          transform: `translateZ(0px)`
        }}></div>
      </div>

      <div className="relative z-10 container-max">
        {/* Enhanced 3D Section Header */}
        <div 
          ref={elementRef}
          className={`text-center mb-20 transition-all duration-1000 ease-out ${
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-20'
          }`}
        >
          <h2 className="text-4xl md:text-6xl font-black text-gray-900 mb-6 drop-shadow-2xl">
            Who We{' '}
            <span className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent drop-shadow-2xl">
              Serve
            </span>
          </h2>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto leading-relaxed drop-shadow-lg">
            We specialize in serving small and mid-sized businesses across diverse industries, 
            providing tailored IT solutions that address your unique challenges and compliance requirements.
          </p>
        </div>

        {/* Enhanced 3D Industries Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-16 perspective-1000">
          {industries.map((industry, index) => (
            <div
              key={index}
              className={`group relative transition-all duration-700 ease-out ${
                isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-20'
              }`}
              style={{ transitionDelay: `${index * 150}ms` }}
              onMouseEnter={() => setHoveredIndustry(index)}
              onMouseLeave={() => setHoveredIndustry(null)}
            >
              <div 
                className="relative h-full bg-white/90 backdrop-blur-xl border border-white/60 rounded-3xl p-8 shadow-2xl hover:shadow-3xl transition-all duration-700 hover:scale-105 hover:-translate-y-3 transform hover:rotate-y-6 hover:rotate-x-3 cursor-pointer"
                style={{
                  transformStyle: 'preserve-3d',
                  transform: hoveredIndustry === index ? 
                    `perspective(1000px) rotateY(${(mousePosition.x - window.innerWidth / 2) * 0.008}deg) rotateX(${(window.innerHeight / 2 - mousePosition.y) * 0.008}deg) scale3d(1.05, 1.05, 1.05)` : 
                    'perspective(1000px) rotateY(0deg) rotateX(0deg) scale3d(1, 1, 1)'
                }}
              >
                {/* Enhanced 3D Gradient Border */}
                <div className={`absolute inset-0 bg-gradient-to-br ${industry.gradient} rounded-3xl opacity-0 group-hover:opacity-100 transition-all duration-700 blur-sm scale-105`}></div>
                
                {/* Enhanced 3D Icon Container */}
                <div className={`relative z-10 w-20 h-20 bg-gradient-to-br ${industry.gradient} rounded-2xl flex items-center justify-center text-4xl mb-6 shadow-2xl group-hover:shadow-3xl transition-all duration-700 group-hover:scale-110 group-hover:rotate-3 group-hover:-translate-y-2`}>
                  <div className="group-hover:animate-bounce">
                    {industry.icon}
                  </div>
                  
                  {/* Enhanced 3D Glow Effect */}
                  <div className={`absolute inset-0 bg-gradient-to-br ${industry.gradient} rounded-2xl opacity-0 group-hover:opacity-40 blur-2xl scale-150 transition-all duration-700`}></div>
                  
                  {/* Floating 3D Particles */}
                  <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-700">
                    {[...Array(8)].map((_, i) => (
                      <div
                        key={i}
                        className={`absolute w-1.5 h-1.5 bg-white rounded-full animate-ping`}
                        style={{
                          top: '50%',
                          left: '50%',
                          transform: `translate(-50%, -50%) rotate(${i * 45}deg) translateY(-18px)`,
                          animationDelay: `${i * 0.1}s`,
                          animationDuration: '2.5s'
                        }}
                      />
                    ))}
                  </div>
                </div>

                {/* Enhanced 3D Content */}
                <div className="relative z-10">
                  <h3 className="text-xl font-bold text-gray-900 mb-4 group-hover:text-blue-600 transition-all duration-500 transform group-hover:scale-105 drop-shadow-lg">
                    {industry.title}
                  </h3>
                  <p className="text-gray-600 leading-relaxed mb-4 group-hover:text-gray-700 transition-colors duration-500 drop-shadow-sm">
                    {industry.description}
                  </p>
                  
                  {/* Industry Features */}
                  <div className="space-y-2">
                    {industry.features.map((feature, featureIndex) => (
                      <div key={featureIndex} className="flex items-center space-x-2">
                        <div className={`w-2 h-2 bg-gradient-to-r ${industry.gradient} rounded-full`}></div>
                        <span className="text-sm text-gray-600 group-hover:text-gray-700 transition-colors duration-300">
                          {feature}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Enhanced 3D Hover Glow */}
                <div className={`absolute inset-0 bg-gradient-to-br ${industry.gradient} rounded-3xl opacity-0 group-hover:opacity-8 transition-opacity duration-700 blur-2xl scale-110`}></div>

                {/* 3D Floating Elements */}
                <div className="absolute top-4 right-4 w-3 h-3 bg-blue-400 rounded-full opacity-0 group-hover:opacity-100 transition-all duration-700 group-hover:animate-ping shadow-lg"></div>
                <div className="absolute bottom-4 left-4 w-2 h-2 bg-purple-400 rounded-full opacity-0 group-hover:opacity-100 transition-all duration-700 delay-100 group-hover:animate-ping shadow-lg"></div>
                <div className="absolute top-1/2 right-2 w-1.5 h-1.5 bg-emerald-400 rounded-full opacity-0 group-hover:opacity-100 transition-all duration-700 delay-200 group-hover:animate-ping shadow-lg"></div>
                
                {/* 3D Corner Accents */}
                <div className="absolute top-0 left-0 w-0 h-0 border-l-[20px] border-t-[20px] border-l-transparent border-t-transparent opacity-0 group-hover:opacity-100 transition-all duration-700">
                  <div className={`w-4 h-4 bg-gradient-to-br ${industry.gradient} rounded-full absolute -top-2 -left-2 shadow-lg`}></div>
                </div>
                <div className="absolute bottom-0 right-0 w-0 h-0 border-r-[20px] border-b-[20px] border-r-transparent border-b-transparent opacity-0 group-hover:opacity-100 transition-all duration-700">
                  <div className={`w-4 h-4 bg-gradient-to-br ${industry.gradient} rounded-full absolute -bottom-2 -right-2 shadow-lg`}></div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Enhanced 3D Bottom Section */}
        <div className={`text-center transition-all duration-1000 ease-out delay-1200 ${
          isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-20'
        }`}>
          <p className="text-xl text-gray-600 mb-8 drop-shadow-lg max-w-4xl mx-auto leading-relaxed">
            Don't see your industry? We customize solutions for any business type. 
            Let's discuss how we can serve your specific needs.
          </p>
          
          {/* Enhanced 3D CTA Button */}
          <div className="relative inline-block">
            <Button
              asChild
              variant="primary"
              size="xl"
              className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 hover:scale-110 hover:shadow-2xl hover:shadow-purple-500/30 transform hover:-translate-y-2 border-0 shadow-xl shadow-purple-500/20 px-10 py-5 text-lg font-bold rounded-3xl transition-all duration-500"
              style={{
                transformStyle: 'preserve-3d',
                transform: 'perspective(1000px)'
              }}
            >
              <Link href="/industries">
                Explore All Industries
              </Link>
            
              {/* Enhanced 3D Glow Effect */}
              <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-purple-600 rounded-3xl opacity-0 group-hover:opacity-30 blur-2xl scale-110 transition-all duration-500"></div>
              
              {/* Floating 3D Elements */}
              <div className="absolute -top-2 -left-2 w-3 h-3 bg-white/60 rounded-full opacity-0 group-hover:opacity-100 transition-all duration-500 animate-ping"></div>
              <div className="absolute -bottom-2 -right-2 w-2 h-2 bg-white/60 rounded-full opacity-0 group-hover:opacity-100 transition-all duration-500 delay-200 animate-ping"></div>
            </Button>
          </div>
        </div>
      </div>
    </section>
  )
}
