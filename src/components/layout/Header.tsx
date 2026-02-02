'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { NAVIGATION } from '@/constants/data'
import { siteConfig } from '@/config/site'
import { Button } from '@/components/ui'

export default function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const pathname = usePathname()

  // Prevent body scroll when mobile menu is open
  useEffect(() => {
    if (isMenuOpen) {
      document.body.classList.add('menu-open')
    } else {
      document.body.classList.remove('menu-open')
    }
    
    // Cleanup on unmount
    return () => {
      document.body.classList.remove('menu-open')
    }
  }, [isMenuOpen])

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-black/20 backdrop-blur-md border-b border-white/10">
      <nav className="container-responsive">
        <div className="flex justify-between items-center py-2 sm:py-3">
          {/* Modern Logo */}
          <Link href="/" className="flex items-center space-x-2 group">
            <div className="w-10 sm:w-12 h-10 sm:h-12 flex items-center justify-center">
              <Image
                src="/logo/tctlogo.webp"
                alt="Triple Cities Tech Logo"
                width={64}
                height={64}
                className="w-full h-full object-contain"
                priority
              />
            </div>
            <span className="text-sm sm:text-base lg:text-lg font-black text-white drop-shadow-lg truncate">
              {siteConfig.name}
            </span>
          </Link>

          {/* Desktop Navigation with Enhanced Hover Effects */}
          <div className="hidden lg:flex items-center space-x-6">
            {NAVIGATION.desktop.map((item, index) => {
              const isActive = pathname === item.href
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  className={`relative font-semibold transition-all duration-300 hover:scale-105 group ${
                    isActive ? 'text-white' : 'text-white/90 hover:text-white'
                  }`}
                  style={{ animationDelay: `${index * 100}ms` }}
                >
                  {item.label}
                  {/* Active underline - always visible when on this page */}
                  <span className={`absolute -bottom-1 left-0 h-0.5 bg-gradient-to-r from-cyan-400 to-cyan-500 transition-all duration-300 ${
                    isActive ? 'w-full' : 'w-0 group-hover:w-full'
                  }`}></span>
                  <span className={`absolute -bottom-1 right-0 h-0.5 bg-gradient-to-r from-cyan-500 to-cyan-400 transition-all duration-300 ${
                    isActive ? 'w-full' : 'w-0 group-hover:w-full delay-150'
                  }`}></span>
                </Link>
              )
            })}
            <Button
              asChild
              variant="primary"
              size="md"
              className="bg-white/10 border border-white/20 hover:bg-white/20 text-white"
            >
              <Link href="/contact#customer-support">Get Support</Link>
            </Button>
            <Button
              asChild
              variant="primary"
              size="md"
              className="bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-400 hover:to-cyan-500"
            >
              <Link href="/contact">Contact Us</Link>
            </Button>
          </div>

          {/* Clean Mobile Menu Button */}
          <button
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="lg:hidden relative p-2 rounded-lg transition-all duration-300 bg-white/10 backdrop-blur-sm border border-white/20 text-white hover:bg-white/20"
          >
            {/* Clean Hamburger Animation */}
            <div className="w-6 h-6 relative">
              <span className={`absolute w-full h-0.5 left-0 transition-all duration-300 transform origin-center ${
                isMenuOpen 
                  ? 'rotate-45 top-3 bg-current' 
                  : 'top-1 bg-current'
              }`}></span>
              <span className={`absolute w-full h-0.5 left-0 top-3 transition-all duration-300 ${
                isMenuOpen 
                  ? 'opacity-0 scale-0' 
                  : 'opacity-100 scale-100 bg-current'
              }`}></span>
              <span className={`absolute w-full h-0.5 left-0 transition-all duration-300 transform origin-center ${
                isMenuOpen 
                  ? '-rotate-45 top-3 bg-current' 
                  : 'top-5 bg-current'
              }`}></span>
            </div>
          </button>
        </div>

        {/* SLEEK MINIMALIST NAVIGATION */}
        <div 
          className={`lg:hidden mobile-menu-overlay transition-all duration-500 ease-out ${
            isMenuOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
          }`}
        >
          {/* Backdrop Overlay */}
          <div className="mobile-menu-backdrop"></div>

          {/* Dark Glass Background */}
          <div className="absolute inset-0 bg-gradient-to-br from-gray-900 via-black to-gray-900 perspective-1000 transform-gpu w-full h-full">
            {/* Subtle Glow Effect */}
            <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 via-transparent to-purple-500/10" style={{ transform: 'translateZ(10px)' }}></div>
            
            {/* 3D Dynamic Pattern */}
            <div className="absolute inset-0 opacity-10" style={{ transform: 'translateZ(20px)' }}>
              <div 
                className="absolute inset-0" 
                style={{
                  backgroundImage: `
                    radial-gradient(circle at 25% 25%, rgba(255, 255, 255, 0.3) 2px, transparent 2px),
                    radial-gradient(circle at 75% 75%, rgba(255, 255, 255, 0.2) 1px, transparent 1px)
                  `,
                  backgroundSize: '80px 80px',
                  filter: 'drop-shadow(0 4px 8px rgba(0, 0, 0, 0.3))'
                }}
              ></div>
            </div>
            
            {/* 3D Floating Elements */}
            <div className="absolute inset-0 overflow-hidden">
              <div className="absolute top-20 left-10 w-32 h-32 bg-cyan-500/5 rounded-full blur-xl" style={{ transform: 'translateZ(30px) rotateX(15deg)' }}></div>
              <div className="absolute top-40 right-16 w-24 h-24 bg-purple-500/5 rounded-full blur-lg" style={{ transform: 'translateZ(25px) rotateY(10deg)' }}></div>
              <div className="absolute bottom-32 left-20 w-20 h-20 bg-blue-500/5 rounded-full blur-md" style={{ transform: 'translateZ(35px) rotateX(-10deg)' }}></div>
            </div>
          </div>

          {/* MINIMALIST NAVIGATION CONTENT */}
          <div className="relative z-10 h-full flex flex-col">
            {/* Clean Header */}
            <div className="flex justify-between items-center p-6 sm:p-8">
              {/* 3D Minimalist Logo */}
              <div className="flex items-center space-x-4" style={{ transform: 'translateZ(40px)' }}>
                <div 
                  className="w-20 h-20 flex items-center justify-center transform-gpu hover:scale-110 transition-all duration-300 relative"
                  style={{ 
                    transform: 'translateZ(50px) rotateX(10deg) rotateY(-5deg)',
                    filter: 'drop-shadow(0 8px 16px rgba(0, 0, 0, 0.4)) drop-shadow(0 4px 8px rgba(6, 182, 212, 0.3))'
                  }}
                >
                  {/* Logo Image */}
                  <Image
                    src="/logo/tctlogo.webp"
                    alt="Triple Cities Tech Logo"
                    width={80}
                    height={80}
                    className="w-full h-full object-contain relative z-10"
                    style={{ 
                      filter: 'drop-shadow(0 4px 8px rgba(0, 0, 0, 0.6)) drop-shadow(0 2px 4px rgba(6, 182, 212, 0.4))',
                      transform: 'translateZ(10px)'
                    }}
                  />
                </div>
                <div style={{ transform: 'translateZ(15px)' }}>
                  <h1 className="text-2xl font-black text-white" style={{ 
                    textShadow: '0 4px 8px rgba(0, 0, 0, 0.5), 0 2px 4px rgba(0, 0, 0, 0.3), 0 0 20px rgba(6, 182, 212, 0.3)'
                  }}>{siteConfig.name}</h1>
                  <p className="text-white/90 text-sm font-semibold mt-2" style={{ 
                    textShadow: '0 2px 4px rgba(0, 0, 0, 0.4)'
                  }}>Technology solutions built for business</p>
                </div>
              </div>
              
              {/* 3D Close Button */}
              <button
                onClick={() => setIsMenuOpen(false)}
                className="w-12 h-12 bg-white/20 backdrop-blur-sm border border-white/30 hover:bg-white/30 rounded-xl flex items-center justify-center group transition-all duration-300 transform-gpu hover:scale-110"
                style={{ 
                  boxShadow: `
                    0 8px 32px rgba(0, 0, 0, 0.3),
                    0 4px 16px rgba(255, 255, 255, 0.1),
                    inset 0 1px 0 rgba(255, 255, 255, 0.2)
                  `,
                  transform: 'translateZ(40px) rotateX(5deg)'
                }}
              >
                <div className="w-6 h-6 relative flex items-center justify-center">
                  <span className="absolute w-6 h-0.5 bg-white transform rotate-45" style={{ 
                    filter: 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.5))'
                  }}></span>
                  <span className="absolute w-6 h-0.5 bg-white transform -rotate-45" style={{ 
                    filter: 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.5))'
                  }}></span>
                </div>
              </button>
            </div>

            {/* 3D NAVIGATION LINKS */}
            <div className="flex-1 flex flex-col justify-center px-4 sm:px-6 space-y-2" style={{ transform: 'translateZ(30px)' }}>
              {NAVIGATION.mobile.map((item, index) => {
                const isActive = pathname === item.href
                return (
                  <Link
                    key={item.label}
                    href={item.href}
                    onClick={() => setIsMenuOpen(false)}
                    className={`group relative py-5 px-6 rounded-2xl transition-all duration-500 backdrop-blur-sm text-center transform-gpu hover:scale-105 ${
                      isActive ? 'bg-white/20 border-2 border-cyan-300/50' : 'hover:bg-white/15'
                    }`}
                    style={{ 
                      animationDelay: `${index * 100}ms`,
                      animation: isMenuOpen ? 'slideInLeft 0.6s ease-out forwards' : 'none',
                      boxShadow: isActive 
                        ? `
                          0 8px 32px rgba(6, 182, 212, 0.4),
                          0 4px 16px rgba(6, 182, 212, 0.3),
                          inset 0 1px 0 rgba(255, 255, 255, 0.2),
                          inset 0 -1px 0 rgba(6, 182, 212, 0.3)
                        `
                        : `
                          0 8px 24px rgba(0, 0, 0, 0.4),
                          0 4px 12px rgba(0, 0, 0, 0.2),
                          inset 0 1px 0 rgba(255, 255, 255, 0.1),
                          inset 0 -1px 0 rgba(0, 0, 0, 0.2)
                        `,
                      transform: `translateZ(${20 + index * 5}px) rotateX(2deg)`,
                      background: isActive 
                        ? 'linear-gradient(135deg, rgba(6, 182, 212, 0.3) 0%, rgba(6, 182, 212, 0.2) 50%, rgba(6, 182, 212, 0.15) 100%)'
                        : 'linear-gradient(135deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.05) 50%, rgba(0, 0, 0, 0.1) 100%)'
                    }}
                  >
                    <div className="flex flex-col items-center" style={{ transform: 'translateZ(10px)' }}>
                      {isActive && (
                        <div className="absolute top-2 right-2 w-3 h-3 bg-cyan-300 rounded-full animate-pulse" style={{ 
                          boxShadow: '0 0 10px rgba(6, 182, 212, 0.8)',
                          transform: 'translateZ(20px)'
                        }}></div>
                      )}
                      <h2 className={`text-2xl sm:text-3xl font-bold mb-2 transition-all duration-500 text-center transform-gpu group-hover:scale-110 ${
                        isActive ? 'text-cyan-300' : 'text-white group-hover:text-cyan-300'
                      }`} style={{ 
                        textShadow: '0 4px 8px rgba(0, 0, 0, 0.6), 0 2px 4px rgba(0, 0, 0, 0.4), 0 0 15px rgba(6, 182, 212, 0.3)',
                        transform: 'translateZ(15px)'
                      }}>
                        {item.label}
                      </h2>
                    <p className="text-white/80 text-sm font-medium text-center" style={{
                      textShadow: '0 2px 4px rgba(0, 0, 0, 0.5)',
                      transform: 'translateZ(10px)'
                    }}>
                      {item.label === 'Home' && 'Back to homepage'}
                      {item.label === 'Services' && 'IT solutions & cybersecurity'}
                      {item.label === 'Industries' && 'Specialized expertise'}
                      {item.label === 'About' && 'Our story & team'}
                      {item.label === 'Contact Us' && 'Get in touch'}
                    </p>
                  </div>
                  
                  {/* 3D Bottom Border */}
                  <div className="absolute bottom-0 left-8 right-8 h-0.5 bg-gradient-to-r from-transparent via-white/30 to-transparent" style={{ 
                    transform: 'translateZ(5px)',
                    filter: 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3))'
                  }}></div>
                  
                  {/* 3D Glow Effect */}
                  <div className="absolute inset-0 rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" style={{
                    background: 'radial-gradient(ellipse at center, rgba(6, 182, 212, 0.3) 0%, transparent 70%)',
                    transform: 'translateZ(-5px)'
                  }}></div>
                </Link>
              )
            })}
            </div>

            {/* Get Support Button - Mobile */}
            <div className="px-4 sm:px-6 pb-2" style={{ transform: 'translateZ(30px)' }}>
              <Link
                href="/contact#customer-support"
                onClick={() => setIsMenuOpen(false)}
                className="block w-full py-4 px-6 rounded-2xl text-center font-bold text-lg text-white bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-400 hover:to-cyan-500 transition-all duration-300 transform-gpu hover:scale-105"
                style={{
                  boxShadow: '0 8px 24px rgba(6, 182, 212, 0.4), 0 4px 12px rgba(0, 0, 0, 0.2)',
                  textShadow: '0 2px 4px rgba(0, 0, 0, 0.3)'
                }}
              >
                Get Support
              </Link>
            </div>

            {/* 3D SOCIAL MEDIA LINKS */}
            <div className="p-4 sm:p-6 text-center" style={{ transform: 'translateZ(35px)' }}>
              <p className="text-white/90 text-sm font-medium mb-4" style={{ 
                textShadow: '0 3px 6px rgba(0, 0, 0, 0.5)',
                transform: 'translateZ(10px)'
              }}>Follow Us</p>
              <div className="flex justify-center space-x-4">
                {/* 3D Facebook */}
                <a 
                  href="https://facebook.com" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="w-14 h-14 bg-white/20 backdrop-blur-sm border border-white/30 hover:bg-blue-600 hover:border-blue-400 rounded-xl flex items-center justify-center transition-all duration-500 hover:scale-110 group transform-gpu"
                  style={{ 
                    boxShadow: `
                      0 6px 20px rgba(0, 0, 0, 0.4),
                      0 3px 10px rgba(0, 0, 0, 0.2),
                      inset 0 1px 0 rgba(255, 255, 255, 0.2),
                      inset 0 -1px 0 rgba(0, 0, 0, 0.2)
                    `,
                    transform: 'translateZ(20px) rotateX(5deg)'
                  }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className="text-white group-hover:text-white transition-colors duration-500" style={{ 
                    filter: 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.5))',
                    transform: 'translateZ(5px)'
                  }}>
                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                  </svg>
                </a>
                
                {/* 3D LinkedIn */}
                <a 
                  href="https://linkedin.com" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="w-14 h-14 bg-white/20 backdrop-blur-sm border border-white/30 hover:bg-blue-700 hover:border-blue-400 rounded-xl flex items-center justify-center transition-all duration-500 hover:scale-110 group transform-gpu"
                  style={{ 
                    boxShadow: `
                      0 6px 20px rgba(0, 0, 0, 0.4),
                      0 3px 10px rgba(0, 0, 0, 0.2),
                      inset 0 1px 0 rgba(255, 255, 255, 0.2),
                      inset 0 -1px 0 rgba(0, 0, 0, 0.2)
                    `,
                    transform: 'translateZ(20px) rotateX(5deg)'
                  }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className="text-white group-hover:text-white transition-colors duration-500" style={{ 
                    filter: 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.5))',
                    transform: 'translateZ(5px)'
                  }}>
                    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                  </svg>
                </a>
              </div>
            </div>
          </div>
        </div>
      </nav>
    </header>
  )
}
