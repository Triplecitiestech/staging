import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { getWorkflowState, adjacentSteps, findStep } from '@/lib/compliance/workflow-state'
import StepStub from '@/components/compliance/StepStub'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ companyId: string }>
}

export default async function PoliciesStep({ params }: Props) {
  const session = await auth()
  if (!session?.user?.email) redirect('/admin')
  const { companyId } = await params
  const steps = await getWorkflowState(companyId)
  const step = findStep(steps, 'policies')
  if (!step) return null
  const { prev, next } = adjacentSteps(steps, 'policies')
  return <StepStub step={step} prev={prev} next={next} />
}
