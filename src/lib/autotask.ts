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
  NEW: 1,
  ACTIVE: 4,
  COMPLETE: 5,
  INACTIVE: 0,
} as const;

// Autotask task status picklist mappings
const AT_TASK_STATUS = {
  NEW: 1,
  IN_PROGRESS: 5,
  WAITING_CUSTOMER: 7,
  COMPLETE: 5,
} as const;

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
   * Get phases for a project
   */
  async getProjectPhases(projectId: number): Promise<AutotaskProjectPhase[]> {
    return this.queryAll<AutotaskProjectPhase>(`Projects/${projectId}/Phases`, {
      op: 'exist',
      field: 'id',
    });
  }

  /**
   * Get tasks for a project
   */
  async getProjectTasks(projectId: number): Promise<AutotaskTask[]> {
    return this.queryAll<AutotaskTask>('ProjectTasks', {
      op: 'eq',
      field: 'projectID',
      value: projectId,
    });
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
 * Map Autotask task status number to our TaskStatus enum
 */
export function mapAtTaskStatus(atStatus: number): string {
  switch (atStatus) {
    case AT_TASK_STATUS.NEW:
      return 'NOT_STARTED';
    case AT_TASK_STATUS.IN_PROGRESS:
      return 'WORK_IN_PROGRESS';
    case AT_TASK_STATUS.WAITING_CUSTOMER:
      return 'WAITING_ON_CLIENT';
    case AT_TASK_STATUS.COMPLETE:
      return 'REVIEWED_AND_DONE';
    default:
      return 'NOT_STARTED';
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
