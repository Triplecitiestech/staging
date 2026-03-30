/**
 * GET /api/compliance/registry — Tool registry with capabilities and gap analysis
 * GET /api/compliance/registry?companyId=xxx&frameworkId=cis-v8-ig1 — Gap analysis for a specific company/framework
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { getAllTools, getGapAnalysis, resolveAllControls } from '@/lib/compliance/registry/resolver'
import { CAPABILITIES } from '@/lib/compliance/registry/capabilities'
import { getConnectors } from '@/lib/compliance/engine'
import type { ConnectorType, FrameworkId } from '@/lib/compliance/types'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const companyId = request.nextUrl.searchParams.get('companyId')
  const frameworkId = request.nextUrl.searchParams.get('frameworkId') as FrameworkId | null

  try {
    const tools = getAllTools()
    const capabilities = CAPABILITIES

    let gapAnalysis = null
    let controlResolutions = null

    if (companyId && frameworkId) {
      // Get the company's available connectors
      const connectors = await getConnectors(companyId)
      const availableConnectors = new Set<ConnectorType>()
      for (const c of connectors) {
        if (c.status === 'available' || c.status === 'verified' || c.status === 'configured') {
          availableConnectors.add(c.connectorType as ConnectorType)
        }
      }

      // Get framework controls
      const { getFrameworkDefinition } = await import('@/lib/compliance/engine')
      const framework = getFrameworkDefinition(frameworkId)
      const controlIds = framework.controls.map((c) => c.controlId)

      gapAnalysis = getGapAnalysis(controlIds, availableConnectors)
      const resMap = resolveAllControls(controlIds, availableConnectors)
      controlResolutions = Object.fromEntries(Array.from(resMap.entries()))
    }

    return NextResponse.json({
      success: true,
      data: {
        tools: tools.map((t) => ({
          toolId: t.toolId,
          name: t.name,
          vendor: t.vendor,
          category: t.category,
          integrationStatus: t.integrationStatus,
          connectorType: t.connectorType,
          description: t.description,
          capabilityCount: t.capabilities.length,
          capabilities: t.capabilities.map((c) => ({
            capabilityId: c.capabilityId,
            confidence: c.confidence,
            dataDescription: c.dataDescription,
          })),
        })),
        capabilities,
        gapAnalysis,
        controlResolutions,
      },
    })
  } catch (err) {
    console.error('[compliance/registry] Error:', err)
    return NextResponse.json({ error: 'Failed to load registry' }, { status: 500 })
  }
}
