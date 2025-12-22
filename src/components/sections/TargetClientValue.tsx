'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { useAnimation } from '@/hooks/useAnimation'
import { ShieldCheckIcon } from '@/components/icons/TechIcons'

export default function TargetClientValue() {
  const { isVisible, elementRef } = useAnimation(0.1)
  const [activeStep, setActiveStep] = useState(0)

  const clientBenefits = [
    {
      phase: 'TCT FORTRESS',
      title: 'What is Fortress?',
      description: 'Fortress is the most comprehensive, secure and forward-thinking IT management platform in the industry.',
      features: [
        'Immediate Help',
        'Uncompromising Security',
        'Maximum Availability',
        'Increased Profitability'
      ],
      icon: <ShieldCheckIcon size={32} className="text-white" />,
      color: 'from-cyan-400 to-cyan-600',
      delay: 400
    }
  ]

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveStep((prev) => (prev + 1) % clientBenefits.length)
    }, 4000)
    return () => clearInterval(interval)
  }, [clientBenefits.length])

  return (
    <section id="drive-business-growth" className="relative py-32 bg-black overflow-hidden scroll-mt-24">
      {/* Background Effects to match CTA */}
      <div className="absolute inset-0">
        {/* Neural Network Grid */}
        <div className="absolute inset-0 opacity-5">
          <div 
            className="absolute inset-0" 
            style={{
              backgroundImage: `
                linear-gradient(rgba(6, 182, 212, 0.1) 1px, transparent 1px),
                linear-gradient(90deg, rgba(6, 182, 212, 0.1) 1px, transparent 1px)
              `,
              backgroundSize: '50px 50px'
            }}
          ></div>
        </div>
        
        {/* Floating Elements - Cyan theme */}
        <div className="absolute top-20 right-20 w-64 h-64 bg-gradient-to-br from-cyan-400/10 to-cyan-600/10 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-20 left-20 w-80 h-80 bg-gradient-to-br from-cyan-500/10 to-cyan-600/10 rounded-full blur-3xl animate-pulse delay-1000"></div>
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-6">
        {/* Section Header */}
        <div 
          ref={elementRef}
          className={`text-center mb-20 transition-all duration-1000 ease-out ${
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-20'
          }`}
        >
          <h2 className="text-5xl md:text-7xl font-black text-white mb-8 leading-tight">
            Drive Business{' '}
            <span className="text-cyan-400">
              Growth and ROI
            </span>
          </h2>
          <p className="text-xl md:text-2xl text-gray-300 max-w-5xl mx-auto leading-relaxed">
            With TCT Fortress, we learn your business <span className="text-cyan-400 font-semibold">inside and out</span> — your model, your needs, and your goals. Then, we apply our expertise to craft <span className="text-cyan-400 font-semibold">strategic roadmaps</span> that leverage the right technology for the outcomes that matter most to you. It's not just about IT — it's about <span className="text-cyan-400 font-semibold">elevating your business to the next level</span> and <span className="text-cyan-400 font-semibold">maximizing profitability</span>.
          </p>
        </div>

        {/* Timeline Visual */}
        <div className={`mb-16 transition-all duration-1000 ease-out delay-200 ${
          isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-20'
        }`}>
          <div className="text-center mb-12 px-4">
            <div className="inline-block">
              <div className="px-8 py-4 bg-gradient-to-r from-cyan-400 to-cyan-600 rounded-full shadow-lg shadow-cyan-400/30 border-2 border-white/20">
                <h3 className="text-2xl md:text-3xl font-black text-white tracking-wider">
                  TCT FORTRESS
                </h3>
              </div>
            </div>
          </div>
        </div>

        {/* Active Step Display */}
        <div className={`transition-all duration-1000 ease-out delay-400 ${
          isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-20'
        }`}>
          <div className="relative bg-gradient-to-br from-black via-gray-900 to-black rounded-3xl p-12 max-w-5xl mx-auto shadow-2xl shadow-cyan-400/50 border-2 border-cyan-400/30">
            {/* Radiant Glow Effects */}
            <div className="absolute -inset-1 bg-gradient-to-r from-cyan-400 via-cyan-500 to-cyan-600 rounded-3xl opacity-20 blur-xl"></div>
            {/* 3D Top Highlight */}
            <div className="absolute top-0 left-0 right-0 h-8 bg-gradient-to-b from-cyan-400/20 to-transparent rounded-t-3xl"></div>
            {/* 3D Side Highlight */}
            <div className="absolute top-0 left-0 bottom-0 w-8 bg-gradient-to-r from-cyan-400/15 to-transparent rounded-l-3xl"></div>
            <div className="relative z-10 grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
              {/* Content */}
              <div>
                <div className="mb-6">
                  <h3 className="text-3xl font-bold text-white">{clientBenefits[activeStep].title}</h3>
                </div>
                <p className="text-xl text-white mb-6 leading-relaxed">
                  Fortress is the most comprehensive, secure and forward-thinking IT management platform in the industry.
                </p>
                <Link
                  href="#how-to-engage"
                  className="inline-flex items-center bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-400 hover:to-cyan-500 text-white px-6 py-3 rounded-lg font-semibold transition-all duration-300 hover:scale-105 shadow-lg hover:shadow-cyan-500/50"
                >
                  Contact us to Learn More
                  <svg className="ml-2 w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                  </svg>
                </Link>
              </div>

              {/* Features List */}
              <div>
                <div className="space-y-4">
                  {clientBenefits[activeStep].features.map((feature, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-center space-x-3 bg-white/10 backdrop-blur-sm hover:bg-white/15 border border-white/20 hover:border-white/30 rounded-xl p-4 transition-all duration-300 group"
                    >
                      <div className="w-2 h-2 bg-cyan-400 rounded-full group-hover:scale-125 transition-transform duration-300"></div>
                      <span className="text-white font-semibold text-lg group-hover:text-cyan-200 transition-colors duration-300">{feature}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>


        {/* Value Metrics */}
        <div className={`mt-20 transition-all duration-1000 ease-out delay-600 ${
          isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-20'
        }`}>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="relative bg-gradient-to-br from-gray-900/50 via-gray-800/40 to-black/60 backdrop-blur-xl border border-emerald-400/30 rounded-3xl p-6 text-center shadow-2xl shadow-emerald-400/20 overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-4 bg-gradient-to-b from-emerald-400/20 to-transparent rounded-t-3xl"></div>
              <div className="absolute top-0 left-0 bottom-0 w-4 bg-gradient-to-r from-emerald-400/15 to-transparent rounded-l-3xl"></div>
              <div className="relative z-10">
                <div className="text-3xl font-black text-emerald-400 mb-2">&lt;60s</div>
                <div className="text-gray-300 text-sm font-semibold">Response Time</div>
              </div>
            </div>
            <div className="relative bg-gradient-to-br from-gray-900/50 via-gray-800/40 to-black/60 backdrop-blur-xl border border-cyan-400/30 rounded-3xl p-6 text-center shadow-2xl shadow-cyan-400/20 overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-4 bg-gradient-to-b from-cyan-400/20 to-transparent rounded-t-3xl"></div>
              <div className="absolute top-0 left-0 bottom-0 w-4 bg-gradient-to-r from-cyan-400/15 to-transparent rounded-l-3xl"></div>
              <div className="relative z-10">
                <div className="text-3xl font-black text-cyan-400 mb-2">97.5%</div>
                <div className="text-gray-300 text-sm font-semibold">Customer Satisfaction</div>
              </div>
            </div>
            <div className="relative bg-gradient-to-br from-gray-900/50 via-gray-800/40 to-black/60 backdrop-blur-xl border border-purple-400/30 rounded-3xl p-6 text-center shadow-2xl shadow-purple-400/20 overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-4 bg-gradient-to-b from-purple-400/20 to-transparent rounded-t-3xl"></div>
              <div className="absolute top-0 left-0 bottom-0 w-4 bg-gradient-to-r from-purple-400/15 to-transparent rounded-l-3xl"></div>
              <div className="relative z-10">
                <div className="text-3xl font-black text-purple-400 mb-2">99.9%</div>
                <div className="text-gray-300 text-sm font-semibold">Network Uptime</div>
              </div>
            </div>
            <div className="relative bg-gradient-to-br from-gray-900/50 via-gray-800/40 to-black/60 backdrop-blur-xl border border-orange-400/30 rounded-3xl p-6 text-center shadow-2xl shadow-orange-400/20 overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-4 bg-gradient-to-b from-orange-400/20 to-transparent rounded-t-3xl"></div>
              <div className="absolute top-0 left-0 bottom-0 w-4 bg-gradient-to-r from-orange-400/15 to-transparent rounded-l-3xl"></div>
              <div className="relative z-10">
                <div className="text-3xl font-black text-orange-400 mb-2">250+</div>
                <div className="text-gray-300 text-sm font-semibold">Happy Businesses</div>
              </div>
            </div>
          </div>
        </div>

      </div>
    </section>
  )
}