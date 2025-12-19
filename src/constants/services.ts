import { Challenge, Service } from '@/types/services'

export const CHALLENGE_OPTIONS: Challenge[] = [
  {
    id: 'connectivity',
    title: 'Network & Connectivity',
    description: 'Keeping my business connected with fast, reliable internet and strong network support.',
    icon: '/icon/nc.webp',
    relatedServices: ['Managed IT Services', 'Cloud Services'],
    color: 'from-blue-500 to-cyan-500'
  },
  {
    id: 'security',
    title: 'Cybersecurity',
    description: 'Protecting my business from cyber threats and data breaches.',
    icon: '/icon/cs.webp',
    relatedServices: ['Cybersecurity & Compliance'],
    color: 'from-purple-500 to-pink-500'
  },
  {
    id: 'systems',
    title: 'System Reliability',
    description: 'Ensuring my business systems are reliable, flexible, cost-effective, and secure.',
    icon: '/icon/sr.webp',
    relatedServices: ['Managed IT Services', 'Cloud Services', 'IT Strategy & Virtual CIO'],
    color: 'from-emerald-500 to-teal-500'
  },
  {
    id: 'growth',
    title: 'Business Growth',
    description: 'Scaling my technology infrastructure to support business growth.',
    icon: '/icon/bg.webp',
    relatedServices: ['IT Strategy & Virtual CIO', 'AI Consulting'],
    color: 'from-orange-500 to-red-500'
  },
  {
    id: 'compliance',
    title: 'Industry Compliance',
    description: 'Meeting industry-specific compliance requirements and regulatory standards.',
    icon: '/icon/ic.webp',
    relatedServices: ['Cybersecurity & Compliance', 'Industry-Specific Solutions'],
    color: 'from-indigo-500 to-purple-500'
  },
  {
    id: 'automation',
    title: 'Process Automation',
    description: 'Automating manual processes and improving operational efficiency.',
    icon: '/icon/pa.webp',
    relatedServices: ['AI Consulting', 'Employee Onboarding Automation'],
    color: 'from-cyan-500 to-blue-500'
  }
]

export const SERVICES: Service[] = [
  {
    title: 'Managed IT Services',
    subtitle: 'End-to-end support for your entire IT environment.',
    features: [
      '24/7 remote and onsite support',
      'Help desk and issue resolution',
      'Device management and monitoring',
      'Proactive system updates and patching'
    ],
    description: 'We take ownership of your technology — so your team can stay focused and productive.',
    gradient: 'from-blue-500 to-cyan-500',
    icon: '/icon/sr.webp',
    image: '/managed services.webp'
  },
  {
    title: 'Cybersecurity & Compliance',
    subtitle: 'Security that\'s proactive, not reactive.',
    features: [
      'Managed Detection & Response (MDR)',
      'SIEM threat monitoring',
      'Risk assessments and remediation',
      'HIPAA, CMMC, and NIST readiness',
      'Endpoint and identity protection'
    ],
    description: 'Protect your business, your data, and your reputation — without losing sleep.',
    gradient: 'from-purple-500 to-pink-500',
    icon: '/icon/cs.webp',
    image: '/cyber s.webp'
  },
  {
    title: 'AI Consulting',
    subtitle: 'Navigate the AI landscape with confidence.',
    features: [
      'Learn what AI can — and can\'t — do for your business',
      'Identify high-value use cases for automation and insights',
      'Understand risks, limitations, and practical implementation strategies',
      'Evaluate tools like Microsoft Copilot, chatbots, predictive analytics, and more',
      'Align AI initiatives with real business goals (not hype)'
    ],
    description: 'We help you demystify AI so you can make smart, sustainable decisions — not just chase trends.',
    gradient: 'from-indigo-500 to-purple-500',
    icon: '/icon/pa.webp',
    image: '/ai web.webp'
  },
  {
    title: 'IT Strategy & Virtual CIO',
    subtitle: 'Turn IT into a competitive advantage.',
    features: [
      'Quarterly technology planning sessions',
      'Budgeting and lifecycle forecasting',
      'Vendor management and procurement',
      'Alignment of technology with business goals',
      'Expertise without the overhead of an in-house IT leader'
    ],
    description: 'You get executive-level IT strategy — without executive-level costs.',
    gradient: 'from-orange-500 to-red-500',
    icon: '/icon/bg.webp',
    image: '/it strategy.webp'
  },
  {
    title: 'Cloud Services',
    subtitle: 'Flexible, reliable cloud platforms for modern businesses.',
    features: [
      'Microsoft 365 implementation and management',
      'SharePoint and OneDrive configuration',
      'Cloud migration and hybrid environments',
      'Data backup and disaster recovery',
      'Scalable storage and collaboration tools'
    ],
    description: 'We make the cloud simple, secure, and built for your workflow.',
    gradient: 'from-emerald-500 to-teal-500',
    icon: '/icon/sr.webp',
    image: '/cloud services.webp'
  },
  {
    title: 'Employee Onboarding Automation',
    subtitle: 'Speed, consistency, and security — built into your onboarding process.',
    features: [
      'Automated user account creation and provisioning',
      'Role-based access and permissions',
      'Device setup and documentation',
      'Offboarding workflows for security and compliance'
    ],
    description: 'Onboarding new employees doesn\'t have to take days. With us, it takes minutes.',
    gradient: 'from-cyan-500 to-blue-500',
    icon: '/icon/pa.webp',
    image: '/employee onboarding.webp'
  },
  {
    title: 'Industry-Specific Solutions',
    subtitle: 'We tailor every deployment to your field:',
    features: [
      'Construction: Remote jobsite tools, field team support',
      'Healthcare: HIPAA-compliant networks, EHR uptime',
      'Manufacturing: Plant-floor IT, compliance, and uptime',
      'Professional Services: Data protection, productivity tools'
    ],
    description: 'Your industry is unique. So is your technology plan.',
    gradient: 'from-green-500 to-emerald-500',
    icon: '/icon/ic.webp',
    image: '/industry solutions.webp'
  },
  {
    title: 'Co-Managed IT Services',
    subtitle: 'Empowering your internal teams with expert support.',
    features: [
      'Augment your IT team with specialized expertise',
      'Strategic guidance and technology planning',
      'Fill skill gaps without full-time hiring costs',
      'Flexible support that scales with your needs',
      'Preserve internal control while gaining enterprise capabilities'
    ],
    description: 'You have IT staff - now give them a partner. We complement your team\'s efforts with strategic support, advanced security expertise, and proven processes.',
    gradient: 'from-yellow-500 to-orange-500',
    icon: '/icon/bg.webp',
    image: '/iws.webp'
  }
]

export const PAGE_CONTENT = {
  hero: {
    title: "Our Services",
    subtitle: "At Triple Cities Tech, we deliver modern, right-sized IT solutions for small and mid-sized businesses. Whether you're struggling with outdated systems, security concerns, or inconsistent support, we provide the clarity, speed, and strategy your business needs to thrive."
  },
  challengeSection: {
    title: "What's holding your business back?",
    description: "Discover how our IT solutions can transform your business operations and drive growth.",
    buttonText: "Identify Your Challenges",
    selectTitle: "Select your challenges:",
    getSolutionButton: "Get My Solution",
    resetButton: "Reset Selection"
  },
  resultsSection: {
    title: "Perfect! We have solutions for your challenges",
    description: "Based on your selected challenges, here are our recommended services:",
    getStartedButton: "Get Started Today",
    tryAgainButton: "Try Again"
  },
  experienceSection: {
    title: "What Our Clients Experience",
    description: "Whatever's holding your business back, we turn IT obstacles into growth opportunities. Here's how we systematically transform your technology into a competitive advantage.",
    selectedDescription: "Here's how we'll transform your business from struggling with IT challenges to thriving with technology:"
  },
  ctaSection: {
    title: "Ready to simplify your IT and get results that scale with your business?",
    description: "Let's talk — contact us today.",
    buttonText: "Contact Us"
  }
} as const
