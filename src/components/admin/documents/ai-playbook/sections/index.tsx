/**
 * Ordered registry of playbook sections.
 *
 * This single array is the source of truth for BOTH the sidebar table of
 * contents and the rendered body. To add / reorder / remove a section, edit
 * only this list — see the "How to add a section" guide at the top of
 * ../../AiManagedServicesPlaybook.tsx.
 *
 * Each entry's `id` MUST match the id on the <section id=…> (or <GradSection
 * id=…>) inside its component, and `num` should match the <SecHead n=…> badge.
 */

import type { ComponentType } from 'react'
import CoreModel from './CoreModel'
import Scope from './Scope'
import Phases from './Phases'
import Platform from './Platform'
import Risk from './Risk'
import Tokens from './Tokens'
import Development from './Development'
import CaseStudies from './CaseStudies'
import ActionItems from './ActionItems'

export interface PlaybookSection {
  id: string
  num: string
  label: string
  Component: ComponentType
}

export const SECTIONS: PlaybookSection[] = [
  { id: 'core',        num: '01', label: 'The Core Model',              Component: CoreModel },
  { id: 'scope',       num: '02', label: 'Included vs. Not Included',   Component: Scope },
  { id: 'phases',      num: '03', label: 'Delivery Phases',             Component: Phases },
  { id: 'platform',    num: '04', label: 'ChatGPT vs. Claude',          Component: Platform },
  { id: 'risk',        num: '05', label: 'Security, Risk & Compliance', Component: Risk },
  { id: 'tokens',      num: '06', label: 'Token Economics & Billing',   Component: Tokens },
  { id: 'development', num: '07', label: 'AI Development Track',         Component: Development },
  { id: 'cases',       num: '08', label: 'Examples & Case Studies',     Component: CaseStudies },
  { id: 'actions',     num: '09', label: 'Action Items',                Component: ActionItems },
]
