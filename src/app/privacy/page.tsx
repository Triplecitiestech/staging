import type { Metadata } from 'next'
import Header from '@/components/layout/Header'
import Footer from '@/components/layout/Footer'

export const metadata: Metadata = {
  title: 'Privacy Policy | Triple Cities Tech',
  description: 'How Triple Cities Tech collects, uses, and protects information.',
}

const LAST_UPDATED = 'May 21, 2026'

export default function PrivacyPolicy() {
  return (
    <main className="bg-gradient-to-br from-black via-gray-900 to-cyan-500 min-h-screen">
      <Header />

      <div className="container mx-auto px-6 py-20 max-w-4xl">
        <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-3xl p-8 md:p-12 shadow-2xl">
          <div className="mb-10 text-center">
            <h1 className="mb-4 text-4xl font-bold text-white md:text-5xl">Privacy Policy</h1>
            <p className="text-cyan-200">Last updated: {LAST_UPDATED}</p>
          </div>

          <div className="space-y-8 text-white/90 leading-relaxed">
            <section>
              <p>
                This Privacy Policy explains how Triple Cities Tech (&quot;Triple Cities Tech,&quot; &quot;we,&quot;
                &quot;us,&quot; or &quot;our&quot;) collects, uses, and safeguards information in connection with our
                website, customer portal, and the internal business applications we operate to deliver our managed IT
                services. By using our website or services, you agree to the practices described here.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-2xl font-bold text-white">Information We Collect</h2>
              <ul className="list-disc space-y-2 pl-6">
                <li><span className="font-semibold text-white">Information you provide</span> — such as your name, email, phone number, company, and message when you submit a contact or scheduling form.</li>
                <li><span className="font-semibold text-white">Account &amp; portal data</span> — information associated with staff and customer accounts used to access our portals.</li>
                <li><span className="font-semibold text-white">Business data from connected systems</span> — when you authorize an integration (for example, Microsoft 365 or QuickBooks Online), we access only the data needed to provide the requested service.</li>
                <li><span className="font-semibold text-white">Usage &amp; technical data</span> — standard log information such as IP address, browser type, and pages visited, used to operate and secure our services.</li>
              </ul>
            </section>

            <section>
              <h2 className="mb-3 text-2xl font-bold text-white">How We Use Information</h2>
              <ul className="list-disc space-y-2 pl-6">
                <li>To respond to inquiries and provide, maintain, and improve our services.</li>
                <li>To operate internal financial, reporting, and operations dashboards used to run our business.</li>
                <li>To secure our systems, prevent fraud or abuse, and meet legal and contractual obligations.</li>
              </ul>
            </section>

            <section>
              <h2 className="mb-3 text-2xl font-bold text-white">Third-Party Integrations</h2>
              <p>
                We integrate with third-party platforms to deliver our services, including Microsoft 365, QuickBooks
                Online (Intuit), and our banking and payments providers. When you connect such a service, we access and
                store only the data necessary for the requested functionality, and we use it solely for that purpose.
                Access can be revoked at any time by disconnecting the integration or contacting us. Your use of those
                platforms remains subject to their own privacy policies.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-2xl font-bold text-white">How We Share Information</h2>
              <p>
                We do not sell your personal information. We share information only with service providers who help us
                operate (under confidentiality obligations), when required by law, or to protect our rights, property, or
                safety and that of our customers.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-2xl font-bold text-white">Data Security &amp; Retention</h2>
              <p>
                We use administrative, technical, and physical safeguards designed to protect information, including
                encryption of sensitive credentials at rest and access controls limiting data to authorized personnel.
                We retain information only as long as needed for the purposes described here or as required by law.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-2xl font-bold text-white">Your Choices</h2>
              <p>
                You may request access to, correction of, or deletion of your personal information, subject to legal and
                contractual limits. To make a request, contact us using the details below.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-2xl font-bold text-white">Contact Us</h2>
              <p>
                Questions about this Privacy Policy or our data practices can be directed to Triple Cities Tech at{' '}
                <a href="mailto:info@triplecitiestech.com" className="text-cyan-300 underline">info@triplecitiestech.com</a>.
              </p>
            </section>

            <section>
              <p className="text-sm text-white/70">
                We may update this Privacy Policy from time to time. Changes are effective when posted, as indicated by
                the &quot;Last updated&quot; date above.
              </p>
            </section>
          </div>
        </div>
      </div>

      <Footer />
    </main>
  )
}
