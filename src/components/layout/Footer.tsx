import Link from 'next/link'
import Image from 'next/image'

export default function Footer() {
  return (
    <footer className="relative bg-black overflow-hidden">

      <div className="relative z-10 max-w-7xl mx-auto px-6 py-20">
        {/* Main Footer Content */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-12 lg:gap-16">
          
          {/* Company Branding */}
          <div className="lg:col-span-2">
            {/* Logo & Company Name */}
            <div className="flex items-center space-x-3 mb-6">
              <div className="w-14 h-14 flex items-center justify-center">
                <Image
                  src="/logo/tctlogo.webp"
                  alt="Triple Cities Tech Logo"
                  width={56}
                  height={56}
                  className="w-full h-full object-contain"
                />
              </div>
              <div>
                <h3 className="text-xl font-black text-white drop-shadow-lg">Triple Cities Tech</h3>
                <p className="text-cyan-300 text-sm font-medium drop-shadow-md">Technology solutions built for business</p>
              </div>
            </div>
            
            {/* Company Description */}
            <p className="text-gray-300 leading-relaxed mb-8 max-w-lg text-sm drop-shadow-sm">
              Professional IT management services for small and mid-sized businesses. 
              We turn IT into a business advantage.
            </p>
            
            {/* Social Links */}
            <div className="flex items-center space-x-4">
              {/* Facebook */}
              <a
                href="https://www.facebook.com/TripleCitiesTech/"
                target="_blank"
                rel="noopener noreferrer"
                className="w-10 h-10 bg-gradient-to-br from-cyan-500/20 to-cyan-600/20 hover:from-cyan-500/30 hover:to-cyan-600/30 border border-cyan-400/30 hover:border-cyan-400/50 rounded-xl flex items-center justify-center transition-all duration-300 hover:scale-110 hover:shadow-lg hover:shadow-cyan-500/20"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="text-white">
                  <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                </svg>
              </a>

              {/* LinkedIn */}
              <a
                href="https://linkedin.com/company/triple-cities-tech"
                target="_blank"
                rel="noopener noreferrer"
                className="w-10 h-10 bg-gradient-to-br from-cyan-500/20 to-cyan-600/20 hover:from-cyan-500/30 hover:to-cyan-600/30 border border-cyan-400/30 hover:border-cyan-400/50 rounded-xl flex items-center justify-center transition-all duration-300 hover:scale-110 hover:shadow-lg hover:shadow-cyan-500/20"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="text-white">
                  <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                </svg>
              </a>
            </div>
            
          </div>

          {/* Services Links */}
          <div>
            <h4 className="text-white font-bold mb-6 text-sm uppercase tracking-wider">Services</h4>
            <ul className="space-y-3">
              <li>
                <Link 
                  href="/services" 
                  className="text-gray-400 hover:text-cyan-400 transition-colors duration-300 text-sm"
                >
                  Managed IT Services
                </Link>
              </li>
              <li>
                <Link 
                  href="/services" 
                  className="text-gray-400 hover:text-cyan-400 transition-colors duration-300 text-sm"
                >
                  Cybersecurity
                </Link>
              </li>
              <li>
                <Link 
                  href="/services" 
                  className="text-gray-400 hover:text-cyan-400 transition-colors duration-300 text-sm"
                >
                  Cloud Services
                </Link>
              </li>
              <li>
                <Link 
                  href="/services" 
                  className="text-gray-400 hover:text-cyan-400 transition-colors duration-300 text-sm"
                >
                  IT Strategy
                </Link>
              </li>
            </ul>
          </div>

          {/* Industries Links */}
          <div>
            <h4 className="text-white font-bold mb-6 text-sm uppercase tracking-wider">Industries</h4>
            <ul className="space-y-3">
              <li>
                <Link 
                  href="/industries" 
                  className="text-gray-400 hover:text-cyan-400 transition-colors duration-300 text-sm"
                >
                  Construction
                </Link>
              </li>
              <li>
                <Link 
                  href="/industries" 
                  className="text-gray-400 hover:text-cyan-400 transition-colors duration-300 text-sm"
                >
                  Healthcare
                </Link>
              </li>
              <li>
                <Link 
                  href="/industries" 
                  className="text-gray-400 hover:text-cyan-400 transition-colors duration-300 text-sm"
                >
                  Manufacturing
                </Link>
              </li>
              <li>
                <Link 
                  href="/industries" 
                  className="text-gray-400 hover:text-cyan-400 transition-colors duration-300 text-sm"
                >
                  Professional Services
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Section */}
        <div className="mt-16 pt-8">
          <div className="flex flex-col lg:flex-row justify-between items-center space-y-4 lg:space-y-0">
            {/* Copyright & Location */}
            <div className="text-center lg:text-left">
              <p className="text-cyan-400 text-xs mb-1">
                © 2025 Triple Cities Tech. All rights reserved.
              </p>
              <p className="text-cyan-300 text-xs">
                Proudly serving businesses across the region
              </p>
            </div>
            
            {/* Legal Links */}
            <div className="flex items-center space-x-6">
              <Link 
                href="/about" 
                className="text-gray-500 hover:text-cyan-400 text-xs transition-colors duration-300 uppercase tracking-wider font-medium"
              >
                About
              </Link>
              <Link 
                href="/contact" 
                className="text-gray-500 hover:text-cyan-400 text-xs transition-colors duration-300 uppercase tracking-wider font-medium"
              >
                Contact
              </Link>
            </div>
          </div>
        </div>
      </div>
    </footer>
  )
}
