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
      phase: 'TCT FORTRESS MANAGED SERVICES',
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
    <section className="relative py-32 bg-black overflow-hidden">
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
                  TCT FORTRESS MANAGED SERVICES
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
                <p className="text-xl text-white mb-8 leading-relaxed">
                  Fortress is the most comprehensive, secure and forward-thinking IT management platform in the industry.{' '}
                  <Link href="/services" className="text-white bg-black/30 px-3 py-1 rounded-lg hover:bg-black/50 font-semibold underline">
                    Learn more
                  </Link>
                </p>
              </div>

              {/* Features List */}
              <div>
                <div className="space-y-4">
                  {clientBenefits[activeStep].features.map((feature, index) => (
                    <div 
                      key={index}
                      className="flex items-center justify-center space-x-3 bg-gray-100/90 hover:bg-gray-200/90 border border-gray-300/50 rounded-xl p-4 transition-all duration-300 cursor-pointer"
                    >
                      <div className="w-2 h-2 bg-cyan-500 rounded-full"></div>
                      <span className="text-gray-800 font-semibold text-lg">{feature}</span>
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
            <div className="relative bg-gradient-to-br from-gray-900/50 via-gray-800/40 to-black/60 backdrop-blur-xl border border-red-400/30 rounded-3xl p-6 text-center shadow-2xl shadow-red-400/20 overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-4 bg-gradient-to-b from-red-400/20 to-transparent rounded-t-3xl"></div>
              <div className="absolute top-0 left-0 bottom-0 w-4 bg-gradient-to-r from-red-400/15 to-transparent rounded-l-3xl"></div>
              <div className="relative z-10">
                <div className="text-3xl font-black text-red-400 mb-2">100%</div>
                <div className="text-gray-300 text-sm font-semibold">Vulnerability Remediation</div>
              </div>
            </div>
            <div className="relative bg-gradient-to-br from-gray-900/50 via-gray-800/40 to-black/60 backdrop-blur-xl border border-purple-400/30 rounded-3xl p-6 text-center shadow-2xl shadow-purple-400/20 overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-4 bg-gradient-to-b from-purple-400/20 to-transparent rounded-t-3xl"></div>
              <div className="absolute top-0 left-0 bottom-0 w-4 bg-gradient-to-r from-purple-400/15 to-transparent rounded-l-3xl"></div>
              <div className="relative z-10">
                <div className="text-3xl font-black text-purple-400 mb-2">99.99%</div>
                <div className="text-gray-300 text-sm font-semibold">Uptime</div>
              </div>
            </div>
          </div>
        </div>

      </div>
    </section>
  )
}