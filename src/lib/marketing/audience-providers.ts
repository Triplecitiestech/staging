/**
 * Audience Provider System
 *
 * Extensible provider architecture for resolving audience recipients from
 * different sources (Autotask, HubSpot, CSV, Manual lists, etc.)
 *
 * To add a new provider:
 * 1. Create a class implementing AudienceProvider
 * 2. Register it in getProvider()
 */

// ============================================
// TYPES
// ============================================

export interface AudienceRecipient {
  name: string;
  email: string;
  companyName?: string;
  companyId?: string; // Local DB company ID
  sourceContactId?: string; // External system contact ID
}

export interface AudienceFilterCriteria {
  // Autotask-specific
  companyIds?: string[]; // Local company IDs to include
  autotaskCompanyIds?: string[]; // Autotask company IDs
  allActiveCustomers?: boolean; // Include all active companies with contacts
  contactGroupIds?: string[]; // Autotask Contact Group IDs (Action Types)

  // Future: HubSpot-specific
  hubspotListId?: string;

  // Future: Manual/CSV
  manualEmails?: Array<{ name: string; email: string; companyName?: string }>;
}

export interface AudienceProvider {
  readonly providerType: string;

  /**
   * Resolve the current recipients for given filter criteria.
   * Returns a fresh list each time (not cached).
   */
  resolveRecipients(criteria: AudienceFilterCriteria): Promise<AudienceRecipient[]>;

  /**
   * Get available targeting options for the UI (e.g., list of companies).
   */
  getTargetingOptions(): Promise<TargetingOption[]>;
}

export interface TargetingOption {
  id: string;
  label: string;
  description?: string;
  contactCount?: number;
}

// ============================================
// AUTOTASK PROVIDER
// ============================================

export class AutotaskAudienceProvider implements AudienceProvider {
  readonly providerType = 'AUTOTASK';

  /**
   * Resolve recipients from Autotask-synced companies/contacts in our local DB.
   * Uses local data (already synced) rather than hitting Autotask API directly,
   * which is faster and doesn't require API calls per send.
   */
  async resolveRecipients(criteria: AudienceFilterCriteria): Promise<AudienceRecipient[]> {
    const { prisma } = await import('@/lib/prisma');

    // Contact Group targeting: resolve via Autotask API
    if (criteria.contactGroupIds && criteria.contactGroupIds.length > 0) {
      const { AutotaskClient } = await import('@/lib/autotask');
      const client = new AutotaskClient();

      const allMembers: AudienceRecipient[] = [];
      const seenEmails = new Set<string>();

      for (const groupId of criteria.contactGroupIds) {
        try {
          console.log(`[Audience] Resolving contact group ${groupId}...`);
          const members = await client.getContactGroupMembers(parseInt(groupId, 10));
          console.log(`[Audience] Contact group ${groupId}: ${members.length} contacts returned from Autotask`);

          let skippedNoEmail = 0;
          for (const member of members) {
            const email = (member.emailAddress || '').toLowerCase().trim();
            if (email && !seenEmails.has(email)) {
              seenEmails.add(email);
              allMembers.push({
                name: `${member.firstName || ''} ${member.lastName || ''}`.trim() || email,
                email,
                sourceContactId: String(member.id),
              });
            } else if (!email) {
              skippedNoEmail++;
            }
          }
          if (skippedNoEmail > 0) {
            console.log(`[Audience] Contact group ${groupId}: skipped ${skippedNoEmail} contacts without email`);
          }
        } catch (err) {
          console.error(`[Audience] Failed to resolve contact group ${groupId}:`, err);
          // Continue with other groups rather than failing entirely
        }
      }

      return allMembers;
    }

    // Company-based targeting: use local DB
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {
      isActive: true,
      email: { not: '' },
    };

    if (criteria.companyIds && criteria.companyIds.length > 0) {
      where.company = { id: { in: criteria.companyIds } };
    } else if (criteria.autotaskCompanyIds && criteria.autotaskCompanyIds.length > 0) {
      where.company = { autotaskCompanyId: { in: criteria.autotaskCompanyIds } };
    } else if (criteria.allActiveCustomers) {
      where.company = { autotaskCompanyId: { not: null } };
    }

    const contacts = await prisma.companyContact.findMany({
      where,
      include: {
        company: { select: { id: true, displayName: true } },
      },
      orderBy: [{ company: { displayName: 'asc' } }, { name: 'asc' }],
    });

    return contacts.map((c) => ({
      name: c.name,
      email: c.email,
      companyName: c.company.displayName,
      companyId: c.company.id,
      sourceContactId: c.autotaskContactId || undefined,
    }));
  }

  /**
   * Get list of companies with contacts for targeting UI
   */
  async getTargetingOptions(): Promise<TargetingOption[]> {
    const { prisma } = await import('@/lib/prisma');

    const companies = await prisma.company.findMany({
      where: {
        autotaskCompanyId: { not: null },
      },
      include: {
        _count: {
          select: {
            contacts: {
              where: { isActive: true, email: { not: '' } },
            },
          },
        },
      },
      orderBy: { displayName: 'asc' },
    });

    return companies
      .filter((c) => c._count.contacts > 0)
      .map((c) => ({
        id: c.id,
        label: c.displayName,
        description: `Autotask customer`,
        contactCount: c._count.contacts,
      }));
  }
}

// ============================================
// MANUAL PROVIDER (for curated lists)
// ============================================

export class ManualAudienceProvider implements AudienceProvider {
  readonly providerType = 'MANUAL';

  async resolveRecipients(criteria: AudienceFilterCriteria): Promise<AudienceRecipient[]> {
    if (!criteria.manualEmails) return [];
    return criteria.manualEmails.map((e) => ({
      name: e.name,
      email: e.email,
      companyName: e.companyName,
    }));
  }

  async getTargetingOptions(): Promise<TargetingOption[]> {
    return []; // Manual lists don't have predefined targeting options
  }
}

// ============================================
// PROVIDER REGISTRY
// ============================================

const providers: Record<string, AudienceProvider> = {
  AUTOTASK: new AutotaskAudienceProvider(),
  MANUAL: new ManualAudienceProvider(),
};

export function getAudienceProvider(providerType: string): AudienceProvider {
  const provider = providers[providerType];
  if (!provider) {
    throw new Error(`Unknown audience provider type: ${providerType}. Available: ${Object.keys(providers).join(', ')}`);
  }
  return provider;
}

/**
 * Register a new audience provider (for future integrations)
 */
export function registerAudienceProvider(providerType: string, provider: AudienceProvider): void {
  providers[providerType] = provider;
}
