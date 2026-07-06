// Resolves who is allowed to VIEW the agent training material.
//
// The training pages under /agents/training are read-only reference content
// with no agent-specific data. So in addition to a logged-in sales agent, we
// also let a logged-in staff member preview exactly what agents see — without
// having to log into the agent portal with a separate agent account.
//
// This is the ONLY place that bridges the two independent auth systems
// (agent HMAC session in agent-session.ts vs. staff NextAuth in auth.ts), and
// it grants READ access to static training content only. Agent session always
// wins, so a real agent never sees the admin-preview chrome.

import { auth } from '@/auth'
import { getCurrentAgent } from '@/lib/agent-auth'

export type TrainingViewer =
  | { kind: 'agent'; firstName: string }
  | { kind: 'admin' }

export async function resolveTrainingViewer(): Promise<TrainingViewer | null> {
  // A real agent session takes priority — they always get the agent view.
  const agent = await getCurrentAgent()
  if (agent) return { kind: 'agent', firstName: agent.firstName }

  // Otherwise a logged-in staff member gets a read-only preview.
  const session = await auth()
  if (session?.user) return { kind: 'admin' }

  return null
}
