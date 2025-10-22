'use client'

import React from 'react'

interface FeatureCardProps {
  icon: React.ReactNode
  title: string
  description: string
  gradient?: string
  delay?: number
  className?: string
}

export default function FeatureCard({ 
  icon, 
  title, 
  description, 
  gradient = 'from-blue-500 to-cyan-500',
  delay = 0,
  className = ''
}: FeatureCardProps) {
  return (
    <div 
      className={`group relative transition-all duration-700 ease-out hover:scale-105 hover:-translate-y-2 ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      <div className="relative h-full bg-white/90 backdrop-blur-xl border border-gray-200/60 rounded-2xl p-8 shadow-lg hover:shadow-2xl transition-all duration-700">
        
        {/* Gradient Border Effect */}
        <div className={`absolute inset-0 bg-gradient-to-br ${gradient} rounded-2xl opacity-0 group-hover:opacity-10 transition-all duration-700`}></div>
        
        {/* Icon Container */}
        <div className={`relative z-10 w-16 h-16 bg-gradient-to-br ${gradient} rounded-xl flex items-center justify-center mb-6 shadow-lg group-hover:shadow-xl transition-all duration-700 group-hover:scale-110`}>
          {icon}
        </div>

        {/* Content */}
        <div className="relative z-10">
          <h3 className="text-xl font-bold text-gray-900 mb-4 group-hover:text-blue-600 transition-colors duration-500">
            {title}
          </h3>
          <p className="text-gray-600 leading-relaxed group-hover:text-gray-700 transition-colors duration-500">
            {description}
          </p>
        </div>

        {/* Hover Accent */}
        <div className="absolute top-4 right-4 w-2 h-2 bg-blue-400 rounded-full opacity-0 group-hover:opacity-100 transition-all duration-700 group-hover:animate-pulse"></div>
      </div>
    </div>
  )
}
