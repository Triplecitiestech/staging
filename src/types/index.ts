// Core types for Triple Cities Tech website

// Re-export service types
export * from './services'

export interface Industry {
  icon: string;
  title: string;
  description: string;
  benefits: string[];
  summary: string;
}

export interface Testimonial {
  name: string;
  company: string;
  role: string;
  content: string;
  rating: number;
}

export interface Benefit {
  icon: string;
  title: string;
  description: string;
}

export interface ContactFormData {
  name: string;
  phone: string;
  company: string;
  message: string;
}

export interface NavItem {
  label: string;
  href: string;
  children?: NavItem[];
}

export interface FooterLink {
  label: string;
  href: string;
}

export interface SocialLink {
  platform: string;
  href: string;
  icon: string;
}

export interface HeroContent {
  title: string;
  subtitle: string;
  description: string;
  ctaText: string;
  ctaHref: string;
}

export interface CompanyValue {
  icon: string;
  title: string;
  description: string;
}

export interface Client {
  name: string;
  industry: string;
  description: string;
}

// Form validation types
export interface FormErrors {
  [key: string]: string;
}

export interface FormValidation {
  isValid: boolean;
  errors: FormErrors;
}

// Animation types
export interface AnimationConfig {
  duration: number;
  delay: number;
  easing: string;
}

// SEO types
export interface PageMetadata {
  title: string;
  description: string;
  keywords: string[];
  ogImage?: string;
  canonical?: string;
}
