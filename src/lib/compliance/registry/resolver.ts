/**
 * Tool Capability Registry — Resolver
 *
 * Given a control and company, determines which tools should provide
 * evidence, ranked by confidence. This is the runtime query layer
 * that bridges the registry to the evaluation engine.
 */

import { CAPABILITY_MAP } from './capabilities'
import { DEFAULT_TOOLS, type ToolDefinition, type CapabilityConfidence } from './tool-definitions'
import { CIS_V8_CAPABILITY_INDEX, type ControlCapabilityRequirement } from './control-capability-map'
import type { ConnectorType, EvidenceSourceType } from '../types'

export interface ResolvedToolMapping {
  toolId: string
  toolName: string
  capabilityId: string
  capabilityName: string
  confidence: CapabilityConfidence
  /** Whether the tool has a working connector for this company */
  available: boolean
  integrationStatus: 'integrated' | 'planned' | 'known'
  evidenceSourceTypes: EvidenceSourceType[]
  reason: string
}

export interface ControlToolResolution {
  controlId: string
  /** All tools that can help with this control, ranked by confidence */
  tools: ResolvedToolMapping[]
  /** Required capabilities that have no integrated tool */
  gaps: Array<{ capabilityId: string; capabilityName: string; bestKnownTool: string | null }>
  /** The evaluation hint from the capability map */
  evaluationHint: string
}

/**
 * Resolve which tools should provide evidence for a given control.
 *
 * @param controlId - The CIS v8 control ID
 * @param availableConnectors - Set of connector types that are configured for this company
 */
export function resolveToolsForControl(
  controlId: string,
  availableConnectors: Set<ConnectorType>
): ControlToolResolution {
  const capReq = CIS_V8_CAPABILITY_INDEX.get(controlId)
  if (!capReq) {
    return { controlId, tools: [], gaps: [], evaluationHint: '' }
  }

  const tools: ResolvedToolMapping[] = []
  const gaps: ControlToolResolution['gaps'] = []
  const allCapabilities = [...capReq.requiredCapabilities, ...capReq.supplementaryCapabilities]

  for (const capId of allCapabilities) {
    const capDef = CAPABILITY_MAP.get(capId)
    const capName = capDef?.name ?? capId

    // Find all tools that provide this capability
    const matchingTools = DEFAULT_TOOLS.filter((t) =>
      t.capabilities.some((c) => c.capabilityId === capId)
    )

    if (matchingTools.length === 0) {
      gaps.push({ capabilityId: capId, capabilityName: capName, bestKnownTool: null })
      continue
    }

    let hasIntegrated = false
    for (const tool of matchingTools) {
      const toolCap = tool.capabilities.find((c) => c.capabilityId === capId)!
      const isAvailable = tool.connectorType !== null && availableConnectors.has(tool.connectorType)

      if (tool.integrationStatus === 'integrated' && isAvailable) {
        hasIntegrated = true
      }

      tools.push({
        toolId: tool.toolId,
        toolName: tool.name,
        capabilityId: capId,
        capabilityName: capName,
        confidence: toolCap.confidence,
        available: isAvailable,
        integrationStatus: tool.integrationStatus,
        evidenceSourceTypes: toolCap.evidenceSourceTypes,
        reason: capReq.requiredCapabilities.includes(capId)
          ? `Required: ${toolCap.dataDescription}`
          : `Supplementary: ${toolCap.dataDescription}`,
      })
    }

    // If this is a required capability and no integrated tool provides it
    if (capReq.requiredCapabilities.includes(capId) && !hasIntegrated) {
      const bestKnown = matchingTools.find((t) => t.integrationStatus === 'known')
      gaps.push({
        capabilityId: capId,
        capabilityName: capName,
        bestKnownTool: bestKnown?.name ?? null,
      })
    }
  }

  // Sort tools: authoritative first, then supplementary, then indirect
  // Within same confidence, available tools first
  const confidenceOrder: Record<string, number> = { authoritative: 0, supplementary: 1, indirect: 2 }
  tools.sort((a, b) => {
    const confDiff = (confidenceOrder[a.confidence] ?? 9) - (confidenceOrder[b.confidence] ?? 9)
    if (confDiff !== 0) return confDiff
    if (a.available !== b.available) return a.available ? -1 : 1
    return 0
  })

  return {
    controlId,
    tools,
    gaps,
    evaluationHint: capReq.evaluationHint,
  }
}

/**
 * Resolve tool mappings for all controls in a framework.
 */
export function resolveAllControls(
  controlIds: string[],
  availableConnectors: Set<ConnectorType>
): Map<string, ControlToolResolution> {
  const map = new Map<string, ControlToolResolution>()
  for (const controlId of controlIds) {
    map.set(controlId, resolveToolsForControl(controlId, availableConnectors))
  }
  return map
}

/**
 * Get the gap analysis for a framework — which capabilities are missing integrated tools.
 */
export function getGapAnalysis(
  controlIds: string[],
  availableConnectors: Set<ConnectorType>
): {
  totalControls: number
  fullyAutomatable: number
  partiallyAutomatable: number
  manualOnly: number
  gaps: Array<{ capabilityId: string; capabilityName: string; affectedControls: string[]; bestKnownTool: string | null }>
} {
  const resolutions = resolveAllControls(controlIds, availableConnectors)
  let fullyAutomatable = 0
  let partiallyAutomatable = 0
  let manualOnly = 0
  const gapMap = new Map<string, { capabilityName: string; controls: string[]; bestKnownTool: string | null }>()

  Array.from(resolutions.entries()).forEach(([controlId, resolution]) => {
    const availableTools = resolution.tools.filter((t) => t.available)
    if (availableTools.length > 0 && resolution.gaps.length === 0) {
      fullyAutomatable++
    } else if (availableTools.length > 0) {
      partiallyAutomatable++
    } else {
      manualOnly++
    }

    for (const gap of resolution.gaps) {
      const existing = gapMap.get(gap.capabilityId)
      if (existing) {
        existing.controls.push(controlId)
      } else {
        gapMap.set(gap.capabilityId, {
          capabilityName: gap.capabilityName,
          controls: [controlId],
          bestKnownTool: gap.bestKnownTool,
        })
      }
    }
  })

  return {
    totalControls: controlIds.length,
    fullyAutomatable,
    partiallyAutomatable,
    manualOnly,
    gaps: Array.from(gapMap.entries()).map(([capabilityId, data]) => ({
      capabilityId,
      capabilityName: data.capabilityName,
      affectedControls: data.controls,
      bestKnownTool: data.bestKnownTool,
    })).sort((a, b) => b.affectedControls.length - a.affectedControls.length),
  }
}

/**
 * Get all tools with their status for display.
 */
export function getAllTools(): ToolDefinition[] {
  return DEFAULT_TOOLS
}

/**
 * Get a capability requirement for a control.
 */
export function getControlCapabilities(controlId: string): ControlCapabilityRequirement | undefined {
  return CIS_V8_CAPABILITY_INDEX.get(controlId)
}
