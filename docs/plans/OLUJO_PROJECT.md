# Olujo Brand Awareness Project - Technical Documentation

**Project Owner**: Adam (Olujo)
**Operations Lead**: Kellan (Olujo)
**Technical Lead**: Kurtis (Triple Cities Tech)
**Status**: Phase 1 (Planning)
**Start Date**: TBD
**Primary Markets**: New York, Florida

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Project Purpose](#project-purpose)
3. [Team Structure](#team-structure)
4. [Phase Breakdown](#phase-breakdown)
5. [Technical Requirements](#technical-requirements)
6. [CRM Architecture](#crm-architecture)
7. [Data Model](#data-model)
8. [Business Rules](#business-rules)
9. [Commission System](#commission-system)
10. [Documentation Pages](#documentation-pages)

---

## Executive Summary

The Olujo Brand Awareness Project is a structured, proof-driven awareness initiative designed to increase brand familiarity for Olujo Tequila among liquor stores in the United States.

**This is NOT a sales program.** Contractors will repeatedly and consistently ask one question: "Do you carry Olujo Tequila?"

The goal is brand recognition, not immediate sales. Downstream purchases occur naturally through existing channels, with commissions attributed to contractors who documented their outreach.

---

## Project Purpose

### Primary Objective
Increase brand awareness and familiarity for Olujo Tequila among liquor stores by creating repeated, documented touchpoints.

### Success Criteria
- ✓ High coverage of liquor stores in target markets
- ✓ Clean, provable outreach data with full audit trail
- ✓ Brand name recognition increases over time
- ✓ Downstream purchases can be fairly attributed
- ✓ Zero selling behavior by contractors (strict compliance)

### What This Is
- Awareness-only phone calls to liquor stores
- Social media engagement (Instagram & Facebook)
- Manual proof logging (call transcripts + activity logs)
- CRM-based attribution and reporting
- Commission tracking for post-awareness purchases

### What This Is NOT
- ❌ Selling or pitching
- ❌ Distributor outreach
- ❌ Price discussion
- ❌ Order placement
- ❌ Negotiation of terms

---

## Team Structure

### Adam — Executive Owner (Olujo)
**Responsibilities**:
- Owns brand representation, messaging approval, final business decisions
- Confirms downstream purchases and bottle counts
- Strategic oversight and approval
- Final decisions on scope changes

### Kellan — Operations Lead (Olujo)
**Responsibilities**:
- Manages day-to-day execution
- Oversees contractors (hiring, training, QA)
- Reviews reporting and coverage metrics
- Acts as liaison between Olujo and technical team
- Day-to-day coordination with reps
- Feedback on scripts and store responses
- Purchase validation and commission processing
- Coordination with Kurtis on system needs

### Kurtis — Technical Lead (Triple Cities Tech)
**Responsibilities**:
- Designs and builds all systems
- Owns CRM, database, hosting, security, data integrity
- Defines and enforces statuses, workflows, attribution logic
- CRM design & implementation
- Database schema and statuses
- Hosting, security, backups
- Data integrity, auditability
- Tooling selection and delivery
- Operational guardrails inside the system

---

## Phase Breakdown

### Phase 1: Alignment & Governance (REQUIRED FIRST)
**Goal**: Lock scope, rules, ownership, and prevent rework.

**Deliverables**:
- Final operating rules (what reps can/can't say)
- Final lead statuses (frozen, no changes post-launch)
- Commission attribution rules (last-touch, verified)
- Contractor requirements (alias, socials, hours)
- Project roles formally acknowledged

**Owners**: Adam (final approval), Kellan (reviews + coordinates), Kurtis (documents + enforces)

**Exit Criteria**:
- Adam signs off on scope
- No open "we'll decide later" items

---

### Phase 2: Sales & Awareness Playbook (NON-TECH)
**Goal**: Create a repeatable, compliant human process before tooling.

**Deliverables**:
- Awareness-only call scripts
- Allowed experiential responses ("orange case", NYC restaurant, etc.)
- Objection handling (busy, not interested, what is it, are you selling)
- Social media commenting SOP (strict, non-spam)
- Proof requirements (transcripts + logging)

**Owners**: Adam (brand approval), Kellan (operational feedback), Kurtis (structure + compliance framing)

**Exit Criteria**:
- Script can be read by any rep with no interpretation
- Kellan can explain the rules in one minute
- Adam confirms brand comfort

---

### Phase 3: Hiring & Onboarding Pipeline
**Goal**: Recruit reps who sound natural, look legitimate, and can follow rules.

**Deliverables**:
- onlinejobs.ph job post
- Interview rubric (English clarity, tone, socials)
- Alias policy (American-sounding first name)
- Social profile requirements (IG + FB review)
- Contractor agreement (temporary, hourly + commission)
- Day-1 onboarding checklist

**Owners**: Kellan (interview coordination), Adam (strategic veto only), Kurtis (onboarding SOP + compliance rules)

**Exit Criteria**:
- First 2–3 reps fully trained
- Social profiles approved
- Reps understand "we do NOT sell"

---

### Phase 4: Data Acquisition (Leads)
**Goal**: Build a clean, deduplicated liquor store database for nationwide outreach.

**Scope**:
- Liquor stores only
- Start with New York and Florida simultaneously
- Expand to additional high-value markets based on traction
- Long-term goal: Every liquor store in the United States

**Deliverables**:
- Scraping method determined (AI-based experimental but cost-effective vs. traditional methods)
- Normalized lead dataset with agreed data points:
  - Business name
  - Phone
  - PoC (Point of Contact) name
  - Facebook page
  - Instagram page
- CSV import format finalized
- Data quality validation process established

**Owners**: Kurtis (scraping + normalization), Kellan (spot-check accuracy)

**Exit Criteria**:
- NY and FL datasets imported simultaneously
- No duplicate phone/address conflicts
- Reps can begin calling immediately

---

### Phase 5: CRM Build (MVP)
**Goal**: Create a proof-first CRM that enforces behavior and attribution.

**Core Capabilities**:
- Lead list with mandatory statuses
- Lead detail page with full timeline
- Contact data fields: Business name, Phone, PoC name, Facebook page, Instagram page
- Notes field for rep observations
- Call transcript upload functionality
- Call log with metadata
- Social activity logging (FB messages/posts, IG DMs)
- Rep assignment & last-touch tracking
- Admin-only purchase & commission entry
- Audit-friendly (no deletes)

**Lead Statuses** (frozen, cannot be changed post-launch):
1. New – Uncontacted
2. Called – No Answer
3. Called – Answered – Carries Olujo
4. Called – Answered – Does Not Carry
5. Called – Answered – Unsure
6. Called – Answered – Introduced Olujo
7. Social Comment Posted
8. Social Response – Carries Olujo
9. Social Response – Does Not Carry
10. Do Not Call
11. Needs Review (QA)

**Owners**: Kurtis (end-to-end)

**Exit Criteria**:
- All agreed contact data points implemented
- Reps can complete full workflow in CRM
- Call transcript upload functional
- Proof cannot be skipped
- Admin can verify purchases

---

### Phase 6: Pilot Launch (NY & FL)
**Goal**: Validate the system with real calls and real proof in initial markets.

**Scope**:
- 2–3 reps
- NY and FL simultaneously
- Awareness calls + social outreach (FB & IG)

**Measured**:
- Calls per rep per day
- Answer rate
- Proof compliance (transcripts uploaded)
- Store familiarity reactions
- Script comfort

**Owners**: Kellan (daily ops), Kurtis (system monitoring), Adam (strategic review)

**Exit Criteria**:
- ≥95% proof compliance
- No selling violations
- CRM data clean and usable

---

### Phase 7: Scale Up & Expand Markets
**Goal**: Increase volume and expand to additional markets based on traction.

**Changes**:
- Hire up to 10 reps
- Expand to additional high-value markets
- Increase QA sampling
- Add reporting dashboards

**Deliverables**:
- Rep performance reports
- Coverage reporting (stores touched by market)
- QA flags and coaching notes
- Commission tracking live

**Owners**: Kellan (people + ops), Kurtis (reporting + data integrity), Adam (growth approval)

**Exit Criteria**:
- Consistent quality across reps
- Clear attribution for any purchases
- No operational drift

---

### Phase 8: Purchase Tracking & Commission Processing
**Goal**: Ensure commissions are fair, provable, and undisputed.

**Process**:
1. Kellan's team tracks store purchases
2. Bottle count verified
3. CRM correlates purchase to rep outreach
4. System attributes rep (last-touch within 30 days)
5. Commission calculated ($25 per bottle sold)
6. Payment processed via Gusto

**Owners**: Kellan (validates purchases & processes commissions), Kurtis (system enforcement), Adam (final approval for disputes)

**Exit Criteria**:
- Zero commission disputes
- Every commission tied to documented outreach

---

## Technical Requirements

### CRM Technology Stack (Proposed)
- **Frontend**: Next.js 15 with TypeScript
- **Backend**: Node.js serverless functions (Vercel)
- **Database**: PostgreSQL (Vercel Postgres or similar)
- **ORM**: Prisma
- **Authentication**: NextAuth.js (for Kellan's team)
- **File Storage**: Cloudflare R2 or AWS S3 (for call transcripts)
- **Hosting**: Vercel

### Performance Requirements
- Page load < 2 seconds
- Search/filter leads < 500ms
- Transcript upload max 10MB per file
- Support 10 concurrent users (reps + admin)

### Security Requirements
- HTTPS only
- Role-based access control (reps vs. admin)
- Audit logging for all data changes
- No data deletion (soft deletes only)
- Call transcripts encrypted at rest

---

## CRM Architecture

### User Roles
1. **Contractor**: Can view/update assigned leads, upload transcripts, log activities
2. **Admin (Kellan's team)**: Full access, purchase entry, commission processing, reporting
3. **Read-Only (Adam)**: View-only access to all data, reports, and dashboards

### Core Entities
- **Lead**: Liquor store record
- **Activity**: Timeline entry (call, social, note)
- **Transcript**: Call recording/transcript file
- **Purchase**: Store purchase event
- **Commission**: Commission calculation record
- **Contractor**: User account for reps

---

## Data Model

### Lead Entity
```typescript
{
  id: string
  businessName: string
  phone: string
  pocName: string | null
  facebookPage: string | null
  instagramPage: string | null
  address: string | null
  city: string
  state: string
  status: LeadStatus (enum)
  assignedContractor: string | null
  lastTouchDate: Date | null
  lastTouchContractor: string | null
  createdAt: Date
  updatedAt: Date
}
```

### Activity Entity
```typescript
{
  id: string
  leadId: string
  contractorId: string
  activityType: 'CALL' | 'SOCIAL' | 'NOTE'
  outcome: string
  notes: string | null
  transcriptUrl: string | null
  contactedPerson: string | null
  timestamp: Date
}
```

### Purchase Entity
```typescript
{
  id: string
  leadId: string
  purchaseDate: Date
  bottleCount: number
  attributedContractor: string | null
  commissionAmount: number
  commissionPaid: boolean
  commissionPaidDate: Date | null
  verifiedBy: string
  createdAt: Date
}
```

---

## Business Rules

### Attribution Rules
1. **Last-Touch Attribution**: The contractor who most recently logged an interaction with the store gets credited for the purchase.
2. **30-Day Commission Window**: A purchase must occur within 30 days of the contractor's last logged interaction for them to earn commission.
3. **No Transcript = No Credit**: If the last interaction logged in the CRM does not have a call transcript or logged content, the contractor does not earn commission, even if the interaction is within 30 days.

### Call Logging Rules
After every call, the contractor must:
- ✓ Upload or paste the call transcript into the CRM
- ✓ Update the lead status to one of the approved statuses
- ✓ Log the date and time of the call
- ✓ Note who they spoke to (owner / employee / unknown)
- ✓ Tag themselves as the last-touch rep

### Social Activity Logging Rules
For every Instagram or Facebook message sent, the contractor must:
- ✓ Log the message content in the CRM timeline
- ✓ Update the lead status to "Instagram Message Sent" or appropriate status
- ✓ Tag themselves as the last-touch rep

For every Instagram or Facebook response received, the contractor must:
- ✓ Log the response content in the CRM timeline
- ✓ Update the lead status to "Instagram Response Received" or appropriate status
- ✓ Log a brief summary of the response content

---

## Commission System

### Commission Structure
- **Amount**: $25 one-time commission per store purchase
- **Trigger**: Store makes a purchase within 30 days of last documented interaction
- **Attribution**: Last-touch (most recent contractor with proof)
- **Payment**: Processed via Gusto on bi-weekly pay period

### Commission Eligibility
A contractor earns commission ONLY if:
1. ✓ A verified awareness call exists
2. ✓ Transcript is uploaded in CRM
3. ✓ Contractor is attributed per system rules
4. ✓ Purchase occurs after the awareness touch (within 30 days)
5. ✓ This is the first purchase from this store (one-time commission)

### Edge Cases
- **No Logged Interactions**: No commission paid (organic purchase)
- **Older Than 30 Days**: No commission paid
- **Missing Transcript**: No commission paid, even if within 30 days
- **Disputed Attribution**: Kellan's team reviews CRM timeline, makes final determination
- **Repeat Purchases**: $25 is a one-time payment per store (no repeat commissions)

---

## Documentation Pages

### Admin Portal Pages
Located in `/src/app/admin/projects/olujo-*`

1. **Project Plan** (`/admin/projects/olujo-plan`)
   - Full 8-phase project plan
   - Role definitions
   - Phase deliverables and exit criteria

2. **Executive Summary** (`/admin/projects/olujo-docs/executive-summary`)
   - Project purpose and leadership
   - Scope definition (included/excluded)
   - Geographic rollout
   - Contractor model
   - Success criteria

3. **Call Handling SOP** (`/admin/projects/olujo-docs/call-handling`)
   - Call scripts
   - Objection handling
   - Compliance guidelines

4. **CRM Handling SOP** (`/admin/projects/olujo-docs/crm-handling`)
   - Required lead statuses
   - Call logging rules
   - Social activity logging rules
   - Timeline rules
   - Contractor scope

5. **Hiring Guidelines** (`/admin/projects/olujo-docs/hiring-guidelines`)
   - Job post template
   - Interview rubric
   - Alias policy
   - Social profile requirements

6. **Contractor Agreement** (`/admin/projects/olujo-docs/contractor-agreement`)
   - Terms of engagement
   - Work hours, pay structure
   - Commission rules

7. **Purchase Tracking SOP** (`/admin/projects/olujo-docs/purchase-tracking`)
   - Commission structure
   - Attribution rules
   - Purchase tracking process
   - Edge cases and special situations

---

## Implementation Timeline

**Phase 1 (Current)**: Documentation and alignment
**Phase 2-3**: Playbook and hiring preparation
**Phase 4**: Data acquisition (NY + FL leads)
**Phase 5**: CRM development (4-6 weeks estimated)
**Phase 6**: Pilot launch (2-3 reps, 2-4 weeks)
**Phase 7**: Scale-up decision point
**Phase 8**: Commission processing goes live

---

## Key Principles

This project does **not** win by persuasion.

It wins by:
1. **Repetition** - Consistent, repeated touchpoints
2. **Recognition** - Brand familiarity over time
3. **Proof** - Every interaction documented
4. **Attribution** - Fair, transparent commission system

**If the data is clean, the brand grows.**

---

## Contact

**For technical questions**: Kurtis (Triple Cities Tech)
**For operational questions**: Kellan (Olujo)
**For strategic decisions**: Adam (Olujo)

---

**Last Updated**: 2026-01-29
