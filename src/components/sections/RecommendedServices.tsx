'use client'

import { Service } from '@/types/services'
import { CheckIcon } from '@/components/icons/TechIcons'
import Link from 'next/link'

interface RecommendedServicesProps {
  recommendedServices: string[]
  services: Service[]
  onReset: () => void
}

export default function RecommendedServices({
  recommendedServices,
  services,
  onReset
}: RecommendedServicesProps) {
  return (
    <div className="text-center">
      <div className="mb-12">
        <div className="w-16 h-16 bg-cyan-600 rounded-full flex items-center justify-center mx-auto mb-6">
          <CheckIcon size={32} className="text-white" />
        </div>
        <h2 className="text-3xl md:text-4xl font-bold text-white mb-6">
          Perfect! We have solutions for your challenges
        </h2>
        <p className="text-lg text-gray-200 mb-12 max-w-3xl mx-auto leading-relaxed">
          Based on your selected challenges, here are our recommended services:
        </p>
      </div>

      {/* Recommended Services - Sleek Design */}
      <div className="max-w-5xl mx-auto mb-16 space-y-2">
        {recommendedServices.map((serviceName, index) => {
          const service = services.find(s => s.title === serviceName)
          if (!service) return null
          
          return (
            <div key={serviceName} className="group relative">
              <div className="relative overflow-hidden transition-all duration-500 hover:scale-[1.01]">
                {/* Sleek Background Glow Effect */}
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-cyan-500/5 via-cyan-400/10 to-cyan-500/5 border border-cyan-400/20 shadow-lg shadow-cyan-500/10"></div>
                
                <div className="relative z-10 flex flex-col sm:flex-row items-start space-y-4 sm:space-y-0 sm:space-x-6 md:space-x-8 py-4 sm:py-6 md:py-8 px-4 sm:px-6 md:px-8">
                  {/* Service Content */}
                  <div className="flex-1 min-w-0">
                    <h3 className="text-xl sm:text-2xl md:text-3xl font-black text-transparent bg-gradient-to-r from-cyan-400 via-cyan-300 to-cyan-400 bg-clip-text mb-3 sm:mb-4 leading-tight">
                      {service.title}
                    </h3>
                    <p className="text-gray-300/90 text-base sm:text-lg md:text-xl leading-relaxed font-light tracking-wide">
                      {service.subtitle}
                    </p>
                  </div>
                  
                  {/* Recommended Badge */}
                  <div className="flex items-center space-x-2 opacity-100 translate-x-0 transition-all duration-500 flex-shrink-0">
                    <div className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse"></div>
                    <span className="text-cyan-400 text-xs sm:text-sm font-medium uppercase tracking-wider hidden sm:inline">Recommended</span>
                  </div>
                </div>
              </div>
              
              {/* Sleek Separator Line */}
              {index < recommendedServices.length - 1 && (
                <div className="relative mx-4 sm:mx-6 md:mx-8">
                  <div className="h-px bg-gradient-to-r from-transparent via-gray-600/30 to-transparent"></div>
                  <div className="absolute inset-0 h-px bg-gradient-to-r from-transparent via-cyan-400/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row gap-6 justify-center">
        <Link
          href="/contact"
          className="inline-flex items-center justify-center bg-white text-gray-900 hover:bg-white/90 font-medium text-lg px-10 py-5 transition-all duration-500 rounded-2xl hover:scale-[1.02] shadow-lg shadow-white/20"
        >
          Get Started Today
        </Link>
        <button
          onClick={onReset}
          className="inline-flex items-center justify-center bg-white/10 hover:bg-white/20 text-white font-medium text-lg px-10 py-5 transition-all duration-500 rounded-2xl hover:scale-[1.02] border border-white/20 hover:border-white/30 backdrop-blur-sm"
          type="button"
        >
          Try Again
        </button>
      </div>
    </div>
  )
}
