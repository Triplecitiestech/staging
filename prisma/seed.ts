// Database Seed Script
// Populates initial data for Triple Cities Tech Project Status Platform

import { PrismaClient, StaffRole, ProjectType } from '@prisma/client'
import { withAccelerate } from '@prisma/extension-accelerate'
import bcrypt from 'bcryptjs'

// Prisma 7 with Accelerate - use accelerateUrl parameter
const prisma = new PrismaClient({
  accelerateUrl: process.env.PRISMA_DATABASE_URL || process.env.DATABASE_URL
}).$extends(withAccelerate())

async function main() {
  console.log('🌱 Starting database seed...\n')

  // ============================================
  // 1. CREATE ADMIN STAFF USER
  // ============================================
  console.log('👤 Creating admin staff user...')

  const adminEmail = process.env.ADMIN_EMAIL || 'admin@triplecitiestech.com'
  const adminName = process.env.ADMIN_NAME || 'Triple Cities Tech Admin'

  const adminUser = await prisma.staffUser.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      name: adminName,
      role: StaffRole.ADMIN,
      isActive: true,
    },
  })
  console.log(`✅ Admin user created: ${adminUser.email}\n`)

  // ============================================
  // 2. CREATE COMPANIES (from legacy portal)
  // ============================================
  console.log('🏢 Creating companies...')

  // Ecospect
  const ecospectPassword = process.env.ONBOARDING_PASSWORD_ECOSPECT || 'YourSecurePassword123!'
  const ecospectHash = await bcrypt.hash(ecospectPassword, 12)

  const ecospect = await prisma.company.upsert({
    where: { slug: 'ecospect' },
    update: {},
    create: {
      slug: 'ecospect',
      displayName: 'Ecospect',
      primaryContact: '',
      contactTitle: '',
      contactEmail: '',
      passwordHash: ecospectHash,
    },
  })
  console.log(`✅ Company created: ${ecospect.displayName}`)

  // All Spec Finishing
  const allSpecPassword = process.env.ONBOARDING_PASSWORD_ALL_SPEC_FINISHING || 'AnotherSecurePass456!'
  const allSpecHash = await bcrypt.hash(allSpecPassword, 12)

  const allSpec = await prisma.company.upsert({
    where: { slug: 'all-spec-finishing' },
    update: {},
    create: {
      slug: 'all-spec-finishing',
      displayName: 'All Spec Finishing',
      primaryContact: '',
      contactTitle: '',
      contactEmail: '',
      passwordHash: allSpecHash,
    },
  })
  console.log(`✅ Company created: ${allSpec.displayName}\n`)

  // ============================================
  // 3. CREATE PROJECT TEMPLATES
  // ============================================
  console.log('📋 Creating project templates...')

  // Template 1: Microsoft 365 Migration
  const m365Template = await prisma.projectTemplate.upsert({
    where: { id: 'template-m365-migration' },
    update: {},
    create: {
      id: 'template-m365-migration',
      name: 'Microsoft 365 Migration',
      description: 'Standard M365 migration with email, file sharing, and security setup',
      projectType: ProjectType.M365_MIGRATION,
      createdBy: adminUser.email,
      phasesJson: [
        {
          title: 'Discovery & Planning',
          description: 'Assess current environment and plan migration strategy',
          estimatedDays: 3,
          owner: 'TCT',
          tasks: [
            'Inventory current email system',
            'Document user accounts and distribution lists',
            'Review security requirements',
            'Create migration timeline',
          ],
        },
        {
          title: 'Microsoft 365 Setup',
          description: 'Configure M365 tenant and licenses',
          estimatedDays: 2,
          owner: 'TCT',
          tasks: [
            'Create M365 tenant',
            'Purchase and assign licenses',
            'Configure DNS records',
            'Set up security policies',
          ],
        },
        {
          title: 'Email Migration',
          description: 'Migrate email data to Exchange Online',
          estimatedDays: 5,
          owner: 'BOTH',
          tasks: [
            'Set up migration endpoint',
            'Create migration batches',
            'Migrate mailboxes',
            'Verify email delivery',
          ],
        },
        {
          title: 'User Training',
          description: 'Train staff on M365 tools',
          estimatedDays: 2,
          owner: 'TCT',
          tasks: [
            'Schedule training sessions',
            'Conduct Outlook training',
            'Conduct Teams training',
            'Provide documentation',
          ],
        },
        {
          title: 'Final Cutover',
          description: 'Complete migration and decommission old system',
          estimatedDays: 1,
          owner: 'BOTH',
          tasks: [
            'Update MX records',
            'Verify all users can send/receive',
            'Archive old system',
            'Complete post-migration checklist',
          ],
        },
      ],
    },
  })
  console.log(`✅ Template created: ${m365Template.name}`)

  // Template 2: New Client Onboarding
  const onboardingTemplate = await prisma.projectTemplate.upsert({
    where: { id: 'template-client-onboarding' },
    update: {},
    create: {
      id: 'template-client-onboarding',
      name: 'New Client Onboarding',
      description: 'Standard onboarding process for new managed services clients',
      projectType: ProjectType.ONBOARDING,
      createdBy: adminUser.email,
      phasesJson: [
        {
          title: 'Initial Assessment',
          description: 'Understand client environment and needs',
          estimatedDays: 5,
          owner: 'TCT',
          tasks: [
            'Network discovery scan',
            'Document hardware inventory',
            'Review software licenses',
            'Assess security posture',
            'Create service delivery plan',
          ],
        },
        {
          title: 'Agreement & Documentation',
          description: 'Finalize contracts and documentation',
          estimatedDays: 3,
          owner: 'BOTH',
          tasks: [
            'Review and sign MSA',
            'Set up billing in ConnectWise',
            'Create client documentation',
            'Establish communication protocols',
          ],
        },
        {
          title: 'Monitoring Setup',
          description: 'Deploy RMM and monitoring tools',
          estimatedDays: 3,
          owner: 'TCT',
          tasks: [
            'Install RMM agents',
            'Configure monitoring alerts',
            'Set up backup verification',
            'Test remote access',
          ],
        },
        {
          title: 'Security Baseline',
          description: 'Implement baseline security controls',
          estimatedDays: 5,
          owner: 'TCT',
          tasks: [
            'Deploy antivirus/EDR',
            'Configure firewall rules',
            'Enable MFA where possible',
            'Implement password policy',
            'Schedule security awareness training',
          ],
        },
        {
          title: 'Transition Complete',
          description: 'Finalize onboarding and begin regular service',
          estimatedDays: 2,
          owner: 'BOTH',
          tasks: [
            'Conduct client kickoff meeting',
            'Provide client portal access',
            'Schedule quarterly business review',
            'Close onboarding project',
          ],
        },
      ],
    },
  })
  console.log(`✅ Template created: ${onboardingTemplate.name}`)

  // Template 3: TCT Fortress Onboarding
  const fortressTemplate = await prisma.projectTemplate.upsert({
    where: { id: 'template-tct-fortress' },
    update: {},
    create: {
      id: 'template-tct-fortress',
      name: 'TCT Fortress Onboarding',
      description: 'Comprehensive security implementation for Fortress security stack',
      projectType: ProjectType.FORTRESS,
      createdBy: adminUser.email,
      phasesJson: [
        {
          title: 'Security Assessment',
          description: 'Evaluate current security posture',
          estimatedDays: 5,
          owner: 'TCT',
          tasks: [
            'Conduct vulnerability scan',
            'Review security policies',
            'Assess compliance requirements',
            'Create security roadmap',
          ],
        },
        {
          title: 'Endpoint Protection',
          description: 'Deploy advanced endpoint security',
          estimatedDays: 3,
          owner: 'TCT',
          tasks: [
            'Deploy EDR solution',
            'Configure threat detection',
            'Set up automated response',
            'Test endpoint protection',
          ],
        },
        {
          title: 'Network Security',
          description: 'Implement network security controls',
          estimatedDays: 5,
          owner: 'TCT',
          tasks: [
            'Configure next-gen firewall',
            'Implement network segmentation',
            'Deploy DNS filtering',
            'Set up VPN for remote access',
          ],
        },
        {
          title: 'Identity & Access',
          description: 'Strengthen identity management',
          estimatedDays: 4,
          owner: 'BOTH',
          tasks: [
            'Implement MFA across all services',
            'Configure conditional access',
            'Review privileged accounts',
            'Set up identity monitoring',
          ],
        },
        {
          title: 'Backup & Recovery',
          description: 'Ensure data protection and recovery capabilities',
          estimatedDays: 3,
          owner: 'TCT',
          tasks: [
            'Deploy immutable backups',
            'Test restore procedures',
            'Document recovery runbooks',
            'Configure backup monitoring',
          ],
        },
        {
          title: 'Security Monitoring',
          description: 'Establish 24/7 security monitoring',
          estimatedDays: 3,
          owner: 'TCT',
          tasks: [
            'Configure SIEM',
            'Set up security alerts',
            'Establish SOC procedures',
            'Create incident response plan',
          ],
        },
        {
          title: 'User Training',
          description: 'Train users on security best practices',
          estimatedDays: 2,
          owner: 'TCT',
          tasks: [
            'Conduct security awareness training',
            'Run phishing simulation',
            'Provide security guidelines',
            'Schedule ongoing training',
          ],
        },
      ],
    },
  })
  console.log(`✅ Template created: ${fortressTemplate.name}\n`)

  console.log('✨ Database seed completed successfully!\n')
  console.log('Summary:')
  console.log(`  - Staff Users: 1 (${adminUser.email})`)
  console.log(`  - Companies: 2 (Ecospect, All Spec Finishing)`)
  console.log(`  - Project Templates: 3 (M365 Migration, Client Onboarding, TCT Fortress)`)
  console.log('')
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
