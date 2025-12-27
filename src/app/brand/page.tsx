'use client'

import { useState } from 'react'
import Header from '@/components/layout/Header'
import Footer from '@/components/layout/Footer'
import { CheckCircleIcon } from '@/components/icons/TechIcons'

export default function BrandGuidelines() {
  const [copiedColor, setCopiedColor] = useState<string>('')

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text)
    setCopiedColor(label)
    setTimeout(() => setCopiedColor(''), 2000)
  }

  const colors = {
    primary: [
      { name: 'Cyan', hex: '#06b6d4', usage: 'Primary brand color - buttons, links, accents, CTAs' },
      { name: 'Cyan Dark', hex: '#0891b2', usage: 'Hover states, secondary accents' },
      { name: 'Cyan Deep', hex: '#0e7490', usage: 'Gradient transitions, darker elements' },
    ],
    backgrounds: [
      { name: 'Slate Dark', hex: '#0f172a', usage: 'Primary dark background' },
      { name: 'Slate', hex: '#1e293b', usage: 'Cards, sections, secondary backgrounds' },
      { name: 'Black', hex: '#000000', usage: 'Deepest backgrounds, text on light' },
      { name: 'White', hex: '#ffffff', usage: 'Text on dark, light backgrounds' },
    ],
    text: [
      { name: 'Light Primary', hex: '#e2e8f0', usage: 'Primary text on dark backgrounds' },
      { name: 'Light Secondary', hex: '#cbd5e1', usage: 'Secondary text, body copy on dark' },
      { name: 'Light Muted', hex: '#94a3b8', usage: 'Muted text, captions on dark' },
      { name: 'Dark Muted', hex: '#64748b', usage: 'Muted text on light backgrounds' },
      { name: 'Dark Primary', hex: '#333333', usage: 'Primary text on light backgrounds' },
    ],
    accent: [
      { name: 'Cyan Light', hex: '#e0f7fa', usage: 'Highlighted boxes, backgrounds' },
      { name: 'Gray Light', hex: '#f4f4f4', usage: 'Light backgrounds, email backgrounds' },
    ],
  }

  return (
    <main className="bg-gradient-to-br from-slate-950 via-gray-900 to-slate-950">
      <Header />

      {/* Hero */}
      <div className="relative py-24 bg-gradient-to-r from-cyan-600 to-cyan-500">
        <div className="max-w-7xl mx-auto px-6 text-center">
          <h1 className="text-5xl md:text-6xl font-black text-black mb-4">Brand Guidelines</h1>
          <p className="text-xl text-slate-900 font-semibold">Triple Cities Tech Visual Identity & Brand Standards</p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-16">

        {/* Brand Overview */}
        <section className="mb-20">
          <h2 className="text-4xl font-bold text-white mb-6 border-b-2 border-cyan-500 pb-4">Brand Overview</h2>
          <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-2xl p-8">
            <div className="grid md:grid-cols-2 gap-8">
              <div>
                <h3 className="text-2xl font-bold text-cyan-400 mb-4">Company Name</h3>
                <p className="text-white text-3xl font-black mb-2">TRIPLE CITIES TECH</p>
                <p className="text-slate-300 mb-6">All caps, bold, spaced lettering for maximum impact</p>

                <h3 className="text-2xl font-bold text-cyan-400 mb-4 mt-8">Tagline</h3>
                <p className="text-white text-lg font-medium">Technology solutions built for business</p>
                <p className="text-slate-400 text-sm mt-2">Sentence case, can be used with or without logo</p>
              </div>
              <div>
                <h3 className="text-2xl font-bold text-cyan-400 mb-4">Brand Voice</h3>
                <ul className="space-y-2 text-slate-300">
                  <li className="flex items-start">
                    <CheckCircleIcon size={20} className="text-cyan-400 mr-2 mt-1 flex-shrink-0" />
                    <span><strong className="text-white">Professional</strong> - Expert, trustworthy, reliable</span>
                  </li>
                  <li className="flex items-start">
                    <CheckCircleIcon size={20} className="text-cyan-400 mr-2 mt-1 flex-shrink-0" />
                    <span><strong className="text-white">Modern</strong> - Tech-forward, innovative, cutting-edge</span>
                  </li>
                  <li className="flex items-start">
                    <CheckCircleIcon size={20} className="text-cyan-400 mr-2 mt-1 flex-shrink-0" />
                    <span><strong className="text-white">Approachable</strong> - Friendly, helpful, human-focused</span>
                  </li>
                  <li className="flex items-start">
                    <CheckCircleIcon size={20} className="text-cyan-400 mr-2 mt-1 flex-shrink-0" />
                    <span><strong className="text-white">Confident</strong> - Direct, clear, authoritative</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* Logo Usage */}
        <section className="mb-20">
          <h2 className="text-4xl font-bold text-white mb-6 border-b-2 border-cyan-500 pb-4">Logo Usage</h2>

          {/* Logo Versions */}
          <div className="grid md:grid-cols-2 gap-8 mb-8">
            {/* Icon Only */}
            <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-2xl p-8">
              <h3 className="text-xl font-bold text-cyan-400 mb-4">Icon Only</h3>
              <div className="bg-slate-950 rounded-xl p-8 mb-4 flex items-center justify-center min-h-[200px]">
                <img src="/android-chrome-512x512.png" alt="TCT Icon" className="h-32" />
              </div>
              <p className="text-slate-300 text-sm mb-2"><strong className="text-white">Usage:</strong> Social media avatars, favicons, app icons, tight spaces</p>
              <p className="text-slate-400 text-xs">Shield icon - works on any background</p>
            </div>

            {/* Full Logo */}
            <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-2xl p-8">
              <h3 className="text-xl font-bold text-cyan-400 mb-4">Full Logo</h3>
              <div className="bg-slate-950 rounded-xl p-8 mb-4 flex items-center justify-center min-h-[200px]">
                <img src="/logo/tctlogo.webp" alt="TCT Full Logo" className="h-32" />
              </div>
              <p className="text-slate-300 text-sm mb-2"><strong className="text-white">Usage:</strong> Website headers, email signatures, letterheads, presentations</p>
              <p className="text-slate-400 text-xs">Full logo with text - primary version</p>
            </div>
          </div>

          {/* Logo Usage Examples */}
          <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-2xl p-8">
            <h3 className="text-xl font-bold text-cyan-400 mb-6">Logo on Different Backgrounds</h3>
            <div className="grid md:grid-cols-2 gap-8">
              <div>
                <div className="bg-slate-950 rounded-xl p-6 mb-4">
                  <img src="/logo/tctlogo.webp" alt="Logo on Dark" className="h-20 mx-auto" />
                </div>
                <p className="text-white font-semibold mb-2">On Dark Backgrounds</p>
                <p className="text-slate-300 text-sm">Primary usage: Dark backgrounds (#0f172a, #1e293b, #000000)</p>
                <p className="text-cyan-400 text-sm mt-2">✓ Best for website, digital applications</p>
              </div>
              <div>
                <div className="bg-white rounded-xl p-6 mb-4">
                  <img src="/logo/tctlogo.webp" alt="Logo on Light" className="h-20 mx-auto" />
                </div>
                <p className="text-white font-semibold mb-2">On Light Backgrounds</p>
                <p className="text-slate-300 text-sm">Use on: Light backgrounds (#ffffff, #f4f4f4)</p>
                <p className="text-cyan-400 text-sm mt-2">✓ For print materials, documents</p>
              </div>
            </div>
            <div className="mt-6 p-4 bg-cyan-500/10 border border-cyan-500/30 rounded-xl">
              <p className="text-slate-300 text-sm">
                <strong className="text-cyan-400">Note:</strong> Logo contains both cyan and black elements. The cyan shield works on any background, but ensure sufficient contrast for the black text portion on light backgrounds.
              </p>
            </div>
          </div>

          {/* Logo Don'ts */}
          <div className="bg-red-900/20 border border-red-500/50 rounded-2xl p-8 mt-8">
            <h3 className="text-xl font-bold text-red-400 mb-4">⚠️ Logo Don'ts</h3>
            <ul className="grid md:grid-cols-2 gap-4 text-slate-300">
              <li>❌ Don't stretch or distort the logo</li>
              <li>❌ Don't change the logo colors</li>
              <li>❌ Don't add effects (shadows, glows, outlines)</li>
              <li>❌ Don't rotate the logo</li>
              <li>❌ Don't place on busy backgrounds</li>
              <li>❌ Don't use low-resolution versions</li>
            </ul>
          </div>
        </section>

        {/* Color Palette */}
        <section className="mb-20">
          <h2 className="text-4xl font-bold text-white mb-6 border-b-2 border-cyan-500 pb-4">Color Palette</h2>

          {/* Primary Colors */}
          <div className="mb-8">
            <h3 className="text-2xl font-bold text-white mb-4">Primary Brand Colors</h3>
            <div className="grid md:grid-cols-3 gap-6">
              {colors.primary.map((color) => (
                <div key={color.hex} className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-6">
                  <div
                    className="w-full h-32 rounded-lg mb-4 cursor-pointer transition-transform hover:scale-105"
                    style={{ backgroundColor: color.hex }}
                    onClick={() => copyToClipboard(color.hex, color.hex)}
                  />
                  <h4 className="text-white font-bold text-lg mb-1">{color.name}</h4>
                  <p className="text-cyan-400 font-mono text-sm mb-2">{color.hex}</p>
                  <p className="text-slate-300 text-sm">{color.usage}</p>
                  {copiedColor === color.hex && (
                    <p className="text-green-400 text-xs mt-2">✓ Copied!</p>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Background Colors */}
          <div className="mb-8">
            <h3 className="text-2xl font-bold text-white mb-4">Background Colors</h3>
            <div className="grid md:grid-cols-4 gap-4">
              {colors.backgrounds.map((color) => (
                <div key={color.hex} className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-4">
                  <div
                    className="w-full h-24 rounded-lg mb-3 cursor-pointer transition-transform hover:scale-105 border border-slate-600"
                    style={{ backgroundColor: color.hex }}
                    onClick={() => copyToClipboard(color.hex, color.hex)}
                  />
                  <h4 className="text-white font-bold mb-1">{color.name}</h4>
                  <p className="text-cyan-400 font-mono text-xs mb-2">{color.hex}</p>
                  <p className="text-slate-300 text-xs">{color.usage}</p>
                  {copiedColor === color.hex && (
                    <p className="text-green-400 text-xs mt-1">✓ Copied!</p>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Text Colors */}
          <div className="mb-8">
            <h3 className="text-2xl font-bold text-white mb-4">Text Colors</h3>
            <div className="grid md:grid-cols-5 gap-4">
              {colors.text.map((color) => (
                <div key={color.hex} className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-4">
                  <div
                    className="w-full h-20 rounded-lg mb-3 cursor-pointer transition-transform hover:scale-105 border border-slate-600"
                    style={{ backgroundColor: color.hex }}
                    onClick={() => copyToClipboard(color.hex, color.hex)}
                  />
                  <h4 className="text-white font-bold text-sm mb-1">{color.name}</h4>
                  <p className="text-cyan-400 font-mono text-xs mb-2">{color.hex}</p>
                  <p className="text-slate-300 text-xs">{color.usage}</p>
                  {copiedColor === color.hex && (
                    <p className="text-green-400 text-xs mt-1">✓</p>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Accent Colors */}
          <div>
            <h3 className="text-2xl font-bold text-white mb-4">Accent Colors</h3>
            <div className="grid md:grid-cols-2 gap-6">
              {colors.accent.map((color) => (
                <div key={color.hex} className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-6">
                  <div
                    className="w-full h-24 rounded-lg mb-4 cursor-pointer transition-transform hover:scale-105 border border-slate-600"
                    style={{ backgroundColor: color.hex }}
                    onClick={() => copyToClipboard(color.hex, color.hex)}
                  />
                  <h4 className="text-white font-bold text-lg mb-1">{color.name}</h4>
                  <p className="text-cyan-400 font-mono text-sm mb-2">{color.hex}</p>
                  <p className="text-slate-300 text-sm">{color.usage}</p>
                  {copiedColor === color.hex && (
                    <p className="text-green-400 text-xs mt-2">✓ Copied!</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Typography */}
        <section className="mb-20">
          <h2 className="text-4xl font-bold text-white mb-6 border-b-2 border-cyan-500 pb-4">Typography</h2>
          <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-2xl p-8">
            <h3 className="text-2xl font-bold text-cyan-400 mb-6">Primary Font: Inter</h3>

            <div className="space-y-6">
              <div>
                <p className="text-slate-400 text-sm mb-2">Headings (H1) - Black (900)</p>
                <p className="text-white text-5xl font-black">Technology Solutions</p>
              </div>
              <div>
                <p className="text-slate-400 text-sm mb-2">Headings (H2) - Bold (700)</p>
                <p className="text-white text-3xl font-bold">Built for Business</p>
              </div>
              <div>
                <p className="text-slate-400 text-sm mb-2">Subheadings - Semibold (600)</p>
                <p className="text-white text-xl font-semibold">Managed IT Services</p>
              </div>
              <div>
                <p className="text-slate-400 text-sm mb-2">Body Text - Regular (400)</p>
                <p className="text-slate-300 text-base font-normal">We provide comprehensive technology solutions designed specifically for small to mid-sized businesses in Central New York.</p>
              </div>
              <div>
                <p className="text-slate-400 text-sm mb-2">Caption/Small Text - Regular (400)</p>
                <p className="text-slate-400 text-sm">Available weights: 300, 400, 500, 600, 700, 800, 900</p>
              </div>
            </div>

            <div className="mt-8 p-6 bg-cyan-500/10 border border-cyan-500/30 rounded-xl">
              <p className="text-white font-semibold mb-2">Google Fonts CDN</p>
              <code className="text-cyan-400 text-sm font-mono break-all">
                https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap
              </code>
            </div>
          </div>
        </section>

        {/* Design Elements */}
        <section className="mb-20">
          <h2 className="text-4xl font-bold text-white mb-6 border-b-2 border-cyan-500 pb-4">Design Elements</h2>
          <div className="grid md:grid-cols-2 gap-8">

            {/* Rounded Corners */}
            <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-2xl p-8">
              <h3 className="text-xl font-bold text-cyan-400 mb-4">Rounded Corners</h3>
              <div className="space-y-4">
                <div className="bg-slate-700 rounded-2xl p-4">
                  <p className="text-white font-mono text-sm">16px - Cards, Containers</p>
                </div>
                <div className="bg-slate-700 rounded-xl p-4">
                  <p className="text-white font-mono text-sm">12px - Buttons, Input Fields</p>
                </div>
                <div className="bg-slate-700 rounded-lg p-4">
                  <p className="text-white font-mono text-sm">8px - Small Elements</p>
                </div>
              </div>
            </div>

            {/* Buttons */}
            <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-2xl p-8">
              <h3 className="text-xl font-bold text-cyan-400 mb-4">Button Styles</h3>
              <div className="space-y-4">
                <button className="w-full bg-cyan-500 hover:bg-cyan-400 text-black font-bold py-3 px-6 rounded-xl transition-all">
                  Primary Button
                </button>
                <button className="w-full bg-slate-700 hover:bg-slate-600 text-white font-semibold py-3 px-6 rounded-xl border-2 border-cyan-500/50 transition-all">
                  Secondary Button
                </button>
                <button className="w-full bg-transparent hover:bg-white/10 text-cyan-400 font-semibold py-3 px-6 rounded-xl border-2 border-cyan-500 transition-all">
                  Outline Button
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* TCT Fortress */}
        <section className="mb-20">
          <h2 className="text-4xl font-bold text-white mb-6 border-b-2 border-emerald-500 pb-4">TCT Fortress Service Bundle</h2>
          <div className="bg-gradient-to-br from-emerald-900/20 to-teal-900/20 border border-emerald-500/50 rounded-2xl p-8">
            <p className="text-slate-300 mb-6">TCT Fortress is a premium service bundle offering comprehensive cybersecurity and managed IT protection.</p>

            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <h3 className="text-xl font-bold text-emerald-400 mb-3">Fortress Brand Colors</h3>
                <div className="space-y-3">
                  <div className="flex items-center space-x-3">
                    <div className="w-16 h-16 bg-emerald-500 rounded-lg cursor-pointer" onClick={() => copyToClipboard('#10b981', '#10b981')}></div>
                    <div>
                      <p className="text-white font-semibold">Emerald</p>
                      <p className="text-emerald-400 font-mono text-sm">#10b981</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-3">
                    <div className="w-16 h-16 bg-teal-500 rounded-lg cursor-pointer" onClick={() => copyToClipboard('#14b8a6', '#14b8a6')}></div>
                    <div>
                      <p className="text-white font-semibold">Teal</p>
                      <p className="text-teal-400 font-mono text-sm">#14b8a6</p>
                    </div>
                  </div>
                </div>
              </div>
              <div>
                <h3 className="text-xl font-bold text-emerald-400 mb-3">Usage Guidelines</h3>
                <ul className="space-y-2 text-slate-300 text-sm">
                  <li className="flex items-start">
                    <span className="text-emerald-400 mr-2">•</span>
                    <span>Use Fortress branding for security-focused communications</span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-emerald-400 mr-2">•</span>
                    <span>Pair with shield/protection imagery</span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-emerald-400 mr-2">•</span>
                    <span>Can be used alongside main TCT branding</span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-emerald-400 mr-2">•</span>
                    <span>Maintain same typography and design elements</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* Download Assets */}
        <section className="mb-20">
          <h2 className="text-4xl font-bold text-white mb-6 border-b-2 border-cyan-500 pb-4">Download Assets</h2>
          <div className="grid md:grid-cols-3 gap-6">
            <a href="/android-chrome-512x512.png" download className="bg-slate-800/50 hover:bg-slate-700/50 backdrop-blur-sm border border-slate-700 hover:border-cyan-500 rounded-xl p-6 transition-all text-center group">
              <div className="text-cyan-400 text-4xl mb-3">📦</div>
              <h3 className="text-white font-bold mb-2 group-hover:text-cyan-400">Logo Icon</h3>
              <p className="text-slate-400 text-sm">PNG format (512x512)</p>
            </a>
            <a href="/logo/tctlogo.webp" download className="bg-slate-800/50 hover:bg-slate-700/50 backdrop-blur-sm border border-slate-700 hover:border-cyan-500 rounded-xl p-6 transition-all text-center group">
              <div className="text-cyan-400 text-4xl mb-3">📦</div>
              <h3 className="text-white font-bold mb-2 group-hover:text-cyan-400">Full Logo</h3>
              <p className="text-slate-400 text-sm">WebP format</p>
            </a>
            <a href="/apple-touch-icon.png" download className="bg-slate-800/50 hover:bg-slate-700/50 backdrop-blur-sm border border-slate-700 hover:border-cyan-500 rounded-xl p-6 transition-all text-center group">
              <div className="text-cyan-400 text-4xl mb-3">📦</div>
              <h3 className="text-white font-bold mb-2 group-hover:text-cyan-400">Apple Touch Icon</h3>
              <p className="text-slate-400 text-sm">PNG format (180x180)</p>
            </a>
          </div>
        </section>

      </div>

      <Footer />
    </main>
  )
}
