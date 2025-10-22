'use client'

import { useState } from 'react'
import Image from 'next/image'
import Header from '@/components/layout/Header'
import Footer from '@/components/layout/Footer'
import { Button } from '@/components/ui'
import { CONTACT_INFO } from '@/constants/data'
import { CalendarIcon, PhoneIcon, MailIcon, GlobeIcon, CheckCircleIcon } from '@/components/icons/TechIcons'

export default function Contact() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    company: '',
    message: ''
  })

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle')

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setSubmitStatus('idle')

    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      })

      if (response.ok) {
        setSubmitStatus('success')
        setFormData({ name: '', email: '', phone: '', company: '', message: '' })
      } else {
        const errorData = await response.json()
        console.error('Server error:', errorData)
        console.error('Status:', response.status)
        setSubmitStatus('error')
      }
    } catch (error) {
      console.error('Error submitting form:', error)
      setSubmitStatus('error')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="bg-gradient-to-br from-black via-gray-900 to-cyan-500 min-h-screen">
      <Header />
      
      {/* Image Section */}
      <div className="relative py-4 pt-20">
        <div className="max-w-5xl mx-auto px-6">
          <div className="relative group">
            {/* 3D Floating Image Effect */}
            <div className="absolute -inset-1 bg-gradient-to-r from-cyan-400 via-cyan-500 to-cyan-600 rounded-2xl blur opacity-75 group-hover:opacity-100 transition duration-1000 group-hover:duration-200 animate-tilt"></div>
            <div className="relative rounded-2xl overflow-hidden shadow-2xl group-hover:shadow-cyan-500/25 group-hover:shadow-3xl transition-all duration-500">
              <Image 
                src="/ctaa.webp" 
                alt="Contact us for IT solutions"
                width={1200}
                height={180}
                className="w-full h-[140px] sm:h-[160px] md:h-[180px] object-contain bg-gray-900 transition-transform duration-700 group-hover:scale-105"
                priority
              />
              
              {/* Gradient Overlay with Animation */}
              <div className="absolute inset-0 bg-gradient-to-br from-black/20 via-black/30 to-black/40 group-hover:from-black/10 group-hover:via-black/20 group-hover:to-black/30 transition-all duration-500"></div>
              
              {/* Animated Border Glow */}
              <div className="absolute inset-0 rounded-2xl border-2 border-cyan-400/0 group-hover:border-cyan-400/50 transition-all duration-500"></div>
              
               {/* Text Overlay */}
               <div className="absolute inset-0">
                 <div className="absolute top-3 left-3 right-3">
                   <div className="text-left">
                     <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white mb-0.5 leading-tight group-hover:text-cyan-100 transition-colors duration-500">
                       Get In Touch
                     </h1>
                     <p className="text-xs text-white font-medium leading-snug group-hover:text-cyan-200 transition-colors duration-500">
                       Ready to transform your IT experience? Let's discuss how we can help your business thrive.
                     </p>
                   </div>
                 </div>
               </div>
              
              {/* Shimmer Effect */}
              <div className="absolute inset-0 -top-10 left-0 w-full h-20 bg-gradient-to-r from-transparent via-cyan-400/20 to-transparent transform -skew-y-12 group-hover:translate-x-full transition-transform duration-1000"></div>
            </div>
          </div>
        </div>
      </div>

       {/* Contact Form & Info */}
       <div className="py-6 pb-16">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          
          {/* Contact Form - Black Floating Card */}
          <div className="relative group">
            {/* 3D Floating Card Effect */}
            <div className="absolute -inset-1 bg-gradient-to-r from-cyan-400 via-cyan-500 to-cyan-600 rounded-2xl blur opacity-75 group-hover:opacity-100 transition duration-1000 group-hover:duration-200 animate-tilt"></div>
            <div className="relative bg-black rounded-2xl p-6 shadow-2xl">
              {/* Card Header */}
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-white mb-3">Send us a message</h2>
                <p className="text-cyan-200 text-base">
                  Have a question about our services? Want to discuss your IT needs? 
                  We'd love to hear from you.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="name" className="block text-sm font-medium text-cyan-200 mb-1">
                      Name *
                    </label>
                    <input
                      type="text"
                      id="name"
                      name="name"
                      value={formData.name}
                      onChange={handleInputChange}
                      required
                      className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-400 focus:ring-2 focus:ring-cyan-400 focus:border-cyan-400 transition-all duration-300 hover:border-cyan-500"
                      placeholder="Your full name"
                    />
                  </div>
                  <div>
                    <label htmlFor="email" className="block text-sm font-medium text-cyan-200 mb-1">
                      Email *
                    </label>
                    <input
                      type="email"
                      id="email"
                      name="email"
                      value={formData.email}
                      onChange={handleInputChange}
                      required
                      className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-400 focus:ring-2 focus:ring-cyan-400 focus:border-cyan-400 transition-all duration-300 hover:border-cyan-500"
                      placeholder="your.email@company.com"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="phone" className="block text-sm font-medium text-cyan-200 mb-1">
                      Phone
                    </label>
                    <input
                      type="tel"
                      id="phone"
                      name="phone"
                      value={formData.phone}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-400 focus:ring-2 focus:ring-cyan-400 focus:border-cyan-400 transition-all duration-300 hover:border-cyan-500"
                      placeholder="(607) 555-0123"
                    />
                  </div>
                  <div>
                    <label htmlFor="company" className="block text-sm font-medium text-cyan-200 mb-1">
                      Company
                    </label>
                    <input
                      type="text"
                      id="company"
                      name="company"
                      value={formData.company}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-400 focus:ring-2 focus:ring-cyan-400 focus:border-cyan-400 transition-all duration-300 hover:border-cyan-500"
                      placeholder="Your company name"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="message" className="block text-sm font-medium text-cyan-200 mb-1">
                    Message *
                  </label>
                  <textarea
                    id="message"
                    name="message"
                    value={formData.message}
                    onChange={handleInputChange}
                    required
                    rows={4}
                    className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-400 focus:ring-2 focus:ring-cyan-400 focus:border-cyan-400 transition-all duration-300 hover:border-cyan-500 resize-none"
                    placeholder="Tell us about your IT needs, questions, or how we can help..."
                  />
                </div>

                {/* Submit Status Messages */}
                {submitStatus === 'success' && (
                  <div className="flex items-center space-x-2 text-green-400 bg-green-900/20 border border-green-500/30 p-3 rounded-lg text-sm">
                    <CheckCircleIcon size={16} />
                    <span>Thank you! Your message has been sent successfully.</span>
                  </div>
                )}

                {submitStatus === 'error' && (
                  <div className="flex items-center space-x-2 text-red-400 bg-red-900/20 border border-red-500/30 p-3 rounded-lg text-sm">
                    <span>Sorry, there was an error sending your message. Please try again or contact us directly.</span>
                  </div>
                )}

                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-3 px-4 bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-400 hover:to-cyan-500 text-black font-bold rounded-lg transition-all duration-300 hover:scale-105 shadow-lg hover:shadow-cyan-500/25"
                >
                  {isSubmitting ? 'Sending...' : 'Send Message'}
                </Button>
              </form>
            </div>
          </div>

          {/* Contact Information - Black Floating Card */}
          <div className="relative group">
            {/* 3D Floating Card Effect */}
            <div className="absolute -inset-1 bg-gradient-to-r from-cyan-400 via-cyan-500 to-cyan-600 rounded-2xl blur opacity-75 group-hover:opacity-100 transition duration-1000 group-hover:duration-200 animate-tilt"></div>
            <div className="relative bg-black rounded-2xl p-6 shadow-2xl">
              {/* Card Header */}
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-white mb-3">Contact Information</h2>
                <p className="text-cyan-200 text-base">
                  Prefer to reach out directly? Here's how you can get in touch with our team.
                </p>
              </div>

              <div className="space-y-3">
                <div className="flex items-start space-x-3 group/item">
                  <div className="w-12 h-12 bg-gradient-to-br from-cyan-500 to-cyan-600 rounded-lg flex items-center justify-center flex-shrink-0 shadow-lg group-hover/item:scale-110 transition-transform duration-300">
                    <PhoneIcon size={20} className="text-white" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-white mb-0.5">Phone</h3>
                    <p className="text-cyan-200 text-sm">{CONTACT_INFO.phone}</p>
                  </div>
                </div>

                <div className="flex items-start space-x-3 group/item">
                  <div className="w-12 h-12 bg-gradient-to-br from-cyan-500 to-cyan-600 rounded-lg flex items-center justify-center flex-shrink-0 shadow-lg group-hover/item:scale-110 transition-transform duration-300">
                    <MailIcon size={20} className="text-white" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-white mb-0.5">Email</h3>
                    <p className="text-cyan-200 text-sm">{CONTACT_INFO.email}</p>
                  </div>
                </div>

                <div className="flex items-start space-x-3 group/item">
                  <div className="w-12 h-12 bg-gradient-to-br from-cyan-500 to-cyan-600 rounded-lg flex items-center justify-center flex-shrink-0 shadow-lg group-hover/item:scale-110 transition-transform duration-300">
                    <GlobeIcon size={20} className="text-white" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-white mb-0.5">Address</h3>
                    <p className="text-cyan-200 text-sm">{CONTACT_INFO.address}</p>
                  </div>
                </div>

                <div className="flex items-start space-x-3 group/item">
                  <div className="w-12 h-12 bg-gradient-to-br from-cyan-500 to-cyan-600 rounded-lg flex items-center justify-center flex-shrink-0 shadow-lg group-hover/item:scale-110 transition-transform duration-300">
                    <CalendarIcon size={20} className="text-white" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-white mb-0.5">Business Hours</h3>
                    <p className="text-cyan-200 text-sm">{CONTACT_INFO.hours}</p>
                  </div>
                </div>
              </div>

              {/* Quick Contact CTA */}
              <div className="mt-4 p-4 bg-gradient-to-br from-gray-900 to-gray-800 border border-cyan-500/20 rounded-lg">
                <h3 className="text-lg font-bold text-white mb-1">Need immediate assistance?</h3>
                <p className="text-cyan-200 text-sm mb-3">
                  For urgent IT issues or emergency support, call us directly.
                </p>
                <Button
                  asChild
                  className="bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-400 hover:to-cyan-500 text-black font-bold px-4 py-2 text-sm rounded-lg transition-all duration-300 hover:scale-105 shadow-lg hover:shadow-cyan-500/25"
                >
                  <a href={`tel:${CONTACT_INFO.phone}`}>
                    Call Now
                  </a>
                </Button>
              </div>
            </div>
          </div>
          </div>
        </div>
      </div>

      <Footer />
    </main>
  )
}
