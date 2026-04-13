/**
 * Maps StaffUser ↔ Gusto employee.
 *
 * - `findOrCreateAutoMappings()` runs on demand (when admin clicks "Sync employees")
 *   and on first access of a user's PTO page. Auto-matches by email (work or personal)
 *   to the staff user's email (case-insensitive).
 * - `getMappingForStaffUser()` returns the mapping for a given staff id (or null).
 * - `manuallyMap()` creates/updates a mapping when the admin fixes unmatched users.
 */

import { prisma } from '@/lib/prisma'
import { getActiveConnection } from '@/lib/gusto/connection'
import { listEmployees, type GustoEmployee } from '@/lib/gusto/client'

export interface MappingResult {
  created: number
  updated: number
  unmatchedStaff: Array<{ id: string; email: string; name: string }>
  unmatchedGusto: Array<{ uuid: string; email: string | null; workEmail: string | null; name: string }>
}

function norm(v: string | null | undefined): string | null {
  return v ? v.trim().toLowerCase() : null
}

export async function findOrCreateAutoMappings(actorStaffId: string): Promise<MappingResult> {
  const conn = await getActiveConnection()
  if (!conn || !conn.companyUuid) {
    throw new Error('Gusto is not connected, or company UUID is not yet resolved.')
  }

  const [employees, staffUsers, existingMappings] = await Promise.all([
    listEmployees(conn.companyUuid),
    prisma.staffUser.findMany({
      where: { isActive: true },
      select: { id: true, email: true, name: true },
    }),
    prisma.ptoEmployeeMapping.findMany({
      select: { id: true, staffUserId: true, gustoEmployeeUuid: true, staffEmail: true },
    }),
  ])

  const mappedStaffIds = new Set(existingMappings.map((m) => m.staffUserId))
  const mappedGustoUuids = new Set(existingMappings.map((m) => m.gustoEmployeeUuid))

  // Build email → staff map
  const staffByEmail = new Map<string, (typeof staffUsers)[number]>()
  for (const s of staffUsers) {
    const key = norm(s.email)
    if (key) staffByEmail.set(key, s)
  }

  const activeEmployees = employees.filter((e) => !e.terminated)

  let created = 0
  let updated = 0

  for (const emp of activeEmployees) {
    if (mappedGustoUuids.has(emp.uuid)) {
      // Already mapped — refresh denormalized fields
      const existing = existingMappings.find((m) => m.gustoEmployeeUuid === emp.uuid)
      if (existing) {
        await prisma.ptoEmployeeMapping.update({
          where: { id: existing.id },
          data: {
            gustoWorkEmail: emp.work_email ?? null,
            gustoPersonalEmail: emp.email ?? null,
            gustoFirstName: emp.first_name,
            gustoLastName: emp.last_name,
            lastGustoSyncAt: new Date(),
          },
        })
        updated++
      }
      continue
    }

    const candidates = [norm(emp.work_email), norm(emp.email)].filter((v): v is string => !!v)
    let matchedStaff: (typeof staffUsers)[number] | undefined
    for (const c of candidates) {
      const s = staffByEmail.get(c)
      if (s && !mappedStaffIds.has(s.id)) {
        matchedStaff = s
        break
      }
    }

    if (!matchedStaff) continue

    await prisma.ptoEmployeeMapping.create({
      data: {
        staffUserId: matchedStaff.id,
        staffEmail: matchedStaff.email,
        gustoEmployeeUuid: emp.uuid,
        gustoWorkEmail: emp.work_email ?? null,
        gustoPersonalEmail: emp.email ?? null,
        gustoFirstName: emp.first_name,
        gustoLastName: emp.last_name,
        matchMethod: 'auto_email',
        mappedByStaffId: actorStaffId,
        lastGustoSyncAt: new Date(),
      },
    })
    mappedStaffIds.add(matchedStaff.id)
    mappedGustoUuids.add(emp.uuid)
    created++
  }

  const unmatchedStaff = staffUsers
    .filter((s) => !mappedStaffIds.has(s.id))
    .map((s) => ({ id: s.id, email: s.email, name: s.name }))
  const unmatchedGusto = activeEmployees
    .filter((e) => !mappedGustoUuids.has(e.uuid))
    .map((e) => ({
      uuid: e.uuid,
      email: e.email,
      workEmail: e.work_email,
      name: `${e.first_name} ${e.last_name}`.trim(),
    }))

  return { created, updated, unmatchedStaff, unmatchedGusto }
}

export async function getMappingForStaffId(staffUserId: string) {
  return prisma.ptoEmployeeMapping.findUnique({ where: { staffUserId } })
}

export async function getMappingForEmail(email: string) {
  return prisma.ptoEmployeeMapping.findFirst({
    where: { staffEmail: { equals: email, mode: 'insensitive' } },
  })
}

export async function manuallyMap(params: {
  staffUserId: string
  gustoEmployeeUuid: string
  actorStaffId: string
}): Promise<void> {
  const { staffUserId, gustoEmployeeUuid, actorStaffId } = params

  const conn = await getActiveConnection()
  if (!conn || !conn.companyUuid) throw new Error('Gusto is not connected')

  const [staff, employees] = await Promise.all([
    prisma.staffUser.findUnique({ where: { id: staffUserId } }),
    listEmployees(conn.companyUuid),
  ])
  if (!staff) throw new Error('Staff user not found')

  const emp = employees.find((e) => e.uuid === gustoEmployeeUuid)
  if (!emp) throw new Error('Gusto employee not found')

  // Clear any existing mapping for either side
  await prisma.ptoEmployeeMapping.deleteMany({
    where: { OR: [{ staffUserId }, { gustoEmployeeUuid }] },
  })

  await prisma.ptoEmployeeMapping.create({
    data: {
      staffUserId,
      staffEmail: staff.email,
      gustoEmployeeUuid,
      gustoWorkEmail: emp.work_email ?? null,
      gustoPersonalEmail: emp.email ?? null,
      gustoFirstName: emp.first_name,
      gustoLastName: emp.last_name,
      matchMethod: 'manual',
      mappedByStaffId: actorStaffId,
      lastGustoSyncAt: new Date(),
    },
  })
}

export async function unmap(staffUserId: string): Promise<void> {
  await prisma.ptoEmployeeMapping.deleteMany({ where: { staffUserId } })
}

export function describeEmployee(e: GustoEmployee): string {
  return `${e.first_name} ${e.last_name}`.trim()
}
