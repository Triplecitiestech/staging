export interface Challenge {
  id: string
  title: string
  description: string
  icon: string
  relatedServices: string[]
  color: string
}

export interface Service {
  title: string
  subtitle: string
  features: string[]
  description: string
  gradient: string
  icon: string
  image?: string
}

export interface ServiceCardProps {
  icon?: string
  title: string
  subtitle: string
  features: string[]
  description: string
  gradient: string
  index: number
  image?: string
  darkBackground?: boolean
}
