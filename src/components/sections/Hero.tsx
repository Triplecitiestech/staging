'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useAnimation } from '@/hooks/useAnimation'
import Image from 'next/image'

export default function Hero() {
  const { isVisible, elementRef } = useAnimation(0.1)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) return null

  return (
    <section className="relative min-h-screen overflow-hidden">
      {/* Hero Background Image */}
      <div className="absolute inset-0">
        <Image
          src="/herobg.webp"
          alt="Hero Background"
          fill
          className="object-cover object-[center_20%]"
          priority
          fetchPriority="high"
        />
        {/* Dark overlay for better text readability */}
        <div className="absolute inset-0 bg-black/40"></div>
      </div>
      
      <div className="relative z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 sm:pt-32 lg:pt-40 pb-16 sm:pb-20">
          <div className="flex items-center justify-center min-h-[75vh] sm:min-h-[80vh]">
            
            {/* Centered Hero Content */}
            <div 
              ref={elementRef}
              className={`transition-all duration-1000 ease-out text-center max-w-6xl mx-auto ${
                isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-20'
              }`}
            >
              
              {/* Main Headline - Centered Layout */}
              <div className="space-y-6 mb-10">
                <h1 className={`transition-all duration-700 delay-200 ${
                  isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
                }`}>
                  <div className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-black text-white leading-tight sm:leading-[0.9] mb-4 md:whitespace-nowrap">
                    Triple Cities Tech
                  </div>
                  <div className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-normal leading-tight sm:leading-[0.9] mb-4 md:whitespace-nowrap">
                    <span className="text-cyan-400">
                      We turn IT into a competitive advantage.
                    </span>
                  </div>
                </h1>
          
                <p className={`text-lg sm:text-xl md:text-2xl text-white font-bold leading-relaxed max-w-3xl mx-auto transition-all duration-700 delay-300 ${
                  isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
                }`}>
                  As your managed IT partner, we help you operate smarter, safer, and more efficiently with clarity, stability, and strategic technology alignment that drives real ROI.
                </p>
              </div>

              {/* CTA Buttons - Centered */}
              <div className={`flex flex-col sm:flex-row gap-6 justify-center items-center transition-all duration-700 delay-500 ${
                isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
              }`}>
                <Link 
                  href="/contact"
                  className="group relative bg-gradient-to-r from-cyan-500 to-cyan-600 text-white px-8 py-4 rounded-lg font-semibold text-lg hover:from-cyan-400 hover:to-cyan-500 transition-all duration-300 hover:scale-105 shadow-lg hover:shadow-cyan-500/25"
                >
                  Get Started
                </Link>
                
                <Link
                  href="#drive-business-growth"
                  className="group relative text-white border-2 border-cyan-500 px-8 py-4 rounded-lg font-medium text-lg hover:border-cyan-400 hover:bg-cyan-500/10 transition-all duration-300 hover:scale-105"
                >
                  Learn More
                </Link>
              </div>
              
            </div>
          </div>
          

        </div>
      </div>

      {/* Seamless Gradient Transition */}
      <div className="absolute bottom-0 left-0 right-0 z-20 h-32 bg-gradient-to-b from-transparent via-black/50 to-black"></div>
    </section>
  )
}

