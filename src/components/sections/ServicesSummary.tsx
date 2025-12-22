'use client'

import React from 'react'
import Link from 'next/link'
import { useAnimation } from '@/hooks/useAnimation'
import { Button } from '@/components/ui'
import { 
  MonitorIcon, 
  ShieldCheckIcon, 
  BriefcaseIcon, 
  CloudIcon,
  UsersIcon,
  LockboxIcon,
  LayersIcon,
  RobotIcon
} from '@/components/icons/TechIcons'

export default function ServicesSummary() {
  const { isVisible, elementRef } = useAnimation(0.1)

  const servicesLeft = [
    {
      icon: <MonitorIcon size={32} className="text-white" />,
      title: 'Managed IT Services',
      description: 'Complete IT management with 24/7 support and proactive monitoring.',
      gradient: 'from-blue-500 to-cyan-500',
      link: '/services#managed-it'
    },
    {
      icon: <ShieldCheckIcon size={32} className="text-white" />,
      title: 'Cybersecurity & Compliance',
      description: 'Advanced threat detection and compliance readiness for your industry.',
      gradient: 'from-purple-500 to-pink-500',
      link: '/services#cybersecurity'
    },
    {
      icon: <BriefcaseIcon size={32} className="text-white" />,
      title: 'IT Strategy & Virtual CIO',
      description: 'Strategic technology planning and executive-level IT guidance.',
      gradient: 'from-orange-500 to-red-500',
      link: '/services#strategy'
    },
    {
      icon: <UsersIcon size={32} className="text-white" />,
      title: 'Employee Onboarding Automation',
      description: 'Automated user provisioning and role-based access management.',
      gradient: 'from-cyan-500 to-blue-500',
      link: '/services#employee-onboarding-automation'
    }
  ]

  const servicesRight = [
    {
      icon: <LayersIcon size={32} className="text-white" />,
      title: 'Co-Managed IT Services',
      description: 'Enterprise-grade tools and capabilities for your existing IT team.',
      gradient: 'from-yellow-500 to-orange-500',
      link: '/services#co-managed-it-services'
    },
    {
      icon: <RobotIcon size={32} className="text-white" />,
      title: 'AI Consulting',
      description: 'Navigate the AI landscape with confidence and practical strategies.',
      gradient: 'from-indigo-500 to-purple-500',
      link: '/services#ai-consulting'
    },
    {
      icon: <CloudIcon size={32} className="text-white" />,
      title: 'Cloud Services',
      description: 'Microsoft 365, SharePoint, and flexible cloud platform management.',
      gradient: 'from-emerald-500 to-teal-500',
      link: '/services#cloud'
    },
    {
      icon: <LockboxIcon size={32} className="text-white" />,
      title: 'Industry-Specific Solutions',
      description: 'Tailored IT solutions for Construction, Healthcare, Manufacturing, and Professional Services.',
      gradient: 'from-green-500 to-emerald-500',
      link: '/services#industry-specific-solutions'
    }
  ]

  return (
    <section className="relative py-24 bg-gradient-to-br from-black via-gray-900 to-cyan-900 overflow-hidden">
      {/* Background Elements */}
      <div className="absolute inset-0">
        {/* Floating Geometric Shapes */}
        <div className="absolute top-20 right-20 w-64 h-64 bg-gradient-to-br from-cyan-400/10 to-cyan-600/10 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-20 left-20 w-80 h-80 bg-gradient-to-br from-purple-500/10 to-pink-500/10 rounded-full blur-3xl animate-pulse delay-1000"></div>
        <div className="absolute top-1/2 left-1/2 w-48 h-48 bg-gradient-to-br from-emerald-500/10 to-teal-500/10 rounded-full blur-3xl animate-pulse delay-2000"></div>
      </div>

      <div className="relative z-10 container-max">
        {/* Enhanced 3D Section Header */}
        <div
          ref={elementRef}
          className={`text-center mb-20 px-4 sm:px-6 lg:px-8 transition-all duration-1000 ease-out ${
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-20'
          }`}
        >
          <h2 className="text-4xl md:text-6xl font-black text-white mb-6">
            Summary of Our{' '}
            <span className="text-cyan-400">
              Services
            </span>
          </h2>
          <p className="text-xl text-white/90 max-w-3xl mx-auto leading-relaxed">
            We offer complete IT management for small and mid-sized businesses, including comprehensive
            solutions that are tailored to meet your specific needs.
          </p>
        </div>

        {/* Services List - Two Columns */}
        <div className="max-w-7xl mx-auto mb-16 px-4 sm:px-6 lg:px-8">
          <div className="space-y-0">
            {[0, 1, 2, 3].map((rowIndex) => (
              <div key={rowIndex} className="grid grid-cols-1 xl:grid-cols-2 gap-8 xl:gap-12 border-b border-gray-200/50 last:border-b-0">
                {/* Left Service */}
                <Link
                  href={servicesLeft[rowIndex].link}
                  className={`group relative transition-all duration-700 ease-out block ${
                    isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-20'
                  }`}
                  style={{ transitionDelay: `${rowIndex * 150}ms` }}
                >
                  <div className="py-6 sm:py-8 hover:bg-white/5 transition-all duration-500 rounded-lg text-center xl:text-left cursor-pointer">
                    <div className="flex flex-col xl:flex-row items-center xl:items-start space-y-4 xl:space-y-0 xl:space-x-4 2xl:space-x-6">
                      {/* Icon */}
                      <div className={`flex-shrink-0 w-12 h-12 sm:w-14 sm:h-14 xl:w-16 xl:h-16 bg-gradient-to-br ${servicesLeft[rowIndex].gradient} rounded-xl xl:rounded-2xl flex items-center justify-center shadow-lg group-hover:shadow-xl transition-all duration-500 group-hover:scale-110`}>
                        {React.cloneElement(servicesLeft[rowIndex].icon, {
                          size: 24,
                          className: "w-5 h-5 sm:w-6 sm:h-6 xl:w-8 xl:h-8 text-white"
                        })}
                      </div>

                      {/* Content */}
                      <div className="xl:flex-1">
                        <h3 className="text-lg sm:text-xl font-bold text-white mb-2 sm:mb-3 group-hover:text-cyan-300 transition-colors duration-500">
                          {servicesLeft[rowIndex].title}
                        </h3>
                        <p className="text-sm sm:text-base text-white/90 leading-relaxed group-hover:text-white transition-colors duration-500">
                          {servicesLeft[rowIndex].description}
                        </p>
                      </div>
                    </div>
                  </div>
                </Link>

                {/* Right Service */}
                <Link
                  href={servicesRight[rowIndex].link}
                  className={`group relative transition-all duration-700 ease-out block ${
                    isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-20'
                  }`}
                  style={{ transitionDelay: `${(rowIndex + 4) * 150}ms` }}
                >
                  <div className="py-6 sm:py-8 hover:bg-white/5 transition-all duration-500 rounded-lg text-center xl:text-left cursor-pointer">
                    <div className="flex flex-col xl:flex-row items-center xl:items-start space-y-4 xl:space-y-0 xl:space-x-4 2xl:space-x-6">
                      {/* Icon */}
                      <div className={`flex-shrink-0 w-12 h-12 sm:w-14 sm:h-14 xl:w-16 xl:h-16 bg-gradient-to-br ${servicesRight[rowIndex].gradient} rounded-xl xl:rounded-2xl flex items-center justify-center shadow-lg group-hover:shadow-xl transition-all duration-500 group-hover:scale-110`}>
                        {React.cloneElement(servicesRight[rowIndex].icon, {
                          size: 24,
                          className: "w-5 h-5 sm:w-6 sm:h-6 xl:w-8 xl:h-8 text-white"
                        })}
                      </div>

                      {/* Content */}
                      <div className="xl:flex-1">
                        <h3 className="text-lg sm:text-xl font-bold text-white mb-2 sm:mb-3 group-hover:text-cyan-300 transition-colors duration-500">
                          {servicesRight[rowIndex].title}
                        </h3>
                        <p className="text-sm sm:text-base text-white/90 leading-relaxed group-hover:text-white transition-colors duration-500">
                          {servicesRight[rowIndex].description}
                        </p>
                      </div>
                    </div>
                  </div>
                </Link>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom Section */}
        <div className={`text-center px-4 sm:px-6 lg:px-8 transition-all duration-1000 ease-out delay-1000 ${
          isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-20'
        }`}>
          <p className="text-xl text-white/90 mb-8 max-w-4xl mx-auto leading-relaxed">
            Our services are tailored to meet the needs of your business — right-sized, secure, and built to scale.
          </p>

          {/* CTA Button */}
          <Button
            asChild
            variant="primary"
            size="xl"
            className="bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-400 hover:to-cyan-500 hover:scale-105 hover:shadow-2xl hover:shadow-cyan-500/30 transform hover:-translate-y-1 border-0 shadow-xl shadow-cyan-500/20 px-10 py-5 text-lg font-bold rounded-2xl transition-all duration-500"
          >
            <Link href="/services">
              Explore Our Solutions
            </Link>
          </Button>
        </div>
      </div>
    </section>
  )
}
