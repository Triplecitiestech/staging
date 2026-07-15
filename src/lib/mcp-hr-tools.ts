// src/lib/mcp-hr-tools.ts
//
// Registers the connector's HR Employee-Relations write tools. These are DIRECT
// writes (no staged-approval flow): a log append / document filing is low-risk
// and the human has already approved the exact text in conversation. Every write
// is audit-logged (actor email + action + target ids + outcome; never PII bodies,
// file contents, or secrets), and read-back verified — the same discipline as the
// Autotask/IT Glue write tools.
//
// Auth: writes to TCT's OWN HumanResources SharePoint site via a DEDICATED,
// least-privilege Entra app (Sites.Selected granted 'write' to that one site).
// See src/lib/hr/employee-relations.ts. Dormant unless CONNECTOR_HR_WRITES_ENABLED
// === 'true' AND the HR_RECORDS_* credentials are set.

import { z } from 'zod'
import {
  appendErLogRow,
  fileErDocument,
  auditHrWrite,
} from '@/lib/hr/employee-relations'

function ok(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
}
function fail(err: unknown) {
  const m = err instanceof Error ? err.message : String(err)
  return { content: [{ type: 'text' as const, text: `Error: ${m}` }], isError: true }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function registerHrTools(server: any) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const emailOf = (extra: any): string | undefined => extra?.authInfo?.extra?.email

  server.registerTool(
    'hr_er_log_append',
    {
      title: 'HR: append Employee Relations log row',
      description:
        'WRITE (direct). Append ONE row to "Employee Relations Log.xlsx" in the HumanResources ' +
        'SharePoint site (…/General/Employee Files/_Employee Relations/). The Entry ID is ' +
        'computed automatically as the next ER-NNNN — never pass it. Input is sanitized to plain ' +
        'text (emojis/special characters stripped) and dates are stored as YYYY-MM-DD Eastern. ' +
        'The row is appended to the workbook table (never overwriting existing rows) and ' +
        'read-back verified. Only call after the user has approved the exact wording. Returns the ' +
        'assigned Entry ID and the row that landed.',
      inputSchema: {
        dateOfIncident: z.string().describe('Date the incident occurred (YYYY-MM-DD preferred)'),
        employee: z.string().describe('Employee name'),
        roleStatus: z.string().describe('Role / Status (e.g. "Technician / Active")'),
        category: z.string().describe('Category (e.g. Attendance, Conduct, Performance)'),
        severity: z.string().describe('Severity (e.g. Low, Medium, High)'),
        summary: z.string().describe('Factual summary of what happened'),
        expectationMissed: z.string().optional().describe('Which expectation/policy was missed'),
        reference: z.string().optional().describe('Reference (e.g. ticket #, policy id)'),
        reportedBy: z.string().describe('Who reported/observed it'),
        actionTaken: z.string().optional().describe('Action taken so far'),
        linkedDocument: z
          .string()
          .optional()
          .describe('Link to a filed document (e.g. a webUrl from hr_file_document)'),
        followUpStatus: z.string().optional().describe('Follow-up / status (e.g. Open, Closed)'),
        dateLogged: z
          .string()
          .optional()
          .describe('Override the Date Logged (defaults to today, Eastern)'),
      },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (args: any, extra: any) => {
      const actor = emailOf(extra)
      try {
        const result = await appendErLogRow({
          dateOfIncident: args.dateOfIncident,
          employee: args.employee,
          roleStatus: args.roleStatus,
          category: args.category,
          severity: args.severity,
          summary: args.summary,
          expectationMissed: args.expectationMissed,
          reference: args.reference,
          reportedBy: args.reportedBy,
          actionTaken: args.actionTaken,
          linkedDocument: args.linkedDocument,
          followUpStatus: args.followUpStatus,
          dateLogged: args.dateLogged,
        })
        auditHrWrite('hr_er_log_append', actor, 'success', {
          entryId: result.entryId,
          rowIndex: result.rowIndex,
          verified: result.verified,
          duplicateEntryIdDetected: result.duplicateEntryIdDetected,
          resolvedDynamically: result.resolvedDynamically,
        })
        return ok(result)
      } catch (e) {
        auditHrWrite('hr_er_log_append', actor, 'error', {
          error: e instanceof Error ? e.message : String(e),
        })
        return fail(e)
      }
    }
  )

  server.registerTool(
    'hr_file_document',
    {
      title: 'HR: file an Employee Relations document',
      description:
        'WRITE (direct). Upload ONE .docx to TWO locations in the HumanResources SharePoint site: ' +
        'the central …/_Employee Relations/ folder AND the subject\'s ' +
        '…/Employee Files/[Name] - [Role] [Date]/Performance & Conduct/ subfolder ' +
        '(the Performance & Conduct subfolder is created if missing). Provide the file as EITHER ' +
        'base64Content OR an https sourceUrl we control. The filename is generated as ' +
        'ER-DOC-NNNN_[LastName]_[YYYY-MM-DD]_[Type].docx (the NNNN is computed automatically). Both ' +
        'uploads are read-back verified. Returns both webUrls — put the relevant one in the log ' +
        'row\'s Linked Document via hr_er_log_append. Only call after the user approves the document.',
      inputSchema: {
        lastName: z.string().describe('Subject last name (used in the filename and folder match)'),
        docType: z.string().describe('Document type for the filename, e.g. Warning, PIP, Counseling'),
        date: z.string().optional().describe('Date for the filename (YYYY-MM-DD; defaults to today Eastern)'),
        employeeFolderName: z
          .string()
          .optional()
          .describe(
            'Exact "[Name] - [Role] [Date]" folder under Employee Files. Omit to resolve by last name (errors if ambiguous).'
          ),
        base64Content: z.string().optional().describe('Base64-encoded .docx bytes (no data: prefix needed)'),
        sourceUrl: z.string().optional().describe('https URL we control to fetch the .docx from'),
      },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (args: any, extra: any) => {
      const actor = emailOf(extra)
      try {
        const result = await fileErDocument({
          lastName: args.lastName,
          docType: args.docType,
          date: args.date,
          employeeFolderName: args.employeeFolderName,
          base64Content: args.base64Content,
          sourceUrl: args.sourceUrl,
        })
        auditHrWrite('hr_file_document', actor, 'success', {
          fileName: result.fileName,
          centralItemId: result.central.itemId,
          employeeFolderItemId: result.employeeFolder.itemId,
          centralVerified: result.central.verified,
          employeeVerified: result.employeeFolder.verified,
        })
        return ok(result)
      } catch (e) {
        auditHrWrite('hr_file_document', actor, 'error', {
          error: e instanceof Error ? e.message : String(e),
        })
        return fail(e)
      }
    }
  )
}
