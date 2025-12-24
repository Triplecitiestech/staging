export default function ServiceSchema() {
  const services = [
    {
      '@type': 'Service',
      serviceType: 'Managed IT Services',
      provider: {
        '@type': 'Organization',
        name: 'Triple Cities Tech'
      },
      areaServed: {
        '@type': 'State',
        name: 'New York'
      },
      description: 'Comprehensive managed IT services including 24/7 monitoring, help desk support, proactive maintenance, and IT infrastructure management for small to mid-sized businesses.',
      offers: {
        '@type': 'Offer',
        availability: 'https://schema.org/InStock',
        availabilityStarts: '2024-01-01'
      }
    },
    {
      '@type': 'Service',
      serviceType: 'Cybersecurity Services',
      provider: {
        '@type': 'Organization',
        name: 'Triple Cities Tech'
      },
      areaServed: {
        '@type': 'State',
        name: 'New York'
      },
      description: 'Advanced cybersecurity solutions including threat monitoring, endpoint protection, security awareness training, compliance management (HIPAA, CMMC, NIST), and incident response.',
      offers: {
        '@type': 'Offer',
        availability: 'https://schema.org/InStock',
        availabilityStarts: '2024-01-01'
      }
    },
    {
      '@type': 'Service',
      serviceType: 'Cloud Services',
      provider: {
        '@type': 'Organization',
        name: 'Triple Cities Tech'
      },
      areaServed: {
        '@type': 'State',
        name: 'New York'
      },
      description: 'Cloud migration, Microsoft 365 management, cloud backup and disaster recovery, and cloud infrastructure optimization for businesses.',
      offers: {
        '@type': 'Offer',
        availability: 'https://schema.org/InStock',
        availabilityStarts: '2024-01-01'
      }
    },
    {
      '@type': 'Service',
      serviceType: 'IT Strategy & Consulting',
      provider: {
        '@type': 'Organization',
        name: 'Triple Cities Tech'
      },
      areaServed: {
        '@type': 'State',
        name: 'New York'
      },
      description: 'Strategic IT planning, technology roadmap development, IT budget optimization, and digital transformation consulting for growing businesses.',
      offers: {
        '@type': 'Offer',
        availability: 'https://schema.org/InStock',
        availabilityStarts: '2024-01-01'
      }
    }
  ]

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify({
          '@context': 'https://schema.org',
          '@graph': services
        })
      }}
    />
  )
}
