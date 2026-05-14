/**
 * LOCAL-ONLY seed for the hermetic preview loop. Not committed; not for prod.
 *
 * Populates the local Docker Postgres with:
 *   - one company (Tri-Bros Transportation — matches the screenshot the
 *     operator shared) plus a couple more for variety
 *   - the raw-SQL compliance tables (via ensureComplianceTables)
 *   - a realistic spread of compliance data so every cockpit page renders
 *     something: an assessment + findings, dispositions, connectors, tools,
 *     platform mappings, a customer profile, pending changes + a bundle,
 *     uploaded/generated policies, and audit-log rows.
 *
 * Run:  DATABASE_URL=postgresql://postgres:devpass@localhost:5433/tct \
 *       npx tsx scripts/local-seed.ts
 */

import { Pool } from 'pg'
import { ensureComplianceTables } from '../src/lib/compliance/ensure-tables'

const DB = process.env.DATABASE_URL || 'postgresql://postgres:devpass@localhost:5433/tct'

const COMPANY = {
  id: '4944a84d-535c-4772-a7a8-affaa8376697',
  slug: 'tri-bros-transportation',
  displayName: 'Tri-Bros Transportation',
}
const COMPANY_2 = {
  id: '6e5828cf-8e92-4f0f-a5d4-f84025829a72',
  slug: 'contoso-industries',
  displayName: 'Contoso Industries',
}

async function main() {
  const pool = new Pool({ connectionString: DB })
  const c = await pool.connect()
  try {
    console.log('→ companies')
    for (const co of [COMPANY, COMPANY_2]) {
      await c.query(
        `INSERT INTO companies (id, slug, "displayName", "passwordHash", "createdAt", "updatedAt", "m365_setup_status")
         VALUES ($1, $2, $3, 'local-dev-no-password', NOW(), NOW(), 'verified')
         ON CONFLICT (id) DO UPDATE SET "displayName" = EXCLUDED."displayName"`,
        [co.id, co.slug, co.displayName]
      )
    }

    console.log('→ ensureComplianceTables')
    await ensureComplianceTables()

    const cid = COMPANY.id

    // --- customer profile (form_responses) ---
    console.log('→ form_responses (customer profile)')
    await c.query(
      `INSERT INTO form_responses (company_id, schema_type, answers, updated_by, created_at, updated_at)
       VALUES ($1, 'customer_profile', $2::jsonb, 'local-seed', NOW(), NOW())
       ON CONFLICT (company_id, schema_type) DO UPDATE SET answers = EXCLUDED.answers`,
      [
        cid,
        JSON.stringify({
          org_legal_name: 'Tri-Bros Transportation LLC',
          org_address: '100 Industrial Pkwy, Binghamton, NY',
          org_industry: 'manufacturing',
          org_employee_count: '26-100',
          org_target_frameworks: ['cis-v8', 'hipaa'],
          org_handles_phi: 'no',
          org_handles_pii: 'yes',
          org_handles_cui: 'no',
          remote_access: 'hybrid',
          on_prem_servers: 'yes_bcdr',
          org_remote_work: 'hybrid',
          org_byod_allowed: 'yes_managed',
          org_contractors: 'yes',
        }),
      ]
    )

    // --- connectors ---
    console.log('→ compliance_connectors')
    const connectors: Array<[string, string, string | null]> = [
      ['microsoft_graph', 'verified', null],
      ['datto_rmm', 'verified', null],
      ['datto_bcdr', 'configured', null],
      ['dnsfilter', 'error', 'API token rejected (401) — rotate the DNSFilter token'],
      ['saas_alerts', 'not_configured', null],
    ]
    for (const [type, status, err] of connectors) {
      await c.query(
        `INSERT INTO compliance_connectors (id, "companyId", "connectorType", status, "lastCollectedAt", "errorMessage", "createdAt", "updatedAt")
         VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, NOW(), NOW())
         ON CONFLICT ("companyId", "connectorType") DO UPDATE SET status = EXCLUDED.status, "errorMessage" = EXCLUDED."errorMessage"`,
        [cid, type, status, status === 'verified' || status === 'configured' ? new Date() : null, err]
      )
    }

    // --- tools ---
    console.log('→ compliance_company_tools')
    const tools: Array<[string, boolean, string | null]> = [
      ['microsoft_defender', true, 'Deployed tenant-wide via Intune'],
      ['datto_rmm', true, null],
      ['datto_edr', true, null],
      ['dnsfilter', true, null],
      ['bullphish', false, 'Customer declined security training tool'],
      ['huntress', false, null],
    ]
    for (const [toolId, deployed, notes] of tools) {
      await c.query(
        `INSERT INTO compliance_company_tools (id, "companyId", "toolId", deployed, notes, "deployedBy", "deployedAt", "createdAt", "updatedAt")
         VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, NOW(), NOW())
         ON CONFLICT ("companyId", "toolId") DO UPDATE SET deployed = EXCLUDED.deployed, notes = EXCLUDED.notes`,
        [cid, toolId, deployed, notes, deployed ? 'local-seed' : null, deployed ? new Date() : null]
      )
    }

    // --- platform mappings ---
    console.log('→ compliance_platform_mappings')
    const mappings: Array<[string, string, string, string]> = [
      ['datto_rmm', 'site-8842', 'Tri-Bros — Main', 'site'],
      ['datto_rmm', 'site-8843', 'Tri-Bros — Warehouse', 'site'],
      ['datto_bcdr', 'client-551', 'Tri-Bros Transportation', 'client'],
      ['dnsfilter', 'org-201', 'Tri-Bros', 'organization'],
    ]
    for (const [platform, extId, extName, extType] of mappings) {
      await c.query(
        `INSERT INTO compliance_platform_mappings (id, "companyId", platform, "externalId", "externalName", "externalType", "mappedBy", "mappedAt")
         VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, 'local-seed', NOW())
         ON CONFLICT ("companyId", platform, "externalId") DO NOTHING`,
        [cid, platform, extId, extName, extType]
      )
    }

    // --- assessment + findings (CIS v8 IG1) ---
    console.log('→ compliance_assessments + findings')
    const assessmentId = 'local-seed-assessment-cis-ig1'
    await c.query(
      `INSERT INTO compliance_assessments
         (id, "companyId", "frameworkId", status, "createdAt", "completedAt", "createdBy",
          "totalControls", "passedControls", "failedControls", "manualReviewControls")
       VALUES ($1, $2, 'cis-v8-ig1', 'complete', NOW() - INTERVAL '6 days', NOW() - INTERVAL '6 days',
               'local-seed', 56, 16, 4, 36)
       ON CONFLICT (id) DO NOTHING`,
      [assessmentId, cid]
    )
    // a prior assessment so the delta renders
    await c.query(
      `INSERT INTO compliance_assessments
         (id, "companyId", "frameworkId", status, "createdAt", "completedAt", "createdBy",
          "totalControls", "passedControls", "failedControls", "manualReviewControls")
       VALUES ('local-seed-assessment-cis-ig1-prior', $1, 'cis-v8-ig1', 'complete',
               NOW() - INTERVAL '40 days', NOW() - INTERVAL '40 days', 'local-seed', 56, 11, 9, 36)
       ON CONFLICT (id) DO NOTHING`,
      [cid]
    )

    const findings: Array<[string, string, string, string]> = [
      ['1.1', 'pass', 'high', 'Microsoft Intune device inventory shows 48 enrolled devices, all accounted for.'],
      ['4.1', 'fail', 'high', 'No documented secure configuration baseline. Intune config profiles are inconsistent across the fleet.'],
      ['5.2', 'fail', 'medium', 'Password policy does not enforce a 14-character minimum. Current minimum is 8.'],
      ['6.3', 'pass', 'high', 'Conditional Access policy "Require MFA — All Users" is enabled and applies to all cloud apps.'],
      ['6.5', 'needs_review', 'low', 'Legacy authentication is not explicitly blocked. Manual review needed to confirm no legacy clients remain.'],
      ['8.2', 'pass', 'high', 'Microsoft 365 unified audit log is enabled; retention is 90 days.'],
      ['10.1', 'fail', 'high', 'Datto EDR is deployed but real-time protection is disabled on 12 of 48 endpoints.'],
      ['11.1', 'pass', 'medium', 'Datto BCDR backup is configured for the primary file server with hourly snapshots.'],
      ['14.1', 'needs_review', 'low', 'No security awareness training program in place — customer declined the BullPhish tool.'],
    ]
    for (const [controlId, status, confidence, reasoning] of findings) {
      await c.query(
        `INSERT INTO compliance_findings
           (id, "assessmentId", "controlId", status, confidence, reasoning, "evidenceIds", "missingEvidence", "evaluatedAt")
         VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, '[]'::jsonb, '[]'::jsonb, NOW())
         ON CONFLICT ("assessmentId", "controlId") DO NOTHING`,
        [assessmentId, controlId, status, confidence, reasoning]
      )
    }

    // --- dispositions ---
    console.log('→ compliance_finding_dispositions')
    await c.query(
      `INSERT INTO compliance_finding_dispositions
         (id, "companyId", "frameworkId", "controlId", "lifecycleStatus", "assignedTo",
          "internalNotes", "createdAt", "updatedAt", "lastReviewedAt")
       VALUES (gen_random_uuid()::text, $1, 'cis-v8-ig1', '4.1', 'scheduled', 'tech@triplecitiestech.com',
               'Baseline config rollout planned for next maintenance window.', NOW(), NOW(), NOW())
       ON CONFLICT ("companyId", "frameworkId", "controlId") DO NOTHING`,
      [cid]
    )
    await c.query(
      `INSERT INTO compliance_finding_dispositions
         (id, "companyId", "frameworkId", "controlId", "lifecycleStatus", "acceptedRiskRationale",
          "decidedAt", "createdAt", "updatedAt", "lastReviewedAt")
       VALUES (gen_random_uuid()::text, $1, 'cis-v8-ig1', '14.1', 'accepted_risk',
               'Customer has declined formal security awareness training. Risk accepted by customer leadership; revisit at annual review.',
               NOW() - INTERVAL '120 days', NOW() - INTERVAL '120 days', NOW() - INTERVAL '120 days', NOW() - INTERVAL '120 days')
       ON CONFLICT ("companyId", "frameworkId", "controlId") DO NOTHING`,
      [cid]
    )

    // --- pending changes + bundle ---
    console.log('→ compliance_pending_changes + bundle')
    const pc1 = 'local-seed-pc-1'
    const pc2 = 'local-seed-pc-2'
    await c.query(
      `INSERT INTO compliance_pending_changes
         (id, "companyId", "actionId", "actionVersion", "linkedFindingIds", "customerImpactSummary",
          status, "createdAt", "createdBy", "updatedAt")
       VALUES
         ($1, $3, 'm365.enable_password_protection', '1.0.0', '[]'::jsonb,
          'When employees change their password, common weak passwords and words related to your company name will be rejected. No effect on existing passwords until the next change.',
          'drafted', NOW(), 'local-seed', NOW()),
         ($2, $3, 'defender.enable_real_time_protection', '1.0.0', '[]'::jsonb,
          'Each company laptop will continuously scan files for malware as they are opened. Performance impact is minimal; users may occasionally see a notification if a suspicious file is blocked.',
          'drafted', NOW(), 'local-seed', NOW())
       ON CONFLICT (id) DO NOTHING`,
      [pc1, pc2, cid]
    )
    const bundleId = 'local-seed-bundle-1'
    await c.query(
      `INSERT INTO compliance_change_bundles
         (id, "companyId", title, status, "customerFacingNotes", "createdAt", "createdBy", "updatedAt")
       VALUES ($1, $2, 'Q2 2026 Security Hardening', 'drafted',
               'A few security improvements we would like to make on your behalf this quarter.',
               NOW(), 'local-seed', NOW())
       ON CONFLICT (id) DO NOTHING`,
      [bundleId, cid]
    )

    // --- policies ---
    console.log('→ compliance_policies')
    await c.query(
      `INSERT INTO compliance_policies
         (id, "companyId", title, source, content, category, "createdBy", "createdAt", "updatedAt")
       VALUES
         (gen_random_uuid()::text, $1, 'Acceptable Use Policy', 'uploaded', 'Lorem ipsum policy body...', 'governance', 'local-seed', NOW(), NOW()),
         (gen_random_uuid()::text, $1, 'Incident Response Plan', 'generated', 'Generated policy body...', 'governance', 'local-seed', NOW(), NOW())
       ON CONFLICT DO NOTHING`,
      [cid]
    )

    // --- audit log ---
    console.log('→ compliance_audit_log')
    await c.query(
      `INSERT INTO compliance_audit_log (id, "companyId", action, actor, details, "createdAt")
       VALUES
         (gen_random_uuid()::text, $1, 'assessment.completed', 'local-seed', '{"frameworkId":"cis-v8-ig1"}'::jsonb, NOW() - INTERVAL '6 days'),
         (gen_random_uuid()::text, $1, 'disposition.created', 'tech@triplecitiestech.com', '{"controlId":"4.1"}'::jsonb, NOW() - INTERVAL '5 days'),
         (gen_random_uuid()::text, $1, 'pending_change.created', 'local-seed', '{"actionId":"m365.enable_password_protection"}'::jsonb, NOW() - INTERVAL '1 day')`,
      [cid]
    )

    console.log('\\n✓ local seed complete')
    console.log(`  Cockpit:  http://localhost:3000/admin/compliance/${cid}`)
  } finally {
    c.release()
    await pool.end()
  }
}

main().catch((err) => {
  console.error('seed failed:', err)
  process.exit(1)
})
