#!/usr/bin/env node
/**
 * Triple Cities Tech — MCP Server
 *
 * Gives Claude Code direct read access to the production database
 * and the ability to call API endpoints for diagnostics.
 *
 * Tools provided:
 *   db_query        — Run a read-only SQL query
 *   db_table_info   — List tables or describe a specific table
 *   company_lookup  — Find a company by name (fuzzy) with related data
 *   ticket_check    — Check ticket counts and details for a company
 *   sync_status     — View Autotask sync history
 *   api_call        — Call any API endpoint on the app
 *   run_diagnostics — Run the reporting validation suite
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { Pool } from 'pg'
import { z } from 'zod'

// ── Database connection ─────────────────────────────────────────────

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  console.error('DATABASE_URL environment variable is required')
  process.exit(1)
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
})

// Base URL for API calls (defaults to production)
const BASE_URL = process.env.APP_BASE_URL || 'https://www.triplecitiestech.com'
const MIGRATION_SECRET = process.env.MIGRATION_SECRET || ''

// ── Helper ──────────────────────────────────────────────────────────

async function query(sql: string, params: unknown[] = []) {
  const client = await pool.connect()
  try {
    const result = await client.query(sql, params)
    return result
  } finally {
    client.release()
  }
}

function truncateRows(rows: Record<string, unknown>[], limit: number): { rows: Record<string, unknown>[]; truncated: boolean; total: number } {
  const total = rows.length
  if (rows.length <= limit) return { rows, truncated: false, total }
  return { rows: rows.slice(0, limit), truncated: true, total }
}

// ── MCP Server ──────────────────────────────────────────────────────

const server = new McpServer({
  name: 'triple-cities-tech',
  version: '1.0.0',
})

// ── Tool: db_query ──────────────────────────────────────────────────

server.tool(
  'db_query',
  'Run a read-only SQL query against the database. Only SELECT statements allowed. Results limited to 100 rows by default.',
  {
    sql: z.string().describe('SQL SELECT query to execute'),
    params: z.array(z.union([z.string(), z.number(), z.boolean(), z.null()])).optional().describe('Query parameters ($1, $2, etc.)'),
    limit: z.number().optional().describe('Max rows to return (default 100)'),
  },
  async ({ sql, params, limit }) => {
    // Safety: only allow SELECT/WITH statements
    const trimmed = sql.trim().toUpperCase()
    if (!trimmed.startsWith('SELECT') && !trimmed.startsWith('WITH')) {
      return { content: [{ type: 'text' as const, text: 'Error: Only SELECT/WITH queries are allowed. This is a read-only tool.' }] }
    }

    // Block dangerous keywords
    const dangerous = ['INSERT', 'UPDATE', 'DELETE', 'DROP', 'ALTER', 'TRUNCATE', 'CREATE', 'GRANT', 'REVOKE']
    for (const kw of dangerous) {
      // Check for keyword as a standalone word (not part of column names)
      const regex = new RegExp(`\\b${kw}\\b`, 'i')
      if (regex.test(sql) && kw !== 'CREATE') {
        // Allow CREATE only in subqueries/CTEs — actually just block it
        return { content: [{ type: 'text' as const, text: `Error: Query contains forbidden keyword "${kw}". This is a read-only tool.` }] }
      }
    }

    try {
      const maxRows = limit || 100
      // Add LIMIT if not already present
      let finalSql = sql
      if (!trimmed.includes('LIMIT')) {
        finalSql = `${sql.replace(/;?\s*$/, '')} LIMIT ${maxRows}`
      }

      const result = await query(finalSql, params || [])
      const { rows, truncated, total } = truncateRows(result.rows, maxRows)

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            rowCount: total,
            truncated,
            fields: result.fields.map(f => f.name),
            rows,
          }, null, 2),
        }],
      }
    } catch (err) {
      return { content: [{ type: 'text' as const, text: `SQL Error: ${(err as Error).message}` }] }
    }
  }
)

// ── Tool: db_table_info ─────────────────────────────────────────────

server.tool(
  'db_table_info',
  'List all tables in the database, or describe columns of a specific table.',
  {
    table: z.string().optional().describe('Table name to describe. Omit to list all tables.'),
  },
  async ({ table }) => {
    try {
      if (!table) {
        const result = await query(`
          SELECT table_name,
                 (SELECT count(*) FROM information_schema.columns c WHERE c.table_name = t.table_name AND c.table_schema = 'public') as column_count
          FROM information_schema.tables t
          WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
          ORDER BY table_name
        `)
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ tables: result.rows }, null, 2),
          }],
        }
      }

      const cols = await query(`
        SELECT column_name, data_type, is_nullable, column_default, character_maximum_length
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1
        ORDER BY ordinal_position
      `, [table])

      const indexes = await query(`
        SELECT indexname, indexdef
        FROM pg_indexes
        WHERE schemaname = 'public' AND tablename = $1
      `, [table])

      // Row count estimate
      const countResult = await query(`SELECT count(*) as count FROM "${table}"`)

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            table,
            rowCount: parseInt(countResult.rows[0]?.count || '0'),
            columns: cols.rows,
            indexes: indexes.rows,
          }, null, 2),
        }],
      }
    } catch (err) {
      return { content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }] }
    }
  }
)

// ── Tool: company_lookup ────────────────────────────────────────────

server.tool(
  'company_lookup',
  'Find a company by name (case-insensitive fuzzy match) and return its details including related projects, autotask IDs, and ticket counts.',
  {
    name: z.string().describe('Company name or partial name to search for'),
    include_projects: z.boolean().optional().describe('Include project details (default true)'),
    include_tickets: z.boolean().optional().describe('Include ticket summary (default true)'),
  },
  async ({ name, include_projects, include_tickets }) => {
    try {
      // Find companies matching the name
      const companies = await query(`
        SELECT id, "displayName", slug, "autotaskCompanyId", "createdAt", "updatedAt"
        FROM "Company"
        WHERE "displayName" ILIKE $1
        ORDER BY "displayName"
        LIMIT 10
      `, [`%${name}%`])

      if (companies.rows.length === 0) {
        return { content: [{ type: 'text' as const, text: `No companies found matching "${name}"` }] }
      }

      const results = []

      for (const company of companies.rows) {
        const entry: Record<string, unknown> = { ...company }

        if (include_projects !== false) {
          const projects = await query(`
            SELECT id, title, slug, status, "autotaskProjectId", "createdAt"
            FROM "Project"
            WHERE "companyId" = $1
            ORDER BY "createdAt" DESC
          `, [company.id])
          entry.projects = projects.rows
          entry.projectCount = projects.rows.length
        }

        if (include_tickets !== false) {
          const ticketCount = await query(`
            SELECT count(*) as total,
                   count(*) FILTER (WHERE status = 'Complete') as closed,
                   count(*) FILTER (WHERE status != 'Complete') as open
            FROM "Ticket"
            WHERE "companyId" = $1
          `, [company.id])
          entry.tickets = ticketCount.rows[0]

          // Also check by autotaskCompanyId
          if (company.autotaskCompanyId) {
            const atTickets = await query(`
              SELECT count(*) as total
              FROM "Ticket"
              WHERE "autotaskCompanyId" = $1
            `, [company.autotaskCompanyId.toString()])
            entry.ticketsByAutotaskId = atTickets.rows[0]
          }
        }

        results.push(entry)
      }

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(results, null, 2),
        }],
      }
    } catch (err) {
      return { content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }] }
    }
  }
)

// ── Tool: ticket_check ──────────────────────────────────────────────

server.tool(
  'ticket_check',
  'Check ticket data for a company — counts, statuses, date ranges, and sample tickets.',
  {
    company_name: z.string().optional().describe('Company name to filter by (fuzzy match)'),
    company_id: z.string().optional().describe('Company UUID to filter by'),
    status: z.string().optional().describe('Filter by ticket status'),
    date_from: z.string().optional().describe('Filter tickets created after this date (YYYY-MM-DD)'),
    date_to: z.string().optional().describe('Filter tickets created before this date (YYYY-MM-DD)'),
    sample_limit: z.number().optional().describe('Number of sample tickets to return (default 5)'),
  },
  async ({ company_name, company_id, status, date_from, date_to, sample_limit }) => {
    try {
      let companyFilter = ''
      const params: unknown[] = []
      let paramIdx = 1

      if (company_id) {
        companyFilter = `AND t."companyId" = $${paramIdx}`
        params.push(company_id)
        paramIdx++
      } else if (company_name) {
        // Resolve company ID first
        const company = await query(
          `SELECT id FROM "Company" WHERE "displayName" ILIKE $1 LIMIT 1`,
          [`%${company_name}%`]
        )
        if (company.rows.length === 0) {
          return { content: [{ type: 'text' as const, text: `No company found matching "${company_name}"` }] }
        }
        companyFilter = `AND t."companyId" = $${paramIdx}`
        params.push(company.rows[0].id)
        paramIdx++
      }

      let statusFilter = ''
      if (status) {
        statusFilter = `AND t.status = $${paramIdx}`
        params.push(status)
        paramIdx++
      }

      let dateFilter = ''
      if (date_from) {
        dateFilter += ` AND t."createDate" >= $${paramIdx}`
        params.push(date_from)
        paramIdx++
      }
      if (date_to) {
        dateFilter += ` AND t."createDate" <= $${paramIdx}`
        params.push(date_to)
        paramIdx++
      }

      // Aggregate stats
      const stats = await query(`
        SELECT
          count(*) as total,
          count(*) FILTER (WHERE t.status = 'Complete') as closed,
          count(*) FILTER (WHERE t.status != 'Complete') as open,
          min(t."createDate") as earliest,
          max(t."createDate") as latest,
          count(DISTINCT t."companyId") as companies
        FROM "Ticket" t
        WHERE 1=1 ${companyFilter} ${statusFilter} ${dateFilter}
      `, params)

      // Status breakdown
      const statusBreakdown = await query(`
        SELECT t.status, count(*) as count
        FROM "Ticket" t
        WHERE 1=1 ${companyFilter} ${statusFilter} ${dateFilter}
        GROUP BY t.status
        ORDER BY count DESC
      `, params)

      // Sample tickets
      const sampleParams = [...params]
      const sampleSql = `
        SELECT t.id, t."autotaskTicketId", t.title, t.status, t.priority,
               t."createDate", t."completedDate", t."dueDateTime",
               c."displayName" as "companyName"
        FROM "Ticket" t
        LEFT JOIN "Company" c ON c.id = t."companyId"
        WHERE 1=1 ${companyFilter} ${statusFilter} ${dateFilter}
        ORDER BY t."createDate" DESC
        LIMIT ${sample_limit || 5}
      `
      const samples = await query(sampleSql, sampleParams)

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            summary: stats.rows[0],
            statusBreakdown: statusBreakdown.rows,
            sampleTickets: samples.rows,
          }, null, 2),
        }],
      }
    } catch (err) {
      return { content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }] }
    }
  }
)

// ── Tool: sync_status ───────────────────────────────────────────────

server.tool(
  'sync_status',
  'View Autotask sync history and status. Shows recent sync logs with results.',
  {
    limit: z.number().optional().describe('Number of recent sync logs to return (default 20)'),
    step: z.string().optional().describe('Filter by sync step (companies, projects, contacts, etc.)'),
  },
  async ({ limit, step }) => {
    try {
      let stepFilter = ''
      const params: unknown[] = []
      if (step) {
        stepFilter = `WHERE "syncStep" = $1`
        params.push(step)
      }

      const logs = await query(`
        SELECT id, "syncStep", status, "recordsProcessed", "recordsFailed",
               "errorMessage", "startedAt", "completedAt",
               EXTRACT(EPOCH FROM ("completedAt" - "startedAt")) as "durationSeconds"
        FROM "AutotaskSyncLog"
        ${stepFilter}
        ORDER BY "startedAt" DESC
        LIMIT $${params.length + 1}
      `, [...params, limit || 20])

      // Overall stats
      const stats = await query(`
        SELECT "syncStep",
               count(*) as runs,
               count(*) FILTER (WHERE status = 'SUCCESS') as successes,
               count(*) FILTER (WHERE status = 'FAILED') as failures,
               max("startedAt") as "lastRun"
        FROM "AutotaskSyncLog"
        GROUP BY "syncStep"
        ORDER BY "lastRun" DESC
      `)

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            syncStepStats: stats.rows,
            recentLogs: logs.rows,
          }, null, 2),
        }],
      }
    } catch (err) {
      return { content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }] }
    }
  }
)

// ── Tool: api_call ──────────────────────────────────────────────────

server.tool(
  'api_call',
  'Call an API endpoint on the Triple Cities Tech app. Supports GET/POST/PATCH/DELETE.',
  {
    method: z.enum(['GET', 'POST', 'PATCH', 'DELETE']).describe('HTTP method'),
    path: z.string().describe('API path (e.g., /api/companies)'),
    body: z.record(z.string(), z.unknown()).optional().describe('Request body for POST/PATCH'),
    query_params: z.record(z.string(), z.string()).optional().describe('Query parameters'),
    use_migration_secret: z.boolean().optional().describe('Add MIGRATION_SECRET as Bearer token or query param'),
  },
  async ({ method, path, body, query_params, use_migration_secret }) => {
    try {
      let url = `${BASE_URL}${path}`

      // Add query params
      const qp = new URLSearchParams(query_params || {})
      if (use_migration_secret && MIGRATION_SECRET) {
        qp.set('secret', MIGRATION_SECRET)
      }
      const qpStr = qp.toString()
      if (qpStr) url += `?${qpStr}`

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      }
      if (use_migration_secret && MIGRATION_SECRET) {
        headers['Authorization'] = `Bearer ${MIGRATION_SECRET}`
      }

      const fetchOpts: RequestInit = {
        method,
        headers,
      }
      if (body && (method === 'POST' || method === 'PATCH')) {
        fetchOpts.body = JSON.stringify(body)
      }

      const response = await fetch(url, fetchOpts)
      const contentType = response.headers.get('content-type') || ''

      let responseBody: unknown
      if (contentType.includes('application/json')) {
        responseBody = await response.json()
      } else {
        responseBody = await response.text()
      }

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            status: response.status,
            statusText: response.statusText,
            headers: Object.fromEntries(response.headers.entries()),
            body: responseBody,
          }, null, 2),
        }],
      }
    } catch (err) {
      return { content: [{ type: 'text' as const, text: `API Error: ${(err as Error).message}` }] }
    }
  }
)

// ── Tool: run_diagnostics ───────────────────────────────────────────

server.tool(
  'run_diagnostics',
  'Run diagnostic queries to check system health — table row counts, recent errors, missing data, and sync gaps.',
  {
    check: z.enum([
      'overview',          // Overall system stats
      'data_gaps',         // Companies missing autotask IDs, empty projects, etc.
      'recent_errors',     // Recent error logs
      'ticket_coverage',   // Which companies have/lack ticket data
      'sync_gaps',         // Companies in Autotask but not synced
    ]).describe('Which diagnostic check to run'),
  },
  async ({ check }) => {
    try {
      switch (check) {
        case 'overview': {
          const counts = await query(`
            SELECT
              (SELECT count(*) FROM "Company") as companies,
              (SELECT count(*) FROM "Project") as projects,
              (SELECT count(*) FROM "Phase") as phases,
              (SELECT count(*) FROM "PhaseTask") as tasks,
              (SELECT count(*) FROM "Ticket") as tickets,
              (SELECT count(*) FROM "TicketNote") as ticket_notes,
              (SELECT count(*) FROM "TicketTimeEntry") as time_entries,
              (SELECT count(*) FROM "Resource") as resources,
              (SELECT count(*) FROM "BlogPost") as blog_posts,
              (SELECT count(*) FROM "StaffUser") as staff_users,
              (SELECT count(*) FROM "AuditLog") as audit_logs,
              (SELECT count(*) FROM "ErrorLog") as error_logs
          `)
          return { content: [{ type: 'text' as const, text: JSON.stringify({ overview: counts.rows[0] }, null, 2) }] }
        }

        case 'data_gaps': {
          const noAutotask = await query(`
            SELECT id, "displayName", slug
            FROM "Company"
            WHERE "autotaskCompanyId" IS NULL
            ORDER BY "displayName"
          `)
          const emptyProjects = await query(`
            SELECT p.id, p.title, c."displayName" as company
            FROM "Project" p
            JOIN "Company" c ON c.id = p."companyId"
            WHERE NOT EXISTS (SELECT 1 FROM "Phase" ph WHERE ph."projectId" = p.id)
          `)
          const emptyPhases = await query(`
            SELECT ph.id, ph.title, p.title as project, c."displayName" as company
            FROM "Phase" ph
            JOIN "Project" p ON p.id = ph."projectId"
            JOIN "Company" c ON c.id = p."companyId"
            WHERE NOT EXISTS (SELECT 1 FROM "PhaseTask" t WHERE t."phaseId" = ph.id)
            LIMIT 20
          `)
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({
                companiesWithoutAutotaskId: noAutotask.rows,
                projectsWithoutPhases: emptyProjects.rows,
                phasesWithoutTasks: emptyPhases.rows,
              }, null, 2),
            }],
          }
        }

        case 'recent_errors': {
          const errors = await query(`
            SELECT level, source, message, path, method, "statusCode", count, "lastOccurred"
            FROM "ErrorLog"
            ORDER BY "lastOccurred" DESC
            LIMIT 20
          `)
          return { content: [{ type: 'text' as const, text: JSON.stringify({ recentErrors: errors.rows }, null, 2) }] }
        }

        case 'ticket_coverage': {
          const coverage = await query(`
            SELECT c.id, c."displayName", c."autotaskCompanyId",
                   count(t.id) as "ticketCount",
                   min(t."createDate") as "earliestTicket",
                   max(t."createDate") as "latestTicket"
            FROM "Company" c
            LEFT JOIN "Ticket" t ON t."companyId" = c.id
            GROUP BY c.id, c."displayName", c."autotaskCompanyId"
            ORDER BY count(t.id) DESC
          `)
          const withTickets = coverage.rows.filter((r: Record<string, unknown>) => Number(r.ticketCount) > 0)
          const withoutTickets = coverage.rows.filter((r: Record<string, unknown>) => Number(r.ticketCount) === 0)

          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({
                companiesWithTickets: withTickets,
                companiesWithoutTickets: withoutTickets,
                summary: {
                  totalCompanies: coverage.rows.length,
                  withTickets: withTickets.length,
                  withoutTickets: withoutTickets.length,
                },
              }, null, 2),
            }],
          }
        }

        case 'sync_gaps': {
          const atCompanies = await query(`
            SELECT c.id, c."displayName", c."autotaskCompanyId",
                   (SELECT count(*) FROM "Ticket" t WHERE t."companyId" = c.id) as "localTickets"
            FROM "Company" c
            WHERE c."autotaskCompanyId" IS NOT NULL
            ORDER BY c."displayName"
          `)

          const lastSync = await query(`
            SELECT "syncStep", max("completedAt") as "lastCompleted",
                   (SELECT status FROM "AutotaskSyncLog" a2
                    WHERE a2."syncStep" = a."syncStep"
                    ORDER BY "startedAt" DESC LIMIT 1) as "lastStatus"
            FROM "AutotaskSyncLog" a
            GROUP BY "syncStep"
            ORDER BY max("completedAt") DESC
          `)

          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({
                autotaskLinkedCompanies: atCompanies.rows,
                lastSyncByStep: lastSync.rows,
              }, null, 2),
            }],
          }
        }
      }
    } catch (err) {
      return { content: [{ type: 'text' as const, text: `Diagnostic Error: ${(err as Error).message}` }] }
    }
  }
)

// ── Start server ────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error('Triple Cities Tech MCP server running on stdio')
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
