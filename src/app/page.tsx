'use client'

import Header from '@/components/layout/Header'
import Hero from '@/components/sections/Hero'
import TargetClientValue from '@/components/sections/TargetClientValue'
import ProspectEngagement from '@/components/sections/ProspectEngagement'
import StreamlinedProcess from '@/components/sections/StreamlinedProcess'
import ServicesSummary from '@/components/sections/ServicesSummary'
import Testimonials from '@/components/sections/Testimonials'
import Footer from '@/components/layout/Footer'

export default function Home() {
  return (
    <main>
      <Header />
      <Hero />
      <TargetClientValue />
      <ServicesSummary />
      <StreamlinedProcess />
      <Testimonials />
      <ProspectEngagement />
      <Footer />
    </main>
  )
}
