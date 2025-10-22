'use client'

import React from 'react'
import Link from 'next/link'
import Image from 'next/image'
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
  index,
  image,
  darkBackground = false
}: ServiceCardProps) {
  const isReversed = index % 2 === 1

  return (
    <div className={`relative grid grid-cols-1 lg:grid-cols-2 gap-16 items-center ${
      isReversed ? 'lg:grid-flow-col-dense' : ''
    }`}>
      
      {/* Sleek Decorative Elements */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {/* Subtle Gradient Orbs */}
        <div className={`absolute ${isReversed ? 'right-0' : 'left-0'} top-1/4 w-64 h-64 rounded-full blur-3xl opacity-10 ${
          darkBackground ? 'bg-cyan-400' : 'bg-blue-500'
        }`}></div>
        <div className={`absolute ${isReversed ? 'left-0' : 'right-0'} bottom-1/4 w-48 h-48 rounded-full blur-3xl opacity-10 ${
          darkBackground ? 'bg-purple-400' : 'bg-purple-500'
        }`}></div>
      </div>
      
      {/* Content Section */}
      <div className={`${isReversed ? 'lg:col-start-2' : ''} space-y-6 relative z-10`}>
        
        {/* Title */}
        <div className="flex items-center space-x-4">
          <div className="w-16 h-16"></div>
          <div>
            <h3 className={`text-3xl font-bold ${darkBackground ? 'text-white' : 'text-gray-900'}`}>{title}</h3>
          </div>
        </div>
        
        {/* Subtitle */}
        <p className={`text-xl font-medium leading-relaxed ${darkBackground ? 'text-white' : 'text-gray-600'}`}>{subtitle}</p>
        
        {/* Features List */}
        <ul className="space-y-3">
          {features.map((feature, featureIndex) => (
            <li key={featureIndex} className="flex items-start group">
              <div className="w-5 h-5 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-full flex items-center justify-center mr-3 mt-0.5 group-hover:scale-110 transition-transform duration-300 flex-shrink-0">
                <CheckCircleIcon size={12} className="text-white" />
              </div>
              <span className={`leading-relaxed transition-colors duration-300 ${
                darkBackground 
                  ? 'text-white group-hover:text-gray-200' 
                  : 'text-gray-700 group-hover:text-gray-900'
              }`}>
                {feature}
              </span>
            </li>
          ))}
        </ul>
        
        {/* Description */}
        <p className={`text-lg leading-relaxed font-medium ${darkBackground ? 'text-white' : 'text-gray-600'}`}>{description}</p>
        
        {/* CTA Button */}
        <div className="pt-4">
          <Link 
            href="/contact"
            className={`group relative inline-flex items-center justify-center px-5 sm:px-6 md:px-8 py-2.5 sm:py-3 md:py-3.5 rounded-full font-bold text-sm sm:text-base md:text-lg transition-all duration-300 hover:scale-105 transform-gpu ${
              darkBackground
                ? 'bg-gradient-to-br from-cyan-400 via-cyan-500 to-cyan-600 hover:from-cyan-300 hover:via-cyan-400 hover:to-cyan-500 text-white'
                : 'bg-gradient-to-br from-blue-500 via-purple-500 to-purple-600 hover:from-blue-400 hover:via-purple-400 hover:to-purple-500 text-white'
            }`}
            style={{
              boxShadow: darkBackground 
                ? '0 8px 20px rgba(6, 182, 212, 0.35), 0 4px 10px rgba(6, 182, 212, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.2), inset 0 -1px 0 rgba(0, 0, 0, 0.1)'
                : '0 8px 20px rgba(79, 70, 229, 0.35), 0 4px 10px rgba(147, 51, 234, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.2), inset 0 -1px 0 rgba(0, 0, 0, 0.1)'
            }}
          >
            <span className="relative z-10 flex items-center whitespace-nowrap">
              <span className="hidden sm:inline">Schedule a Consultation</span>
              <span className="sm:hidden">Get Started</span>
              <svg 
                className="ml-1.5 sm:ml-2 w-4 h-4 sm:w-5 sm:h-5 transition-transform duration-300 group-hover:translate-x-1" 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </span>
            {/* 3D Glow Effect */}
            <div className={`absolute inset-0 rounded-full blur-md opacity-0 group-hover:opacity-50 transition-opacity duration-300 ${
              darkBackground ? 'bg-cyan-400' : 'bg-purple-500'
            }`} style={{ transform: 'translateZ(-5px)' }}></div>
          </Link>
        </div>
      </div>
      
      {/* Visual Section */}
      <div className={`${isReversed ? 'lg:col-start-1' : ''} relative z-10`}>
        {image ? (
          <div className="relative group">
            {/* Sleek Border Accent */}
            <div className={`absolute -inset-0.5 rounded-3xl opacity-75 group-hover:opacity-100 transition-opacity duration-500 ${
              darkBackground 
                ? 'bg-gradient-to-br from-cyan-400 via-blue-500 to-purple-500' 
                : 'bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500'
            }`}></div>
            
            {/* Image Container */}
            <div className="relative rounded-3xl overflow-hidden shadow-2xl bg-white">
              <Image 
                src={image} 
                alt={title}
                width={800}
                height={400}
                className="w-full h-96 object-cover"
              />
            </div>
          </div>
        ) : (
          <div className="bg-gray-100 rounded-3xl p-12 shadow-2xl relative overflow-hidden border-2 border-dashed border-gray-300">
            
            {/* Content */}
            <div className="relative z-10 text-center text-gray-600">
              <div className="w-24 h-24 mb-6 mx-auto"></div>
              <h4 className="text-2xl font-bold mb-4 text-gray-700">{title}</h4>
              <p className="text-gray-500 leading-relaxed">{subtitle}</p>
            </div>
            
            {/* Decorative Elements */}
            <div className="absolute top-4 right-4 w-3 h-3 bg-gray-300 rounded-full animate-pulse"></div>
            <div className="absolute bottom-4 left-4 w-2 h-2 bg-gray-300 rounded-full animate-pulse delay-1000"></div>
          </div>
        )}
      </div>
    </div>
  )
}
