'use client'

import React from 'react'
import { useAnimation } from '@/hooks/useAnimation'
import { ZapIcon, RocketIcon, PhoneIcon, LockboxIcon } from '@/components/icons/TechIcons'

export default function StreamlinedProcess() {
  const { isVisible, elementRef } = useAnimation(0.1)

  const salesProcess = [
    {
      step: '01',
      title: 'Kickoff Call',
      description: 'Initial fact gathering and start of assessment',
      icon: <PhoneIcon size={32} className="text-white" />,
      color: 'from-cyan-400 to-cyan-600'
    },
    {
      step: '02',
      title: 'Rapid Deployment',
      description: 'Install TCT suite of tools and begin comprehensive documentation',
      icon: <ZapIcon size={32} className="text-white" />,
      color: 'from-cyan-400 to-cyan-600'
    },
    {
      step: '03',
      title: 'Secure Environment',
      description: 'Apply TCT security standards and continue deep analysis',
      icon: <LockboxIcon size={32} className="text-white" />,
      color: 'from-cyan-400 to-cyan-600'
    },
    {
      step: '04',
      title: 'Go Live',
      description: 'Assessment review and communications with staff',
      icon: <RocketIcon size={32} className="text-white" />,
      color: 'from-cyan-400 to-cyan-600'
    }
  ]

  return (
    <section 
      ref={elementRef}
      className="relative py-32 bg-gradient-to-br from-black via-gray-900 to-cyan-900"
    >
      <div className="relative z-10 max-w-7xl mx-auto px-6">
        <div className={`text-center mb-12 transition-all duration-1000 ease-out ${
          isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-20'
        }`}>
          <h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-black text-white mb-4 md:mb-6 lg:mb-8 leading-tight">First 30 Days</h2>
          <p className="text-gray-300 text-lg">From kickoff to go-live in 4 comprehensive steps</p>
        </div>

        <div className={`grid grid-cols-1 md:grid-cols-4 gap-8 transition-all duration-1000 ease-out delay-200 ${
          isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-20'
        }`}>
          {salesProcess.map((step, index) => (
            <div key={index} className="text-center relative group">
              {/* Step Icon with 3D Effect */}
              <div className={`relative w-20 h-20 bg-gradient-to-r ${step.color} rounded-2xl flex items-center justify-center mb-6 mx-auto shadow-2xl shadow-cyan-400/30 transform group-hover:scale-110 transition-all duration-300 overflow-hidden`}>
                {/* 3D Top Highlight */}
                <div className="absolute top-0 left-0 right-0 h-4 bg-gradient-to-b from-white/30 to-transparent rounded-t-2xl"></div>
                {/* 3D Side Highlight */}
                <div className="absolute top-0 left-0 bottom-0 w-4 bg-gradient-to-r from-white/20 to-transparent rounded-l-2xl"></div>
                <div className="relative z-10">
                  {React.cloneElement(step.icon, { size: 32 })}
                </div>
              </div>
              
              {/* Step Number with Enhanced Styling */}
              <div className={`font-black text-xl mb-3 bg-gradient-to-r ${step.color} bg-clip-text text-transparent relative`}>
                <span className="relative z-10">{step.step}</span>
                <div className="absolute inset-0 bg-gradient-to-r from-cyan-400/20 to-cyan-600/20 blur-sm"></div>
              </div>
              
              {/* Step Content */}
              <div className="relative">
                <h4 className="text-xl font-bold text-white mb-3 group-hover:text-cyan-300 transition-colors duration-300">{step.title}</h4>
                <p className="text-gray-300 text-sm leading-relaxed">{step.description}</p>
              </div>
              
              {/* Enhanced Connector */}
              {index < salesProcess.length - 1 && (
                <div className={`hidden md:block absolute top-10 -right-4 w-12 h-1 bg-gradient-to-r from-cyan-400 via-cyan-500 to-cyan-600 rounded-full shadow-lg shadow-cyan-400/50`}></div>
              )}
            </div>
          ))}
        </div>

      </div>
    </section>
  )
}
