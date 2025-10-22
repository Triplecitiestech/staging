'use client'

import { Challenge } from '@/types/services'
import { ChevronDownIcon } from '@/components/icons/TechIcons'
import Image from 'next/image'

interface ChallengeSelectorProps {
  selectedChallenges: string[]
  showDropdown: boolean
  onChallengeSelect: (challengeId: string) => void
  onIdentifyChallenges: () => void
  onGetResults: () => void
  onReset: () => void
  challenges: Challenge[]
}

export default function ChallengeSelector({
  selectedChallenges,
  showDropdown,
  onChallengeSelect,
  onIdentifyChallenges,
  onGetResults,
  onReset,
  challenges
}: ChallengeSelectorProps) {
  return (
    <>
      {/* Main Challenge Question */}
      <div className="text-center mb-20">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-black text-white mb-8 leading-tight">
            What's holding your business back?
          </h2>
          
          <p className="text-xl text-gray-300 max-w-2xl mx-auto leading-relaxed mb-16">
            Discover how our IT solutions can transform your business operations and drive growth.
          </p>
        
          {/* Interactive Challenge Selector */}
          <div className="max-w-md mx-auto mb-20">
            <button 
              onClick={onIdentifyChallenges}
              className="group w-full bg-white/10 backdrop-blur-sm border border-white/20 hover:bg-white/20 text-white font-medium text-lg px-8 py-6 rounded-2xl transition-all duration-500 hover:scale-[1.02] flex items-center justify-center space-x-4"
            >
              <span className="text-white/90 group-hover:text-white transition-colors duration-300">
                {selectedChallenges.length > 0 
                  ? `${selectedChallenges.length} challenge${selectedChallenges.length > 1 ? 's' : ''} selected` 
                  : 'Identify Your Challenges'
                }
              </span>
              <ChevronDownIcon 
                size={24} 
                className={`transform transition-all duration-500 text-white/70 group-hover:text-white ${showDropdown ? 'rotate-180' : ''}`} 
              />
            </button>
          </div>
        </div>

        {/* Challenge Options Dropdown */}
        {showDropdown && (
          <div className="max-w-4xl mx-auto mb-20">
            <h3 className="text-xl sm:text-2xl md:text-3xl font-light text-white/90 mb-8 sm:mb-12 md:mb-16 text-center px-4">
              Select your challenges:
            </h3>
            
            <div className="max-w-5xl mx-auto space-y-2">
              {challenges.map((challenge, index) => (
                <div key={challenge.id} className="group relative">
                  <button
                    onClick={() => onChallengeSelect(challenge.id)}
                    className="w-full text-left transition-all duration-500 hover:scale-[1.01] relative overflow-hidden"
                  >
                    {/* Sleek Background Glow Effect */}
                    <div className={`absolute inset-0 rounded-2xl transition-all duration-500 ${
                      selectedChallenges.includes(challenge.id)
                        ? 'bg-gradient-to-r from-cyan-500/5 via-cyan-400/10 to-cyan-500/5 border border-cyan-400/20 shadow-lg shadow-cyan-500/10'
                        : 'bg-gradient-to-r from-transparent via-white/[0.02] to-transparent hover:bg-gradient-to-r hover:from-cyan-500/3 hover:via-cyan-400/8 hover:to-cyan-500/3 hover:border hover:border-cyan-400/10'
                    }`}></div>
                    
                    <div className="relative z-10 flex flex-col sm:flex-row items-start space-y-4 sm:space-y-0 sm:space-x-4 md:space-x-8 py-4 sm:py-6 md:py-8 px-4 sm:px-6 md:px-8">
                      {/* Enhanced Challenge Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-col sm:flex-row sm:items-center space-y-2 sm:space-y-0 sm:space-x-4 md:space-x-6 mb-3 sm:mb-4">
                          <div className={`relative transition-all duration-500 flex-shrink-0 ${
                            selectedChallenges.includes(challenge.id)
                              ? 'scale-110'
                              : 'group-hover:scale-105'
                          }`}>
                            <div className={`w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14 rounded-full flex items-center justify-center transition-all duration-500 ${
                              selectedChallenges.includes(challenge.id)
                                ? 'bg-gradient-to-br from-cyan-400 to-cyan-500 shadow-lg shadow-cyan-400/50'
                                : `bg-gradient-to-br ${challenge.color} group-hover:shadow-lg group-hover:shadow-cyan-400/30`
                            }`}>
                              <Image
                                src={challenge.icon}
                                alt={challenge.title}
                                width={20}
                                height={20}
                                className="w-5 h-5 sm:w-6 sm:h-6 md:w-7 md:h-7 object-contain"
                              />
                            </div>
                          </div>
                          <h4 className={`text-xl sm:text-2xl md:text-3xl font-black transition-all duration-500 leading-tight ${
                            selectedChallenges.includes(challenge.id)
                              ? 'text-transparent bg-gradient-to-r from-cyan-400 via-cyan-300 to-cyan-400 bg-clip-text'
                              : 'text-white group-hover:text-transparent group-hover:bg-gradient-to-r group-hover:from-cyan-300 group-hover:via-white group-hover:to-cyan-300 group-hover:bg-clip-text'
                          }`}>
                            {challenge.title}
                          </h4>
                        </div>
                        <p className="text-gray-300/90 text-base sm:text-lg md:text-xl leading-relaxed sm:ml-0 md:ml-14 font-light tracking-wide">
                          {challenge.description}
                        </p>
                      </div>
                      
                      {/* Selection Status Indicator */}
                      <div className={`flex items-center space-x-2 transition-all duration-500 flex-shrink-0 ${
                        selectedChallenges.includes(challenge.id)
                          ? 'opacity-100 translate-x-0'
                          : 'opacity-0 translate-x-4'
                      }`}>
                        <div className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse"></div>
                        <span className="text-cyan-400 text-xs sm:text-sm font-medium uppercase tracking-wider hidden sm:inline">Selected</span>
                      </div>
                    </div>
                  </button>
                  
                  {/* Sleek Separator Line */}
                  {index < challenges.length - 1 && (
                    <div className="relative mx-4 sm:mx-6 md:mx-8">
                      <div className="h-px bg-gradient-to-r from-transparent via-gray-600/30 to-transparent"></div>
                      <div className="absolute inset-0 h-px bg-gradient-to-r from-transparent via-cyan-400/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Action Buttons - Always visible when challenges are selected */}
        {selectedChallenges.length > 0 && (
          <div className="max-w-4xl mx-auto mb-20">
            <div className="flex flex-col sm:flex-row justify-center gap-6">
              <button
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  onGetResults()
                }}
                className="px-10 py-5 font-medium text-lg transition-all duration-500 rounded-2xl bg-white text-gray-900 hover:bg-white/90 hover:scale-[1.02] shadow-lg shadow-white/20"
                type="button"
              >
                Get My Solution ({selectedChallenges.length})
              </button>
              <button
                onClick={onReset}
                className="px-10 py-5 bg-white/10 hover:bg-white/20 text-white font-medium text-lg transition-all duration-500 hover:scale-[1.02] rounded-2xl border border-white/20 hover:border-white/30 backdrop-blur-sm"
                type="button"
              >
                Reset Selection
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
