import { redirect } from 'next/navigation'
import { getCurrentAgent } from '@/lib/agent-auth'

export const dynamic = 'force-dynamic'

export default async function AgentsRootPage() {
  const agent = await getCurrentAgent()
  if (agent) redirect('/agents/dashboard')
  redirect('/agents/login')
}
