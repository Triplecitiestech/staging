export default function ServicesSchema() {
  const servicesData = {
    "@context": "https://schema.org",
    "@type": "Service",
    "serviceType": "Managed IT Services",
    "provider": {
      "@type": "LocalBusiness",
      "name": "Triple Cities Tech",
      "address": {
        "@type": "PostalAddress",
        "streetAddress": "1109 Monroe St",
        "addressLocality": "Endicott",
        "addressRegion": "NY",
        "postalCode": "13760",
        "addressCountry": "US"
      },
      "telephone": "(607) 341-7500",
      "url": "https://www.triplecitiestech.com"
    },
    "areaServed": [
      {
        "@type": "City",
        "name": "Binghamton",
        "addressRegion": "NY"
      },
      {
        "@type": "City",
        "name": "Endicott",
        "addressRegion": "NY"
      },
      {
        "@type": "AdministrativeArea",
        "name": "Broome County",
        "addressRegion": "NY"
      },
      {
        "@type": "AdministrativeArea",
        "name": "Southern Tier",
        "addressRegion": "NY"
      },
      {
        "@type": "Country",
        "name": "United States"
      }
    ],
    "hasOfferCatalog": {
      "@type": "OfferCatalog",
      "name": "IT Services",
      "itemListElement": [
        {
          "@type": "Offer",
          "itemOffered": {
            "@type": "Service",
            "name": "Managed IT Services",
            "description": "Comprehensive IT management for small businesses including 24/7 monitoring, maintenance, proactive support, and help desk services."
          }
        },
        {
          "@type": "Offer",
          "itemOffered": {
            "@type": "Service",
            "name": "Cybersecurity",
            "description": "Enterprise-grade security tools, threat monitoring, vulnerability assessments, and compliance management for HIPAA, CMMC, and NIST standards."
          }
        },
        {
          "@type": "Offer",
          "itemOffered": {
            "@type": "Service",
            "name": "Cloud Services",
            "description": "Cloud migration, management, optimization, and Microsoft 365 support for business applications and data storage."
          }
        },
        {
          "@type": "Offer",
          "itemOffered": {
            "@type": "Service",
            "name": "IT Strategy & Consulting",
            "description": "Strategic IT planning, technology roadmap development, and IT budget optimization for growing businesses."
          }
        },
        {
          "@type": "Offer",
          "itemOffered": {
            "@type": "Service",
            "name": "Co-Managed IT Services",
            "description": "Enterprise-grade tools and capabilities for existing IT teams including advanced security platforms, automated compliance tracking, and disaster recovery solutions."
          }
        }
      ]
    }
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(servicesData) }}
    />
  )
}
