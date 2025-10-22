'use client'

import React from 'react'
import { useAnimation } from '@/hooks/useAnimation'

interface SectionProps {
  children: React.ReactNode
  className?: string
  background?: 'light' | 'dark' | 'gradient' | 'transparent' | 'black-cyan' | 'cyan-black' | 'pure-cyan'
  id?: string
}

export default function Section({ 
  children, 
  className = '',
  background = 'light',
  id 
}: SectionProps) {
  const { isVisible, elementRef } = useAnimation(0.1)

  const backgroundClasses = {
    light: 'bg-white',
    dark: 'bg-gray-900',
    gradient: 'bg-gradient-to-br from-gray-50 via-white to-gray-100',
    transparent: '',
    'black-cyan': 'bg-gradient-to-br from-black via-gray-900 to-cyan-900',
    'cyan-black': 'bg-gradient-to-br from-cyan-900 via-gray-900 to-black',
    'pure-cyan': 'bg-cyan-500'
  }

  return (
    <section 
      id={id}
      className={`relative py-24 ${backgroundClasses[background]} overflow-hidden ${className}`}
    >
      {background === 'gradient' && (
        <div className="absolute inset-0">
          {/* Subtle background elements for gradient sections */}
          <div className="absolute inset-0 opacity-[0.02]">
            <div 
              className="absolute inset-0" 
              style={{
                backgroundImage: `
                  linear-gradient(rgba(59, 130, 246, 0.1) 1px, transparent 1px),
                  linear-gradient(90deg, rgba(59, 130, 246, 0.1) 1px, transparent 1px)
                `,
                backgroundSize: '100px 100px'
              }}
            ></div>
          </div>
        </div>
      )}
      
      {(background === 'black-cyan' || background === 'cyan-black') && (
        <div className="absolute inset-0">
          {/* Subtle background elements for black/cyan sections */}
          <div className="absolute inset-0 opacity-[0.03]">
            <div 
              className="absolute inset-0" 
              style={{
                backgroundImage: `
                  linear-gradient(rgba(6, 182, 212, 0.1) 1px, transparent 1px),
                  linear-gradient(90deg, rgba(6, 182, 212, 0.1) 1px, transparent 1px)
                `,
                backgroundSize: '80px 80px'
              }}
            ></div>
          </div>
        </div>
      )}

      {background === 'pure-cyan' && (
        <div className="absolute inset-0">
          {/* Subtle background pattern for pure cyan sections */}
          <div className="absolute inset-0 opacity-[0.05]">
            <div 
              className="absolute inset-0" 
              style={{
                backgroundImage: `
                  radial-gradient(circle at 25% 25%, rgba(255, 255, 255, 0.1) 1px, transparent 1px),
                  radial-gradient(circle at 75% 75%, rgba(255, 255, 255, 0.1) 1px, transparent 1px)
                `,
                backgroundSize: '60px 60px'
              }}
            ></div>
          </div>
        </div>
      )}
      
      <div className="relative z-10 max-w-7xl mx-auto px-6">
        <div 
          ref={elementRef}
          className={`transition-all duration-1000 ease-out ${
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
          }`}
        >
          {children}
        </div>
      </div>
    </section>
  )
}
