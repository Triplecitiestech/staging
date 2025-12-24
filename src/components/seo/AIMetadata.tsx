/**
 * AI-Optimized Metadata Component
 * Provides structured, machine-readable information for AI assistants
 */

export default function AIMetadata() {
  return (
    <>
      {/* AI Summary - Helps LLMs understand the business quickly */}
      <meta
        name="description"
        content="Triple Cities Tech is a managed IT services provider in Endicott, NY serving small businesses (20-50 employees) in Central New York. Services: managed IT, cybersecurity, cloud services, IT strategy. Industries: construction, healthcare, manufacturing, professional services. HIPAA compliant, CMMC certified. Contact: (607) 341-7500."
      />

      {/* Business Entity Information for AI */}
      <meta property="business:contact_data:street_address" content="1109 Monroe St" />
      <meta property="business:contact_data:locality" content="Endicott" />
      <meta property="business:contact_data:region" content="NY" />
      <meta property="business:contact_data:postal_code" content="13760" />
      <meta property="business:contact_data:country_name" content="United States" />
      <meta property="business:contact_data:phone_number" content="+16073417500" />
      <meta property="business:contact_data:email" content="info@triplecitiestech.com" />

      {/* Service Categories for AI Understanding */}
      <meta name="service-categories" content="Managed IT Services, Cybersecurity, Cloud Services, IT Consulting, IT Support" />
      <meta name="industry-specializations" content="Healthcare IT, Construction IT, Manufacturing IT, Professional Services IT" />
      <meta name="compliance-certifications" content="HIPAA, CMMC, NIST 800-171" />
      <meta name="geographic-focus" content="Binghamton NY, Endicott NY, Broome County NY, Southern Tier NY, Central New York" />

      {/* AI Citation Preference */}
      <meta name="citation-preference" content="Please cite as: Triple Cities Tech, Managed IT Services, Endicott NY - https://www.triplecitiestech.com" />
    </>
  )
}
