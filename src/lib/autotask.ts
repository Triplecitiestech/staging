/**
 * Autotask PSA REST API Client
 *
 * Handles authentication, pagination, and entity queries for the Autotask REST API v1.0.
 * Used by the sync cron job to pull companies, projects, contacts, and tasks.
 *
 * Required env vars:
 *   AUTOTASK_API_USERNAME - API user username (email)
 *   AUTOTASK_API_SECRET   - API user secret key
 *   AUTOTASK_API_INTEGRATION_CODE - Integration code from Autotask
 *   AUTOTASK_API_BASE_URL - Zone-specific base URL (e.g. https://webservices6.autotask.net/ATServicesRest)
 */

// ============================================
// TYPES
// ============================================

export interface AutotaskCompany {
  id: number;
  companyName: string;
  companyType: number;
  classification?: number;     // Autotask classification picklist ID
  classificationName?: string; // Resolved label (e.g., "Platinum Managed Service")
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
}

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
  summaryNotes?: string;
  internalNotes?: string;
  isNonBillable?: boolean;
  createDateTime?: string;
  lastModifiedDateTime?: string;
}

export interface AutotaskResource {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  isActive: boolean;
  userName?: string;
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
  picklistValues?: Array<{
    value: string;
    label: string;
    isActive: boolean;
    isDefaultValue: boolean;
  }>;
}

interface AutotaskEntityInfo {
  fields: AutotaskFieldInfo[];
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

  private async get<T>(endpoint: string): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: this.headers,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Autotask API GET ${endpoint} failed (${response.status}): ${errorText}`);
    }

    return response.json() as Promise<T>;
  }

  /**
   * Query all records from an Autotask entity with compound filters.
   * Accepts a single filter OR an array of filters (implicitly ANDed by the API).
   */
  private async queryAll<T>(entityPath: string, filter: object | object[]): Promise<T[]> {
    const results: T[] = [];
    let nextPageUrl: string | undefined;

    // First request — wrap single filter in array, pass arrays as-is
    const filterArray = Array.isArray(filter) ? filter : [filter];
    const url = `${this.baseUrl}/v1.0/${entityPath}/query`;
    const response = await fetch(url, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({ filter: filterArray }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Autotask API query ${entityPath} failed (${response.status}): ${errorText}`);
    }

    const data = (await response.json()) as AutotaskApiResponse<T>;
    if (data.items) {
      results.push(...data.items);
    }

    nextPageUrl = data.pageDetails?.nextPageUrl;

    // Paginate through all results
    while (nextPageUrl) {
      const pageResponse = await fetch(nextPageUrl, {
        method: 'GET',
        headers: this.headers,
      });

      if (!pageResponse.ok) break;

      const pageData = (await pageResponse.json()) as AutotaskApiResponse<T>;
      if (pageData.items) {
        results.push(...pageData.items);
      }
      nextPageUrl = pageData.pageDetails?.nextPageUrl;
    }

    return results;
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
    const url = `${this.baseUrl}/v1.0/${entityPath}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch(url, {
        method: 'PATCH',
        headers: this.headers,
        body: JSON.stringify(data),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Autotask API PATCH ${entityPath} failed (${response.status}): ${errorText}`);
      }

      return response.json() as Promise<T>;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * POST (create) an entity in Autotask
   */
  private async post<T>(entityPath: string, data: object): Promise<T> {
    const url = `${this.baseUrl}/v1.0/${entityPath}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(data),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Autotask API POST ${entityPath} failed (${response.status}): ${errorText}`);
      }

      return response.json() as Promise<T>;
    } finally {
      clearTimeout(timeoutId);
    }
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

  /**
   * Get tickets for a company from the last N days.
   * Fetches tickets created OR with activity in the window to capture status changes.
   */
  async getCompanyTickets(companyId: number, days: number = 30): Promise<AutotaskTicket[]> {
    const since = new Date();
    since.setDate(since.getDate() - days);
    try {
      // Query tickets created OR modified in the window — captures status changes
      return await this.queryAll('Tickets', {
        op: 'and',
        items: [
          { op: 'eq', field: 'companyID', value: companyId },
          {
            op: 'or',
            items: [
              { op: 'gte', field: 'createDate', value: since.toISOString() },
              { op: 'gte', field: 'lastActivityDate', value: since.toISOString() },
            ],
          },
        ],
      });
    } catch (err) {
      // Never silently swallow — surface the error so sync can report it
      console.error(`[AutotaskClient] getCompanyTickets failed for company ${companyId}:`, err instanceof Error ? err.message : String(err));
      throw err;
    }
  }

  /**
   * Find a resource by email address (for SSO matching)
   */
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
    publish?: number; // 1=All/External, 2=Internal
  }): Promise<AutotaskTicketNote> {
    const payload = {
      ticketID: ticketId,
      title: data.title,
      description: data.description,
      noteType: data.noteType || 1,
      publish: data.publish || 1, // Default to external/customer-visible
    };

    // Try child entity path first (most reliable for this Autotask instance)
    try {
      const result = await this.post<{ item: AutotaskTicketNote }>(
        `Tickets/${ticketId}/Notes`,
        payload
      );
      return result.item;
    } catch {
      // Fallback to top-level TicketNotes entity
      const result = await this.post<{ item: AutotaskTicketNote }>(
        'TicketNotes',
        payload
      );
      return result.item;
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
