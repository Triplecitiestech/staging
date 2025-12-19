'use client'

import React from 'react'
import { useAnimation } from '@/hooks/useAnimation'

interface PageHeroProps {
  title: string
  subtitle: string
  description?: string
  badge?: string
  gradientFrom?: string
  gradientTo?: string
  videoBackground?: string
  imageBackground?: string
  textAlign?: 'left' | 'center' | 'right'
  verticalPosition?: 'top' | 'center' | 'bottom'
  subtitlePosition?: 'below' | 'side' | 'above'
  titleNoWrap?: boolean
  showGradientTransition?: boolean
}

export default function PageHero({ 
  title, 
  subtitle, 
  description = '',
  badge = '',
  gradientFrom = 'from-slate-950',
  gradientTo = 'to-gray-900',
  videoBackground,
  imageBackground,
  textAlign = 'center',
  verticalPosition = 'center',
  subtitlePosition = 'below',
  titleNoWrap = false,
  showGradientTransition = true
}: PageHeroProps) {
  const { isVisible, elementRef } = useAnimation(0.1)

  return (
    <section className={`relative py-32 ${!videoBackground && !imageBackground && gradientFrom !== 'from-transparent' ? `bg-gradient-to-br ${gradientFrom} via-gray-900 ${gradientTo}` : ''} overflow-hidden`}>
      {/* Background Elements */}
      <div className="absolute inset-0">
        {/* Video Background */}
        {videoBackground && (
          <video
            autoPlay
            muted
            loop
            playsInline
            className="absolute inset-0 w-full h-full object-cover"
          >
            <source src={videoBackground} type="video/webm" />
          </video>
        )}
        
        {/* Image Background */}
        {imageBackground && (
          <div 
            className="absolute inset-0 w-full h-full bg-cover bg-center bg-no-repeat"
            style={{
              backgroundImage: `url(${imageBackground})`
            }}
          ></div>
        )}
        
        {/* Overlay for better text readability */}
        <div className={`absolute inset-0 ${videoBackground ? 'bg-black/70' : imageBackground ? 'bg-black/40' : gradientFrom === 'from-transparent' ? 'bg-transparent' : ''}`}></div>
        
        {/* Subtle Grid */}
        <div className="absolute inset-0 opacity-[0.02]">
          <div 
            className="absolute inset-0" 
            style={{
              backgroundImage: `
                linear-gradient(rgba(255, 255, 255, 0.1) 1px, transparent 1px),
                linear-gradient(90deg, rgba(255, 255, 255, 0.1) 1px, transparent 1px)
              `,
              backgroundSize: '60px 60px'
            }}
          ></div>
        </div>
        
        {/* Single Elegant Glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] bg-gradient-to-r from-cyan-500/5 via-blue-600/8 to-purple-600/5 rounded-full blur-3xl"></div>
      </div>

      <div className={`relative z-10 max-w-6xl mx-auto px-6 ${
        textAlign === 'left' ? 'text-left' : 
        textAlign === 'right' ? 'text-right' : 
        'text-center'
      } ${
        verticalPosition === 'top' ? 'pt-16 pb-32' :
        verticalPosition === 'bottom' ? 'pt-32 pb-16' :
        'py-32'
      }`}>
        <div 
          ref={elementRef}
          className={`transition-all duration-1200 ease-out ${
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
          }`}
        >
          
          {/* Badge */}
          {badge && (
            <div className={`transition-all duration-700 delay-100 ${
              isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
            }`}>
              <div className="inline-flex items-center space-x-2 mb-8">
                <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-pulse"></div>
                <span className="text-cyan-400 text-sm font-medium tracking-wider uppercase">
                  {badge}
                </span>
              </div>
            </div>
          )}
          
          {subtitlePosition === 'side' ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-center">
              {/* Title */}
              <div>
                <h1 className={`text-3xl sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-black text-white leading-tight transition-all duration-700 delay-200 ${
                  titleNoWrap ? 'md:whitespace-nowrap' : ''
                } ${
                  isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
                }`}>
                  {title}
                </h1>
              </div>
              
              {/* Subtitle */}
              <div>
                <p className={`text-xl md:text-2xl text-white font-medium leading-relaxed transition-all duration-700 delay-300 ${
                  isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
                }`} style={{
                  textShadow: '0 4px 8px rgba(0, 0, 0, 0.8), 0 2px 4px rgba(0, 0, 0, 0.6), 0 0 20px rgba(255, 255, 255, 0.1)',
                  transform: 'translateZ(10px)',
                  filter: 'drop-shadow(0 4px 8px rgba(0, 0, 0, 0.8))'
                }}>
                  {subtitle}
                </p>
              </div>
            </div>
          ) : subtitlePosition === 'above' ? (
            <>
              {/* Subtitle */}
              <p className={`text-xl md:text-2xl text-white font-medium max-w-4xl ${
                textAlign === 'left' ? 'ml-0' : 
                textAlign === 'right' ? 'mr-0' : 
                'mx-auto'
              } leading-relaxed transition-all duration-700 delay-200 mb-8 ${
                isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
              }`} style={{
                textShadow: '0 4px 8px rgba(0, 0, 0, 0.8), 0 2px 4px rgba(0, 0, 0, 0.6), 0 0 20px rgba(255, 255, 255, 0.1)',
                transform: 'translateZ(10px)',
                filter: 'drop-shadow(0 4px 8px rgba(0, 0, 0, 0.8))'
              }}>
                {subtitle}
              </p>
              
              {/* Title */}
              <h1 className={`text-3xl sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-black text-white leading-tight transition-all duration-700 delay-300 ${
                titleNoWrap ? 'md:whitespace-nowrap' : ''
              } ${
                isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
              }`}>
                {title}
              </h1>
              
              {/* Description */}
              {description && (
                <p className={`text-lg md:text-xl text-white/90 font-medium max-w-4xl ${
                  textAlign === 'left' ? 'ml-0' : 
                  textAlign === 'right' ? 'mr-0' : 
                  'mx-auto'
                } leading-relaxed transition-all duration-700 delay-400 mt-6 ${
                  isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
                }`} style={{
                  textShadow: '0 4px 8px rgba(0, 0, 0, 0.8), 0 2px 4px rgba(0, 0, 0, 0.6), 0 0 20px rgba(255, 255, 255, 0.1)',
                  transform: 'translateZ(10px)',
                  filter: 'drop-shadow(0 4px 8px rgba(0, 0, 0, 0.8))'
                }}>
                  {description}
                </p>
              )}
            </>
          ) : (
            <>
              {/* Title */}
              <h1 className={`text-3xl sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-black text-white mb-8 leading-tight transition-all duration-700 delay-200 ${
                titleNoWrap ? 'md:whitespace-nowrap' : ''
              } ${
                isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
              }`}>
                {title}
              </h1>
              
              {/* Subtitle */}
              <p className={`text-xl md:text-2xl text-white font-medium max-w-4xl ${
                textAlign === 'left' ? 'ml-0' : 
                textAlign === 'right' ? 'mr-0' : 
                'mx-auto'
              } leading-relaxed transition-all duration-700 delay-300 ${
                isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
              }`} style={{
                textShadow: '0 4px 8px rgba(0, 0, 0, 0.8), 0 2px 4px rgba(0, 0, 0, 0.6), 0 0 20px rgba(255, 255, 255, 0.1)',
                transform: 'translateZ(10px)',
                filter: 'drop-shadow(0 4px 8px rgba(0, 0, 0, 0.8))'
              }}>
                {subtitle}
              </p>
              
              {/* Description */}
              {description && (
                <p className={`text-lg md:text-xl text-white/90 font-medium max-w-4xl ${
                  textAlign === 'left' ? 'ml-0' : 
                  textAlign === 'right' ? 'mr-0' : 
                  'mx-auto'
                } leading-relaxed transition-all duration-700 delay-400 mt-6 ${
                  isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
                }`} style={{
                  textShadow: '0 4px 8px rgba(0, 0, 0, 0.8), 0 2px 4px rgba(0, 0, 0, 0.6), 0 0 20px rgba(255, 255, 255, 0.1)',
                  transform: 'translateZ(10px)',
                  filter: 'drop-shadow(0 4px 8px rgba(0, 0, 0, 0.8))'
                }}>
                  {description}
                </p>
              )}
            </>
          )}
        </div>
      </div>

      {/* Seamless Gradient Transition */}
      {showGradientTransition && (
        <div className="absolute bottom-0 left-0 right-0 z-20 h-32 bg-gradient-to-b from-transparent via-black/50 to-black"></div>
      )}
    </section>
  )
}
