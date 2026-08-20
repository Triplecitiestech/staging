'use client'

import { useState } from 'react'
import { Turnstile } from '@marsidev/react-turnstile'
import { Button } from '@/components/ui'
import { CheckCircleIcon } from '@/components/icons/TechIcons'

interface ContactFormProps {
  /** Show the optional Phone field. */
  showPhone?: boolean
  /** Show the optional Company field. */
  showCompany?: boolean
  /** Rows on the message textarea. */
  messageRows?: number
  /** Label for the message field (the required `*` is appended automatically). */
  messageLabel?: string
  messagePlaceholder?: string
  submitLabel?: string
  submittingLabel?: string
  /** Copy shown in the green banner once the API confirms the send. */
  successMessage?: string
  /** Unique prefix for input ids so two forms can never collide on one page. */
  idPrefix?: string
}

/**
 * The site's inquiry form. Every submission goes to POST /api/contact, which
 * requires all five spam layers documented in SPAM_PROTECTION.md — honeypot,
 * the 3-second minimum fill time, and a Turnstile token are enforced here on
 * the client; keyword filtering and rate limiting are enforced server-side.
 *
 * Defaults reproduce the Contact Us page exactly; the campaign landing page
 * passes a trimmed field set. Do not fork this component — add a prop.
 */
export default function ContactForm({
  showPhone = true,
  showCompany = true,
  messageRows = 5,
  messageLabel = 'Message',
  messagePlaceholder = 'Tell us about your IT needs, questions, or how we can help...',
  submitLabel = 'Send Message',
  submittingLabel = 'Sending...',
  successMessage = 'Thank you! Your message has been sent successfully.',
  idPrefix = '',
}: ContactFormProps) {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    company: '',
    message: '',
    website: '' // Honeypot field
  })

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [turnstileToken, setTurnstileToken] = useState<string>('')
  const [formLoadTime] = useState<number>(Date.now())

  const fieldId = (name: string) => `${idPrefix}${name}`

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

    // Client-side spam checks
    if (formData.website) {
      // Honeypot filled - likely spam
      setSubmitStatus('error')
      setIsSubmitting(false)
      return
    }

    const timeElapsed = Date.now() - formLoadTime
    if (timeElapsed < 3000) {
      // Form submitted too quickly (less than 3 seconds)
      setSubmitStatus('error')
      setIsSubmitting(false)
      return
    }

    if (!turnstileToken) {
      // Turnstile not completed
      setSubmitStatus('error')
      setIsSubmitting(false)
      return
    }

    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...formData,
          turnstileToken,
          formLoadTime
        }),
      })

      if (response.ok) {
        setSubmitStatus('success')
        setFormData({ name: '', email: '', phone: '', company: '', message: '', website: '' })
        setTurnstileToken('')
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

  const fieldBase = 'w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/50 focus:ring-2 focus:ring-cyan-400 focus:border-cyan-400 transition-all duration-300 hover:border-cyan-400/50'
  const inputClasses = `${fieldBase} backdrop-blur-sm`
  const textareaClasses = `${fieldBase} resize-none backdrop-blur-sm`
  const labelClasses = 'block text-sm font-semibold text-white mb-2'

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label htmlFor={fieldId('name')} className={labelClasses}>
            Name *
          </label>
          <input
            type="text"
            id={fieldId('name')}
            name="name"
            value={formData.name}
            onChange={handleInputChange}
            required
            className={inputClasses}
            placeholder="Your full name"
          />
        </div>
        <div>
          <label htmlFor={fieldId('email')} className={labelClasses}>
            Email *
          </label>
          <input
            type="email"
            id={fieldId('email')}
            name="email"
            value={formData.email}
            onChange={handleInputChange}
            required
            className={inputClasses}
            placeholder="your.email@company.com"
          />
        </div>
      </div>

      {(showPhone || showCompany) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {showPhone && (
            <div>
              <label htmlFor={fieldId('phone')} className={labelClasses}>
                Phone
              </label>
              <input
                type="tel"
                id={fieldId('phone')}
                name="phone"
                value={formData.phone}
                onChange={handleInputChange}
                className={inputClasses}
                placeholder="(607) 555-0123"
              />
            </div>
          )}
          {showCompany && (
            <div>
              <label htmlFor={fieldId('company')} className={labelClasses}>
                Company
              </label>
              <input
                type="text"
                id={fieldId('company')}
                name="company"
                value={formData.company}
                onChange={handleInputChange}
                className={inputClasses}
                placeholder="Your company name"
              />
            </div>
          )}
        </div>
      )}

      <div>
        <label htmlFor={fieldId('message')} className={labelClasses}>
          {`${messageLabel} *`}
        </label>
        <textarea
          id={fieldId('message')}
          name="message"
          value={formData.message}
          onChange={handleInputChange}
          required
          rows={messageRows}
          className={textareaClasses}
          placeholder={messagePlaceholder}
        />
      </div>

      {/* Honeypot field - hidden from users */}
      <div style={{ position: 'absolute', left: '-9999px', width: '1px', height: '1px', overflow: 'hidden' }} aria-hidden="true">
        <label htmlFor={fieldId('website')}>Website (leave blank)</label>
        <input
          type="text"
          id={fieldId('website')}
          name="website"
          value={formData.website}
          onChange={handleInputChange}
          tabIndex={-1}
          autoComplete="off"
        />
      </div>

      {/* Cloudflare Turnstile */}
      <div className="flex justify-center">
        <Turnstile
          siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || '1x00000000000000000000AA'}
          onSuccess={(token) => setTurnstileToken(token)}
          onError={() => setTurnstileToken('')}
          onExpire={() => setTurnstileToken('')}
          options={{
            theme: 'dark',
            size: 'normal'
          }}
        />
      </div>

      {/* Submit Status Messages */}
      {submitStatus === 'success' && (
        <div className="flex items-center space-x-3 text-green-400 bg-green-900/30 border border-green-400/50 p-4 rounded-xl">
          <CheckCircleIcon size={20} />
          <span className="font-medium">{successMessage}</span>
        </div>
      )}

      {submitStatus === 'error' && (
        <div className="flex items-center space-x-3 text-red-400 bg-red-900/30 border border-red-400/50 p-4 rounded-xl">
          <span className="font-medium">Sorry, there was an error sending your message. Please try again or contact us directly.</span>
        </div>
      )}

      <Button
        type="submit"
        disabled={isSubmitting}
        className="w-full py-4 px-6 bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-400 hover:to-cyan-500 text-black font-bold rounded-xl transition-all duration-300 hover:scale-105 shadow-lg hover:shadow-cyan-500/50 text-lg"
      >
        {isSubmitting ? submittingLabel : submitLabel}
      </Button>
    </form>
  )
}
