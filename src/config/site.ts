// Site configuration for Triple Cities Tech

export const siteConfig = {
  name: 'Triple Cities Tech',
  description: 'Professional IT management services for small and mid-sized businesses in Central New York. Cybersecurity, cloud services, and IT strategy.',
  url: 'https://triplecitiestech.com',
  ogImage: 'https://triplecitiestech.com/og-image.jpg',
  links: {
    twitter: 'https://twitter.com/triplecitiestech',
    linkedin: 'https://linkedin.com/company/triple-cities-tech',
    facebook: 'https://facebook.com/triplecitiestech',
    github: 'https://github.com/triplecitiestech'
  },
  contact: {
    phone: '+1 (607) 555-0123',
    email: 'hello@triplecitiestech.com',
    address: '123 Main Street, Binghamton, NY 13901',
    hours: 'Monday - Friday: 8:00 AM - 6:00 PM'
  },
  company: {
    founded: 2020,
    employees: '10-50',
    location: 'Central New York',
    industry: 'Information Technology',
    specialties: ['Managed IT Services', 'Cybersecurity', 'Cloud Services', 'IT Strategy']
  },
  seo: {
    titleTemplate: '%s | Triple Cities Tech',
    defaultTitle: 'Triple Cities Tech - Managed IT Services',
    defaultDescription: 'Professional IT management services for small and mid-sized businesses in Central New York. Cybersecurity, cloud services, and IT strategy.',
    siteUrl: 'https://triplecitiestech.com',
    openGraph: {
      type: 'website',
      locale: 'en_US',
      url: 'https://triplecitiestech.com',
      siteName: 'Triple Cities Tech',
      images: [
        {
          url: 'https://triplecitiestech.com/og-image.jpg',
          width: 1200,
          height: 630,
          alt: 'Triple Cities Tech - Managed IT Services'
        }
      ]
    },
    twitter: {
      handle: '@triplecitiestech',
      site: '@triplecitiestech',
      cardType: 'summary_large_image'
    }
  },
  features: {
    blog: false,
    newsletter: true,
    testimonials: true,
    caseStudies: false,
    careers: true
  },
  analytics: {
    googleAnalyticsId: process.env.NEXT_PUBLIC_GA_ID,
    googleTagManagerId: process.env.NEXT_PUBLIC_GTM_ID,
    hotjarId: process.env.NEXT_PUBLIC_HOTJAR_ID
  },
  integrations: {
    contactForm: 'formspree', // or 'netlify', 'emailjs', etc.
    crm: 'hubspot', // or 'salesforce', 'pipedrive', etc.
    chat: 'intercom', // or 'zendesk', 'crisp', etc.
    calendar: 'calendly' // or 'acuity', 'bookafy', etc.
  }
} as const;

export type SiteConfig = typeof siteConfig;
