'use client'

import Image from 'next/image'

interface ClientExperienceProps {
  selectedChallenges: string[]
}

const experienceSteps = [
  {
    title: 'Stop the Pain',
    description: 'Immediate relief from IT headaches with 24/7 support, instant issue resolution, and proactive monitoring',
    icon: '/icon/nc.webp',
    gradient: 'from-cyan-500 to-blue-600'
  },
  {
    title: 'Secure & Stabilize',
    description: 'Eliminate security worries with enterprise-grade protection, compliance readiness, and bulletproof infrastructure',
    icon: '/icon/cs.webp',
    gradient: 'from-purple-500 to-pink-600'
  },
  {
    title: 'Modernize & Optimize',
    description: 'Transform outdated systems into modern, efficient operations with cloud solutions and streamlined workflows',
    icon: '/icon/sr.webp',
    gradient: 'from-emerald-500 to-teal-600'
  },
  {
    title: 'Scale & Dominate',
    description: 'Turn IT into your competitive advantage with strategic planning, AI integration, and growth-focused solutions',
    icon: '/icon/bg.webp',
    gradient: 'from-orange-500 to-red-600'
  }
]

export default function ClientExperience({ selectedChallenges }: ClientExperienceProps) {
  const hasSelectedChallenges = selectedChallenges.length > 0

  return (
    <div className="mt-24 pt-16 border-t border-gray-600">
      <div className="text-center mb-16">
        <h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-black text-white mb-6 leading-tight">
          What Our Clients <span className="text-cyan-400">Experience</span>
        </h2>
        <p className="text-xl text-gray-300 max-w-4xl mx-auto leading-relaxed">
          {hasSelectedChallenges 
            ? "Here's how we'll transform your business from struggling with IT challenges to thriving with technology:"
            : "Whatever's holding your business back, we turn IT obstacles into growth opportunities. Here's how we systematically transform your technology into a competitive advantage."
          }
        </p>
      </div>

      {/* Service Journey Details */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
        {experienceSteps.map((step, index) => (
          <div 
            key={index}
            className={`relative overflow-hidden rounded-2xl p-6 text-center transition-all duration-500 hover:scale-105 ${
              index % 2 === 0 
                ? 'bg-black border border-cyan-500' 
                : 'bg-cyan-500 border border-cyan-600'
            }`}
          >
            <div className="relative z-10">
              <div className={`w-12 h-12 rounded-lg flex items-center justify-center mx-auto mb-4 shadow-lg ${
                index % 2 === 0 
                  ? 'bg-cyan-500' 
                  : 'bg-black'
              }`}>
                <Image
                  src={step.icon}
                  alt={step.title}
                  width={24}
                  height={24}
                  className={`w-6 h-6 object-contain ${
                    index % 2 === 0 
                      ? 'filter brightness-0 invert' 
                      : 'filter brightness-0 invert'
                  }`}
                />
              </div>
              <h3 className={`text-lg font-bold mb-2 ${
                index % 2 === 0 
                  ? 'text-white' 
                  : 'text-black'
              }`}>{step.title}</h3>
              <p className={`text-sm leading-relaxed ${
                index % 2 === 0 
                  ? 'text-gray-300' 
                  : 'text-gray-800'
              }`}>{step.description}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
