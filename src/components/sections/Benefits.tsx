'use client'

import { useAnimation, useParallax } from '@/hooks/useAnimation'
import { useState, useEffect } from 'react'

export default function Benefits() {
  const { isVisible, elementRef } = useAnimation(0.1)
  const parallaxOffset = useParallax(0.2)
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 })
  const [hoveredCard, setHoveredCard] = useState<number | null>(null)

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePosition({ x: e.clientX, y: e.clientY })
    }

    window.addEventListener('mousemove', handleMouseMove)
    return () => window.removeEventListener('mousemove', handleMouseMove)
  }, [])

  const benefits = [
    {
      title: 'Proactive IT Management',
      description: 'We don\'t wait for problems to happen. Our proactive approach prevents issues before they impact your business.',
      gradient: 'from-cyan-400 via-blue-500 to-indigo-600',
      accent: 'bg-cyan-400/20',
      border: 'border-cyan-400/30',
      glow: 'shadow-cyan-400/50',
      delay: 200,
      number: '01'
    },
    {
      title: 'Enterprise-Grade Security',
      description: 'Your data is protected with the same security measures used by Fortune 500 companies, tailored for your business size.',
      gradient: 'from-violet-400 via-purple-500 to-fuchsia-600',
      accent: 'bg-violet-400/20',
      border: 'border-violet-400/30',
      glow: 'shadow-violet-400/50',
      delay: 400,
      number: '02'
    },
    {
      title: '24/7 Monitoring & Support',
      description: 'Round-the-clock monitoring ensures your systems are always running smoothly, with instant support when you need it.',
      gradient: 'from-emerald-400 via-teal-500 to-cyan-600',
      accent: 'bg-emerald-400/20',
      border: 'border-emerald-400/30',
      glow: 'shadow-emerald-400/50',
      delay: 600,
      number: '03'
    },
    {
      title: 'Strategic Technology Planning',
      description: 'We help you plan for the future with technology roadmaps that align with your business growth and goals.',
      gradient: 'from-orange-400 via-red-500 to-pink-600',
      accent: 'bg-orange-400/20',
      border: 'border-orange-400/30',
      glow: 'shadow-orange-400/50',
      delay: 800,
      number: '04'
    },
    {
      title: 'Custom Solutions',
      description: 'One-size-fits-all doesn\'t work for growing businesses. We build solutions that fit your specific needs and budget.',
      gradient: 'from-indigo-400 via-blue-500 to-purple-600',
      accent: 'bg-indigo-400/20',
      border: 'border-indigo-400/30',
      glow: 'shadow-indigo-400/50',
      delay: 1000,
      number: '05'
    },
    {
      title: 'Measurable Results',
      description: 'Track your IT performance with detailed reporting and analytics that show the real impact on your business.',
      gradient: 'from-teal-400 via-cyan-500 to-blue-600',
      accent: 'bg-teal-400/20',
      border: 'border-teal-400/30',
      glow: 'shadow-teal-400/50',
      delay: 1200,
      number: '06'
    }
  ]

  return (
    <section className="relative py-32 bg-gradient-to-br from-slate-900 via-gray-900 to-black overflow-hidden">
      {/* Premium Cyber Background */}
      <div className="absolute inset-0">
        {/* Neural Network Grid */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/20 via-transparent to-purple-500/20"></div>
          <div 
            className="absolute inset-0" 
            style={{
              backgroundImage: `
                linear-gradient(rgba(6, 182, 212, 0.03) 1px, transparent 1px),
                linear-gradient(90deg, rgba(6, 182, 212, 0.03) 1px, transparent 1px)
              `,
              backgroundSize: '100px 100px'
            }}
          ></div>
        </div>
        
        {/* Floating Cyber Orbs */}
        <div 
          className="absolute top-20 right-20 w-96 h-96 bg-gradient-to-br from-cyan-400/10 to-blue-600/10 rounded-full blur-3xl"
          style={{ 
            transform: `translateY(${parallaxOffset * 0.1}px)`,
            filter: 'blur(60px)',
            animation: 'pulse 4s ease-in-out infinite'
          }}
        ></div>
        <div 
          className="absolute bottom-20 left-20 w-80 h-80 bg-gradient-to-br from-purple-400/10 to-fuchsia-600/10 rounded-full blur-3xl"
          style={{ 
            transform: `translateY(${parallaxOffset * 0.15}px)`,
            filter: 'blur(50px)',
            animation: 'pulse 6s ease-in-out infinite reverse'
          }}
        ></div>
        <div 
          className="absolute top-1/2 left-1/2 w-64 h-64 bg-gradient-to-br from-emerald-400/10 to-teal-600/10 rounded-full blur-3xl"
          style={{ 
            transform: `translateY(${parallaxOffset * 0.2}px) translateZ(0px)`,
            filter: 'blur(30px)'
          }}
        ></div>
        
        {/* Additional 3D Elements */}
        <div 
          className="absolute top-1/4 left-1/4 w-32 h-32 bg-gradient-to-br from-orange-200/30 to-red-200/30 rounded-full blur-2xl animate-pulse delay-1500"
          style={{ 
            transform: `translateY(${parallaxOffset * 0.25}px) translateZ(0px)`,
            filter: 'blur(25px)'
          }}
        ></div>
        <div 
          className="absolute bottom-1/4 right-1/4 w-40 h-40 bg-gradient-to-br from-indigo-200/30 to-blue-200/30 rounded-full blur-2xl animate-pulse delay-2500"
          style={{ 
            transform: `translateY(${parallaxOffset * 0.3}px) translateZ(0px)`,
            filter: 'blur(30px)'
          }}
        ></div>
      </div>

      {/* 3D Grid Pattern Overlay */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute inset-0" style={{
          backgroundImage: `linear-gradient(rgba(59, 130, 246, 0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(59, 130, 246, 0.1) 1px, transparent 1px)`,
          backgroundSize: '100px 100px',
          transform: `translateZ(0px)`
        }}></div>
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-6">
        {/* Premium Section Header */}
        <div 
          ref={elementRef}
          className={`text-center mb-24 transition-all duration-1000 ease-out ${
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-20'
          }`}
        >
          <div className="inline-block px-4 py-2 bg-gradient-to-r from-cyan-500/10 to-blue-500/10 border border-cyan-500/20 rounded-full mb-6">
            <span className="text-sm font-semibold text-cyan-400 tracking-wider uppercase">Enterprise Security Solutions</span>
          </div>
          <h2 className="text-5xl md:text-7xl font-black text-white mb-8 leading-tight">
            Why Choose{' '}
            <span className="bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-600 bg-clip-text text-transparent">
              Triple Cities Tech?
            </span>
          </h2>
          <p className="text-xl text-gray-300 max-w-4xl mx-auto leading-relaxed font-light">
            We're not just another IT company. We're your cybersecurity fortress, transforming digital threats into business opportunities with enterprise-grade protection.
          </p>
        </div>

        {/* Premium Benefits Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {benefits.map((benefit, index) => (
            <div
              key={index}
              className={`group relative transition-all duration-700 ease-out ${
                isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-20'
              }`}
              style={{ transitionDelay: `${benefit.delay}ms` }}
              onMouseEnter={() => setHoveredCard(index)}
              onMouseLeave={() => setHoveredCard(null)}
            >
              <div 
                className={`relative h-full bg-gray-900/50 backdrop-blur-xl border ${benefit.border} rounded-2xl p-8 hover:bg-gray-800/60 transition-all duration-700 hover:scale-105 hover:-translate-y-2 cursor-pointer group-hover:${benefit.glow} shadow-2xl`}
                style={{
                  transform: hoveredCard === index ? 
                    `perspective(1000px) rotateY(${(mousePosition.x - window.innerWidth / 2) * 0.005}deg) rotateX(${(window.innerHeight / 2 - mousePosition.y) * 0.005}deg) scale3d(1.05, 1.05, 1.05)` : 
                    'perspective(1000px) rotateY(0deg) rotateX(0deg) scale3d(1, 1, 1)'
                }}
              >
                {/* Gradient Border Effect */}
                <div className={`absolute inset-0 bg-gradient-to-br ${benefit.gradient} rounded-2xl opacity-0 group-hover:opacity-20 transition-all duration-700 blur-sm`}></div>
                
                {/* Premium Number Badge */}
                <div className="relative z-10 flex items-start justify-between mb-8">
                  <div className={`w-16 h-16 ${benefit.accent} rounded-xl flex items-center justify-center border ${benefit.border} backdrop-blur-sm group-hover:scale-110 transition-all duration-500`}>
                    <span className={`text-2xl font-black bg-gradient-to-br ${benefit.gradient} bg-clip-text text-transparent`}>
                      {benefit.number}
                    </span>
                  </div>
                  
                  {/* Cyber Accent Lines */}
                  <div className="flex flex-col space-y-1 opacity-40 group-hover:opacity-100 transition-opacity duration-500">
                    <div className={`w-8 h-0.5 bg-gradient-to-r ${benefit.gradient}`}></div>
                    <div className={`w-6 h-0.5 bg-gradient-to-r ${benefit.gradient}`}></div>
                    <div className={`w-4 h-0.5 bg-gradient-to-r ${benefit.gradient}`}></div>
                  </div>
                </div>

                {/* Premium Content */}
                <div className="relative z-10 space-y-4">
                  <h3 className="text-2xl font-bold text-white mb-4 group-hover:text-transparent group-hover:bg-gradient-to-r group-hover:from-white group-hover:to-gray-300 group-hover:bg-clip-text transition-all duration-500">
                    {benefit.title}
                  </h3>
                  <p className="text-gray-300 leading-relaxed text-sm font-light group-hover:text-white transition-colors duration-500">
                    {benefit.description}
                  </p>
                </div>

                {/* Cyber Grid Pattern */}
                <div className="absolute bottom-0 right-0 w-24 h-24 opacity-10 group-hover:opacity-30 transition-opacity duration-500">
                  <div 
                    className="w-full h-full"
                    style={{
                      backgroundImage: `
                        linear-gradient(45deg, transparent 30%, rgba(6, 182, 212, 0.2) 30%, rgba(6, 182, 212, 0.2) 70%, transparent 70%),
                        linear-gradient(-45deg, transparent 30%, rgba(168, 85, 247, 0.2) 30%, rgba(168, 85, 247, 0.2) 70%, transparent 70%)
                      `,
                      backgroundSize: '8px 8px'
                    }}
                  ></div>
                </div>

                {/* Floating Scan Lines */}
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none">
                  <div className={`absolute top-8 left-0 w-full h-0.5 bg-gradient-to-r from-transparent via-cyan-400 to-transparent opacity-60 animate-pulse`}></div>
                  <div className={`absolute bottom-8 left-0 w-full h-0.5 bg-gradient-to-r from-transparent via-purple-400 to-transparent opacity-40 animate-pulse delay-500`}></div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Premium CTA Section */}
        <div className={`text-center mt-24 transition-all duration-1000 ease-out delay-1400 ${
          isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-20'
        }`}>
          <div className="relative inline-block group">
            <div 
              className="relative bg-gradient-to-r from-cyan-500 via-blue-600 to-purple-600 text-white font-bold text-lg px-12 py-6 rounded-2xl shadow-2xl hover:shadow-cyan-400/50 transition-all duration-500 hover:scale-105 transform hover:-translate-y-1 cursor-pointer overflow-hidden"
            >
              {/* Animated Background */}
              <div className="absolute inset-0 bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-500 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
              
              {/* Cyber Scan Effect */}
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-700">
                <div className="absolute top-0 left-0 w-full h-0.5 bg-white/60 animate-pulse"></div>
                <div className="absolute bottom-0 left-0 w-full h-0.5 bg-white/60 animate-pulse delay-300"></div>
                <div className="absolute top-0 left-0 w-0.5 h-full bg-white/60 animate-pulse delay-150"></div>
                <div className="absolute top-0 right-0 w-0.5 h-full bg-white/60 animate-pulse delay-450"></div>
              </div>
              
              <span className="relative z-10 tracking-wide">Ready to Fortify Your Digital Infrastructure?</span>
              
              {/* Corner Accents */}
              <div className="absolute top-2 left-2 w-3 h-3 border-l-2 border-t-2 border-cyan-300 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
              <div className="absolute top-2 right-2 w-3 h-3 border-r-2 border-t-2 border-purple-300 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
              <div className="absolute bottom-2 left-2 w-3 h-3 border-l-2 border-b-2 border-cyan-300 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
              <div className="absolute bottom-2 right-2 w-3 h-3 border-r-2 border-b-2 border-purple-300 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
