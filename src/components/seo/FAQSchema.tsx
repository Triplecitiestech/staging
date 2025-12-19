export default function FAQSchema() {
  const faqData = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": [
      {
        "@type": "Question",
        "name": "What does Triple Cities Tech do?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Triple Cities Tech provides managed IT services, cybersecurity, cloud solutions, and IT strategy for 20-50 person teams in Central New York. We're based in Endicott, NY and serve businesses throughout the region with comprehensive IT support, monitoring, and security services."
        }
      },
      {
        "@type": "Question",
        "name": "Where is Triple Cities Tech located?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Our office is located at 1109 Monroe St, Endicott, NY 13760. We primarily serve businesses in Binghamton, Broome County, and the Southern Tier region of New York. We also provide remote IT support to clients nationwide including Alaska, Maine, Florida, and other states across the country."
        }
      },
      {
        "@type": "Question",
        "name": "What industries does Triple Cities Tech serve?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "We specialize in IT services for construction, healthcare, manufacturing, and professional services industries. We provide HIPAA-compliant solutions for healthcare, CMMC compliance for contractors, NIST compliance for manufacturers, and secure IT infrastructure for professional services firms."
        }
      },
      {
        "@type": "Question",
        "name": "Does Triple Cities Tech offer 24/7 support?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Yes, we provide 24/7 emergency support for our managed IT clients. Our business hours are Monday-Friday 8:30am-5:00pm EST, with after-hours emergency support available around the clock for critical issues."
        }
      },
      {
        "@type": "Question",
        "name": "How do I contact Triple Cities Tech?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "You can call us at (607) 341-7500, email info@triplecitiestech.com, or schedule a consultation at https://calendly.com/kurtis-tct. We respond to all inquiries within one business day."
        }
      },
      {
        "@type": "Question",
        "name": "What is Co-Managed IT Services?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Co-Managed IT Services provide enterprise-grade tools and capabilities for your existing IT team. We offer advanced security tools, automated compliance tracking, streamlined onboarding workflows, enterprise backup solutions, and access to our full technology stack and best practices."
        }
      },
      {
        "@type": "Question",
        "name": "What areas does Triple Cities Tech serve?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Triple Cities Tech primarily serves businesses in Binghamton, Broome County, and the Southern Tier region of New York, including Endicott, Johnson City, Vestal, Ithaca, and Cortland. We also provide remote IT support to clients nationwide across the United States. Our office is located in Endicott, NY."
        }
      }
    ]
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(faqData) }}
    />
  )
}
