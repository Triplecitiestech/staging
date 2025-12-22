'use client'

import React, { useState } from 'react'
import { useAnimation } from '@/hooks/useAnimation'
import Link from 'next/link'
import { CalendarIcon, PhoneIcon, ChevronRightIcon, MailIcon, ChevronLeftIcon } from '@/components/icons/TechIcons'
import { CONTACT_INFO } from '@/constants/data'

// Type definitions
interface ConversationEntry {
  type: 'user' | 'bot'
  message: string
}

interface QuestionOption {
  value: string
  label: string
}

type AnswerRecord = Record<string, string>

interface Question {
  id: string
  question: string | ((answers: AnswerRecord) => string)
  type: 'multiple_choice' | 'multiple_select' | 'text_input'
  options: QuestionOption[]
}

type UserPath = 'outsource' | 'internal'

export default function ProspectEngagement() {
  const { isVisible, elementRef } = useAnimation(0.1)
  const [currentStep, setCurrentStep] = useState(0)
  const [userPath, setUserPath] = useState<UserPath | ''>('')
  const [responses, setResponses] = useState<AnswerRecord>({})
  const [showBot, setShowBot] = useState(false)
  const [conversationHistory, setConversationHistory] = useState<ConversationEntry[]>([])
  const [isCompleted, setIsCompleted] = useState(false)
  const [textInput, setTextInput] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Conversational Bot Questions
  const getConversationalQuestions = (path: UserPath): Question[] => {
    if (path === 'outsource') {
      const questions = [
        {
          id: 'company_size',
          question: "Great choice! Let's start with your company size. How many employees do you have?",
          type: 'multiple_choice' as const,
          options: [
            { value: '1-10', label: '1-10 employees' },
            { value: '11-25', label: '11-25 employees' },
            { value: '26-50', label: '26-50 employees' },
            { value: '51-100', label: '51-100 employees' },
            { value: '100+', label: '100+ employees' }
          ]
        },
        {
          id: 'current_it_staff',
          question: (answers: AnswerRecord) => {
            const size = answers.company_size;
            if (size === '1-10') return "Perfect! For a smaller company like yours, how many people currently handle your IT?";
            if (size === '11-25') return "Good! With that size, how many IT staff do you currently have?";
            return "Excellent! How many dedicated IT staff do you currently have?";
          },
          type: 'multiple_choice' as const,
          options: [
            { value: '0', label: 'No dedicated IT staff' },
            { value: '1', label: '1 person' },
            { value: '2-3', label: '2-3 people' },
            { value: '4-5', label: '4-5 people' },
            { value: '6+', label: '6+ people' }
          ]
        },
        {
          id: 'primary_concerns',
          question: (answers: AnswerRecord) => {
            const staff = answers.current_it_staff;
            if (staff === '0') return "I see you don't have dedicated IT staff. What are your biggest IT worries right now?";
            if (staff === '1') return "Having just one IT person can be challenging. What keeps you up at night regarding IT?";
            return "With your current IT team, what are your main concerns?";
          },
          type: 'multiple_select' as const,
          options: [
            { value: 'security', label: 'Cybersecurity threats' },
            { value: 'downtime', label: 'System downtime' },
            { value: 'cost', label: 'Unpredictable IT costs' },
            { value: 'scalability', label: 'Scaling with business growth' },
            { value: 'compliance', label: 'Industry compliance' },
            { value: 'support', label: '24/7 technical support' }
          ]
        },
        {
          id: 'current_provider',
          question: "Thanks for sharing that. Do you currently work with any IT service providers?",
          type: 'multiple_choice' as const,
          options: [
            { value: 'no', label: 'No, we handle everything internally' },
            { value: 'yes_unsatisfied', label: 'Yes, but we\'re not happy with them' },
            { value: 'yes_satisfied', label: 'Yes, and they\'re doing okay' },
            { value: 'considering', label: 'We\'re thinking about switching' }
          ]
        },
        {
          id: 'budget_range',
          question: "What's your current monthly IT budget range? This helps me suggest the right solution.",
          type: 'multiple_choice' as const,
          options: [
            { value: 'under_1000', label: 'Under $1,000' },
            { value: '1000_3000', label: '$1,000 - $3,000' },
            { value: '3000_5000', label: '$3,000 - $5,000' },
            { value: '5000_10000', label: '$5,000 - $10,000' },
            { value: 'over_10000', label: 'Over $10,000' }
          ]
        },
        {
          id: 'email',
          question: "What's your email address so we can send you more information?",
          type: 'text_input' as const,
          options: []
        },
        {
          id: 'phone',
          question: "What's the best phone number to reach you?",
          type: 'text_input' as const,
          options: []
        }
      ];
      return questions;
    }
    return []
  }

  const handleAnswer = (questionId: string, answer: string) => {
    if (questionId === 'email') {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(answer)) {
        alert('Please enter a valid email address')
        return
      }
    }

    if (questionId === 'phone') {
      const phoneRegex = /^[\+]?[1-9][\d\s\-\(\)]{7,15}$/
      if (!phoneRegex.test(answer.replace(/\s/g, ''))) {
        alert('Please enter a valid phone number')
        return
      }
    }

    const newResponses = { ...responses, [questionId]: answer }
    setResponses(newResponses)

    const currentQuestion = getCurrentQuestion()
    const selectedOption = currentQuestion?.options.find(opt => opt.value === answer)
    setConversationHistory(prev => [
      ...prev,
      { type: 'user' as const, message: selectedOption?.label || answer }
    ])

    const questions = getConversationalQuestions(userPath as UserPath)
    if (currentStep < questions.length) {
      setCurrentStep(prev => prev + 1)
    } else {
      setIsCompleted(true)
    }
  }

  const handleSendEmail = async () => {
    setIsSubmitting(true)
    try {
      const response = await fetch('/api/questionnaire', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userPath,
          responses,
          email: responses.email,
          phone: responses.phone
        }),
      })

      const result = await response.json()

      if (response.ok) {
        alert('Assessment submitted successfully! We\'ll be in touch soon.')
        setShowBot(false)
        setCurrentStep(0)
        setUserPath('')
        setResponses({})
        setConversationHistory([])
        setIsCompleted(false)
        setTextInput('')
      } else {
        throw new Error(result.error || 'Failed to submit assessment')
      }
    } catch (error) {
      console.error('Error submitting assessment:', error)
      alert('Failed to submit assessment. Please try again or contact us directly.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(prev => prev - 1)
      setConversationHistory(prev => prev.slice(0, -1))
    } else {
      setShowBot(false)
      setCurrentStep(0)
      setUserPath('')
      setResponses({})
      setConversationHistory([])
    }
  }

  const getCurrentQuestion = (): (Question & { question: string }) | null => {
    if (!userPath) return null
    const questions = getConversationalQuestions(userPath as UserPath)
    const question = questions[currentStep - 1]
    if (!question) return null

    const resolvedQuestion = typeof question.question === 'function'
      ? question.question(responses)
      : question.question

    return {
      ...question,
      question: resolvedQuestion
    }
  }

  const contactOptions = [
    {
      icon: <MailIcon size={32} className="text-white" />,
      title: 'Have us reach out to you',
      description: 'Fill out our contact form and one of our experts will reach out promptly.',
      color: 'from-cyan-500 to-cyan-600',
      href: '/contact',
      actionText: 'Contact Us'
    },
    {
      icon: <CalendarIcon size={32} className="text-white" />,
      title: 'Schedule a Meeting',
      description: 'Book a free consultation with our IT experts to discuss your needs.',
      color: 'from-purple-500 to-purple-600',
      href: 'https://calendly.com/kurtis-tct',
      actionText: 'Schedule Now'
    },
    {
      icon: <PhoneIcon size={32} className="text-white" />,
      title: 'Call Us Directly',
      description: 'Call and speak with our sales team today.',
      color: 'from-orange-500 to-orange-600',
      href: `tel:${CONTACT_INFO.phone}`,
      actionText: CONTACT_INFO.phone,
      isPhone: true
    }
  ]

  return (
    <section id="how-to-engage" className="relative py-16 md:py-24 lg:py-32 bg-gradient-to-br from-cyan-900 via-gray-900 to-black overflow-hidden scroll-mt-24">
      <div className="absolute inset-0">
        <div className="absolute inset-0 opacity-5">
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: `
                linear-gradient(rgba(6, 182, 212, 0.1) 1px, transparent 1px),
                linear-gradient(90deg, rgba(6, 182, 212, 0.1) 1px, transparent 1px)
              `,
              backgroundSize: '60px 60px'
            }}
          ></div>
        </div>

        <div className="absolute top-20 right-10 md:right-32 w-32 h-32 md:w-72 md:h-72 bg-gradient-to-br from-cyan-300/20 to-cyan-500/20 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-20 left-10 md:left-32 w-24 h-24 md:w-64 md:h-64 bg-gradient-to-br from-cyan-400/20 to-cyan-600/20 rounded-full blur-3xl animate-pulse delay-1000"></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-16 h-16 md:w-32 md:h-32 bg-gradient-to-br from-cyan-300/20 to-cyan-400/20 rounded-full blur-3xl animate-pulse delay-2000"></div>

        <div className="absolute inset-0 bg-gradient-to-t from-gray-900/10 via-transparent to-gray-900/10"></div>
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-6">
        <div
          ref={elementRef}
          className={`text-center mb-12 md:mb-16 lg:mb-20 transition-all duration-1000 ease-out ${
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-20'
          }`}
        >
          <h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-black text-white mb-4 md:mb-6 lg:mb-8 leading-tight px-4">
            How to{' '}
            <span className="bg-gradient-to-r from-cyan-200 to-cyan-400 bg-clip-text text-transparent">
              Engage
            </span>{' '}
            with Us
          </h2>
        </div>

        {!showBot ? (
          <div className={`transition-all duration-1000 ease-out delay-200 max-w-6xl mx-auto ${
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-20'
          }`}>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
              {contactOptions.map((option, index) => (
                <div key={index} className="group">
                  <div className="relative bg-white/10 backdrop-blur-sm border border-white/20 rounded-2xl md:rounded-3xl p-6 md:p-8 hover:border-white/30 transition-all duration-500 hover:scale-[1.02] hover:shadow-2xl hover:shadow-cyan-500/20 h-full flex flex-col">
                    <div className={`w-16 h-16 md:w-20 md:h-20 rounded-2xl bg-gradient-to-r ${option.color} flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-300 mx-auto mb-6`}>
                      {React.cloneElement(option.icon, { size: 28 })}
                    </div>

                    <div className="text-center mb-6 flex-grow">
                      <h4 className="text-xl md:text-2xl font-bold text-white mb-3 group-hover:text-cyan-200 transition-colors duration-300">
                        {option.title}
                      </h4>
                      <p className="text-white/90 text-sm md:text-base leading-relaxed">
                        {option.description}
                      </p>
                    </div>

                    <div>
                      <a
                        href={option.href}
                        target={option.href.startsWith('http') ? '_blank' : undefined}
                        rel={option.href.startsWith('http') ? 'noopener noreferrer' : undefined}
                        className={`inline-flex items-center justify-center w-full text-center bg-gradient-to-r ${option.color} hover:opacity-90 text-white font-bold px-4 py-3 md:px-6 md:py-4 rounded-xl transition-all duration-300 hover:scale-105 shadow-lg ${
                          option.isPhone ? 'text-lg md:text-xl' : ''
                        }`}
                      >
                        {option.actionText}
                        {!option.isPhone && <ChevronRightIcon size={16} className="ml-2 transform group-hover:translate-x-1 transition-transform duration-300" />}
                      </a>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className={`transition-all duration-1000 ease-out delay-200 max-w-4xl mx-auto px-4 sm:px-6 ${
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-20'
          }`}>
            <div className="relative bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl sm:rounded-2xl md:rounded-3xl overflow-hidden shadow-2xl">
              <div className="bg-gray-900/50 border-b border-white/20 p-4 md:p-6">
                <button
                  onClick={handleBack}
                  className="flex items-center space-x-2 text-cyan-300 hover:text-cyan-200 transition-colors duration-300 group"
                >
                  <ChevronLeftIcon size={20} className="transform group-hover:-translate-x-1 transition-transform duration-300" />
                  <span className="font-medium">Back to Options</span>
                </button>
              </div>

              <div className="p-4 md:p-6 border-b border-white/20">
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 mb-3">
                  <span className="text-sm font-medium text-gray-200">
                    Question {currentStep} of {userPath ? getConversationalQuestions(userPath as UserPath).length : 0}
                  </span>
                  <span className="text-sm font-semibold text-cyan-300 bg-cyan-500/20 px-3 py-1 rounded-full">
                    IT Assessment
                  </span>
                </div>
                <div className="w-full bg-gray-700 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-cyan-400 to-cyan-500 h-2 rounded-full transition-all duration-700 ease-out"
                    style={{ width: `${userPath ? (currentStep / getConversationalQuestions(userPath as UserPath).length) * 100 : 0}%` }}
                  ></div>
                </div>
              </div>

              <div className="p-3 sm:p-4 md:p-6 max-h-80 sm:max-h-96 overflow-y-auto">
                {conversationHistory.length > 0 && (
                  <div className="mb-4 sm:mb-6 space-y-3 sm:space-y-4">
                    {conversationHistory.map((entry: ConversationEntry, index: number) => (
                      <div key={index} className={`flex ${entry.type === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[85%] sm:max-w-xs md:max-w-md px-3 sm:px-4 py-2 sm:py-3 rounded-xl sm:rounded-2xl ${
                          entry.type === 'user'
                            ? 'bg-gradient-to-r from-cyan-400 to-cyan-500 text-white shadow-lg'
                            : 'bg-gray-800/50 text-gray-200 border border-gray-600/50'
                        }`}>
                          <span className="text-xs sm:text-sm leading-relaxed">{entry.message}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {!isCompleted ? (
                  <div className="mb-4 sm:mb-6">
                    <h3 className="text-base sm:text-lg md:text-xl font-bold text-white mb-3 sm:mb-4 leading-relaxed">
                      {getCurrentQuestion()?.question || ''}
                    </h3>

                    {getCurrentQuestion()?.type === 'text_input' ? (
                      <div className="space-y-3 sm:space-y-4">
                        <div className="relative">
                          <input
                            type={getCurrentQuestion()?.id === 'email' ? 'email' : 'tel'}
                            value={textInput}
                            onChange={(e) => setTextInput(e.target.value)}
                            placeholder={getCurrentQuestion()?.id === 'email' ? 'Enter your email address' : 'Enter your phone number'}
                            className="w-full bg-gray-800/50 border border-gray-600/50 hover:border-cyan-400/50 focus:border-cyan-400 rounded-xl p-3 sm:p-4 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-400/20 transition-all duration-300 text-sm sm:text-base"
                            style={{ fontSize: '16px' }}
                          />
                        </div>
                        <button
                          onClick={() => {
                            if (textInput.trim()) {
                              handleAnswer(getCurrentQuestion()?.id || '', textInput.trim())
                              setTextInput('')
                            }
                          }}
                          disabled={!textInput.trim()}
                          className="w-full bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-600 hover:to-cyan-700 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed text-white font-bold px-4 sm:px-6 py-3 sm:py-4 rounded-xl transition-all duration-300 hover:scale-105 shadow-lg flex items-center justify-center text-sm sm:text-base"
                        >
                          <span>Continue</span>
                          <ChevronRightIcon size={14} className="ml-2 sm:ml-2" />
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-2 sm:space-y-3">
                        {getCurrentQuestion()?.options.map((option, index) => (
                          <button
                            key={index}
                            onClick={() => handleAnswer(getCurrentQuestion()?.id || '', option.value)}
                            className="w-full text-left bg-gray-800/50 hover:bg-gray-700/50 border border-gray-600/50 hover:border-cyan-400/50 rounded-lg sm:rounded-xl p-3 sm:p-4 transition-all duration-300 hover:scale-[1.02] group shadow-sm"
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-white font-medium group-hover:text-cyan-300 transition-colors duration-300 text-sm sm:text-base leading-relaxed pr-2">{option.label}</span>
                              <ChevronRightIcon size={14} className="text-gray-400 group-hover:text-cyan-400 transform group-hover:translate-x-1 transition-all duration-300 flex-shrink-0" />
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-6 sm:py-8">
                    <div className="w-14 h-14 sm:w-16 sm:h-16 md:w-20 md:h-20 bg-gradient-to-r from-cyan-500 to-cyan-600 rounded-full flex items-center justify-center mx-auto mb-4 sm:mb-6 shadow-lg">
                      <span className="text-xl sm:text-2xl md:text-3xl">✓</span>
                    </div>
                    <h3 className="text-xl sm:text-2xl md:text-3xl font-bold text-white mb-3 sm:mb-4">Assessment Complete!</h3>
                    <p className="text-gray-200 text-sm sm:text-base md:text-lg mb-6 sm:mb-8 max-w-2xl mx-auto px-4">
                      Based on your responses, we can provide a customized solution for your IT needs.
                    </p>

                    <div className="bg-gray-800/50 border border-gray-600/50 rounded-lg sm:rounded-xl p-4 sm:p-6 mb-6 sm:mb-8 mx-4 sm:mx-0">
                      <h4 className="text-base sm:text-lg md:text-xl font-bold text-white mb-2 sm:mb-3">Next Steps:</h4>
                      <p className="text-gray-200 text-xs sm:text-sm md:text-base">
                        We'll review your responses and prepare a personalized proposal.
                        Contact us to schedule a consultation and discuss your specific needs.
                      </p>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center px-4 sm:px-0">
                      <button
                        onClick={handleSendEmail}
                        disabled={isSubmitting}
                        className="inline-flex items-center justify-center bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-600 hover:to-cyan-700 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed text-white font-bold px-4 sm:px-6 py-3 sm:py-4 rounded-lg sm:rounded-xl transition-all duration-300 hover:scale-105 shadow-lg text-sm sm:text-base"
                      >
                        {isSubmitting ? (
                          <>
                            <div className="animate-spin rounded-full h-4 w-4 sm:h-5 sm:w-5 border-b-2 border-white mr-2"></div>
                            Submitting...
                          </>
                        ) : (
                          <>
                            <MailIcon size={16} className="mr-2 sm:mr-2" />
                            Submit Assessment
                          </>
                        )}
                      </button>
                      <Link
                        href="/contact"
                        className="inline-flex items-center justify-center bg-gray-700/50 hover:bg-gray-600/50 text-white font-bold px-4 sm:px-6 py-3 sm:py-4 rounded-lg sm:rounded-xl transition-all duration-300 hover:scale-105 border border-gray-600/50 text-sm sm:text-base"
                      >
                        Contact Us Now
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
