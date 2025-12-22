'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function Support() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/contact#customer-support')
  }, [router])

  return null
}
