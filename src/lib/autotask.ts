/**
 * Autotask PSA REST API Client
 *
 * Handles authentication, pagination, retry, and entity queries for the Autotask REST API v1.0.
 * Used by the sync cron job to pull companies, projects, contacts, and tasks.
 *
 * Required env vars:
 *   AUTOTASK_API_USERNAME - API user username (email)
 *   AUTOTASK_API_SECRET   - API user secret key
 *   AUTOTASK_API_INTEGRATION_CODE - Integration code from Autotask
 *   AUTOTASK_API_BASE_URL - Zone-specific base URL (e.g. https://webservices6.autotask.net/ATServicesRest)
 */

import { withRetry } from '@/lib/resilience';

// ============================================
// TYPES
// ============================================

export interface AutotaskCompany {
  id: number;
  companyName: string;
  companyType: number;
  classification?: number;     // Autotask classification picklist ID
  classificationName?: string; // Resolved label (e.g., "Platinum Managed Service")
  companyCategoryID?: number;  // References the CompanyCategories entity
  isActive: boolean;
  phone?: string;
  webAddress?: string;
  lastActivityDate?: string;
}

export interface AutotaskContact {
  id: number;
  companyID: number;
  firstName: string;
  lastName: string;
  emailAddress?: string;
  title?: string;
  phone?: string;
  mobilePhone?: string;
  isActive: boolean;
}

export interface AutotaskBillingCode {
  id: number;
  name: string;
  description?: string;
  /** 1 = Tickets (Labor) — the work-type codes valid on time entries. */
  useType?: number;
  billingCodeType?: number;
  isActive: boolean;
}

export interface AutotaskRole {
  id: number;
  name: string;
  description?: string;
  isActive: boolean;
  hourlyFactor?: number;
  hourlyRate?: number;
  roleType?: number;
}

export interface AutotaskProject {
  id: number;
  companyID: number;
  projectName: string;
  description?: string;
  status: number;
  startDateTime?: string;
  endDateTime?: string;
  estimatedHours?: number;
  lastActivityDateTime?: string;
  projectLeadResourceID?: number;
}

export interface AutotaskProjectPhase {
  id: number;
  projectID: number;
  title: string;
  description?: string;
  startDate?: string;
  dueDate?: string;
  estimatedHours?: number;
  sortOrder?: number;
  isScheduled?: boolean;
  lastActivityDateTime?: string;
}

export interface AutotaskTask {
  id: number;
  projectID: number;
  phaseID?: number;
  title: string;
  description?: string;
  status: number;
  priority: number;
  startDateTime?: string;
  endDateTime?: string;
  estimatedHours?: number;
  assignedResourceID?: number;
  lastActivityDate?: string;
  completedDateTime?: string;
}

export interface AutotaskProjectNote {
  id: number;
  projectID: number;
  title: string;
  description: string;
  noteType?: number;
  publish?: number; // 1=All, 2=Internal
  creatorResourceID?: number;
  lastActivityDate?: string;
  createDateTime?: string;
}

export interface AutotaskTaskNote {
  id: number;
  taskID: number;
  title: string;
  description: string;
  noteType?: number;
  publish?: number; // 1=All (external), 2=Internal
  creatorResourceID?: number;
  lastActivityDate?: string;
  createDateTime?: string;
}

/**
 * Autotask Ticket entity.
 * The Autotask API returns all fields by default in query responses.
 * This interface covers the fields used by the reporting sync pipeline.
 */
export interface AutotaskTicket {
  id: number;
  companyID?: number;
  ticketNumber: string;
  title: string;
  description?: string;
  status: number;
  createDate: string;
  completedDate?: string;
  priority: number;
  queueID?: number | null;
  source?: number | null;
  issueType?: number | null;
  subIssueType?: number | null;
  assignedResourceID?: number | null;
  creatorResourceID?: number | null;
  contactID?: number | null;
  contractID?: number | null;
  serviceLevelAgreementID?: number | null;
  dueDateTime?: string | null;
  estimatedHours?: number | null;
  lastActivityDate?: string | null;
  // SLA tracking (read-only; all confirmed present on the Tickets entity).
  // Actual vs due datetimes drive both "did we meet SLA" and "about to breach"
  // (breach countdown = dueDateTime − now, computed by the caller).
  serviceLevelAgreementHasBeenMet?: boolean | null;
  firstResponseDateTime?: string | null;       // actual first response
  firstResponseDueDateTime?: string | null;    // target
  firstResponseInitiatingResourceID?: number | null;
  firstResponseAssignedResourceID?: number | null;
  resolutionPlanDateTime?: string | null;      // actual
  resolutionPlanDueDateTime?: string | null;   // target
  resolvedDateTime?: string | null;            // actual
  resolvedDueDateTime?: string | null;         // target
  serviceLevelAgreementPausedNextEventHours?: number | null; // paused-clock value
}

/**
 * Fields requested on ticket queries via includeFields — keep in sync with the
 * AutotaskTicket interface. Without includeFields, Autotask returns every
 * entity field plus userDefinedFields per ticket, which bloats the reporting
 * sync's 30-day pull across all companies.
 */
const TICKET_QUERY_FIELDS = [
  'id', 'companyID', 'ticketNumber', 'title', 'description', 'status',
  'createDate', 'completedDate', 'priority', 'queueID', 'source',
  'issueType', 'subIssueType', 'assignedResourceID', 'creatorResourceID',
  'contactID', 'contractID', 'serviceLevelAgreementID', 'dueDateTime',
  'estimatedHours', 'lastActivityDate',
];

/**
 * Ticket fields for Service-Delivery-Manager reporting — the base reporting
 * fields plus every SLA tracking field (all confirmed on the Tickets entity).
 * Used by searchTickets so business-wide SLA reports ("did we meet", "about to
 * breach") come back in one query. `description` is dropped to keep large
 * all-company pulls lean; no cost/rate fields are requested.
 */
const TICKET_SDM_FIELDS = [
  'id', 'companyID', 'ticketNumber', 'title', 'status',
  'createDate', 'completedDate', 'priority', 'queueID', 'source',
  'issueType', 'subIssueType', 'assignedResourceID', 'creatorResourceID',
  'contactID', 'contractID', 'serviceLevelAgreementID', 'dueDateTime',
  'estimatedHours', 'lastActivityDate',
  'serviceLevelAgreementHasBeenMet',
  'firstResponseDateTime', 'firstResponseDueDateTime',
  'firstResponseInitiatingResourceID', 'firstResponseAssignedResourceID',
  'resolutionPlanDateTime', 'resolutionPlanDueDateTime',
  'resolvedDateTime', 'resolvedDueDateTime',
  'serviceLevelAgreementPausedNextEventHours',
];

export interface AutotaskTicketNote {
  id: number;
  ticketID: number;
  title: string;
  description: string;
  noteType?: number;
  publish?: number; // 1=All/External, 2=Internal Only, 3=Customer-visible
  creatorResourceID?: number;
  creatorContactID?: number;
  lastActivityDate?: string;
  createDateTime?: string;
}

export interface AutotaskTimeEntry {
  id: number;
  taskID?: number;
  ticketID?: number;
  resourceID: number;
  dateWorked: string;
  startDateTime?: string;
  endDateTime?: string;
  hoursWorked: number;
  hoursToBill?: number;      // billable hours (read-only in Autotask)
  billingCodeID?: number;
  roleID?: number;
  timeEntryType?: number;
  summaryNotes?: string;
  internalNotes?: string;
  isNonBillable?: boolean;
  contractID?: number;
  showOnInvoice?: boolean;
  billingApprovalLevelMostRecent?: number;
  createDateTime?: string;
  lastModifiedDateTime?: string;
}

/**
 * Assistant-facing view of a time entry — hours, billable status, who logged it,
 * and the entry notes. Deliberately excludes any internal cost/rate basis (the
 * Autotask TimeEntries entity carries none, and role/resource rates are never
 * joined in here).
 */
/**
 * Invoice state of a billable time entry, derived from BillingItems (Autotask
 * exposes NO billed/invoiced flag on TimeEntries themselves):
 *   non_billable         — isNonBillable = true
 *   invoiced             — a BillingItem for this entry has a non-null invoiceID
 *   approved_not_invoiced— a BillingItem exists but invoiceID is null (posted, not yet on an invoice)
 *   unposted             — no BillingItem yet (not approved/posted for billing)
 *   unknown              — billing status could not be resolved (lookup skipped/failed)
 */
export type TimeEntryBillingStatus =
  | 'non_billable'
  | 'invoiced'
  | 'approved_not_invoiced'
  | 'unposted'
  | 'unknown';

export interface TimeEntryView {
  id: number;
  resourceID: number;
  resourceName: string | null;
  resourceEmail: string | null;
  dateWorked: string;
  startDateTime: string | null;
  endDateTime: string | null;
  hoursWorked: number;
  hoursToBill: number | null;
  isNonBillable: boolean;
  billable: boolean;
  billingCodeID: number | null;
  roleID: number | null;
  contractID: number | null;
  showOnInvoice: boolean | null;
  billingStatus?: TimeEntryBillingStatus;
  summaryNotes: string | null;
  internalNotes: string | null;
  ticketID: number | null;
  taskID: number | null;
  ticketNumber?: string | null;
  companyID?: number | null;
}

// ── Service-Delivery-Manager reporting types (read-only) ────────────────────

export interface TicketSearchFilters {
  companyId?: number;
  status?: number | number[];
  priority?: number;
  queueId?: number;
  assignedResourceId?: number;
  openOnly?: boolean;
  /** Date field the from/to window applies to. */
  dateField?: 'createDate' | 'lastActivityDate' | 'completedDate';
  from?: Date;
  to?: Date;
  /** Hard cap on returned rows (safety valve for all-company pulls). */
  max?: number;
}

export interface TicketSearchResult {
  count: number;
  truncated: boolean;
  tickets: Array<AutotaskTicket & { ticketUrl: string }>;
}

export interface CompanyListItem {
  id: number;
  companyName: string;
  isActive: boolean;
  classification: number | null;
  classificationName: string | null;
  companyType: number | null;
  companyTypeName: string | null;
  companyCategoryID: number | null;
}

export interface AutotaskContract {
  id: number;
  companyID: number;
  contractName: string;
  contractCategory?: number | null;
  contractType?: number | null;
  status?: number | null;
  serviceLevelAgreementID?: number | null;
  startDate?: string | null;
  endDate?: string | null;
}

export interface ContractListItem extends AutotaskContract {
  contractCategoryName: string | null;
  contractTypeName: string | null;
  statusName: string | null;
  slaName: string | null;
}

export interface ResourceListItem {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  isActive: boolean;
  resourceType: string | null;
}

/** Autotask ServiceLevelAgreementResults — per-ticket SLA met/elapsed detail. */
export interface AutotaskSlaResult {
  id: number;
  ticketID: number | null;
  serviceLevelAgreementName: string | null;
  firstResponseElapsedHours: number | null;
  isFirstResponseMet: boolean | null;
  resolutionPlanElapsedHours: number | null;
  isResolutionPlanMet: boolean | null;
  resolutionElapsedHours: number | null;
  isResolutionMet: boolean | null;
}

/** Autotask SurveyResults — native survey ratings (NO free-text comment field). */
export interface AutotaskSurveyResult {
  id: number;
  surveyID: number;
  surveyName?: string | null;
  ticketID: number | null;
  companyID: number | null;
  contactID: number | null;
  surveyRating: number | null;
  companyRating: number | null;
  contactRating: number | null;
  resourceRating: number | null;
  sendDate: string | null;
  completeDate: string | null;
}

export interface AutotaskResource {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  isActive: boolean;
  userName?: string;
  resourceType?: string;
  licenseType?: number;
}

export interface AutotaskClientPortalUser {
  id: number;
  contactID: number;
  isActive: boolean;
  securityLevel?: number;
  dateActivated?: string;
}

interface AutotaskApiResponse<T> {
  items?: T[];
  pageDetails?: {
    count: number;
    requestCount: number;
    prevPageUrl?: string;
    nextPageUrl?: string;
  };
}

interface AutotaskFieldInfo {
  name: string;
  dataType: string;
  isPickList: boolean;
  length?: number;
  isRequired?: boolean;
  isReadOnly?: boolean;
  isQueryable?: boolean;
  isReference?: boolean;
  referenceEntityType?: string;
  picklistParentValueField?: string;
  picklistValues?: Array<{
    value: string;
    label: string;
    isActive: boolean;
    isDefaultValue: boolean;
    isSystem?: boolean;
    sortOrder?: number;
    parentValue?: string;
  }>;
}

interface AutotaskEntityInfo {
  fields: AutotaskFieldInfo[];
}

/** One picklist option with the FULL metadata the REST field-info endpoint
 *  returns (the basic getEntityPicklist keeps only id + label). */
export interface PicklistOptionDetailed {
  id: number;
  label: string;
  isActive: boolean;
  isSystem: boolean;
  isDefaultValue: boolean;
  sortOrder: number;
  parentId: number | null;
  parentLabel: string | null;
}

export interface PicklistDetailed {
  entity: string;
  field: string;
  /** Field whose values parent this picklist (e.g. subIssueType → issueType) */
  parentField: string | null;
  options: PicklistOptionDetailed[];
}

// Autotask project status picklist mappings (common defaults)
// These can vary per instance - use getFieldInfo to get actual values
const AT_PROJECT_STATUS = {
  INACTIVE: 0,
  NEW: 1,
  ACTIVE: 4,
  COMPLETE: 5,
} as const;

// Autotask task status picklist mappings
// Autotask default picklist values for Task status:
//   1 = New, 4 = In Progress, 5 = Complete, 7 = Waiting Customer
const AT_TASK_STATUS_NEW = 1;
const AT_TASK_STATUS_IN_PROGRESS = 4;
const AT_TASK_STATUS_COMPLETE = 5;
const AT_TASK_STATUS_WAITING_CUSTOMER = 7;

// Autotask task priority mappings
const AT_TASK_PRIORITY = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
} as const;

// ============================================
// CLIENT
// ============================================

export class AutotaskClient {
  private baseUrl: string;
  private headers: Record<string, string>;

  constructor() {
    const username = process.env.AUTOTASK_API_USERNAME;
    const secret = process.env.AUTOTASK_API_SECRET;
    const integrationCode = process.env.AUTOTASK_API_INTEGRATION_CODE;
    const baseUrl = process.env.AUTOTASK_API_BASE_URL;

    if (!username || !secret || !integrationCode || !baseUrl) {
      throw new Error(
        'Missing Autotask API credentials. Required: AUTOTASK_API_USERNAME, AUTOTASK_API_SECRET, AUTOTASK_API_INTEGRATION_CODE, AUTOTASK_API_BASE_URL'
      );
    }

    this.baseUrl = baseUrl.replace(/\/$/, ''); // Remove trailing slash
    this.headers = {
      'Content-Type': 'application/json',
      'ApiIntegrationCode': integrationCode,
      'UserName': username,
      'Secret': secret,
    };
  }

  // ============================================
  // GENERIC QUERY HELPERS
  // ============================================

  /**
   * Single-attempt HTTP request with a hard timeout. Throws on non-2xx with
   * the status code in the message so classifyError() can judge retryability.
   */
  private async requestJson<T>(
    url: string,
    options: { method: 'GET' | 'POST' | 'PATCH'; body?: string; timeoutMs: number; label: string },
  ): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs);
    try {
      const response = await fetch(url, {
        method: options.method,
        headers: this.headers,
        body: options.body,
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Autotask API ${options.label} failed (${response.status}): ${errorText}`);
      }

      return response.json() as Promise<T>;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Retry wrapper for idempotent Autotask calls. Retries transient failures
   * (429 rate limit, 5xx, timeouts) with exponential backoff; permanent errors
   * (4xx) surface immediately so entity-path fallback chains still work.
   * Kept short (2 retries, 1s base) to fit serverless time budgets and avoid
   * piling onto Autotask's 3-thread limit.
   */
  private withRetries<T>(label: string, fn: () => Promise<T>): Promise<T> {
    return withRetry(fn, {
      maxRetries: 2,
      baseDelayMs: 1000,
      maxDelayMs: 8000,
      onRetry: (attempt, err, delayMs) => {
        console.warn(`[AutotaskClient] ${label}: retry ${attempt} after ${err.category} error (waiting ${Math.round(delayMs)}ms): ${err.message}`);
      },
    });
  }

  private async get<T>(endpoint: string): Promise<T> {
    return this.withRetries(`GET ${endpoint}`, () =>
      this.requestJson<T>(`${this.baseUrl}${endpoint}`, {
        method: 'GET',
        timeoutMs: 30_000,
        label: `GET ${endpoint}`,
      })
    );
  }

  /**
   * Query all records from an Autotask entity with compound filters.
   * Accepts a single filter OR an array of filters (implicitly ANDed by the API).
   * Pass includeFields to limit the response to the listed fields — without it
   * Autotask returns every entity field plus userDefinedFields per record.
   * Pages are retried on transient failures; a page that still fails throws
   * instead of silently returning a truncated result set.
   */
  private async queryAll<T>(
    entityPath: string,
    filter: object | object[],
    includeFields?: string[],
  ): Promise<T[]> {
    const results: T[] = [];

    // First request — wrap single filter in array, pass arrays as-is
    const filterArray = Array.isArray(filter) ? filter : [filter];
    const url = `${this.baseUrl}/v1.0/${entityPath}/query`;
    const queryBody: Record<string, unknown> = { filter: filterArray };
    if (includeFields?.length) {
      queryBody.includeFields = includeFields;
    }

    const data = await this.withRetries(`query ${entityPath}`, () =>
      this.requestJson<AutotaskApiResponse<T>>(url, {
        method: 'POST',
        body: JSON.stringify(queryBody),
        timeoutMs: 30_000,
        label: `query ${entityPath}`,
      })
    );
    if (data.items) {
      results.push(...data.items);
    }
    let nextPageUrl = data.pageDetails?.nextPageUrl;

    // Paginate through all results (each page gets its own timeout + retries)
    while (nextPageUrl) {
      const pageUrl: string = nextPageUrl;
      let pageData: AutotaskApiResponse<T>;
      try {
        pageData = await this.withRetries(`query ${entityPath} (page)`, () =>
          this.requestJson<AutotaskApiResponse<T>>(pageUrl, {
            method: 'GET',
            timeoutMs: 30_000,
            label: `query ${entityPath} page`,
          })
        );
      } catch (err) {
        // A truncated result set silently corrupts downstream syncs (the
        // "empty phases" failure mode) — surface the partial fetch instead.
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(`Autotask pagination for ${entityPath} failed after ${results.length} records: ${message}`);
      }
      if (pageData.items) {
        results.push(...pageData.items);
      }
      nextPageUrl = pageData.pageDetails?.nextPageUrl;
    }

    return results;
  }

  /**
   * Execute a SINGLE query page (POST) WITHOUT following pagination.
   * Returns the page's items plus whether Autotask reports more pages.
   *
   * Callers that expect large result sets should paginate by narrowing the
   * filter (e.g. splitting a date range or an id batch) rather than following
   * pageDetails.nextPageUrl: some Autotask zones reject the nextPageUrl GET
   * with HTTP 405 ("does not support http method 'GET'") when the original
   * query used includeFields.
   */
  private async queryOnePage<T>(
    entityPath: string,
    filter: object | object[],
    includeFields?: string[],
  ): Promise<{ items: T[]; hasMore: boolean }> {
    const filterArray = Array.isArray(filter) ? filter : [filter];
    const url = `${this.baseUrl}/v1.0/${entityPath}/query`;
    const body: Record<string, unknown> = { filter: filterArray };
    if (includeFields?.length) {
      body.includeFields = includeFields;
    }
    const data = await this.withRetries(`query ${entityPath} (single page)`, () =>
      this.requestJson<AutotaskApiResponse<T>>(url, {
        method: 'POST',
        body: JSON.stringify(body),
        timeoutMs: 30_000,
        label: `query ${entityPath} single page`,
      })
    );
    return { items: data.items ?? [], hasMore: !!data.pageDetails?.nextPageUrl };
  }

  // ============================================
  // ENTITY QUERIES
  // ============================================

  /**
   * Get all active companies
   */
  async getActiveCompanies(): Promise<AutotaskCompany[]> {
    return this.queryAll<AutotaskCompany>('Companies', {
      op: 'eq',
      field: 'isActive',
      value: true,
    });
  }

  /**
   * Search active companies by name
   */
  async searchCompanies(nameQuery: string): Promise<AutotaskCompany[]> {
    return this.queryAll<AutotaskCompany>('Companies', {
      op: 'and',
      items: [
        { op: 'eq', field: 'isActive', value: true },
        { op: 'contains', field: 'companyName', value: nameQuery },
      ],
    });
  }

  /**
   * Get companies modified since a given date
   */
  async getCompaniesModifiedSince(since: Date): Promise<AutotaskCompany[]> {
    return this.queryAll<AutotaskCompany>('Companies', {
      op: 'and',
      items: [
        { op: 'eq', field: 'isActive', value: true },
        { op: 'gte', field: 'lastActivityDate', value: since.toISOString() },
      ],
    });
  }

  /**
   * Get a single company by ID
   */
  async getCompany(id: number): Promise<AutotaskCompany> {
    const data = await this.get<{ item: AutotaskCompany }>(`/v1.0/Companies/${id}`);
    return data.item;
  }

  /**
   * Get contacts for a company
   */
  async getContactsByCompany(companyId: number): Promise<AutotaskContact[]> {
    return this.queryAll<AutotaskContact>('Contacts', {
      op: 'and',
      items: [
        { op: 'eq', field: 'companyID', value: companyId },
        { op: 'eq', field: 'isActive', value: true },
      ],
    });
  }

  /** Resolve a single contact by id to name/email/title/phone. */
  async getContactById(id: number): Promise<AutotaskContact | null> {
    try {
      const results = await this.queryAll<AutotaskContact>('Contacts', {
        op: 'eq', field: 'id', value: id,
      });
      return results[0] || null;
    } catch (err) {
      console.error(`[AutotaskClient] getContactById failed for ${id}:`, err instanceof Error ? err.message : String(err));
      throw err;
    }
  }

  /**
   * Get all active Client Access Portal users (legacy Autotask-hosted portal).
   * Used by the portal-migration tool to build the outreach list of customers
   * who need to be moved to the new TCT customer portal.
   */
  async getActiveClientPortalUsers(): Promise<AutotaskClientPortalUser[]> {
    return this.queryAll<AutotaskClientPortalUser>('ClientPortalUsers', {
      op: 'eq',
      field: 'isActive',
      value: true,
    });
  }

  /**
   * Get a single project by Autotask ID
   */
  async getProject(id: number): Promise<AutotaskProject> {
    const data = await this.get<{ item: AutotaskProject }>(`/v1.0/Projects/${id}`);
    return data.item;
  }

  /**
   * Get all active projects
   */
  async getActiveProjects(): Promise<AutotaskProject[]> {
    // Status 1 (New) and 4 (Active) are typically active
    return this.queryAll<AutotaskProject>('Projects', {
      op: 'or',
      items: [
        { op: 'eq', field: 'status', value: AT_PROJECT_STATUS.NEW },
        { op: 'eq', field: 'status', value: AT_PROJECT_STATUS.ACTIVE },
      ],
    });
  }

  /**
   * Get all projects (including completed) for sync
   */
  async getAllProjects(): Promise<AutotaskProject[]> {
    return this.queryAll<AutotaskProject>('Projects', {
      op: 'exist',
      field: 'id',
    });
  }

  /**
   * Get projects modified since a given date
   */
  async getProjectsModifiedSince(since: Date): Promise<AutotaskProject[]> {
    return this.queryAll<AutotaskProject>('Projects', {
      op: 'gte',
      field: 'lastActivityDateTime',
      value: since.toISOString(),
    });
  }

  /**
   * Get projects for a specific company
   */
  async getProjectsByCompany(companyId: number): Promise<AutotaskProject[]> {
    return this.queryAll<AutotaskProject>('Projects', {
      op: 'eq',
      field: 'companyID',
      value: companyId,
    });
  }

  /**
   * Get phases for a project.
   * Tries child entity endpoint first, then falls back to direct query.
   */
  async getProjectPhases(projectId: number): Promise<AutotaskProjectPhase[]> {
    try {
      return await this.queryAll<AutotaskProjectPhase>(
        `Projects/${projectId}/Phases`,
        { op: 'exist', field: 'id' }
      );
    } catch {
      // Fallback: query Phases directly with projectID filter
      return this.queryAll<AutotaskProjectPhase>('Phases', {
        op: 'eq',
        field: 'projectID',
        value: projectId,
      });
    }
  }

  /**
   * Get tasks for a project.
   * Tries multiple entity paths since Autotask versions differ.
   */
  async getProjectTasks(projectId: number): Promise<AutotaskTask[]> {
    // Try child entity endpoint first
    try {
      const tasks = await this.queryAll<AutotaskTask>(
        `Projects/${projectId}/Tasks`,
        { op: 'exist', field: 'id' }
      );
      if (tasks.length > 0) return tasks;
    } catch {
      // Not available as child endpoint
    }

    // Try ProjectTasks entity with filter
    try {
      const tasks = await this.queryAll<AutotaskTask>('ProjectTasks', {
        op: 'eq',
        field: 'projectID',
        value: projectId,
      });
      if (tasks.length > 0) return tasks;
    } catch {
      // Not available
    }

    // Try Tasks entity with filter
    return this.queryAll<AutotaskTask>('Tasks', {
      op: 'eq',
      field: 'projectID',
      value: projectId,
    });
  }

  /**
   * Get notes for a project
   */
  async getProjectNotes(projectId: number): Promise<AutotaskProjectNote[]> {
    try {
      return await this.queryAll<AutotaskProjectNote>(
        `Projects/${projectId}/Notes`,
        { op: 'exist', field: 'id' }
      );
    } catch {
      // Fallback: query ProjectNotes directly
      try {
        return await this.queryAll<AutotaskProjectNote>('ProjectNotes', {
          op: 'eq',
          field: 'projectID',
          value: projectId,
        });
      } catch {
        return [];
      }
    }
  }

  /**
   * Get field info (picklist values) for an entity
   */
  async getFieldInfo(entityType: string): Promise<AutotaskEntityInfo> {
    const data = await this.get<AutotaskEntityInfo>(
      `/v1.0/${entityType}/entityInformation/fields`
    );
    return data;
  }

  /**
   * PATCH (update) an entity in Autotask
   */
  private async patch<T>(entityPath: string, data: object): Promise<T> {
    // PATCH sets absolute field values, so retrying a transient failure is safe
    return this.withRetries(`PATCH ${entityPath}`, () =>
      this.requestJson<T>(`${this.baseUrl}/v1.0/${entityPath}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
        timeoutMs: 15_000,
        label: `PATCH ${entityPath}`,
      })
    );
  }

  /**
   * POST (create) an entity in Autotask.
   * NOT retried: creates aren't idempotent — a timeout after Autotask accepted
   * the request would duplicate the note/time entry on retry.
   */
  private async post<T>(entityPath: string, data: object): Promise<T> {
    return this.requestJson<T>(`${this.baseUrl}/v1.0/${entityPath}`, {
      method: 'POST',
      body: JSON.stringify(data),
      timeoutMs: 15_000,
      label: `POST ${entityPath}`,
    });
  }

  /**
   * Update a task's status in Autotask (write-back).
   *
   * The Autotask REST API v1.0 exposes project tasks as child entities under Projects.
   * When atProjectId is provided, uses the child entity path: Projects/{projectId}/Tasks
   * Falls back to top-level ProjectTasks and Tasks if the child path fails.
   */
  async updateTaskStatus(atTaskId: string, atStatus: number, atProjectId?: string): Promise<void> {
    const taskId = parseInt(atTaskId, 10);
    const payload = { id: taskId, status: atStatus };
    let lastError: Error | null = null;

    // If we have the project ID, try child entity path first
    if (atProjectId) {
      try {
        await this.patch(`Projects/${atProjectId}/Tasks`, payload);
        return;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        // Fall through to try other paths
      }
    }

    // Fallback: try top-level ProjectTasks
    try {
      await this.patch(`ProjectTasks`, payload);
      return;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }

    // Last resort: try Tasks entity
    try {
      await this.patch(`Tasks`, payload);
      return;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }

    // All paths failed — throw the last error
    throw lastError || new Error(`Failed to update task ${atTaskId} status`);
  }

  /**
   * Update a project's status in Autotask (write-back)
   */
  async updateProjectStatus(atProjectId: string, atStatus: number): Promise<void> {
    await this.patch(`Projects`, {
      id: parseInt(atProjectId, 10),
      status: atStatus,
    });
  }

  // ============================================
  // TASK NOTES
  // ============================================

  /**
   * Get notes for a specific task
   */
  async getTaskNotes(taskId: number): Promise<AutotaskTaskNote[]> {
    try {
      return await this.queryAll<AutotaskTaskNote>(
        `ProjectTasks/${taskId}/Notes`,
        { op: 'exist', field: 'id' }
      );
    } catch {
      try {
        return await this.queryAll<AutotaskTaskNote>('TaskNotes', {
          op: 'eq',
          field: 'taskID',
          value: taskId,
        });
      } catch {
        return [];
      }
    }
  }

  /**
   * Create a note on a task in Autotask
   */
  async createTaskNote(taskId: number, data: {
    title: string;
    description: string;
    noteType?: number;
    publish?: number; // 1=All, 2=Internal
  }): Promise<AutotaskTaskNote> {
    const result = await this.post<{ item: AutotaskTaskNote }>('TaskNotes', {
      taskID: taskId,
      title: data.title,
      description: data.description,
      noteType: data.noteType ?? 1,
      publish: data.publish ?? 1,
    });
    return result.item;
  }

  // ============================================
  // TIME ENTRIES
  // ============================================

  /**
   * Get time entries for a specific task
   */
  async getTaskTimeEntries(taskId: number): Promise<AutotaskTimeEntry[]> {
    try {
      return await this.queryAll<AutotaskTimeEntry>('TimeEntries', {
        op: 'eq',
        field: 'taskID',
        value: taskId,
      });
    } catch {
      return [];
    }
  }

  /**
   * Create a time entry on a task in Autotask
   */
  async createTimeEntry(data: {
    taskID: number;
    resourceID: number;
    dateWorked: string;
    hoursWorked: number;
    summaryNotes?: string;
    internalNotes?: string;
  }): Promise<AutotaskTimeEntry> {
    const result = await this.post<{ item: AutotaskTimeEntry }>('TimeEntries', {
      taskID: data.taskID,
      resourceID: data.resourceID,
      dateWorked: data.dateWorked,
      hoursWorked: data.hoursWorked,
      summaryNotes: data.summaryNotes || '',
      internalNotes: data.internalNotes || '',
    });
    return result.item;
  }

  // ============================================
  // RESOURCES (Autotask Users)
  // ============================================

  /**
   * Get all active resources (Autotask users/technicians)
   */
  async getActiveResources(): Promise<AutotaskResource[]> {
    return this.queryAll<AutotaskResource>('Resources', {
      op: 'eq',
      field: 'isActive',
      value: true,
    });
  }

  /**
   * Get a single resource by ID
   */
  async getResource(id: number): Promise<AutotaskResource> {
    const data = await this.get<{ item: AutotaskResource }>(`/v1.0/Resources/${id}`);
    return data.item;
  }

  // ============================================
  // LOOKUPS (billing codes, roles) — for time entries
  // ============================================

  /**
   * Active work-type (labor) billing codes — useType 1 = Tickets (Labor).
   * These are the codes valid as billingCodeID on a ticket time entry.
   */
  async getBillingCodes(): Promise<AutotaskBillingCode[]> {
    return this.queryAll<AutotaskBillingCode>('BillingCodes', {
      op: 'and',
      items: [
        { op: 'eq', field: 'useType', value: 1 },
        { op: 'eq', field: 'isActive', value: true },
      ],
    });
  }

  /** Active Autotask roles — valid as roleID on a time entry. */
  async getRoles(): Promise<AutotaskRole[]> {
    return this.queryAll<AutotaskRole>('Roles', {
      op: 'eq', field: 'isActive', value: true,
    });
  }

  /**
   * Active picklist options (numeric id + label) for a Tickets field — e.g.
   * 'queueID', 'priority', 'ticketType', 'status'. Sourced from entity field
   * info (instance-specific picklists), so callers never guess numeric values.
   */
  async getTicketPicklist(fieldName: string): Promise<Array<{ id: number; label: string }>> {
    return this.getEntityPicklist('Tickets', fieldName);
  }

  /**
   * Active picklist options (numeric id + label) for ANY entity field — sourced
   * from entityInformation (instance-specific), so callers never guess numeric
   * values. Returns [] if the field is not a picklist on this instance.
   */
  async getEntityPicklist(entity: string, fieldName: string): Promise<Array<{ id: number; label: string }>> {
    const info = await this.getFieldInfo(entity);
    const field = info?.fields?.find((f) => f.name === fieldName);
    if (!field?.picklistValues) return [];
    return field.picklistValues
      .filter((pv) => pv.isActive)
      .map((pv) => ({ id: parseInt(pv.value, 10), label: pv.label }));
  }

  /** id -> label map for an entity picklist field (includes inactive values so
   *  historical ids still resolve). Returns an empty map if not a picklist. */
  private async picklistLabelMap(entity: string, fieldName: string): Promise<Map<number, string>> {
    const info = await this.getFieldInfo(entity);
    const field = info?.fields?.find((f) => f.name === fieldName);
    const map = new Map<number, string>();
    if (!field?.picklistValues) return map;
    for (const pv of field.picklistValues) {
      const id = parseInt(pv.value, 10);
      if (!Number.isNaN(id)) map.set(id, pv.label);
    }
    return map;
  }

  /**
   * Get tickets for a company from the last N days.
   * Fetches tickets created OR with activity in the window to capture status changes.
   */
  async getCompanyTickets(companyId: number, days: number = 30, openOnly: boolean = false): Promise<AutotaskTicket[]> {
    const since = new Date();
    since.setDate(since.getDate() - days);
    try {
      // Query tickets created OR modified in the window — captures status changes
      const items: object[] = [
        { op: 'eq', field: 'companyID', value: companyId },
        {
          op: 'or',
          items: [
            { op: 'gte', field: 'createDate', value: since.toISOString() },
            { op: 'gte', field: 'lastActivityDate', value: since.toISOString() },
          ],
        },
      ];
      // "Open" = no completedDate (Autotask stamps completedDate on completion).
      if (openOnly) items.push({ op: 'notExist', field: 'completedDate' });
      return await this.queryAll('Tickets', { op: 'and', items }, TICKET_QUERY_FIELDS);
    } catch (err) {
      // Never silently swallow — surface the error so sync can report it
      console.error(`[AutotaskClient] getCompanyTickets failed for company ${companyId}:`, err instanceof Error ? err.message : String(err));
      throw err;
    }
  }

  /**
   * Get ALL tickets for a company created on/after a given date.
   *
   * Unlike getCompanyTickets() — which caps at a rolling N-day window and ORs in
   * lastActivityDate for incremental sync — this pulls the complete created-in-window
   * history for long-range reporting (e.g. a multi-year Technology Business Review).
   *
   * Paginates by recursively splitting the createDate window whenever a single
   * 500-record page fills, which avoids the nextPageUrl GET that some Autotask
   * zones reject with HTTP 405 for includeFields queries.
   */
  async getCompanyTicketsCreatedSince(companyId: number, since: Date): Promise<AutotaskTicket[]> {
    const acc: AutotaskTicket[] = [];
    await this.collectCompanyTickets(companyId, since, new Date(), acc, 0);
    return acc;
  }

  private async collectCompanyTickets(
    companyId: number,
    from: Date,
    to: Date,
    acc: AutotaskTicket[],
    depth: number,
  ): Promise<void> {
    const { items, hasMore } = await this.queryOnePage<AutotaskTicket>('Tickets', [
      { op: 'eq', field: 'companyID', value: companyId },
      { op: 'gte', field: 'createDate', value: from.toISOString() },
      { op: 'lt', field: 'createDate', value: to.toISOString() },
    ], TICKET_QUERY_FIELDS);

    const spanMs = to.getTime() - from.getTime();
    // Stop splitting at a 1-DAY floor (or excessive depth). Autotask appears to
    // filter createDate at day granularity, so sub-day windows return the same
    // day's tickets repeatedly — splitting below a day causes duplicate fetches
    // (de-duplicated downstream by ticket id) without finding new records. A
    // single day with >500 tickets for one company is implausible.
    const DAY_MS = 24 * 60 * 60 * 1000;
    if (!hasMore || spanMs <= DAY_MS || depth > 24) {
      if (hasMore && (spanMs <= DAY_MS || depth > 24)) {
        console.warn(`[AutotaskClient] collectCompanyTickets: window ${from.toISOString()}–${to.toISOString()} still reports >500 tickets at the split floor; result may be truncated.`);
      }
      acc.push(...items);
      return;
    }
    const mid = new Date(from.getTime() + Math.floor(spanMs / 2));
    await this.collectCompanyTickets(companyId, from, mid, acc, depth + 1);
    await this.collectCompanyTickets(companyId, mid, to, acc, depth + 1);
  }

  /**
   * Fetch a single ticket by its Autotask ID. Used by the SOC real-time
   * ingest webhook to pull a ticket the moment it lands.
   */
  async getTicket(ticketId: number): Promise<AutotaskTicket | null> {
    try {
      const results = await this.queryAll<AutotaskTicket>('Tickets', {
        op: 'eq', field: 'id', value: ticketId,
      }, TICKET_QUERY_FIELDS);
      return results[0] || null;
    } catch (err) {
      console.error(`[AutotaskClient] getTicket failed for ${ticketId}:`, err instanceof Error ? err.message : String(err));
      throw err;
    }
  }

  /**
   * Fetch a ticket's current Resolution text. `resolution` is NOT in
   * TICKET_QUERY_FIELDS (it's large and unused by the reporting sync), so this
   * queries it explicitly — used to append to the Resolution field on close.
   */
  async getTicketResolution(ticketId: number): Promise<string | null> {
    const results = await this.queryAll<{ id: number; resolution?: string | null }>('Tickets', {
      op: 'eq', field: 'id', value: ticketId,
    }, ['id', 'resolution']);
    return results[0]?.resolution ?? null;
  }

  /**
   * Fetch a single ticket by its human ticket number (e.g. "T20260527.0006").
   * Autotask Extension Callouts send the ticket number, not the numeric id.
   */
  async getTicketByNumber(ticketNumber: string): Promise<AutotaskTicket | null> {
    try {
      const results = await this.queryAll<AutotaskTicket>('Tickets', {
        op: 'eq', field: 'ticketNumber', value: ticketNumber,
      }, TICKET_QUERY_FIELDS);
      return results[0] || null;
    } catch (err) {
      console.error(`[AutotaskClient] getTicketByNumber failed for ${ticketNumber}:`, err instanceof Error ? err.message : String(err));
      throw err;
    }
  }

  /**
   * Get notes for a specific ticket (for customer timeline)
   */
  async getTicketNotes(ticketId: number): Promise<AutotaskTicketNote[]> {
    try {
      return await this.queryAll<AutotaskTicketNote>(
        `Tickets/${ticketId}/Notes`,
        { op: 'exist', field: 'id' }
      );
    } catch {
      try {
        return await this.queryAll<AutotaskTicketNote>('TicketNotes', {
          op: 'eq',
          field: 'ticketID',
          value: ticketId,
        });
      } catch {
        return [];
      }
    }
  }

  /**
   * Create a note on a ticket in Autotask (for customer replies)
   */
  async createTicketNote(ticketId: number, data: {
    title: string;
    description: string;
    noteType?: number;
    publish?: number; // 1=All/External, 2=Internal, 3=Customer Portal visible
    creatorContactID?: number; // Autotask contact ID — attributes note to customer instead of API user
  }): Promise<AutotaskTicketNote> {
    const payload: Record<string, unknown> = {
      ticketID: ticketId,
      title: data.title,
      description: data.description,
      noteType: data.noteType || 1,
      publish: data.publish || 1,
    };

    // Set creatorContactID so Autotask attributes the note to the customer, not the API user
    if (data.creatorContactID) {
      payload.creatorContactID = data.creatorContactID;
    }

    // Try child entity path first (most reliable for this Autotask instance)
    try {
      const result = await this.post<{ item?: AutotaskTicketNote; itemId?: number }>(
        `Tickets/${ticketId}/Notes`,
        payload
      );
      return result.item ?? { id: result.itemId ?? 0, ticketID: ticketId, title: data.title, description: data.description } as AutotaskTicketNote;
    } catch {
      // Fallback to top-level TicketNotes entity
      const result = await this.post<{ item?: AutotaskTicketNote; itemId?: number }>(
        'TicketNotes',
        payload
      );
      return result.item ?? { id: result.itemId ?? 0, ticketID: ticketId, title: data.title, description: data.description } as AutotaskTicketNote;
    }
  }

  /**
   * Get time entries for a ticket (for customer timeline)
   */
  async getTicketTimeEntries(ticketId: number): Promise<AutotaskTimeEntry[]> {
    // Try child entity path first (most reliable for ticket time entries)
    try {
      return await this.queryAll<AutotaskTimeEntry>(
        `Tickets/${ticketId}/TimeEntries`,
        { op: 'exist', field: 'id' },
      );
    } catch {
      // Fallback: query TimeEntries entity with ticketID filter
      try {
        return await this.queryAll<AutotaskTimeEntry>('TimeEntries', {
          op: 'eq',
          field: 'ticketID',
          value: ticketId,
        });
      } catch (err) {
        console.error(`[autotask] Failed to get time entries for ticket ${ticketId}: ${err instanceof Error ? err.message : String(err)}`);
        return [];
      }
    }
  }

  /**
   * Get ALL time entries in a date range, across all tickets and tasks.
   * Uses compound filters (dateWorked >= from AND dateWorked <= to).
   * This is much more efficient than per-ticket queries and captures
   * both ticket and project task time entries.
   */
  async getTimeEntriesByDateRange(from: Date, to: Date): Promise<AutotaskTimeEntry[]> {
    const fromStr = from.toISOString().split('T')[0];
    const toStr = to.toISOString().split('T')[0];
    try {
      return await this.queryAll<AutotaskTimeEntry>('TimeEntries', [
        { op: 'gte', field: 'dateWorked', value: fromStr },
        { op: 'lte', field: 'dateWorked', value: toStr },
      ]);
    } catch (err) {
      console.error(`[autotask] Failed to get time entries for range ${fromStr} to ${toStr}: ${err instanceof Error ? err.message : String(err)}`);
      return [];
    }
  }

  // ── Time-entry reads for the connector (whitelisted, resource-resolved) ────

  private toTimeEntryView(e: AutotaskTimeEntry, resMap: Map<number, AutotaskResource>): TimeEntryView {
    const r = resMap.get(e.resourceID);
    return {
      id: e.id,
      resourceID: e.resourceID,
      resourceName: r ? `${r.firstName} ${r.lastName}`.trim() : null,
      resourceEmail: r?.email ?? null,
      dateWorked: e.dateWorked,
      startDateTime: e.startDateTime ?? null,
      endDateTime: e.endDateTime ?? null,
      hoursWorked: e.hoursWorked,
      hoursToBill: e.hoursToBill ?? null,
      isNonBillable: !!e.isNonBillable,
      billable: !e.isNonBillable,
      billingCodeID: e.billingCodeID ?? null,
      roleID: e.roleID ?? null,
      contractID: e.contractID ?? null,
      showOnInvoice: e.showOnInvoice ?? null,
      summaryNotes: e.summaryNotes ?? null,
      internalNotes: e.internalNotes ?? null,
      ticketID: e.ticketID ?? null,
      taskID: e.taskID ?? null,
    };
  }

  /** id -> Resource (name/email), batched with the `in` operator. */
  private async resourceMap(ids: number[]): Promise<Map<number, AutotaskResource>> {
    const map = new Map<number, AutotaskResource>();
    const distinct = Array.from(new Set(ids));
    for (let i = 0; i < distinct.length; i += 200) {
      const chunk = distinct.slice(i, i + 200);
      if (chunk.length === 0) continue;
      const rows = await this.queryAll<AutotaskResource>('Resources',
        { op: 'in', field: 'id', value: chunk },
        ['id', 'firstName', 'lastName', 'email', 'isActive']);
      for (const r of rows) map.set(r.id, r);
    }
    return map;
  }

  /** ticketId -> { ticketNumber, companyID }, batched with the `in` operator. */
  private async ticketRefMap(ids: number[]): Promise<Map<number, { ticketNumber?: string; companyID?: number }>> {
    const map = new Map<number, { ticketNumber?: string; companyID?: number }>();
    const distinct = Array.from(new Set(ids));
    for (let i = 0; i < distinct.length; i += 200) {
      const chunk = distinct.slice(i, i + 200);
      if (chunk.length === 0) continue;
      const rows = await this.queryAll<AutotaskTicket>('Tickets',
        { op: 'in', field: 'id', value: chunk },
        ['id', 'ticketNumber', 'companyID']);
      for (const t of rows) map.set(t.id, { ticketNumber: t.ticketNumber, companyID: t.companyID });
    }
    return map;
  }

  /** All time entries on a ticket, resource-resolved and whitelisted. */
  async getTicketTimeEntriesDetailed(ticketId: number): Promise<TimeEntryView[]> {
    const entries = await this.getTicketTimeEntries(ticketId);
    const resMap = await this.resourceMap(entries.map((e) => e.resourceID).filter(Boolean));
    return entries.map((e) => this.toTimeEntryView(e, resMap));
  }

  /**
   * All time entries a resource logged in a dateWorked range (across tickets),
   * each with the ticket number + company id. dateWorked filters at day
   * granularity (YYYY-MM-DD), inclusive.
   */
  async searchTimeEntriesByResource(resourceId: number, from: Date, to: Date): Promise<TimeEntryView[]> {
    return this.searchTimeEntries({ resourceId, from, to, withBillingStatus: false });
  }

  /**
   * General labor/billing read for SDM reporting. Filter by resource and/or
   * company and a dateWorked range. TimeEntries carry no companyID, so the
   * company filter is applied via the ticket→company join (task-only entries
   * are dropped when a company filter is set). When withBillingStatus is on
   * (default), each entry is tagged invoiced / approved_not_invoiced / unposted
   * / non_billable via BillingItems. NO cost/rate fields are ever requested.
   */
  async searchTimeEntries(opts: {
    resourceId?: number;
    companyId?: number;
    from: Date;
    to: Date;
    withBillingStatus?: boolean;
  }): Promise<TimeEntryView[]> {
    const fromStr = opts.from.toISOString().split('T')[0];
    const toStr = opts.to.toISOString().split('T')[0];
    const filter: object[] = [
      { op: 'gte', field: 'dateWorked', value: fromStr },
      { op: 'lte', field: 'dateWorked', value: toStr },
    ];
    if (opts.resourceId != null) filter.push({ op: 'eq', field: 'resourceID', value: opts.resourceId });
    const entries = await this.queryAll<AutotaskTimeEntry>('TimeEntries', filter);

    const resMap = await this.resourceMap(entries.map((e) => e.resourceID).filter(Boolean));
    const ticketMap = await this.ticketRefMap(
      entries.map((e) => e.ticketID).filter((v): v is number => typeof v === 'number')
    );
    let views = entries.map((e) => {
      const v = this.toTimeEntryView(e, resMap);
      const ref = e.ticketID != null ? ticketMap.get(e.ticketID) : undefined;
      v.ticketNumber = ref?.ticketNumber ?? null;
      v.companyID = ref?.companyID ?? null;
      return v;
    });
    if (opts.companyId != null) {
      views = views.filter((v) => v.companyID === opts.companyId);
    }
    if (opts.withBillingStatus !== false) {
      await this.attachBillingStatus(views);
    }
    return views;
  }

  /**
   * Resolve invoice status per time entry via BillingItems — Autotask exposes NO
   * billed/invoiced flag on TimeEntries. Best-effort: on lookup failure billable
   * entries are left 'unknown'. Only whitelisted keys are requested (id,
   * timeEntryID, invoiceID) — never a rate/amount field.
   */
  private async attachBillingStatus(views: TimeEntryView[]): Promise<void> {
    for (const v of views) v.billingStatus = v.isNonBillable ? 'non_billable' : 'unposted';
    const billableIds = views.filter((v) => !v.isNonBillable).map((v) => v.id);
    if (billableIds.length === 0) return;

    const byTimeEntry = new Map<number, number | null>(); // timeEntryID -> invoiceID
    try {
      const distinct = Array.from(new Set(billableIds));
      for (let i = 0; i < distinct.length; i += 200) {
        const chunk = distinct.slice(i, i + 200);
        if (chunk.length === 0) continue;
        const rows = await this.queryAll<{ timeEntryID?: number; invoiceID?: number | null }>(
          'BillingItems',
          { op: 'in', field: 'timeEntryID', value: chunk },
          ['id', 'timeEntryID', 'invoiceID'],
        );
        for (const r of rows) {
          if (r.timeEntryID != null) byTimeEntry.set(r.timeEntryID, r.invoiceID ?? null);
        }
      }
    } catch (err) {
      console.warn(`[AutotaskClient] attachBillingStatus: BillingItems lookup failed, marking unknown: ${err instanceof Error ? err.message : String(err)}`);
      for (const v of views) if (!v.isNonBillable) v.billingStatus = 'unknown';
      return;
    }
    for (const v of views) {
      if (v.isNonBillable) continue;
      if (!byTimeEntry.has(v.id)) { v.billingStatus = 'unposted'; continue; }
      v.billingStatus = byTimeEntry.get(v.id) != null ? 'invoiced' : 'approved_not_invoiced';
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SERVICE DELIVERY MANAGER (SDM) — read-only reporting reads
  // Business-wide tickets/SLA/companies/contracts/resources/surveys. No
  // cost/rate fields are requested anywhere in this section.
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Business-wide ticket search with server-side filters + all SLA fields.
   * Omit companyId to query across ALL companies. Paginates by recursively
   * splitting the chosen date window (Autotask 405s the includeFields
   * nextPageUrl GET), de-dupes by id, and stops at a safety cap.
   */
  async searchTickets(filters: TicketSearchFilters): Promise<TicketSearchResult> {
    const dateField = filters.dateField ?? 'createDate';
    const to = filters.to ?? new Date();
    const from = filters.from ?? new Date(to.getTime() - 90 * 24 * 60 * 60 * 1000);
    const cap = Math.min(Math.max(filters.max ?? 2000, 1), 5000);

    const base: object[] = [];
    if (filters.companyId != null) base.push({ op: 'eq', field: 'companyID', value: filters.companyId });
    if (filters.priority != null) base.push({ op: 'eq', field: 'priority', value: filters.priority });
    if (filters.queueId != null) base.push({ op: 'eq', field: 'queueID', value: filters.queueId });
    if (filters.assignedResourceId != null) base.push({ op: 'eq', field: 'assignedResourceID', value: filters.assignedResourceId });
    if (Array.isArray(filters.status)) {
      if (filters.status.length) base.push({ op: 'in', field: 'status', value: filters.status });
    } else if (filters.status != null) {
      base.push({ op: 'eq', field: 'status', value: filters.status });
    }
    if (filters.openOnly) base.push({ op: 'notExist', field: 'completedDate' });

    const acc = new Map<number, AutotaskTicket>();
    const state = { truncated: false };
    await this.collectTickets(base, dateField, from, to, acc, 0, cap, state);

    const tickets = Array.from(acc.values()).map((t) => ({
      ...t,
      ticketUrl: getAutotaskTicketUrl(String(t.id)),
    }));
    return { count: tickets.length, truncated: state.truncated, tickets };
  }

  private async collectTickets(
    base: object[],
    dateField: string,
    from: Date,
    to: Date,
    acc: Map<number, AutotaskTicket>,
    depth: number,
    cap: number,
    state: { truncated: boolean },
  ): Promise<void> {
    if (acc.size >= cap) { state.truncated = true; return; }
    const items = [
      ...base,
      { op: 'gte', field: dateField, value: from.toISOString() },
      { op: 'lt', field: dateField, value: to.toISOString() },
    ];
    const { items: page, hasMore } = await this.queryOnePage<AutotaskTicket>('Tickets', items, TICKET_SDM_FIELDS);
    const spanMs = to.getTime() - from.getTime();
    const DAY_MS = 24 * 60 * 60 * 1000;
    if (!hasMore || spanMs <= DAY_MS || depth > 24) {
      if (hasMore && (spanMs <= DAY_MS || depth > 24)) {
        state.truncated = true;
        console.warn(`[AutotaskClient] searchTickets: window ${from.toISOString()}–${to.toISOString()} still >500 at the split floor; result may be truncated.`);
      }
      for (const t of page) {
        if (acc.size >= cap) { state.truncated = true; break; }
        acc.set(t.id, t);
      }
      return;
    }
    const mid = new Date(from.getTime() + Math.floor(spanMs / 2));
    await this.collectTickets(base, dateField, from, mid, acc, depth + 1, cap, state);
    await this.collectTickets(base, dateField, mid, to, acc, depth + 1, cap, state);
  }

  /** SLA id -> name (from the serviceLevelAgreementID picklist on Tickets). */
  async getSlaList(): Promise<Array<{ id: number; label: string }>> {
    return this.getEntityPicklist('Tickets', 'serviceLevelAgreementID');
  }

  /**
   * Per-ticket SLA met/elapsed detail from the ServiceLevelAgreementResults
   * entity (query-only). Answers "did we meet SLA" with the actual met flags and
   * elapsed hours for first-response, resolution-plan, and resolution.
   */
  async getTicketSlaResults(ticketId: number): Promise<AutotaskSlaResult[]> {
    const rows = await this.queryAll<Record<string, unknown>>('ServiceLevelAgreementResults', {
      op: 'eq', field: 'ticketID', value: ticketId,
    });
    return rows.map((r) => ({
      id: Number(r.id),
      ticketID: (r.ticketID as number) ?? null,
      serviceLevelAgreementName: (r.serviceLevelAgreementName as string) ?? null,
      firstResponseElapsedHours: (r.firstResponseElapsedHours as number) ?? null,
      isFirstResponseMet: (r.isFirstResponseMet as boolean) ?? null,
      resolutionPlanElapsedHours: (r.resolutionPlanElapsedHours as number) ?? null,
      isResolutionPlanMet: (r.isResolutionPlanMet as boolean) ?? null,
      resolutionElapsedHours: (r.resolutionElapsedHours as number) ?? null,
      isResolutionMet: (r.isResolutionMet as boolean) ?? null,
    }));
  }

  /** Active managed companies with resolved classification + type labels. */
  async getManagedCompanies(activeOnly = true): Promise<CompanyListItem[]> {
    const companies = activeOnly
      ? await this.getActiveCompanies()
      : await this.queryAll<AutotaskCompany>('Companies', { op: 'exist', field: 'id' });
    const [classMap, typeMap] = await Promise.all([
      this.picklistLabelMap('Companies', 'classification'),
      this.picklistLabelMap('Companies', 'companyType'),
    ]);
    return companies.map((c) => ({
      id: c.id,
      companyName: c.companyName,
      isActive: c.isActive,
      classification: c.classification ?? null,
      classificationName: c.classification != null ? (classMap.get(c.classification) ?? null) : null,
      companyType: c.companyType ?? null,
      companyTypeName: c.companyType != null ? (typeMap.get(c.companyType) ?? null) : null,
      companyCategoryID: c.companyCategoryID ?? null,
    }));
  }

  /**
   * Contracts across companies (top-level queryable), with resolved
   * category/type/status/SLA labels — the likely home of a named service tier
   * (e.g. "Platinum Managed Service"). activeOnly keeps contracts with no
   * endDate or an endDate in the future (status ints are instance-specific, so
   * we filter on dates rather than a guessed status value).
   */
  async listContracts(opts: { companyId?: number; activeOnly?: boolean } = {}): Promise<ContractListItem[]> {
    const items: object[] = [];
    if (opts.companyId != null) items.push({ op: 'eq', field: 'companyID', value: opts.companyId });
    const filter = items.length === 0
      ? { op: 'exist', field: 'id' }
      : items.length === 1 ? items[0] : { op: 'and', items };
    const rows = await this.queryAll<AutotaskContract>('Contracts', filter,
      ['id', 'companyID', 'contractName', 'contractCategory', 'contractType', 'status', 'serviceLevelAgreementID', 'startDate', 'endDate']);
    const [catMap, typeMap, statusMap, slaMap] = await Promise.all([
      this.picklistLabelMap('Contracts', 'contractCategory'),
      this.picklistLabelMap('Contracts', 'contractType'),
      this.picklistLabelMap('Contracts', 'status'),
      this.picklistLabelMap('Tickets', 'serviceLevelAgreementID'),
    ]);
    let list: ContractListItem[] = rows.map((c) => ({
      ...c,
      contractCategoryName: c.contractCategory != null ? (catMap.get(c.contractCategory) ?? null) : null,
      contractTypeName: c.contractType != null ? (typeMap.get(c.contractType) ?? null) : null,
      statusName: c.status != null ? (statusMap.get(c.status) ?? null) : null,
      slaName: c.serviceLevelAgreementID != null ? (slaMap.get(c.serviceLevelAgreementID) ?? null) : null,
    }));
    if (opts.activeOnly !== false) {
      const now = new Date();
      list = list.filter((c) => !c.endDate || new Date(c.endDate) >= now);
    }
    return list;
  }

  /** Active resources (technicians) with resourceType, for team reporting. */
  async getResourcesList(activeOnly = true): Promise<ResourceListItem[]> {
    const resources = activeOnly
      ? await this.getActiveResources()
      : await this.queryAll<AutotaskResource>('Resources', { op: 'exist', field: 'id' });
    return resources.map((r) => ({
      id: r.id,
      firstName: r.firstName,
      lastName: r.lastName,
      email: r.email,
      isActive: r.isActive,
      resourceType: r.resourceType ?? null,
    }));
  }

  /**
   * Native Autotask customer-satisfaction survey responses (SurveyResults,
   * query-only). Ratings + ticket/company/contact + send/complete dates.
   * NOTE: the entity carries NO free-text comment field, and only NATIVE
   * Autotask surveys populate it — a custom completion-email survey is not here.
   */
  async getSurveyResults(opts: { from?: Date; to?: Date; companyId?: number; completedOnly?: boolean } = {}): Promise<AutotaskSurveyResult[]> {
    const items: object[] = [];
    if (opts.completedOnly !== false) items.push({ op: 'exist', field: 'completeDate' });
    if (opts.from) items.push({ op: 'gte', field: 'completeDate', value: opts.from.toISOString() });
    if (opts.to) items.push({ op: 'lte', field: 'completeDate', value: opts.to.toISOString() });
    if (opts.companyId != null) items.push({ op: 'eq', field: 'companyID', value: opts.companyId });
    const filter = items.length === 0
      ? { op: 'exist', field: 'id' }
      : items.length === 1 ? items[0] : { op: 'and', items };
    const rows = await this.queryAll<Record<string, unknown>>('SurveyResults', filter);
    const surveyNames = await this.getSurveyNameMap().catch(() => new Map<number, string>());
    return rows.map((r) => {
      const surveyID = Number(r.surveyID);
      return {
        id: Number(r.id),
        surveyID,
        surveyName: surveyNames.get(surveyID) ?? null,
        ticketID: (r.ticketID as number) ?? null,
        companyID: (r.companyID as number) ?? null,
        contactID: (r.contactID as number) ?? null,
        surveyRating: (r.surveyRating as number) ?? null,
        companyRating: (r.companyRating as number) ?? null,
        contactRating: (r.contactRating as number) ?? null,
        resourceRating: (r.resourceRating as number) ?? null,
        sendDate: (r.sendDate as string) ?? null,
        completeDate: (r.completeDate as string) ?? null,
      };
    });
  }

  /** surveyID -> display name, for labelling survey results. */
  private async getSurveyNameMap(): Promise<Map<number, string>> {
    const rows = await this.queryAll<{ id: number; name?: string; displayName?: string }>(
      'Surveys', { op: 'exist', field: 'id' }, ['id', 'name', 'displayName']);
    const map = new Map<number, string>();
    for (const s of rows) map.set(s.id, s.displayName || s.name || `Survey ${s.id}`);
    return map;
  }

  /**
   * Get time entries for a set of tickets, batched with the `in` operator.
   * Used by long-range reporting to total labor hours without a per-ticket
   * round trip. Batches stay modest to respect Autotask query limits, and an
   * optional deadline lets the caller bound total time and accept a partial
   * (best-effort) result rather than risk a serverless timeout.
   */
  async getTimeEntriesByTicketIds(
    ticketIds: number[],
    opts: { batchSize?: number; deadlineMs?: number } = {},
  ): Promise<{ entries: AutotaskTimeEntry[]; completed: boolean }> {
    const initialBatch = opts.batchSize ?? 100;
    const entries: AutotaskTimeEntry[] = [];
    // Work queue of ticket-id batches; a batch that fills a 500-record page is
    // split in half and retried (avoids the nextPageUrl GET that can 405).
    const queue: number[][] = [];
    for (let i = 0; i < ticketIds.length; i += initialBatch) {
      queue.push(ticketIds.slice(i, i + initialBatch));
    }

    while (queue.length > 0) {
      if (opts.deadlineMs && Date.now() > opts.deadlineMs) {
        return { entries, completed: false };
      }
      const batch = queue.shift();
      if (!batch || batch.length === 0) continue;
      const filter = batch.length === 1
        ? { op: 'eq', field: 'ticketID', value: batch[0] }
        : { op: 'in', field: 'ticketID', value: batch };
      try {
        const { items, hasMore } = await this.queryOnePage<AutotaskTimeEntry>('TimeEntries', filter);
        if (hasMore && batch.length > 1) {
          const mid = Math.ceil(batch.length / 2);
          queue.unshift(batch.slice(0, mid), batch.slice(mid));
        } else {
          entries.push(...items);
        }
      } catch (err) {
        console.error(`[AutotaskClient] getTimeEntriesByTicketIds batch failed: ${err instanceof Error ? err.message : String(err)}`);
        return { entries, completed: false };
      }
    }
    return { entries, completed: true };
  }

  /**
   * Get Contact Groups (Action Types) from Autotask
   */
  async getContactGroups(): Promise<{ id: number; name: string; isActive: boolean }[]> {
    try {
      return await this.queryAll<{ id: number; name: string; isActive: boolean }>('ContactGroups', {
        op: 'eq',
        field: 'isActive',
        value: true,
      });
    } catch {
      return [];
    }
  }

  /**
   * Get contacts in a specific Contact Group.
   * ContactGroupContacts is a junction entity returning only contactID + contactGroupID.
   * We must fetch the actual Contact records separately to get names/emails.
   */
  async getContactGroupMembers(groupId: number): Promise<AutotaskContact[]> {
    // Step 1: Get junction records (contactID + contactGroupID)
    const junctionRecords = await this.queryAll<{ id: number; contactID: number; contactGroupID: number }>(
      'ContactGroupContacts',
      { op: 'eq', field: 'contactGroupID', value: groupId }
    );

    if (junctionRecords.length === 0) return [];

    // Step 2: Fetch actual contact details for each contactID
    const contactIds = junctionRecords.map(r => r.contactID).filter(Boolean);
    if (contactIds.length === 0) return [];

    const contacts: AutotaskContact[] = [];
    // Batch in groups of 50 to stay within API limits
    const batchSize = 50;
    for (let i = 0; i < contactIds.length; i += batchSize) {
      const batch = contactIds.slice(i, i + batchSize);
      if (batch.length === 1) {
        const result = await this.queryAll<AutotaskContact>('Contacts', {
          op: 'eq', field: 'id', value: batch[0]
        });
        contacts.push(...result);
      } else {
        const result = await this.queryAll<AutotaskContact>('Contacts', {
          op: 'in', field: 'id', value: batch
        });
        contacts.push(...result);
      }
    }

    return contacts;
  }

  /**
   * Update (PATCH) a ticket in Autotask
   */
  async patchTicket(ticketId: number, data: Record<string, unknown>): Promise<void> {
    await this.patch('Tickets', { id: ticketId, ...data });
  }

  async getResourceByEmail(email: string): Promise<AutotaskResource | null> {
    try {
      const resources = await this.queryAll<AutotaskResource>('Resources', {
        op: 'eq',
        field: 'email',
        value: email,
      });
      return resources.length > 0 ? resources[0] : null;
    } catch {
      return null;
    }
  }

  // ============================================
  // INSTANCE CONFIGURATION READS (MCP connector)
  // ============================================
  // Everything below reads ADMIN CONFIGURATION (picklists, categories,
  // catalog, UDFs, business hours) LIVE from the REST API — no caching.
  // Verified boundaries (swagger, all zones): the REST API exposes NO
  // workflow rules, notification templates, dashboards/widgets, SLA
  // definitions, or status→SLA-event mapping. Tools must state those
  // boundaries instead of deriving or guessing values.

  /** Filter that matches every row — Autotask's query endpoint requires a filter. */
  private static readonly ALL_ROWS = { op: 'gte', field: 'id', value: 0 };

  /**
   * Full-metadata picklist for any entity field: isSystem/isDefaultValue/
   * sortOrder plus parent linkage (e.g. each subIssueType carries the
   * issueType it belongs to, resolved to a label). Throws (rather than
   * returning []) when the field is missing or not a picklist, so callers
   * can't mistake a typo for an empty picklist.
   */
  async getEntityPicklistDetailed(
    entity: string,
    fieldName: string,
    includeInactive = false,
  ): Promise<PicklistDetailed> {
    const info = await this.getFieldInfo(entity);
    const field = info?.fields?.find((f) => f.name === fieldName);
    if (!field) {
      const picklistFields = (info?.fields ?? []).filter((f) => f.isPickList).map((f) => f.name);
      throw new Error(`Field '${fieldName}' not found on ${entity}. Picklist fields on this entity: ${picklistFields.join(', ') || '(none)'}`);
    }
    if (!field.isPickList || !field.picklistValues) {
      throw new Error(`Field '${fieldName}' on ${entity} is not a picklist (dataType ${field.dataType}).`);
    }
    const parentField = field.picklistParentValueField || null;
    const parentLabels = new Map<string, string>();
    if (parentField) {
      const parent = info.fields.find((f) => f.name === parentField);
      for (const pv of parent?.picklistValues ?? []) parentLabels.set(pv.value, pv.label);
    }
    const options = field.picklistValues
      .filter((pv) => includeInactive || pv.isActive)
      .map((pv) => ({
        id: parseInt(pv.value, 10),
        label: pv.label,
        isActive: pv.isActive,
        isSystem: pv.isSystem ?? false,
        isDefaultValue: pv.isDefaultValue,
        sortOrder: pv.sortOrder ?? 0,
        parentId: pv.parentValue ? parseInt(pv.parentValue, 10) : null,
        parentLabel: pv.parentValue ? parentLabels.get(pv.parentValue) ?? null : null,
      }))
      .sort((a, b) => a.sortOrder - b.sortOrder);
    return { entity, field: fieldName, parentField, options };
  }

  /** ONE field-info call turned into id→label maps for several Tickets picklists. */
  private async ticketLabelMaps(fieldNames: string[]): Promise<Map<string, Map<number, string>>> {
    const info = await this.getFieldInfo('Tickets');
    const out = new Map<string, Map<number, string>>();
    for (const name of fieldNames) {
      const field = info?.fields?.find((f) => f.name === name);
      const map = new Map<number, string>();
      for (const pv of field?.picklistValues ?? []) {
        const id = parseInt(pv.value, 10);
        if (!Number.isNaN(id)) map.set(id, pv.label);
      }
      out.set(name, map);
    }
    return out;
  }

  /**
   * Ticket categories with their field defaults (TicketCategoryFieldDefaults),
   * picklist ids resolved to labels — including the DEFAULT SLA, status, queue,
   * priority and work type each category applies.
   */
  async getTicketCategoriesWithDefaults(
    includeDefaults = true,
    includeInactive = false,
  ): Promise<Array<Record<string, unknown>>> {
    const filter = includeInactive
      ? AutotaskClient.ALL_ROWS
      : { op: 'eq', field: 'isActive', value: true };
    const categories = await this.queryAll<Record<string, unknown>>('TicketCategories', filter);
    const base = categories.map((c) => ({
      id: c.id,
      name: c.name,
      nickname: c.nickname ?? null,
      isActive: c.isActive,
      isGlobalDefault: c.isGlobalDefault,
      isApiOnly: c.isApiOnly,
      displayColorRGB: c.displayColorRGB ?? null,
    }));
    if (!includeDefaults) return base;

    const [defaults, maps, billingCodes] = await Promise.all([
      this.queryAll<Record<string, unknown>>('TicketCategoryFieldDefaults', AutotaskClient.ALL_ROWS),
      this.ticketLabelMaps(['status', 'queueID', 'priority', 'sourceID', 'issueType', 'subIssueType', 'ticketType', 'serviceLevelAgreementID']),
      this.queryAll<{ id: number; name: string }>('BillingCodes', AutotaskClient.ALL_ROWS, ['id', 'name']),
    ]);
    const codeNames = new Map(billingCodes.map((b) => [b.id, b.name]));
    const label = (field: string, v: unknown) =>
      v == null ? null : { id: v, label: maps.get(field)?.get(Number(v)) ?? null };
    const byCategory = new Map<number, Record<string, unknown>>();
    for (const d of defaults) {
      byCategory.set(Number(d.ticketCategoryID), {
        status: label('status', d.status),
        queue: label('queueID', d.queueID),
        priority: label('priority', d.priority),
        source: label('sourceID', d.sourceID),
        issueType: label('issueType', d.issueTypeID),
        subIssueType: label('subIssueType', d.subIssueTypeID),
        ticketType: label('ticketType', d.ticketTypeID),
        serviceLevelAgreement: label('serviceLevelAgreementID', d.serviceLevelAgreementID),
        workType: d.workTypeID == null ? null : { id: d.workTypeID, label: codeNames.get(Number(d.workTypeID)) ?? null },
        title: d.title ?? null,
        description: d.description ?? null,
        estimatedHours: d.estimatedHours ?? null,
        resolution: d.resolution ?? null,
        purchaseOrderNumber: d.purchaseOrderNumber ?? null,
      });
    }
    return base.map((c) => ({ ...c, fieldDefaults: byCategory.get(Number(c.id)) ?? null }));
  }

  /**
   * Queues as configured on this instance: full picklist metadata plus queue
   * MEMBERSHIP from ResourceRoleQueues (which technicians work each queue).
   * Queue routing/email settings are NOT exposed by the REST API.
   */
  async getQueuesDetailed(includeMembers = true): Promise<{
    queues: Array<Record<string, unknown>>;
    membershipNote: string;
  }> {
    const picklist = await this.getEntityPicklistDetailed('Tickets', 'queueID');
    let membersByQueue = new Map<number, Array<{ resourceId: number; name: string; email: string | null }>>();
    if (includeMembers) {
      const [associations, resources] = await Promise.all([
        this.queryAll<{ id: number; queueID: number; resourceID: number }>('ResourceRoleQueues', AutotaskClient.ALL_ROWS),
        this.getResourcesList(true),
      ]);
      const resourceById = new Map(resources.map((r) => [r.id, r]));
      membersByQueue = new Map();
      for (const a of associations) {
        const res = resourceById.get(a.resourceID);
        if (!res) continue; // inactive resource
        const list = membersByQueue.get(a.queueID) ?? [];
        if (!list.some((m) => m.resourceId === a.resourceID)) {
          list.push({ resourceId: res.id, name: `${res.firstName} ${res.lastName}`.trim(), email: res.email ?? null });
        }
        membersByQueue.set(a.queueID, list);
      }
    }
    return {
      queues: picklist.options.map((q) => ({
        ...q,
        members: includeMembers ? membersByQueue.get(q.id) ?? [] : undefined,
      })),
      membershipNote:
        'Members come from ResourceRoleQueues (active resources only). Queue routing, email processing, and notification settings are UI-only — not exposed by the Autotask REST API.',
    };
  }

  /**
   * Billing codes as CONFIGURATION: every use type (labor, material, milestone,
   * service, …) with type labels, pricing/GL fields, and the instance's work
   * type modifiers. Read-only — the REST API has no write surface for
   * BillingCodes at all.
   */
  async getBillingCodesDetailed(opts: { useType?: number; includeInactive?: boolean } = {}): Promise<{
    billingCodes: Array<Record<string, unknown>>;
    workTypeModifiers: Array<Record<string, unknown>>;
    modifierNote: string;
  }> {
    const filters: object[] = [];
    if (!opts.includeInactive) filters.push({ op: 'eq', field: 'isActive', value: true });
    if (opts.useType != null) filters.push({ op: 'eq', field: 'useType', value: opts.useType });
    if (!filters.length) filters.push(AutotaskClient.ALL_ROWS);

    const [codes, info, modifiers, modInfo] = await Promise.all([
      this.queryAll<Record<string, unknown>>('BillingCodes', filters),
      this.getFieldInfo('BillingCodes'),
      this.queryAll<Record<string, unknown>>('WorkTypeModifiers', AutotaskClient.ALL_ROWS),
      this.getFieldInfo('WorkTypeModifiers'),
    ]);
    const pick = (entityInfo: AutotaskEntityInfo | undefined, field: string) => {
      const map = new Map<number, string>();
      for (const pv of entityInfo?.fields?.find((f) => f.name === field)?.picklistValues ?? []) {
        map.set(parseInt(pv.value, 10), pv.label);
      }
      return map;
    };
    const useTypes = pick(info, 'useType');
    const codeTypes = pick(info, 'billingCodeType');
    const modTypes = pick(modInfo, 'modifierType');
    return {
      billingCodes: codes.map((c) => ({
        id: c.id,
        name: c.name,
        description: c.description ?? null,
        isActive: c.isActive,
        useType: { id: c.useType, label: useTypes.get(Number(c.useType)) ?? null },
        billingCodeType: { id: c.billingCodeType, label: codeTypes.get(Number(c.billingCodeType)) ?? null },
        unitCost: c.unitCost ?? null,
        unitPrice: c.unitPrice ?? null,
        markupRate: c.markupRate ?? null,
        generalLedgerAccount: c.generalLedgerAccount ?? null,
        externalNumber: c.externalNumber ?? null,
        taxCategoryID: c.taxCategoryID ?? null,
        isExcludedFromNewContracts: c.isExcludedFromNewContracts ?? null,
        afterHoursWorkType: c.afterHoursWorkType ?? null,
        department: c.department ?? null,
      })),
      workTypeModifiers: modifiers.map((m) => ({
        id: m.id,
        modifierType: { id: m.modifierType, label: modTypes.get(Number(m.modifierType)) ?? null },
        modifierValue: m.modifierValue,
      })),
      modifierNote:
        'WorkTypeModifiers carry no billing-code reference field in the REST API (verified against the API schema), so they are returned unjoined rather than guessed.',
    };
  }

  /** Product catalog as configuration (pricing, categories, procurement flags). */
  async getProductsList(opts: { activeOnly?: boolean; search?: string } = {}): Promise<{
    count: number;
    hasMore: boolean;
    products: Array<Record<string, unknown>>;
  }> {
    const filters: object[] = [];
    if (opts.activeOnly !== false) filters.push({ op: 'eq', field: 'isActive', value: true });
    if (opts.search) filters.push({ op: 'contains', field: 'name', value: opts.search });
    if (!filters.length) filters.push(AutotaskClient.ALL_ROWS);
    const fields = [
      'id', 'name', 'description', 'isActive', 'sku', 'manufacturerName', 'manufacturerProductName',
      'unitCost', 'unitPrice', 'msrp', 'markupRate', 'periodType', 'billingType', 'priceCostMethod',
      'productCategory', 'productBillingCodeID', 'chargeBillingCodeID', 'doesNotRequireProcurement', 'isSerialized',
    ];
    const [{ items, hasMore }, info] = await Promise.all([
      this.queryOnePage<Record<string, unknown>>('Products', filters, fields),
      this.getFieldInfo('Products'),
    ]);
    const pick = (field: string) => {
      const map = new Map<number, string>();
      for (const pv of info?.fields?.find((f) => f.name === field)?.picklistValues ?? []) map.set(parseInt(pv.value, 10), pv.label);
      return map;
    };
    const periodTypes = pick('periodType');
    const billingTypes = pick('billingType');
    const priceCostMethods = pick('priceCostMethod');
    const categories = pick('productCategory');
    return {
      count: items.length,
      hasMore,
      products: items.map((p) => ({
        ...p,
        periodType: p.periodType == null ? null : { id: p.periodType, label: periodTypes.get(Number(p.periodType)) ?? null },
        billingType: p.billingType == null ? null : { id: p.billingType, label: billingTypes.get(Number(p.billingType)) ?? null },
        priceCostMethod: p.priceCostMethod == null ? null : { id: p.priceCostMethod, label: priceCostMethods.get(Number(p.priceCostMethod)) ?? null },
        productCategory: p.productCategory == null ? null : { id: p.productCategory, label: categories.get(Number(p.productCategory)) ?? null },
      })),
    };
  }

  /** Service catalog + service bundles as configuration. Services carry the SLA they apply. */
  async getServicesList(opts: { activeOnly?: boolean } = {}): Promise<{
    services: Array<Record<string, unknown>>;
    serviceBundles: Array<Record<string, unknown>>;
  }> {
    const filter = opts.activeOnly === false
      ? AutotaskClient.ALL_ROWS
      : { op: 'eq', field: 'isActive', value: true };
    const [services, bundles, info, slaMaps] = await Promise.all([
      this.queryAll<Record<string, unknown>>('Services', filter, [
        'id', 'name', 'description', 'invoiceDescription', 'isActive', 'unitCost', 'unitPrice',
        'markupRate', 'periodType', 'billingCodeID', 'serviceLevelAgreementID', 'sku', 'catalogNumberPartNumber',
      ]),
      this.queryAll<Record<string, unknown>>('ServiceBundles', filter),
      this.getFieldInfo('Services'),
      this.ticketLabelMaps(['serviceLevelAgreementID']),
    ]);
    const periodTypes = new Map<number, string>();
    for (const pv of info?.fields?.find((f) => f.name === 'periodType')?.picklistValues ?? []) {
      periodTypes.set(parseInt(pv.value, 10), pv.label);
    }
    const slaNames = slaMaps.get('serviceLevelAgreementID') ?? new Map<number, string>();
    const withLabels = (s: Record<string, unknown>) => ({
      ...s,
      periodType: s.periodType == null ? null : { id: s.periodType, label: periodTypes.get(Number(s.periodType)) ?? null },
      serviceLevelAgreement: s.serviceLevelAgreementID == null
        ? null
        : { id: s.serviceLevelAgreementID, label: slaNames.get(Number(s.serviceLevelAgreementID)) ?? null },
    });
    return { services: services.map(withLabels), serviceBundles: bundles.map(withLabels) };
  }

  /**
   * User-defined field DEFINITIONS (name, type, required, default, list
   * options) across the instance, with udfType/dataType/displayFormat resolved.
   */
  async getUdfDefinitions(opts: { udfType?: string } = {}): Promise<Array<Record<string, unknown>>> {
    const [defs, info, listItems] = await Promise.all([
      this.queryAll<Record<string, unknown>>('UserDefinedFieldDefinitions', AutotaskClient.ALL_ROWS),
      this.getFieldInfo('UserDefinedFieldDefinitions'),
      this.queryAll<Record<string, unknown>>('UserDefinedFieldListItems', AutotaskClient.ALL_ROWS),
    ]);
    const pick = (field: string) => {
      const map = new Map<number, string>();
      for (const pv of info?.fields?.find((f) => f.name === field)?.picklistValues ?? []) map.set(parseInt(pv.value, 10), pv.label);
      return map;
    };
    const udfTypes = pick('udfType');
    const dataTypes = pick('dataType');
    const displayFormats = pick('displayFormat');
    const itemsByField = new Map<number, Array<Record<string, unknown>>>();
    for (const it of listItems) {
      const key = Number(it.udfFieldId);
      const list = itemsByField.get(key) ?? [];
      list.push({ id: it.id, valueForDisplay: it.valueForDisplay, valueForExport: it.valueForExport, isActive: it.isActive });
      itemsByField.set(key, list);
    }
    const rows = defs.map((d) => ({
      id: d.id,
      name: d.name,
      description: d.description ?? null,
      udfType: { id: d.udfType, label: udfTypes.get(Number(d.udfType)) ?? null },
      dataType: { id: d.dataType, label: dataTypes.get(Number(d.dataType)) ?? null },
      displayFormat: d.displayFormat == null ? null : { id: d.displayFormat, label: displayFormats.get(Number(d.displayFormat)) ?? null },
      isActive: d.isActive,
      isRequired: d.isRequired,
      isPrivate: d.isPrivate,
      isProtected: d.isProtected,
      isVisibleToClientPortal: d.isVisibleToClientPortal,
      defaultValue: d.defaultValue ?? null,
      sortOrder: d.sortOrder ?? null,
      numberOfDecimalPlaces: d.numberOfDecimalPlaces ?? null,
      mergeVariableName: d.mergeVariableName ?? null,
      createDate: d.createDate ?? null,
      listItems: itemsByField.get(Number(d.id)) ?? [],
    }));
    if (!opts.udfType) return rows;
    const want = opts.udfType.toLowerCase();
    return rows.filter((r) => String((r.udfType as { label?: string }).label ?? '').toLowerCase().includes(want));
  }

  /**
   * SLA clock inputs: internal locations with weekly business hours, plus
   * holiday sets and their holidays. (The SLA definitions themselves — event
   * targets per SLA — are NOT exposed by the REST API.)
   */
  async getBusinessHoursAndHolidays(): Promise<{
    locations: Array<Record<string, unknown>>;
    holidaySets: Array<Record<string, unknown>>;
  }> {
    const [locations, sets, holidays, info] = await Promise.all([
      this.queryAll<Record<string, unknown>>('InternalLocationWithBusinessHours', AutotaskClient.ALL_ROWS),
      this.queryAll<Record<string, unknown>>('HolidaySets', AutotaskClient.ALL_ROWS),
      this.queryAll<Record<string, unknown>>('Holidays', AutotaskClient.ALL_ROWS),
      this.getFieldInfo('InternalLocationWithBusinessHours'),
    ]);
    const tzMap = new Map<number, string>();
    for (const pv of info?.fields?.find((f) => f.name === 'timeZoneID')?.picklistValues ?? []) {
      tzMap.set(parseInt(pv.value, 10), pv.label);
    }
    const holidayHoursTypes = new Map<number, string>();
    for (const pv of info?.fields?.find((f) => f.name === 'holidayHoursType')?.picklistValues ?? []) {
      holidayHoursTypes.set(parseInt(pv.value, 10), pv.label);
    }
    const setNames = new Map(sets.map((s) => [Number(s.id), String(s.holidaySetName)]));
    const holidaysBySet = new Map<number, Array<Record<string, unknown>>>();
    for (const h of holidays) {
      const key = Number(h.holidaySetID);
      const list = holidaysBySet.get(key) ?? [];
      list.push({ id: h.id, holidayName: h.holidayName, holidayDate: h.holidayDate });
      holidaysBySet.set(key, list);
    }
    const day = (loc: Record<string, unknown>, prefix: string) => ({
      start: loc[`${prefix}BusinessHoursStartTime`] ?? null,
      end: loc[`${prefix}BusinessHoursEndTime`] ?? null,
      extendedStart: loc[`${prefix}ExtendedHoursStartTime`] ?? null,
      extendedEnd: loc[`${prefix}ExtendedHoursEndTime`] ?? null,
    });
    return {
      locations: locations.map((loc) => ({
        id: loc.id,
        name: loc.name,
        isDefault: loc.isDefault,
        timeZone: loc.timeZoneID == null ? null : { id: loc.timeZoneID, label: tzMap.get(Number(loc.timeZoneID)) ?? null },
        businessHours: {
          monday: day(loc, 'monday'),
          tuesday: day(loc, 'tuesday'),
          wednesday: day(loc, 'wednesday'),
          thursday: day(loc, 'thursday'),
          friday: day(loc, 'friday'),
          saturday: day(loc, 'saturday'),
          sunday: day(loc, 'sunday'),
        },
        holidaySet: loc.holidaySetID == null
          ? null
          : { id: loc.holidaySetID, name: setNames.get(Number(loc.holidaySetID)) ?? null },
        holidayHoursType: loc.holidayHoursType == null
          ? null
          : { id: loc.holidayHoursType, label: holidayHoursTypes.get(Number(loc.holidayHoursType)) ?? null },
        noHoursOnHolidays: loc.noHoursOnHolidays ?? null,
      })),
      holidaySets: sets.map((s) => ({
        id: s.id,
        name: s.holidaySetName,
        description: s.holidaySetDescription ?? null,
        holidays: (holidaysBySet.get(Number(s.id)) ?? []).sort((a, b) => String(a.holidayDate).localeCompare(String(b.holidayDate))),
      })),
    };
  }

  /**
   * Sent-notification log (NotificationHistory): which template fired, to whom,
   * when, from which entity. This is the closest the REST API gets to
   * notification/workflow visibility — rule and template DEFINITIONS are not
   * exposed. Returns whatever history the instance retains.
   */
  async getNotificationHistory(opts: {
    from?: Date; to?: Date; ticketId?: number; companyId?: number; templateName?: string; max?: number;
  } = {}): Promise<{ count: number; hasMore: boolean; notifications: Array<Record<string, unknown>> }> {
    const to = opts.to ?? new Date();
    const from = opts.from ?? new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);
    const filters: object[] = [
      { op: 'gte', field: 'notificationSentTime', value: from.toISOString() },
      { op: 'lte', field: 'notificationSentTime', value: to.toISOString() },
    ];
    if (opts.ticketId != null) filters.push({ op: 'eq', field: 'ticketID', value: opts.ticketId });
    if (opts.companyId != null) filters.push({ op: 'eq', field: 'companyID', value: opts.companyId });
    if (opts.templateName) filters.push({ op: 'contains', field: 'templateName', value: opts.templateName });
    const { items, hasMore } = await this.queryOnePage<Record<string, unknown>>('NotificationHistory', filters, [
      'id', 'notificationSentTime', 'templateName', 'notificationHistoryTypeID', 'recipientEmailAddress',
      'recipientDisplayName', 'entityTitle', 'entityNumber', 'ticketID', 'companyID', 'projectID', 'taskID',
      'timeEntryID', 'quoteID', 'opportunityID', 'initiatingResourceID', 'initiatingContactID', 'isDeleted', 'isTemplateJob',
    ]);
    const typeMap = await this.picklistLabelMap('NotificationHistory', 'notificationHistoryTypeID');
    const max = Math.min(opts.max ?? 200, 500);
    return {
      count: Math.min(items.length, max),
      hasMore: hasMore || items.length > max,
      notifications: items.slice(0, max).map((n) => ({
        ...n,
        notificationHistoryType: n.notificationHistoryTypeID == null
          ? null
          : { id: n.notificationHistoryTypeID, label: typeMap.get(Number(n.notificationHistoryTypeID)) ?? null },
      })),
    };
  }

  /**
   * Generic single-page query for a CONFIG entity. The allowlist of entities
   * lives at the tool layer; this method just executes. Returns at most one
   * API page (500 rows) with a hasMore flag.
   */
  async queryConfigEntity(
    entity: string,
    filters: Array<{ field: string; op: string; value?: unknown }> = [],
    includeFields?: string[],
    max = 500,
  ): Promise<{ entity: string; count: number; hasMore: boolean; items: Array<Record<string, unknown>> }> {
    const filterArray: object[] = filters.length
      ? filters.map((f) => (f.value === undefined ? { op: f.op, field: f.field } : { op: f.op, field: f.field, value: f.value }))
      : [AutotaskClient.ALL_ROWS];
    const { items, hasMore } = await this.queryOnePage<Record<string, unknown>>(entity, filterArray, includeFields);
    const capped = Math.min(max, 500);
    return { entity, count: Math.min(items.length, capped), hasMore: hasMore || items.length > capped, items: items.slice(0, capped) };
  }

  /**
   * Live entity capabilities from the REST API's own metadata: can this
   * entity be queried/created/updated/deleted, does it have UDFs, and what
   * fields does it expose (type, required, read-only, picklist, reference).
   */
  async getEntityCapabilities(entity: string): Promise<Record<string, unknown>> {
    if (!/^[A-Za-z]+$/.test(entity)) throw new Error('Entity must be a bare REST entity name, e.g. "TicketCategories".');
    const [rawInfo, fieldInfo, udfInfo] = await Promise.all([
      this.get<Record<string, unknown>>(`/v1.0/${entity}/entityInformation`),
      this.getFieldInfo(entity),
      this.get<{ fields?: Array<Record<string, unknown>> }>(`/v1.0/${entity}/entityInformation/userDefinedFields`).catch(() => null),
    ]);
    const info = (rawInfo?.info ?? rawInfo) as Record<string, unknown>;
    return {
      entity,
      capabilities: {
        canQuery: info?.canQuery ?? null,
        canCreate: info?.canCreate ?? null,
        canUpdate: info?.canUpdate ?? null,
        canDelete: info?.canDelete ?? null,
        hasUserDefinedFields: info?.hasUserDefinedFields ?? null,
        supportsWebhookCallouts: info?.supportsWebhookCallouts ?? null,
      },
      fields: (fieldInfo?.fields ?? []).map((f) => ({
        name: f.name,
        dataType: f.dataType,
        isRequired: f.isRequired ?? false,
        isReadOnly: f.isReadOnly ?? false,
        isQueryable: f.isQueryable ?? true,
        isPickList: f.isPickList,
        picklistValueCount: f.picklistValues?.length ?? 0,
        picklistParentValueField: f.picklistParentValueField || null,
        isReference: f.isReference ?? false,
        referenceEntityType: f.referenceEntityType || null,
      })),
      userDefinedFields: (udfInfo?.fields ?? []).map((f) => ({ name: f.name, dataType: f.dataType })),
    };
  }

  /**
   * Current values of one config row, for staged-write before-snapshots.
   * Uses the same query-by-id pattern as the rest of this client.
   */
  async getConfigRow(entity: string, id: number): Promise<Record<string, unknown> | null> {
    const rows = await this.queryAll<Record<string, unknown>>(entity, { op: 'eq', field: 'id', value: id });
    return rows[0] ?? null;
  }
}

// ============================================
// STATUS MAPPING HELPERS
// ============================================

/**
 * Map Autotask project status number to our ProjectStatus enum
 */
export function mapAtProjectStatus(atStatus: number): 'ACTIVE' | 'COMPLETED' | 'ON_HOLD' | 'CANCELLED' {
  switch (atStatus) {
    case AT_PROJECT_STATUS.NEW:
    case AT_PROJECT_STATUS.ACTIVE:
      return 'ACTIVE';
    case AT_PROJECT_STATUS.COMPLETE:
      return 'COMPLETED';
    case AT_PROJECT_STATUS.INACTIVE:
      return 'ON_HOLD';
    default:
      return 'ACTIVE';
  }
}

/**
 * Map Autotask task status number to our TaskStatus enum.
 * Uses individual constants to avoid duplicate-value bugs.
 */
export function mapAtTaskStatus(atStatus: number): string {
  if (atStatus === AT_TASK_STATUS_COMPLETE) return 'REVIEWED_AND_DONE';
  if (atStatus === AT_TASK_STATUS_IN_PROGRESS) return 'WORK_IN_PROGRESS';
  if (atStatus === AT_TASK_STATUS_WAITING_CUSTOMER) return 'WAITING_ON_CLIENT';
  if (atStatus === AT_TASK_STATUS_NEW) return 'NOT_STARTED';
  return 'NOT_STARTED';
}

/**
 * Reverse map: our TaskStatus → Autotask task status number.
 * Returns null if no mapping exists (status is local-only).
 */
export function mapLocalStatusToAt(localStatus: string): number | null {
  switch (localStatus) {
    case 'NOT_STARTED':
      return AT_TASK_STATUS_NEW;
    case 'WORK_IN_PROGRESS':
    case 'ASSIGNED':
    case 'NEEDS_REVIEW':
    case 'INFORMATION_RECEIVED':
      return AT_TASK_STATUS_IN_PROGRESS;
    case 'REVIEWED_AND_DONE':
    case 'NOT_APPLICABLE':
    case 'ITG_DOCUMENTED':
      return AT_TASK_STATUS_COMPLETE;
    case 'WAITING_ON_CLIENT':
    case 'WAITING_ON_VENDOR':
    case 'CUSTOMER_NOTE_ADDED':
    case 'STUCK':
      return AT_TASK_STATUS_WAITING_CUSTOMER;
    default:
      return null;
  }
}

/**
 * Reverse map: our ProjectStatus → Autotask project status number.
 * Returns null if no mapping exists.
 */
export function mapLocalProjectStatusToAt(localStatus: string): number | null {
  switch (localStatus) {
    case 'ACTIVE':
      return AT_PROJECT_STATUS.ACTIVE;
    case 'COMPLETED':
      return AT_PROJECT_STATUS.COMPLETE;
    case 'ON_HOLD':
    case 'CANCELLED':
      return AT_PROJECT_STATUS.INACTIVE;
    default:
      return null;
  }
}

/**
 * Map Autotask task priority to our Priority enum
 */
export function mapAtTaskPriority(atPriority: number): 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT' {
  switch (atPriority) {
    case AT_TASK_PRIORITY.LOW:
      return 'LOW';
    case AT_TASK_PRIORITY.MEDIUM:
      return 'MEDIUM';
    case AT_TASK_PRIORITY.HIGH:
      return 'HIGH';
    case AT_TASK_PRIORITY.CRITICAL:
      return 'URGENT';
    default:
      return 'MEDIUM';
  }
}

/**
 * Generate a URL-friendly slug from a string
 */
export function generateSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 100);
}

/**
 * Generate a unique slug by appending a random suffix if needed
 */
export function generateUniqueSlug(text: string, suffix?: string): string {
  const base = generateSlug(text);
  return suffix ? `${base}-${suffix}` : base;
}

/**
 * Extract the Autotask web UI zone from the API base URL.
 * API: https://webservices6.autotask.net/ATServicesRest → zone: ww6
 */
function getAutotaskZone(): string {
  const baseUrl = process.env.AUTOTASK_API_BASE_URL || '';
  const match = baseUrl.match(/webservices(\d+)\.autotask\.net/);
  return match ? `ww${match[1]}` : 'ww6';
}

/**
 * Generate an Autotask web UI URL for a project.
 * Uses the Datto PSA deep-link format: /Mvc/Projects/ProjectDetail.mvc?ProjectId={id}
 */
export function getAutotaskProjectUrl(atProjectId: string): string {
  const zone = getAutotaskZone();
  return `https://${zone}.autotask.net/Mvc/Projects/ProjectDetail.mvc?ProjectId=${atProjectId}`;
}

/**
 * Generate an Autotask web UI URL for a task (project task).
 * Uses the Datto PSA deep-link format: /Mvc/Projects/TaskDetail.mvc?TaskId={id}
 */
export function getAutotaskTaskUrl(atTaskId: string): string {
  const zone = getAutotaskZone();
  return `https://${zone}.autotask.net/Mvc/Projects/TaskDetail.mvc?TaskId=${atTaskId}`;
}

/**
 * Generate an Autotask web UI URL for a service desk ticket.
 * Uses the Datto PSA deep-link format: /Mvc/ServiceDesk/TicketDetail.mvc?TicketId={id}
 */
export function getAutotaskTicketUrl(atTicketId: string): string {
  const zone = getAutotaskZone();
  return `https://${zone}.autotask.net/Mvc/ServiceDesk/TicketDetail.mvc?TicketId=${atTicketId}`;
}
