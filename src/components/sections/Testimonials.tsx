'use client'

import { useAnimation } from '@/hooks/useAnimation'
import { useState } from 'react'
import { ChevronLeftIcon, ChevronRightIcon } from '@/components/icons/TechIcons'

export default function Testimonials() {
  const { isVisible, elementRef } = useAnimation(0.1)
  const [currentIndex, setCurrentIndex] = useState(0)

  const testimonials = [
    {
      quote: "Triple Cities Tech transformed how we manage our IT — faster onboarding, no more surprises, and a team that actually understands our business.",
      author: "Construction Firm CEO ",
      company: "Construction Industry"
    },
    {
      quote: "They handle everything. I don't have to think about IT anymore. And our team is working more efficiently than ever.",
      author: "Healthcare Practice Manager",
      company: "Healthcare Industry"
    },
    {
      quote: "The cybersecurity upgrades and cloud migration made an immediate impact. We sleep better at night.",
      author: "Manufacturing Operations Director",
      company: "Manufacturing Industry"
    }
  ]

  const nextSlide = () => {
    setCurrentIndex((prev) => (prev + 1) % testimonials.length)
  }

  const prevSlide = () => {
    setCurrentIndex((prev) => (prev - 1 + testimonials.length) % testimonials.length)
  }

  const goToSlide = (index: number) => {
    setCurrentIndex(index)
  }

  return (
    <section className="relative py-12 sm:py-16 md:py-20 lg:py-24 overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-black via-gray-900 to-cyan-900"></div>
      
      {/* Animated background elements */}
      <div className="absolute inset-0">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl animate-pulse delay-1000"></div>
      </div>
      
      <div className="relative z-10 container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl">
        {/* Section Header */}
        <div 
          ref={elementRef}
          className={`text-center mb-8 sm:mb-12 md:mb-16 transition-all duration-700 ${
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'
          }`}
        >
          <h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-3 sm:mb-4 px-4">
            What Our Clients Say
          </h2>
          <p className="text-base sm:text-lg md:text-xl text-cyan-100 max-w-2xl mx-auto px-4">
            Don't just take our word for it. Here's what business leaders have to say about working with Triple Cities Tech.
          </p>
        </div>

        {/* Simple Testimonial Card */}
        <div className="relative max-w-4xl mx-auto">
          <div className="bg-white rounded-2xl p-6 sm:p-8 md:p-10 lg:p-12 shadow-2xl border border-gray-200">
            <blockquote className="text-gray-800 text-base sm:text-lg md:text-xl lg:text-2xl leading-relaxed mb-6 sm:mb-8 text-center font-medium">
              {testimonials[currentIndex].quote}
            </blockquote>
            
            <div className="flex flex-col items-center space-y-3">
              <div className="w-16 h-0.5 bg-cyan-500 rounded-full"></div>
              <div className="text-center">
                <p className="font-bold text-gray-900 text-lg sm:text-xl tracking-wide">
                  {testimonials[currentIndex].author}
                </p>
                <p className="text-cyan-600 text-sm sm:text-base font-semibold mt-1 tracking-wide">
                  {testimonials[currentIndex].company}
                </p>
              </div>
            </div>
          </div>
          
          {/* Navigation Arrows */}
          <button
            onClick={prevSlide}
            className="absolute -left-4 sm:-left-6 md:-left-8 top-1/2 -translate-y-1/2 z-10 w-12 h-12 sm:w-14 sm:h-14 md:w-16 md:h-16 bg-cyan-500 hover:bg-cyan-600 rounded-full flex items-center justify-center shadow-xl hover:shadow-2xl transition-all duration-300 hover:scale-105"
          >
            <ChevronLeftIcon size={20} className="text-white" />
          </button>
          
          <button
            onClick={nextSlide}
            className="absolute -right-4 sm:-right-6 md:-right-8 top-1/2 -translate-y-1/2 z-10 w-12 h-12 sm:w-14 sm:h-14 md:w-16 md:h-16 bg-cyan-500 hover:bg-cyan-600 rounded-full flex items-center justify-center shadow-xl hover:shadow-2xl transition-all duration-300 hover:scale-105"
          >
            <ChevronRightIcon size={20} className="text-white" />
          </button>
        </div>

        {/* Dots Indicator */}
        <div className="flex justify-center space-x-3 sm:space-x-4 mt-8 sm:mt-12">
          {testimonials.map((_, index) => (
            <button
              key={index}
              onClick={() => goToSlide(index)}
              className={`w-3 h-3 sm:w-4 sm:h-4 rounded-full transition-all duration-300 ${
                index === currentIndex 
                  ? 'bg-cyan-500 scale-125' 
                  : 'bg-gray-300 hover:bg-gray-400'
              }`}
            />
          ))}
        </div>
      </div>
    </section>
  )
}