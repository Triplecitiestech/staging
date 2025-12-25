'use client'

import { useState } from 'react'
import Header from '@/components/layout/Header'
import { UsersIcon, ShieldCheckIcon, ChevronRightIcon } from '@/components/icons/TechIcons'
import Link from 'next/link'

export default function ContactPreview() {
  const [activeOption, setActiveOption] = useState<1 | 2 | 3 | 4>(1)

  return (
    <main className="min-h-screen bg-black">
      <Header />

      {/* Tab Selector */}
      <div className="sticky top-16 z-40 bg-gray-900 border-b border-white/10 px-4 py-3 overflow-x-auto">
        <div className="flex gap-2 min-w-max">
          {[1, 2, 3, 4].map((num) => (
            <button
              key={num}
              onClick={() => setActiveOption(num as 1 | 2 | 3 | 4)}
              className={`px-4 py-2 rounded-lg font-semibold whitespace-nowrap transition-all ${
                activeOption === num
                  ? 'bg-cyan-500 text-white'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              Option {num}
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-2">
          {activeOption === 1 && 'Side-by-Side Compact Cards'}
          {activeOption === 2 && 'Large Stacked Buttons'}
          {activeOption === 3 && 'Integrated Hero Overlay'}
          {activeOption === 4 && 'Horizontal Tabs'}
        </p>
      </div>

      {/* Option 1: Side-by-Side Compact Cards */}
      {activeOption === 1 && (
        <div className="relative bg-gradient-to-br from-black via-gray-900 to-cyan-900 py-8">
          <div className="text-center mb-6 px-6">
            <h1 className="text-2xl font-black text-white mb-2">Contact Us</h1>
            <p className="text-sm text-white/90">Choose how we can help you today</p>
          </div>
          <div className="max-w-6xl mx-auto px-4">
            <div className="grid grid-cols-2 gap-3">
              {/* New Customer */}
              <Link
                href="#sales"
                className="group relative bg-white/10 backdrop-blur-sm border-2 border-cyan-400/50 hover:border-cyan-400 rounded-2xl p-4 shadow-xl transition-all duration-300"
              >
                <div className="text-center">
                  <div className="w-12 h-12 mx-auto mb-3 bg-gradient-to-br from-cyan-500 to-blue-500 rounded-xl flex items-center justify-center shadow-lg">
                    <UsersIcon size={24} className="text-white" />
                  </div>
                  <h3 className="text-sm font-bold text-white mb-2">New to TCT?</h3>
                  <div className="inline-flex items-center justify-center w-full bg-cyan-500 text-white text-xs font-semibold px-3 py-2 rounded-lg">
                    Get Started
                  </div>
                </div>
              </Link>

              {/* Existing Customer */}
              <Link
                href="#support"
                className="group relative bg-white/10 backdrop-blur-sm border-2 border-emerald-400/50 hover:border-emerald-400 rounded-2xl p-4 shadow-xl transition-all duration-300"
              >
                <div className="text-center">
                  <div className="w-12 h-12 mx-auto mb-3 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-xl flex items-center justify-center shadow-lg">
                    <ShieldCheckIcon size={24} className="text-white" />
                  </div>
                  <h3 className="text-sm font-bold text-white mb-2">Existing Customer?</h3>
                  <div className="inline-flex items-center justify-center w-full bg-emerald-500 text-white text-xs font-semibold px-3 py-2 rounded-lg">
                    Get Support
                  </div>
                </div>
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Option 2: Large Stacked Buttons */}
      {activeOption === 2 && (
        <div className="relative bg-gradient-to-br from-black via-gray-900 to-cyan-900 py-8">
          <div className="text-center mb-6 px-6">
            <h1 className="text-2xl font-black text-white mb-2">Contact Us</h1>
            <p className="text-sm text-white/90">Choose how we can help you today</p>
          </div>
          <div className="max-w-2xl mx-auto px-6 space-y-4">
            {/* New Customer Button */}
            <Link
              href="#sales"
              className="group block bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 rounded-2xl p-6 shadow-xl transition-all duration-300"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0">
                    <UsersIcon size={28} className="text-white" />
                  </div>
                  <div className="text-left">
                    <h3 className="text-lg font-bold text-white">New to Triple Cities Tech?</h3>
                    <p className="text-sm text-white/80">Let's discuss your IT needs</p>
                  </div>
                </div>
                <ChevronRightIcon size={24} className="text-white flex-shrink-0" />
              </div>
            </Link>

            {/* Existing Customer Button */}
            <Link
              href="#support"
              className="group block bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 rounded-2xl p-6 shadow-xl transition-all duration-300"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0">
                    <ShieldCheckIcon size={28} className="text-white" />
                  </div>
                  <div className="text-left">
                    <h3 className="text-lg font-bold text-white">Existing Customer?</h3>
                    <p className="text-sm text-white/80">Access support & portals</p>
                  </div>
                </div>
                <ChevronRightIcon size={24} className="text-white flex-shrink-0" />
              </div>
            </Link>
          </div>
        </div>
      )}

      {/* Option 3: Integrated Hero Overlay */}
      {activeOption === 3 && (
        <div className="relative bg-gradient-to-br from-black via-gray-900 to-cyan-900 py-12">
          <div className="max-w-4xl mx-auto px-6">
            <div className="text-center mb-8">
              <h1 className="text-3xl font-black text-white mb-3">Contact Us</h1>
              <p className="text-base text-white/90 mb-8">Choose how we can help you today</p>

              {/* Floating Button Group */}
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Link
                  href="#sales"
                  className="group inline-flex items-center justify-center bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-white font-bold px-6 py-4 rounded-xl transition-all duration-300 shadow-lg"
                >
                  <UsersIcon size={20} className="mr-2" />
                  New Customer
                  <ChevronRightIcon size={16} className="ml-2" />
                </Link>

                <Link
                  href="#support"
                  className="group inline-flex items-center justify-center bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white font-bold px-6 py-4 rounded-xl transition-all duration-300 shadow-lg"
                >
                  <ShieldCheckIcon size={20} className="mr-2" />
                  Existing Customer
                  <ChevronRightIcon size={16} className="ml-2" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Option 4: Horizontal Tabs */}
      {activeOption === 4 && (
        <div className="relative bg-gradient-to-br from-black via-gray-900 to-cyan-900 py-8">
          <div className="text-center mb-6 px-6">
            <h1 className="text-2xl font-black text-white mb-4">Contact Us</h1>
          </div>
          <div className="max-w-2xl mx-auto px-6">
            {/* Tab Buttons */}
            <div className="grid grid-cols-2 gap-2 mb-6">
              <button className="bg-cyan-500 text-white font-bold py-4 px-4 rounded-xl shadow-lg">
                <UsersIcon size={20} className="inline mr-2" />
                New Customer
              </button>
              <button className="bg-gray-800/50 text-gray-300 font-semibold py-4 px-4 rounded-xl border border-gray-600/50">
                <ShieldCheckIcon size={20} className="inline mr-2" />
                Existing
              </button>
            </div>

            {/* Content for selected tab */}
            <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-2xl p-6">
              <h3 className="text-xl font-bold text-white mb-3">New to Triple Cities Tech?</h3>
              <p className="text-white/80 mb-4">Interested in our services? Let's discuss how we can help your business thrive.</p>
              <Link
                href="#sales"
                className="inline-flex items-center justify-center w-full bg-cyan-500 hover:bg-cyan-400 text-white font-bold px-6 py-3 rounded-xl transition-all"
              >
                Get in Touch
                <ChevronRightIcon size={16} className="ml-2" />
              </Link>
            </div>
          </div>
        </div>
      )}

      <div className="p-6 text-center">
        <Link href="/contact" className="text-cyan-400 hover:text-cyan-300">
          ← Back to Current Contact Page
        </Link>
      </div>
    </main>
  )
}
