'use client'

import Link from 'next/link'
import { useAnimation, useParallax } from '@/hooks/useAnimation'
import { useState, useEffect } from 'react'
import { Button } from '@/components/ui'

export default function CallToAction() {
  const { isVisible, elementRef } = useAnimation(0.1)
  const parallaxOffset = useParallax(0.2)
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 })

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePosition({ x: e.clientX, y: e.clientY })
    }

    window.addEventListener('mousemove', handleMouseMove)
    return () => window.removeEventListener('mousemove', handleMouseMove)
  }, [])

  return (
    <section className="relative py-24 bg-gradient-to-br from-blue-600 via-purple-600 to-indigo-700 text-white overflow-hidden">
      {/* Enhanced 3D Background Elements */}
      <div className="absolute inset-0">
        {/* Floating 3D Geometric Shapes */}
        <div 
          className="absolute top-20 left-20 w-96 h-96 bg-gradient-to-br from-white/10 to-blue-300/10 rounded-full blur-3xl animate-pulse"
          style={{ 
            transform: `translateY(${parallaxOffset * 0.1}px) translateZ(0px) rotate(${parallaxOffset * 0.1}deg)`,
            filter: 'blur(40px)'
          }}
        ></div>
        <div 
          className="absolute bottom-20 right-20 w-80 h-80 bg-gradient-to-br from-purple-300/10 to-pink-300/10 rounded-full blur-3xl animate-pulse delay-1000"
          style={{ 
            transform: `translateY(${parallaxOffset * 0.15}px) translateZ(0px) rotate(-${parallaxOffset * 0.1}deg)`,
            filter: 'blur(35px)'
          }}
        ></div>
        <div 
          className="absolute top-1/2 left-1/2 w-64 h-64 bg-gradient-to-br from-indigo-300/10 to-blue-300/10 rounded-full blur-3xl animate-pulse delay-2000"
          style={{ 
            transform: `translateY(${parallaxOffset * 0.2}px) translateZ(0px) rotate(${parallaxOffset * 0.15}deg)`,
            filter: 'blur(30px)'
          }}
        ></div>
        
        {/* Additional 3D Elements */}
        <div 
          className="absolute top-1/4 right-1/4 w-32 h-32 bg-gradient-to-br from-cyan-300/8 to-blue-300/8 rounded-full blur-2xl animate-pulse delay-1500"
          style={{ 
            transform: `translateY(${parallaxOffset * 0.25}px) translateZ(0px) rotate(${parallaxOffset * 0.2}deg)`,
            filter: 'blur(25px)'
          }}
        ></div>
        <div 
          className="absolute bottom-1/4 left-1/4 w-40 h-40 bg-gradient-to-br from-emerald-300/8 to-teal-300/8 rounded-full blur-2xl animate-pulse delay-2500"
          style={{ 
            transform: `translateY(${parallaxOffset * 0.3}px) translateZ(0px) rotate(-${parallaxOffset * 0.15}deg)`,
            filter: 'blur(30px)'
          }}
        ></div>
      </div>

      {/* 3D Grid Pattern Overlay */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute inset-0" style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
          backgroundSize: '100px 100px',
          transform: `translateZ(0px)`
        }}></div>
      </div>

      {/* Diagonal 3D Lines */}
      <div className="absolute inset-0 opacity-5">
        <div className="absolute inset-0" style={{
          backgroundImage: `linear-gradient(45deg, rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(-45deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
          backgroundSize: '80px 80px',
          transform: `translateZ(0px)`
        }}></div>
      </div>

      <div className="relative z-10 container-max text-center">
        <div 
          ref={elementRef}
          className={`max-w-4xl mx-auto transition-all duration-1000 ease-out ${
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-20'
          }`}
        >
          {/* Enhanced 3D Main Heading */}
          <h2 className="text-4xl md:text-6xl font-black mb-8 drop-shadow-2xl">
            Ready to Stop Stressing About{' '}
            <span className="bg-gradient-to-r from-white via-blue-100 to-cyan-100 bg-clip-text text-transparent drop-shadow-2xl">
              IT?
            </span>
          </h2>
          
          {/* Enhanced 3D Description */}
          <p className="text-xl md:text-2xl mb-12 text-blue-100 leading-relaxed drop-shadow-lg max-w-3xl mx-auto">
            Schedule a free meeting with our team. We'll discuss your challenges, identify opportunities, 
            and build a roadmap that puts your business in control of its technology.
          </p>
          
          {/* Enhanced 3D CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-6 justify-center items-center mb-12">
            <div className="relative group">
              <Button
                asChild
                variant="outline"
                size="xl"
                className="bg-white/90 backdrop-blur-xl text-blue-600 hover:bg-white hover:scale-110 hover:shadow-2xl hover:shadow-white/30 transform hover:-translate-y-2 border-white/30 font-bold py-5 px-10 rounded-3xl transition-all duration-500 shadow-xl shadow-white/20"
                style={{
                  transformStyle: 'preserve-3d',
                  transform: 'perspective(1000px)'
                }}
              >
                <Link href="/contact">
                  Schedule Free Consultation
                </Link>
                
                {/* Enhanced 3D Glow Effect */}
                <div className="absolute inset-0 bg-white rounded-3xl opacity-0 group-hover:opacity-20 blur-2xl scale-110 transition-all duration-500"></div>
                
                {/* Floating 3D Elements */}
                <div className="absolute -top-2 -left-2 w-3 h-3 bg-blue-400 rounded-full opacity-0 group-hover:opacity-100 transition-all duration-500 animate-ping"></div>
                <div className="absolute -bottom-2 -right-2 w-2 h-2 bg-purple-400 rounded-full opacity-0 group-hover:opacity-100 transition-all duration-500 delay-200 animate-ping"></div>
              </Button>
            </div>
            
            <div className="relative group">
              <Button
                asChild
                variant="primary"
                size="xl"
                className="bg-gradient-to-r from-blue-700 to-purple-700 hover:from-blue-800 hover:to-purple-800 hover:scale-110 hover:shadow-2xl hover:shadow-purple-500/30 transform hover:-translate-y-2 border-white/20 font-bold py-5 px-10 rounded-3xl transition-all duration-500 shadow-xl shadow-black/20"
                style={{
                  transformStyle: 'preserve-3d',
                  transform: 'perspective(1000px)'
                }}
              >
                <a href="tel:607-222-TCT1">
                  Call (607) 222-TCT1
                </a>
                
                {/* Enhanced 3D Glow Effect */}
                <div className="absolute inset-0 bg-gradient-to-r from-blue-700 to-purple-700 rounded-3xl opacity-0 group-hover:opacity-30 blur-2xl scale-110 transition-all duration-500"></div>
                
                {/* Floating 3D Elements */}
                <div className="absolute -top-2 -left-2 w-3 h-3 bg-white/60 rounded-full opacity-0 group-hover:opacity-100 transition-all duration-500 animate-ping"></div>
                <div className="absolute -bottom-2 -right-2 w-2 h-2 bg-white/60 rounded-full opacity-0 group-hover:opacity-100 transition-all duration-500 delay-200 animate-ping"></div>
              </Button>
            </div>
          </div>
          
          {/* Enhanced 3D Info Card */}
          <div 
            className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-3xl p-8 shadow-2xl hover:shadow-3xl transition-all duration-700 hover:scale-105 hover:-translate-y-2 transform hover:rotate-y-2 hover:rotate-x-1 cursor-pointer group"
            style={{
              transformStyle: 'preserve-3d',
              transform: `perspective(1000px) rotateY(${(mousePosition.x - window.innerWidth / 2) * 0.003}deg) rotateX(${(window.innerHeight / 2 - mousePosition.y) * 0.003}deg)`
            }}
          >
            {/* Enhanced 3D Gradient Border */}
            <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-blue-300/20 rounded-3xl opacity-0 group-hover:opacity-100 transition-all duration-700 blur-sm scale-105"></div>
            
            <div className="relative z-10">
              <p className="text-xl text-blue-100 leading-relaxed drop-shadow-lg">
                <strong className="text-white drop-shadow-lg">What to expect:</strong> A 30-minute conversation about your business, 
                current IT challenges, and how we can help you achieve your technology goals.
              </p>
            </div>

            {/* Enhanced 3D Hover Glow */}
            <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-blue-300/20 rounded-3xl opacity-0 group-hover:opacity-10 transition-opacity duration-700 blur-2xl scale-110"></div>

            {/* 3D Floating Elements */}
            <div className="absolute top-4 right-4 w-3 h-3 bg-white/60 rounded-full opacity-0 group-hover:opacity-100 transition-all duration-700 group-hover:animate-ping shadow-lg"></div>
            <div className="absolute bottom-4 left-4 w-2 h-2 bg-purple-300/60 rounded-full opacity-0 group-hover:opacity-100 transition-all duration-700 delay-100 group-hover:animate-ping shadow-lg"></div>
            <div className="absolute top-1/2 right-2 w-1.5 h-1.5 bg-cyan-300/60 rounded-full opacity-0 group-hover:opacity-100 transition-all duration-700 delay-200 group-hover:animate-ping shadow-lg"></div>
            
            {/* 3D Corner Accents */}
            <div className="absolute top-0 left-0 w-0 h-0 border-l-[20px] border-t-[20px] border-l-transparent border-t-transparent opacity-0 group-hover:opacity-100 transition-all duration-700">
              <div className="w-4 h-4 bg-gradient-to-br from-white to-blue-300 rounded-full absolute -top-2 -left-2 shadow-lg"></div>
            </div>
            <div className="absolute bottom-0 right-0 w-0 h-0 border-r-[20px] border-b-[20px] border-r-transparent border-b-transparent opacity-0 group-hover:opacity-100 transition-all duration-700">
              <div className="w-4 h-4 bg-gradient-to-br from-purple-300 to-white rounded-full absolute -bottom-2 -right-2 shadow-lg"></div>
            </div>
            
            {/* 3D Edge Lines */}
            <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-transparent via-white/50 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-700 transform scale-x-0 group-hover:scale-x-100 origin-left"></div>
            <div className="absolute bottom-0 right-0 w-0.5 h-full bg-gradient-to-b from-transparent via-white/50 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-700 transform scale-y-0 group-hover:scale-y-100 origin-top"></div>
          </div>
        </div>
      </div>
    </section>
  )
}
