import Link from 'next/link'
import Header from '@/components/layout/Header'
import Footer from '@/components/layout/Footer'
import { Button } from '@/components/ui'

export default function NotFound() {
  return (
    <main className="min-h-screen flex flex-col">
      <Header />

      <div className="relative flex-1 bg-gradient-to-br from-black via-gray-900 to-cyan-900 overflow-hidden">
        {/* Background Elements */}
        <div className="absolute inset-0">
          <div className="absolute top-20 right-20 w-64 h-64 bg-gradient-to-br from-cyan-400/10 to-cyan-600/10 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute bottom-20 left-20 w-80 h-80 bg-gradient-to-br from-purple-500/10 to-pink-500/10 rounded-full blur-3xl animate-pulse delay-1000"></div>
        </div>

        {/* Content */}
        <div className="relative z-10 flex items-center justify-center min-h-[calc(100vh-200px)] px-6">
          <div className="text-center max-w-2xl">
            {/* 404 Number */}
            <div className="mb-8">
              <h1 className="text-8xl md:text-9xl font-black bg-gradient-to-r from-cyan-400 to-cyan-600 bg-clip-text text-transparent">
                404
              </h1>
            </div>

            {/* Title */}
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-6">
              Page Not Found
            </h2>

            {/* Description */}
            <p className="text-xl text-white/90 mb-10 leading-relaxed">
              Sorry, we couldn't find the page you're looking for. The page may have been moved or no longer exists.
            </p>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button
                asChild
                variant="primary"
                size="lg"
                className="bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-400 hover:to-cyan-500 hover:scale-105 transition-all duration-300"
              >
                <Link href="/">
                  Back to Home
                </Link>
              </Button>

              <Button
                asChild
                variant="secondary"
                size="lg"
                className="bg-white/10 backdrop-blur-sm border border-white/20 hover:bg-white/15 hover:border-white/30 text-white hover:scale-105 transition-all duration-300"
              >
                <Link href="/contact">
                  Contact Us
                </Link>
              </Button>
            </div>

            {/* Helpful Links */}
            <div className="mt-12 pt-8 border-t border-white/10">
              <p className="text-white/70 mb-4">You might be looking for:</p>
              <div className="flex flex-wrap justify-center gap-4 text-sm">
                <Link href="/services" className="text-cyan-400 hover:text-cyan-300 transition-colors">
                  Services
                </Link>
                <span className="text-white/30">•</span>
                <Link href="/industries" className="text-cyan-400 hover:text-cyan-300 transition-colors">
                  Industries
                </Link>
                <span className="text-white/30">•</span>
                <Link href="/about" className="text-cyan-400 hover:text-cyan-300 transition-colors">
                  About Us
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>

      <Footer />
    </main>
  )
}
