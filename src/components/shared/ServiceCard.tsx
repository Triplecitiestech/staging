'use client'

import React from 'react'
import Link from 'next/link'
import { CheckCircleIcon } from '@/components/icons/TechIcons'

interface ServiceCardProps {
  icon?: string
  title: string
  subtitle: string
  features: string[]
  description: string
  gradient: string
  index: number
  image?: string
  darkBackground?: boolean
}

export default function ServiceCard({
  title,
  subtitle,
  features,
  description,
  gradient,
  darkBackground = false
}: ServiceCardProps) {
  return (
    <div className="relative">

      {/* Glassmorphism Card */}
      <div className="relative bg-white/10 backdrop-blur-sm border border-white/20 rounded-3xl p-8 md:p-12 shadow-2xl transition-all duration-500 hover:bg-white/15 hover:border-white/30 hover:shadow-[0_20px_60px_rgba(6,182,212,0.3)]">

        {/* Subtle Gradient Orbs */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-3xl">
          <div className="absolute -top-20 -right-20 w-64 h-64 bg-gradient-to-br from-cyan-400/20 to-purple-500/20 rounded-full blur-3xl"></div>
          <div className="absolute -bottom-20 -left-20 w-64 h-64 bg-gradient-to-br from-blue-500/20 to-pink-500/20 rounded-full blur-3xl"></div>
        </div>

        {/* Content */}
        <div className="relative z-10 space-y-6">

          {/* Title Section */}
          <div className="text-center">
            <h3 className="text-3xl md:text-4xl font-bold text-white mb-3">{title}</h3>
            <p className="text-xl text-white/90 font-medium">{subtitle}</p>
          </div>

          {/* Divider */}
          <div className="w-20 h-1 bg-gradient-to-r from-cyan-400 to-blue-500 rounded-full mx-auto"></div>

          {/* Features List */}
          <ul className="space-y-3">
            {features.map((feature, featureIndex) => (
              <li key={featureIndex} className="flex items-start group">
                <div className="w-5 h-5 bg-gradient-to-br from-cyan-400 to-blue-500 rounded-full flex items-center justify-center mr-3 mt-0.5 group-hover:scale-110 transition-transform duration-300 flex-shrink-0 shadow-lg shadow-cyan-500/50">
                  <CheckCircleIcon size={12} className="text-white" />
                </div>
                <span className="text-white/90 leading-relaxed transition-colors duration-300 group-hover:text-white">
                  {feature}
                </span>
              </li>
            ))}
          </ul>

          {/* Description */}
          <p className="text-lg text-white/80 leading-relaxed">{description}</p>

          {/* CTA Button */}
          <div className="pt-6 text-center">
            <Link
              href="/contact"
              className="group relative inline-flex items-center justify-center px-6 sm:px-8 py-3 sm:py-4 rounded-full font-bold text-base sm:text-lg transition-all duration-300 hover:scale-105 transform-gpu bg-gradient-to-br from-cyan-400 via-cyan-500 to-cyan-600 hover:from-cyan-300 hover:via-cyan-400 hover:to-cyan-500 text-white shadow-[0_8px_20px_rgba(6,182,212,0.35),0_4px_10px_rgba(6,182,212,0.25)]"
            >
              <span className="relative z-10 flex items-center whitespace-nowrap">
                <span className="hidden sm:inline">Schedule a Consultation</span>
                <span className="sm:hidden">Get Started</span>
                <svg
                  className="ml-2 w-5 h-5 transition-transform duration-300 group-hover:translate-x-1"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </span>
              {/* 3D Glow Effect */}
              <div className="absolute inset-0 rounded-full blur-md opacity-0 group-hover:opacity-50 transition-opacity duration-300 bg-cyan-400"></div>
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
