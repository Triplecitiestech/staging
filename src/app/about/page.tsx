'use client'

import { useEffect, useRef } from 'react'
import Header from '@/components/layout/Header'
import Footer from '@/components/layout/Footer'
import Link from 'next/link'
import { CONTACT_INFO } from '@/constants/data'
import PageHero from '@/components/shared/PageHero'
import Section from '@/components/shared/Section'

import { 
  BuildingIcon, 
  ShieldCheckIcon, 
  LayersIcon,
  HandshakeIcon, 
  TargetIcon,
  BookOpenIcon,
  UsersIcon,
  PhoneIcon,
  MailIcon,
  GlobeIcon
} from '@/components/icons/TechIcons'

export default function About() {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const handleTimeUpdate = () => {
      // Restart video at 15 seconds for seamless loop
      if (video.currentTime >= 15) {
        video.currentTime = 0
      }
    }

    video.addEventListener('timeupdate', handleTimeUpdate)
    
    // Ensure video starts playing
    video.play().catch(console.error)

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate)
    }
  }, [])

  const values = [
    {
      icon: <BuildingIcon size={24} className="text-white" />,
      title: 'Built for Small Business',
      description: 'We specialize in helping 20–50 person teams grow with technology that fits their size, budget, and goals.',
      gradient: 'from-blue-500 to-cyan-500'
    },
    {
      icon: <ShieldCheckIcon size={24} className="text-white" />,
      title: 'Security Without Headaches',
      description: 'We deliver strong cybersecurity and compliance solutions that don\'t slow you down or bury you in jargon.',
      gradient: 'from-purple-500 to-pink-500'
    },
    {
      icon: <LayersIcon size={24} className="text-white" />,
      title: 'Automation with Purpose',
      description: 'From onboarding to monitoring, our automated processes reduce errors, increase speed, and give you peace of mind.',
      gradient: 'from-emerald-500 to-teal-500'
    },
    {
      icon: <HandshakeIcon size={24} className="text-white" />,
      title: 'Partnership, Not Just Support',
      description: 'We don\'t just fix problems — we prevent them. We provide strategic guidance that aligns technology with your long-term vision.',
      gradient: 'from-orange-500 to-red-500'
    },
    {
      icon: <TargetIcon size={24} className="text-white" />,
      title: 'Trust, Impact, and the Ride',
      description: 'Our values are simple: Earn trust. Be impactful. Enjoy the ride. These guide every client interaction and decision we make.',
      gradient: 'from-indigo-500 to-purple-500'
    }
  ]

  const clients = [
    'Construction firms that need rugged, mobile-ready IT support',
    'Healthcare providers looking for HIPAA-compliant solutions',
    'Manufacturers requiring stable, secure infrastructure',
    'Professional service firms needing efficient, secure workflows'
  ]

  return (
    <main className="relative">
      <Header />
      
      {/* Video Background for entire page */}
      <div className="relative">
        {/* Video Background */}
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          preload="auto"
          className="fixed inset-0 w-full h-full object-cover -z-10"
          style={{
            minWidth: '100vw',
            minHeight: '100vh',
            width: 'auto',
            height: 'auto',
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)'
          }}
        >
          <source src="https://pub-fb343e810bf34aa4b3ec0c7f1889d31c.r2.dev/aboutpagebg.webm" type="video/webm" />
          {/* Fallback for browsers that don't support video */}
          <div className="fixed inset-0 bg-gradient-to-br from-slate-900 via-gray-900 to-black -z-10"></div>
        </video>
        
        {/* Enhanced overlays for better text readability and seamless blending */}
        <div className="fixed inset-0 bg-black/40 -z-10"></div>
        <div className="fixed inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/50 -z-10"></div>
        <div className="fixed inset-0 bg-gradient-to-r from-black/20 via-transparent to-black/20 -z-10"></div>
        
        {/* PageHero with transparent background */}
        <div className="relative z-10">
                     <PageHero 
             badge="Our Story"
             title="About Us"
             subtitle="At Triple Cities Tech, we believe small and mid-sized businesses deserve enterprise-grade IT without the complexity, cost, or frustration. We were founded on a simple idea: that technology should serve your business — not the other way around."
             gradientFrom="from-transparent"
             gradientTo="to-transparent"
             showGradientTransition={false}
           />
        </div>
        
        {/* Content with relative positioning */}
        <div className="relative z-10">
          {/* Our Story */}
          <Section background="transparent" className="!pt-0 sm:!pt-0 !pb-12 sm:!pb-16 -mt-24 sm:-mt-32 lg:-mt-40">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8 lg:gap-10 items-center">
          <div>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-4 sm:mb-5" style={{
              textShadow: '0 4px 8px rgba(0, 0, 0, 0.8), 0 2px 4px rgba(0, 0, 0, 0.6), 0 0 20px rgba(255, 255, 255, 0.1)',
              transform: 'translateZ(10px)',
              filter: 'drop-shadow(0 4px 8px rgba(0, 0, 0, 0.8))'
            }}>Our Story</h2>
            <div className="space-y-3 sm:space-y-4 text-base sm:text-lg leading-relaxed">
              <p className="text-white font-medium" style={{
                textShadow: '0 2px 4px rgba(0, 0, 0, 0.8), 0 1px 2px rgba(0, 0, 0, 0.6)',
                filter: 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.8))'
              }}>
                After years of working in larger MSPs, our founder saw a pattern: clients were being 
                sold one-size-fits-all solutions that didn't fit their needs. Systems were overcomplicated, 
                outdated, or slow to implement. There had to be a better way.
              </p>
              <p className="text-white font-medium" style={{
                textShadow: '0 2px 4px rgba(0, 0, 0, 0.8), 0 1px 2px rgba(0, 0, 0, 0.6)',
                filter: 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.8))'
              }}>
                In 2017, Triple Cities Tech was created to provide agile, right-sized, and modern IT 
                solutions for companies that want to work smarter — not harder — with their technology.
              </p>
              <p className="text-white font-medium" style={{
                textShadow: '0 2px 4px rgba(0, 0, 0, 0.8), 0 1px 2px rgba(0, 0, 0, 0.6)',
                filter: 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.8))'
              }}>
                Today, we help businesses in construction, healthcare, manufacturing, and professional 
                services gain clarity, stability, and performance from their IT.
              </p>
            </div>
          </div>
          <div className="relative">
            <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-3xl p-6 sm:p-8 shadow-xl">
              <div className="text-center">
                <div className="w-16 h-16 sm:w-20 sm:h-20 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-2xl flex items-center justify-center mb-3 sm:mb-4 mx-auto shadow-lg">
                  <BookOpenIcon size={28} className="text-white sm:w-9 sm:h-9" />
                </div>
                <h3 className="text-xl sm:text-2xl font-bold text-white mb-2 sm:mb-3" style={{
                  textShadow: '0 3px 6px rgba(0, 0, 0, 0.8), 0 1px 3px rgba(0, 0, 0, 0.6), 0 0 15px rgba(255, 255, 255, 0.1)',
                  transform: 'translateZ(8px)',
                  filter: 'drop-shadow(0 3px 6px rgba(0, 0, 0, 0.8))'
                }}>Founded in 2017</h3>
                <p className="text-white font-medium leading-relaxed" style={{
                  textShadow: '0 2px 4px rgba(0, 0, 0, 0.8), 0 1px 2px rgba(0, 0, 0, 0.6)',
                  filter: 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.8))'
                }}>
                  Born from the frustration of seeing businesses struggle with oversized, 
                  overcomplicated IT solutions that didn't fit their needs.
                </p>
              </div>
            </div>
          </div>
        </div>
      </Section>

          {/* What We Stand For */}
          <Section background="transparent">
            <div className="text-center mb-12 sm:mb-16 lg:mb-20">
              <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-6 sm:mb-8" style={{
                textShadow: '0 4px 8px rgba(0, 0, 0, 0.8), 0 2px 4px rgba(0, 0, 0, 0.6), 0 0 20px rgba(255, 255, 255, 0.1)',
                transform: 'translateZ(10px)',
                filter: 'drop-shadow(0 4px 8px rgba(0, 0, 0, 0.8))'
              }}>
                What We Stand For
              </h2>
              <p className="text-lg sm:text-xl text-white font-medium max-w-3xl mx-auto leading-relaxed px-4" style={{
                textShadow: '0 2px 4px rgba(0, 0, 0, 0.8), 0 1px 2px rgba(0, 0, 0, 0.6)',
                filter: 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.8))'
              }}>
                Our core principles guide everything we do, from client interactions to technology decisions.
              </p>
            </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8 max-w-7xl mx-auto">
          {/* First 3 cards in top row */}
          {values.slice(0, 3).map((value, index) => (
            <div key={index} className="group">
              <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-3xl p-6 sm:p-8 shadow-xl hover:shadow-2xl transition-all duration-500 hover:scale-105 h-full">
                <div className="text-center">
                  <div className={`w-14 h-14 sm:w-16 sm:h-16 bg-gradient-to-br ${value.gradient} rounded-2xl flex items-center justify-center mb-4 sm:mb-6 mx-auto shadow-lg group-hover:scale-110 transition-transform duration-300`}>
                    {value.icon}
                  </div>
                  <h3 className="text-lg sm:text-xl font-bold text-white mb-3 sm:mb-4 group-hover:text-cyan-200 transition-colors duration-300" style={{
                    textShadow: '0 3px 6px rgba(0, 0, 0, 0.8), 0 1px 3px rgba(0, 0, 0, 0.6), 0 0 15px rgba(255, 255, 255, 0.1)',
                    transform: 'translateZ(8px)',
                    filter: 'drop-shadow(0 3px 6px rgba(0, 0, 0, 0.8))'
                  }}>
                    {value.title}
                  </h3>
                  <p className="text-white font-medium leading-relaxed text-sm sm:text-base" style={{
                    textShadow: '0 2px 4px rgba(0, 0, 0, 0.8), 0 1px 2px rgba(0, 0, 0, 0.6)',
                    filter: 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.8))'
                  }}>
                    {value.description}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
        
        {/* Second row with 2 cards centered */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-8 max-w-4xl mx-auto mt-6 sm:mt-8">
          {values.slice(3, 5).map((value, index) => (
            <div key={index + 3} className="group">
              <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-3xl p-6 sm:p-8 shadow-xl hover:shadow-2xl transition-all duration-500 hover:scale-105 h-full">
                <div className="text-center">
                  <div className={`w-14 h-14 sm:w-16 sm:h-16 bg-gradient-to-br ${value.gradient} rounded-2xl flex items-center justify-center mb-4 sm:mb-6 mx-auto shadow-lg group-hover:scale-110 transition-transform duration-300`}>
                    {value.icon}
                  </div>
                  <h3 className="text-lg sm:text-xl font-bold text-white mb-3 sm:mb-4 group-hover:text-cyan-200 transition-colors duration-300" style={{
                    textShadow: '0 3px 6px rgba(0, 0, 0, 0.8), 0 1px 3px rgba(0, 0, 0, 0.6), 0 0 15px rgba(255, 255, 255, 0.1)',
                    transform: 'translateZ(8px)',
                    filter: 'drop-shadow(0 3px 6px rgba(0, 0, 0, 0.8))'
                  }}>
                    {value.title}
                  </h3>
                  <p className="text-white font-medium leading-relaxed text-sm sm:text-base" style={{
                    textShadow: '0 2px 4px rgba(0, 0, 0, 0.8), 0 1px 2px rgba(0, 0, 0, 0.6)',
                    filter: 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.8))'
                  }}>
                    {value.description}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Section>

          {/* Who We Serve */}
          <Section background="transparent">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 sm:gap-12 lg:gap-16 items-center">
              <div className="relative order-2 lg:order-1">
                <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-3xl p-8 sm:p-12 shadow-xl">
                  <div className="text-center">
                    <div className="w-20 h-20 sm:w-24 sm:h-24 bg-gradient-to-br from-purple-500 to-pink-500 rounded-2xl flex items-center justify-center mb-4 sm:mb-6 mx-auto shadow-lg">
                      <UsersIcon size={32} className="text-white sm:w-10 sm:h-10" />
                    </div>
                    <h3 className="text-xl sm:text-2xl font-bold text-white mb-3 sm:mb-4 drop-shadow-lg">Our Clients</h3>
                    <p className="text-white font-medium leading-relaxed text-sm sm:text-base" style={{
                      textShadow: '0 2px 4px rgba(0, 0, 0, 0.8), 0 1px 2px rgba(0, 0, 0, 0.6)',
                      filter: 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.8))'
                    }}>
                      Growing businesses ready to upgrade their IT experience and gain a competitive advantage.
                    </p>
                  </div>
                </div>
              </div>
              <div className="order-1 lg:order-2">
                <h2 className="text-4xl md:text-5xl font-bold text-white mb-8" style={{
                  textShadow: '0 4px 8px rgba(0, 0, 0, 0.8), 0 2px 4px rgba(0, 0, 0, 0.6), 0 0 20px rgba(255, 255, 255, 0.1)',
                  transform: 'translateZ(10px)',
                  filter: 'drop-shadow(0 4px 8px rgba(0, 0, 0, 0.8))'
                }}>Who We Serve</h2>
                <p className="text-lg text-white font-medium mb-8 leading-relaxed" style={{
                  textShadow: '0 2px 4px rgba(0, 0, 0, 0.8), 0 1px 2px rgba(0, 0, 0, 0.6)',
                  filter: 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.8))'
                }}>
                  Our clients include businesses across multiple industries, each with unique IT challenges 
                  and growth opportunities.
                </p>
            <ul className="space-y-4">
              {clients.map((client, index) => (
                <li key={index} className="flex items-start group">
                  <div className="w-6 h-6 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-full flex items-center justify-center mr-4 mt-0.5 group-hover:scale-110 transition-transform duration-300">
                    <span className="text-white text-sm font-bold">✓</span>
                  </div>
                  <span className="text-white font-medium leading-relaxed group-hover:text-cyan-200 transition-colors duration-300" style={{
                    textShadow: '0 2px 4px rgba(0, 0, 0, 0.8), 0 1px 2px rgba(0, 0, 0, 0.6)',
                    filter: 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.8))'
                  }}>{client}</span>
                </li>
              ))}
            </ul>
            <p className="text-lg text-white font-medium mt-8 leading-relaxed" style={{
              textShadow: '0 2px 4px rgba(0, 0, 0, 0.8), 0 1px 2px rgba(0, 0, 0, 0.6)',
              filter: 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.8))'
            }}>
              If you're a growing business ready to upgrade your IT experience, we're here to help.
            </p>
          </div>
        </div>
      </Section>

          {/* Contact Section */}
          <Section background="transparent">
            <div className="text-center">
              <h2 className="text-4xl md:text-5xl font-bold text-white mb-8" style={{
                textShadow: '0 4px 8px rgba(0, 0, 0, 0.8), 0 2px 4px rgba(0, 0, 0, 0.6), 0 0 20px rgba(255, 255, 255, 0.1)',
                transform: 'translateZ(10px)',
                filter: 'drop-shadow(0 4px 8px rgba(0, 0, 0, 0.8))'
              }}>Based in Central New York</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8 max-w-4xl mx-auto">
                <div className="group">
                  <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-3xl p-6 sm:p-8 shadow-xl hover:shadow-2xl transition-all duration-500 hover:scale-105">
                    <div className="w-14 h-14 sm:w-16 sm:h-16 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-xl flex items-center justify-center mb-3 sm:mb-4 mx-auto group-hover:scale-110 transition-transform duration-300">
                      <PhoneIcon size={20} className="text-white sm:w-6 sm:h-6" />
                    </div>
                    <p className="font-semibold mb-2 text-white text-sm sm:text-base" style={{
                      textShadow: '0 2px 4px rgba(0, 0, 0, 0.8), 0 1px 2px rgba(0, 0, 0, 0.6)',
                      filter: 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.8))'
                    }}>Phone</p>
                    <a href="tel:607-222-TCT1" className="text-blue-300 hover:text-white transition-colors duration-300 text-base sm:text-lg font-medium" style={{
                      textShadow: '0 2px 4px rgba(0, 0, 0, 0.8), 0 1px 2px rgba(0, 0, 0, 0.6)',
                      filter: 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.8))'
                    }}>
                      (607) 222-TCT1
                    </a>
                  </div>
                </div>
                <div className="group">
                  <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-3xl p-6 sm:p-8 shadow-xl hover:shadow-2xl transition-all duration-500 hover:scale-105">
                    <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl flex items-center justify-center mb-4 mx-auto group-hover:scale-110 transition-transform duration-300">
                      <MailIcon size={24} className="text-white" />
                    </div>
                    <p className="font-semibold mb-2 text-white" style={{
                      textShadow: '0 2px 4px rgba(0, 0, 0, 0.8), 0 1px 2px rgba(0, 0, 0, 0.6)',
                      filter: 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.8))'
                    }}>Email</p>
                    <a href={`mailto:${CONTACT_INFO.email}`} className="text-purple-300 hover:text-white transition-colors duration-300 text-lg font-medium" style={{
                      textShadow: '0 2px 4px rgba(0, 0, 0, 0.8), 0 1px 2px rgba(0, 0, 0, 0.6)',
                      filter: 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.8))'
                    }}>
                      {CONTACT_INFO.email}
                    </a>
                  </div>
                </div>
                <div className="group">
                  <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-3xl p-6 sm:p-8 shadow-xl hover:shadow-2xl transition-all duration-500 hover:scale-105">
                    <div className="w-16 h-16 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-xl flex items-center justify-center mb-4 mx-auto group-hover:scale-110 transition-transform duration-300">
                      <GlobeIcon size={24} className="text-white" />
                    </div>
                    <p className="font-semibold mb-2 text-white" style={{
                      textShadow: '0 2px 4px rgba(0, 0, 0, 0.8), 0 1px 2px rgba(0, 0, 0, 0.6)',
                      filter: 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.8))'
                    }}>Website</p>
                    <a href="https://www.triplecitiestech.com" className="text-emerald-300 hover:text-white transition-colors duration-300 text-lg font-medium" style={{
                      textShadow: '0 2px 4px rgba(0, 0, 0, 0.8), 0 1px 2px rgba(0, 0, 0, 0.6)',
                      filter: 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.8))'
                    }}>
                      www.triplecitiestech.com
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </Section>

          {/* CTA Section */}
          <Section background="transparent">
            <div className="text-center">
              <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-6 sm:mb-8 px-4" style={{
                textShadow: '0 4px 8px rgba(0, 0, 0, 0.8), 0 2px 4px rgba(0, 0, 0, 0.6), 0 0 20px rgba(255, 255, 255, 0.1)',
                transform: 'translateZ(10px)',
                filter: 'drop-shadow(0 4px 8px rgba(0, 0, 0, 0.8))'
              }}>
                Let's Build Something Smarter, Together
              </h2>
              <p className="text-lg sm:text-xl text-white font-medium mb-8 sm:mb-12 max-w-3xl mx-auto leading-relaxed px-4" style={{
                textShadow: '0 2px 4px rgba(0, 0, 0, 0.8), 0 1px 2px rgba(0, 0, 0, 0.6)',
                filter: 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.8))'
              }}>
                Ready to transform your IT experience? Let's discuss how we can help your business 
                gain clarity, stability, and performance from technology.
              </p>
              <div className="relative inline-block">
                <Link 
                  href="/contact" 
                  className="bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-600 hover:to-cyan-700 text-white px-8 sm:px-12 py-3 sm:py-4 rounded-2xl font-semibold text-base sm:text-lg shadow-xl hover:shadow-2xl hover:scale-105 transition-all duration-300 inline-block"
                >
                  Schedule Meeting
                </Link>
              </div>
            </div>
          </Section>
        </div>
      </div>

      <Footer />
    </main>
  )
}
