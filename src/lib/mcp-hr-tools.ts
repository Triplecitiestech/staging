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
  updateErLogRow,
  describeErLogTable,
  fileErDocument,
  auditHrWrite,
} from '@/lib/hr/employee-relations'
import { toolFailure, FAILURE_ENVELOPE_TOOL_NOTE } from '@/lib/connector/failure-envelope'

function ok(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
}

/**
 * Structured failure for the HR surface. Retrofitted 2026-07-30: a workbook
 * width mismatch used to surface as a bare Graph 400 ("the number of rows or
 * columns in the input array doesn't match…"), which named no column and routed
 * the owner nowhere. The envelope carries reasonCode + remediation + fixableBy.
 */
function fail(err: unknown, tool: string) {
  return toolFailure(err, { surface: 'hr_sharepoint', tool })
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
        'computed automatically as the next ER-NNNN, read from the sheet\'s own Entry ID column — ' +
        'never pass it, and never infer it from the ER-DOC-NNNN document numbering, which has ' +
        'legitimately diverged from it. Input is sanitized to plain text (emojis/special ' +
        'characters stripped) and dates are stored as YYYY-MM-DD Eastern. ' +
        'The row width and column ORDER are read from the table\'s LIVE header row on every call, ' +
        'so a column a human adds to the sheet does not break this tool: any column no parameter ' +
        'maps to is appended blank and reported in unmappedColumns — surface that to the user, ' +
        'because a blank there may be a column someone expects to be filled. ' +
        'The row is appended to the workbook table (never overwriting existing rows) and ' +
        'read-back verified. Only call after the user has approved the exact wording. Returns the ' +
        'assigned Entry ID, the row that landed keyed by the sheet\'s own headers, and the live ' +
        'column list. ' +
        FAILURE_ENVELOPE_TOOL_NOTE,
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
        meetingWithTech: z
          .string()
          .optional()
          .describe(
            'What the technician said when the issue was discussed with them (free text). Leave ' +
              'unset if the conversation has not happened yet.'
          ),
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
          meetingWithTech: args.meetingWithTech,
          dateLogged: args.dateLogged,
        })
        auditHrWrite('hr_er_log_append', actor, 'success', {
          entryId: result.entryId,
          rowIndex: result.rowIndex,
          verified: result.verified,
          duplicateEntryIdDetected: result.duplicateEntryIdDetected,
          resolvedDynamically: result.resolvedDynamically,
          tableColumnCount: result.tableColumns.length,
          unmappedColumnCount: result.unmappedColumns.length,
        })
        return ok(result)
      } catch (e) {
        auditHrWrite('hr_er_log_append', actor, 'error', {
          error: e instanceof Error ? e.message : String(e),
        })
        return fail(e, 'hr_er_log_append')
      }
    }
  )

  server.registerTool(
    'hr_er_log_update',
    {
      title: 'HR: update an Employee Relations log row',
      description:
        'WRITE (direct). Patch ONE EXISTING row of "Employee Relations Log.xlsx", located by its Entry ID ' +
        '(e.g. "ER-0005"). This tool NEVER creates a row — if the Entry ID does not exist it fails rather ' +
        'than appending, because a duplicate row would inflate the subject\'s disciplinary record. Use ' +
        'hr_er_log_append for a NEW entry and this tool for anything that fills in or corrects an entry ' +
        'that already exists: the meetingWithTech text once the conversation with the technician has ' +
        'happened, followUpStatus when the item closes, linkedDocument when a write-up is filed later, or ' +
        'a changed actionTaken. ' +
        'It NEVER writes Entry ID or Date Logged — Entry ID is the immutable key, and Date Logged records ' +
        'when the entry was created, not when it was edited; there is deliberately no parameter for either. ' +
        'Pass entryId plus AT LEAST ONE field to change; every field you omit is left exactly as it is, and ' +
        'no other row is touched. Cells are patched individually in place (never a row or table rewrite), ' +
        'at positions read from the table\'s LIVE header row on every call, so a column a human adds or ' +
        'moves cannot make this write the wrong cell. Input is sanitized to plain text (emojis/special ' +
        'characters stripped) and dates are stored as YYYY-MM-DD Eastern. ' +
        'By default a field REPLACES the cell; set appendToSummary / appendToMeetingWithTech to add the new ' +
        'text on a new line instead, which is what you want for a follow-up conversation. Passing an empty ' +
        'string clears a cell — that is an explicit instruction, so only send one deliberately. ' +
        'More than one row with the same Entry ID is a refusal, not a guess. Every written cell is ' +
        'read-back verified. Only call after the user has approved the exact wording. Returns the Entry ID, ' +
        'the full row after the patch keyed by the sheet\'s own headers, a per-cell before/after list of ' +
        'what actually changed, and any column whose value already matched. ' +
        FAILURE_ENVELOPE_TOOL_NOTE,
      inputSchema: {
        entryId: z
          .string()
          .describe(
            'Entry ID of the EXISTING row to patch, e.g. "ER-0005". Matched case-insensitively and ' +
              'trimmed. Never written — this is the lookup key.'
          ),
        dateOfIncident: z.string().optional().describe('Date the incident occurred (YYYY-MM-DD preferred)'),
        employee: z.string().optional().describe('Employee name'),
        roleStatus: z.string().optional().describe('Role / Status (e.g. "Technician / Active")'),
        category: z.string().optional().describe('Category (e.g. Attendance, Conduct, Performance)'),
        severity: z.string().optional().describe('Severity (e.g. Low, Medium, High)'),
        summary: z.string().optional().describe('Factual summary of what happened'),
        expectationMissed: z.string().optional().describe('Which expectation/policy was missed'),
        reference: z.string().optional().describe('Reference (e.g. ticket #, policy id)'),
        reportedBy: z.string().optional().describe('Who reported/observed it'),
        actionTaken: z.string().optional().describe('Action taken so far'),
        linkedDocument: z
          .string()
          .optional()
          .describe('Link to a filed document (e.g. a webUrl from hr_file_document)'),
        followUpStatus: z.string().optional().describe('Follow-up / status (e.g. Open, Closed)'),
        meetingWithTech: z
          .string()
          .optional()
          .describe(
            'What the technician said when the issue was discussed with them (free text). This is the ' +
              'field hr_er_log_append tells you to leave unset until the conversation has happened — ' +
              'this is where it lands afterwards.'
          ),
        appendToSummary: z
          .boolean()
          .optional()
          .describe(
            'Append the supplied summary to the existing Summary on a new line instead of replacing it. Default false (replace).'
          ),
        appendToMeetingWithTech: z
          .boolean()
          .optional()
          .describe(
            'Append the supplied meetingWithTech text to the existing cell on a new line instead of ' +
              'replacing it. Default false (replace). Use this for a follow-up conversation so the earlier ' +
              'one is kept.'
          ),
      },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (args: any, extra: any) => {
      const actor = emailOf(extra)
      try {
        const result = await updateErLogRow({
          entryId: args.entryId,
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
          meetingWithTech: args.meetingWithTech,
          appendToSummary: args.appendToSummary,
          appendToMeetingWithTech: args.appendToMeetingWithTech,
        })
        auditHrWrite('hr_er_log_update', actor, 'success', {
          entryId: result.entryId,
          rowIndex: result.rowIndex,
          verified: result.verified,
          // Column NAMES only — never the text written, which is HR content.
          changedColumns: result.changed.map((c) => c.column),
          unchangedRequestedCount: result.unchangedRequested.length,
          resolvedDynamically: result.resolvedDynamically,
          tableColumnCount: result.tableColumns.length,
        })
        return ok(result)
      } catch (e) {
        auditHrWrite('hr_er_log_update', actor, 'error', {
          error: e instanceof Error ? e.message : String(e),
        })
        return fail(e, 'hr_er_log_update')
      }
    }
  )

  server.registerTool(
    'hr_er_log_columns',
    {
      title: 'HR: inspect the Employee Relations log table',
      description:
        'READ-ONLY. Report the LIVE shape of the log table in "Employee Relations Log.xlsx": its ' +
        'name, its header row in order, the column count, which columns hr_er_log_append can fill ' +
        'and which it would leave blank, any column marked required that no parameter fills, ' +
        'canonical columns the sheet no longer has, the row count and the next Entry ID. Writes ' +
        'nothing. Use this to check the sheet against the tool after someone edits the workbook, ' +
        'or to explain why a column came back blank — without appending a row to find out. ' +
        FAILURE_ENVELOPE_TOOL_NOTE,
      inputSchema: {},
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (_args: any, _extra: any) => {
      try {
        return ok(await describeErLogTable())
      } catch (e) {
        return fail(e, 'hr_er_log_columns')
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
        'row\'s Linked Document via hr_er_log_append. Only call after the user approves the document. ' +
        FAILURE_ENVELOPE_TOOL_NOTE,
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
        return fail(e, 'hr_file_document')
      }
    }
  )
}
