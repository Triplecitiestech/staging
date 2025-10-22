import { useState, useCallback } from 'react'
import { CHALLENGE_OPTIONS } from '@/constants/services'

export const useChallengeSelection = () => {
  const [selectedChallenges, setSelectedChallenges] = useState<string[]>([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [showResults, setShowResults] = useState(false)

  const handleChallengeSelect = useCallback((challengeId: string) => {
    setSelectedChallenges(prev => 
      prev.includes(challengeId)
        ? prev.filter(id => id !== challengeId)
        : [...prev, challengeId]
    )
  }, [])

  const handleIdentifyChallenges = useCallback(() => {
    setShowDropdown(prev => !prev)
  }, [])

  const handleGetResults = useCallback(() => {
    if (selectedChallenges.length > 0) {
      setShowResults(true)
      setShowDropdown(false)
    }
  }, [selectedChallenges.length])

  const handleReset = useCallback((event?: React.MouseEvent) => {
    if (event) {
      event.preventDefault()
      event.stopPropagation()
    }
    
    setSelectedChallenges([])
    setShowResults(false)
    setShowDropdown(false)
    
    // The scroll position will be restored by the useEffect in the main component
  }, [])

  const getRecommendedServices = useCallback(() => {
    const allRelatedServices = selectedChallenges.flatMap(challengeId => {
      const challenge = CHALLENGE_OPTIONS.find(c => c.id === challengeId)
      return challenge ? challenge.relatedServices : []
    })
    
    return Array.from(new Set(allRelatedServices))
  }, [selectedChallenges])

  return {
    selectedChallenges,
    showDropdown,
    showResults,
    handleChallengeSelect,
    handleIdentifyChallenges,
    handleGetResults,
    handleReset,
    getRecommendedServices
  }
}
