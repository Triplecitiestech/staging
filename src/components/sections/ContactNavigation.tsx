'use client'

import React from 'react'
import { useAnimation } from '@/hooks/useAnimation'

export default function ContactNavigation() {
  const { isVisible, elementRef } = useAnimation(0.1)

  return (
    <section className="relative py-8 bg-black overflow-hidden">
      
      <div className="relative z-10 max-w-7xl mx-auto px-6">
        {/* CTA Content - Directly on background */}
        <div 
          ref={elementRef}
          className={`transition-all duration-1000 ease-out ${
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-20'
          }`}
        >
          <div className="relative flex justify-center items-center py-4">
            {/* Abstract Graphic Centered */}
            <div className="relative h-40 lg:h-48 opacity-30">
              <div className="relative w-full h-full">
                {/* Radiant concentric circles with glow effects */}
                <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-40 h-40 bg-gradient-to-br from-cyan-400/40 to-cyan-600/30 rounded-full blur-lg shadow-2xl shadow-cyan-400/20"></div>
                <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-32 h-32 bg-gradient-to-br from-cyan-300/50 to-cyan-500/40 rounded-full blur-md shadow-xl shadow-cyan-300/30"></div>
                <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-24 h-24 bg-gradient-to-br from-cyan-200/60 to-cyan-400/50 rounded-full blur-sm shadow-lg shadow-cyan-200/40"></div>
                <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-16 h-16 bg-gradient-to-br from-white/70 to-cyan-300/60 rounded-full blur-sm shadow-md shadow-white/20"></div>
                <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-8 h-8 bg-gradient-to-br from-white/80 to-cyan-200/70 rounded-full shadow-lg shadow-white/30"></div>
                
                {/* Additional radiant geometric shapes */}
                <div className="absolute top-1/4 left-1/4 w-16 h-16 bg-gradient-to-br from-cyan-400/40 to-cyan-600/30 rounded-lg rotate-45 blur-md shadow-xl shadow-cyan-400/25"></div>
                <div className="absolute bottom-1/4 right-1/4 w-12 h-12 bg-gradient-to-br from-cyan-300/50 to-cyan-500/40 rounded-full blur-sm shadow-lg shadow-cyan-300/30"></div>
                <div className="absolute top-3/4 left-1/3 w-8 h-8 bg-gradient-to-br from-cyan-200/60 to-cyan-400/50 rounded-full blur-sm shadow-md shadow-cyan-200/35"></div>
                <div className="absolute top-1/6 right-1/6 w-6 h-6 bg-gradient-to-br from-white/70 to-cyan-300/60 rounded-full shadow-md shadow-white/25"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
