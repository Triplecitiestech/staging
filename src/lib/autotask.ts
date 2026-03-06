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
  taskID: number;
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

  private async queryAll<T>(entityPath: string, filter: object): Promise<T[]> {
    const results: T[] = [];
    let nextPageUrl: string | undefined;

    // First request
    const url = `${this.baseUrl}/v1.0/${entityPath}/query`;
    const response = await fetch(url, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({ filter: [filter] }),
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
    const response = await fetch(url, {
      method: 'PATCH',
      headers: this.headers,
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Autotask API PATCH ${entityPath} failed (${response.status}): ${errorText}`);
    }

    return response.json() as Promise<T>;
  }

  /**
   * POST (create) an entity in Autotask
   */
  private async post<T>(entityPath: string, data: object): Promise<T> {
    const url = `${this.baseUrl}/v1.0/${entityPath}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Autotask API POST ${entityPath} failed (${response.status}): ${errorText}`);
    }

    return response.json() as Promise<T>;
  }

  /**
   * Update a task's status in Autotask (write-back)
   */
  async updateTaskStatus(atTaskId: string, atStatus: number): Promise<void> {
    await this.patch(`ProjectTasks`, {
      id: parseInt(atTaskId, 10),
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
   * Get tickets for a company from the last N days
   */
  async getCompanyTickets(companyId: number, days: number = 30): Promise<{
    id: number;
    ticketNumber: string;
    title: string;
    status: number;
    createDate: string;
    completedDate?: string;
    priority: number;
  }[]> {
    const since = new Date();
    since.setDate(since.getDate() - days);
    try {
      return await this.queryAll('Tickets', {
        op: 'and',
        items: [
          { op: 'eq', field: 'companyID', value: companyId },
          { op: 'gte', field: 'createDate', value: since.toISOString() },
        ],
      });
    } catch {
      return [];
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
    const result = await this.post<{ item: AutotaskTicketNote }>('TicketNotes', {
      ticketID: ticketId,
      title: data.title,
      description: data.description,
      noteType: data.noteType || 1,
      publish: data.publish || 1, // Default to external/customer-visible
    });
    return result.item;
  }

  /**
   * Get time entries for a ticket (for customer timeline)
   */
  async getTicketTimeEntries(ticketId: number): Promise<AutotaskTimeEntry[]> {
    try {
      return await this.queryAll<AutotaskTimeEntry>('TimeEntries', {
        op: 'eq',
        field: 'ticketID',
        value: ticketId,
      });
    } catch {
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
   * Get contacts in a specific Contact Group
   */
  async getContactGroupMembers(groupId: number): Promise<{ id: number; firstName: string; lastName: string; emailAddress: string; companyID: number }[]> {
    try {
      return await this.queryAll('ContactGroupContacts', {
        op: 'eq',
        field: 'contactGroupID',
        value: groupId,
      });
    } catch {
      return [];
    }
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
 * Uses the modern Datto PSA URL format with entity navigation.
 */
export function getAutotaskProjectUrl(atProjectId: string): string {
  const zone = getAutotaskZone();
  return `https://${zone}.autotask.net/Mvc/Framework/CommonPage.mvc/PageState/Navigate?PageName=ProjectDetail&Id=${atProjectId}`;
}

/**
 * Generate an Autotask web UI URL for a task (project task).
 */
export function getAutotaskTaskUrl(atTaskId: string): string {
  const zone = getAutotaskZone();
  return `https://${zone}.autotask.net/Mvc/Framework/CommonPage.mvc/PageState/Navigate?PageName=TaskDetail&Id=${atTaskId}`;
}

/**
 * Generate an Autotask web UI URL for a service desk ticket.
 */
export function getAutotaskTicketUrl(atTicketId: string): string {
  const zone = getAutotaskZone();
  return `https://${zone}.autotask.net/Mvc/Framework/CommonPage.mvc/PageState/Navigate?PageName=TicketDetail&Id=${atTicketId}`;
}
