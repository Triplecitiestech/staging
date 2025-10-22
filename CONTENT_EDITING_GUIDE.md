# Triple Cities Tech - Content Editing Guide

**Prepared by BJANDCO for TCT**  
**Last Updated:** October 3, 2025

---

## 📋 Table of Contents

1. [Quick Start Guide](#quick-start-guide)
2. [Content Structure Overview](#content-structure-overview)
3. [Page-by-Page Content Guide](#page-by-page-content-guide)
4. [Configuration Files](#configuration-files)
5. [GitHub Editing Guidelines](#github-editing-guidelines)
6. [Content Guidelines & Best Practices](#content-guidelines--best-practices)
7. [Troubleshooting](#troubleshooting)

---

## 🚀 Quick Start Guide

### For Non-Technical Users
1. **Navigate to the file** you want to edit in GitHub
2. **Click the pencil icon** (✏️) to edit
3. **Make your changes** directly in the text editor
4. **Scroll down** to commit changes
5. **Add a description** of what you changed
6. **Click "Commit changes"**

---

## 📁 Content Structure Overview

The website content is organized across several key areas:

### Main Pages
- **Homepage** (`src/app/page.tsx`) - Hero, value propositions, testimonials
- **About** (`src/app/about/page.tsx`) - Company story, values, team
- **Services** (`src/app/services/page.tsx`) - Service offerings and descriptions
- **Industries** (`src/app/industries/page.tsx`) - Industry-specific solutions
- **Contact** (`src/app/contact/page.tsx`) - Contact form and information

### Content Configuration Files
- **Site Config** (`src/config/site.ts`) - Basic company information
- **Contact Config** (`src/config/contact.ts`) - Contact details
- **Data Constants** (`src/constants/data.ts`) - Navigation and contact info
- **Services Data** (`src/constants/services.ts`) - Service descriptions and features

---

## 📄 Page-by-Page Content Guide

### 🏠 Homepage (`src/app/page.tsx`)

The homepage is composed of several sections. Content is managed in individual component files:

#### Hero Section (`src/components/sections/Hero.tsx`)
**Current Content:**
- **Main Headline:** "Triple Cities Tech"
- **Subheadline:** "We turn IT into a competitive advantage."
- **Description:** "As your managed IT partner, we help you operate smarter, safer, and more efficiently with clarity, stability, and strategic technology alignment that drives real ROI."
- **Status Words:** READY, ACTIVE, ONLINE, SECURE (rotating)

**To Edit:** Modify the text directly in the Hero.tsx file

#### Target Client Value Section (`src/components/sections/TargetClientValue.tsx`)
**Content:** Value propositions for target clients

#### Prospect Engagement Section (`src/components/sections/ProspectEngagement.tsx`)
**Content:** Engagement strategies and benefits

#### Streamlined Process Section (`src/components/sections/StreamlinedProcess.tsx`)
**Content:** Process descriptions and workflow

#### Services Summary Section (`src/components/sections/ServicesSummary.tsx`)
**Content:** Overview of main services

#### Testimonials Section (`src/components/sections/Testimonials.tsx`)
**Current Testimonials:**
1. "Triple Cities Tech transformed how we manage our IT — faster onboarding, no more surprises, and a team that actually understands our business." - Construction Firm CEO
2. "They handle everything. I don't have to think about IT anymore. And our team is working more efficiently than ever." - Healthcare Practice Manager
3. "The cybersecurity upgrades and cloud migration made an immediate impact. We sleep better at night." - Manufacturing Operations Director

**To Edit:** Modify the `testimonials` array in Testimonials.tsx

---

### 🏢 About Page (`src/app/about/page.tsx`)

#### Company Story Section
**Current Content:**
- **Founded:** 2017
- **Mission:** "We believe small and mid-sized businesses deserve enterprise-grade IT without the complexity, cost, or frustration."
- **Story:** After years of working in larger MSPs, founder saw pattern of one-size-fits-all solutions that didn't fit client needs.

#### Company Values
**Current Values:**
1. **Built for Small Business** - Specialize in 20–50 person teams
2. **Security Without Headaches** - Strong cybersecurity without jargon
3. **Automation with Purpose** - Reduce errors, increase speed
4. **Partnership, Not Just Support** - Strategic guidance and prevention
5. **Trust, Impact, and the Ride** - Core values: Earn trust, Be impactful, Enjoy the ride

#### Target Clients
**Current Client Types:**
- Construction firms needing rugged, mobile-ready IT support
- Healthcare providers looking for HIPAA-compliant solutions
- Manufacturers requiring stable, secure infrastructure
- Professional service firms needing efficient, secure workflows

#### Contact Information
**Current Details:**
- **Phone:** (607) 222-TCT1
- **Email:** info@triplecitiestech.com
- **Website:** www.triplecitiestech.com

---

### 🛠️ Services Page (`src/app/services/page.tsx`)

Content is managed in `src/constants/services.ts`:

#### Service Offerings
**Current Services:**

1. **Managed IT Services**
   - Subtitle: "End-to-end support for your entire IT environment."
   - Features: 24/7 support, help desk, device management, proactive updates
   - Description: "We take ownership of your technology — so your team can stay focused and productive."

2. **Cybersecurity & Compliance**
   - Subtitle: "Security that's proactive, not reactive."
   - Features: MDR, SIEM monitoring, risk assessments, HIPAA/CMMC/NIST readiness
   - Description: "Protect your business, your data, and your reputation — without losing sleep."

3. **Cloud Services**
   - Subtitle: "Flexible, reliable cloud platforms for modern businesses."
   - Features: Microsoft 365, SharePoint, cloud migration, backup/recovery
   - Description: "We make the cloud simple, secure, and built for your workflow."

4. **IT Strategy & Virtual CIO**
   - Subtitle: "Turn IT into a competitive advantage."
   - Features: Quarterly planning, budgeting, vendor management, business alignment
   - Description: "You get executive-level IT strategy — without executive-level costs."

5. **AI Consulting**
   - Subtitle: "Navigate the AI landscape with confidence."
   - Features: AI education, use case identification, risk assessment, tool evaluation
   - Description: "We help you demystify AI so you can make smart, sustainable decisions — not just chase trends."

6. **Employee Onboarding Automation**
   - Subtitle: "Speed, consistency, and security — built into your onboarding process."
   - Features: Automated account creation, role-based access, device setup, offboarding
   - Description: "Onboarding new employees doesn't have to take days. With us, it takes minutes."

7. **Industry-Specific Solutions**
   - Subtitle: "We tailor every deployment to your field:"
   - Features: Construction, Healthcare, Manufacturing, Professional Services solutions
   - Description: "Your industry is unique. So is your technology plan."

#### Challenge Identification
**Current Challenges:**
1. Network & Connectivity
2. Cybersecurity
3. System Reliability
4. Business Growth
5. Industry Compliance
6. Process Automation

---

### 🏭 Industries Page (`src/app/industries/page.tsx`)

**Current Industries:**

1. **Construction**
   - Subtitle: "You're managing remote crews, juggling multiple sites, and racing deadlines — and IT should never slow you down."
   - Features: Secure project data, automated onboarding, rugged tech, streamlined systems
   - Description: "With Triple Cities Tech, your technology becomes as dependable as your crew."

2. **Healthcare**
   - Subtitle: "From HIPAA compliance to EHR systems, IT in healthcare must be fast, secure, and dependable."
   - Features: Patient data protection, uptime improvement, automated onboarding, compliance
   - Description: "We make sure your IT supports patient care — not distracts from it."

3. **Manufacturing**
   - Subtitle: "Your production lines rely on stability and precision — and so should your technology."
   - Features: Infrastructure protection, IoT security, compliance solutions, ERP support
   - Description: "Get IT that's built to move as fast as your operations."

4. **Professional Services**
   - Subtitle: "Whether you're managing sensitive client data or ensuring business continuity, we help legal, accounting, architecture, and other service firms."
   - Features: Information protection, automated onboarding, workflow streamlining, bottleneck elimination
   - Description: "We make sure your tools work as hard as you do — so you can focus on delivering results."

---

### 📞 Contact Page (`src/app/contact/page.tsx`)

#### Contact Form
**Form Fields:**
- Name (required)
- Email (required)
- Phone (optional)
- Company (optional)
- Message (required)

#### Contact Information
**Current Details:**
- **Phone:** +1 (607) 555-0123
- **Email:** info@triplecitiestech.com
- **Address:** 123 Main Street, Binghamton, NY 13901
- **Hours:** Office Hours: Monday–Friday, 8:30am–5:00pm
- **Emergency Support:** Available 24/7 for managed clients

---

## ⚙️ Configuration Files

### Site Configuration (`src/config/site.ts`)
**Key Settings:**
- Company name: "Triple Cities Tech"
- Description: "Professional IT management services for small and mid-sized businesses in Central New York"
- URL: "https://triplecitiestech.com"
- Contact details
- Social media links
- SEO settings

### Contact Configuration (`src/config/contact.ts`)
**Current Settings:**
- Email: info@triplecitiestech.com (from environment variable)
- Phone: (607) 222-TCT1
- Company: Triple Cities Tech
- Website: https://www.triplecitiestech.com

### Data Constants (`src/constants/data.ts`)
**Navigation Structure:**
- Desktop: Industries, Services, About
- Mobile: Industries, Services, About, Get Support
- Footer: Services, Industries, Company links

**Contact Information:**
- Phone: +1 (607) 555-0123
- Email: info@triplecitiestech.com
- Address: 123 Main Street, Binghamton, NY 13901

---

## 📝 GitHub Editing Guidelines

### How to Edit Content

1. **Navigate to the file** you want to edit
2. **Click the pencil icon** (✏️) in the top-right corner
3. **Make your changes** in the text editor
4. **Preview changes** if needed
5. **Scroll to the bottom** of the page
6. **Add a commit message** describing your changes
7. **Click "Commit changes"**

### Best Practices for GitHub Editing

#### Commit Messages
- Use clear, descriptive messages
- Examples:
  - "Update company phone number"
  - "Add new service description"
  - "Fix typo in hero section"

#### File Organization
- **Text content:** Edit directly in component files
- **Configuration:** Update config files for site-wide changes
- **Images:** Upload to `/public/` directory
- **Styling:** Avoid editing CSS unless necessary

#### Testing Changes
- Always preview changes before committing
- Test on different screen sizes if possible
- Check for broken links or formatting issues

---

## ✍️ Content Guidelines & Best Practices

### Writing Style
- **Tone:** Professional, approachable, confident
- **Voice:** First person plural ("we", "our")
- **Target Audience:** Small to mid-sized business owners and decision-makers
- **Length:** Concise but informative

### Key Messaging
- **Value Proposition:** "We turn IT into a competitive advantage"
- **Target Market:** 20-50 person businesses
- **Geographic Focus:** Central New York
- **Core Benefits:** Clarity, stability, performance

### Content Updates
- **Keep messaging consistent** across all pages
- **Update contact information** in all relevant files
- **Maintain brand voice** and tone
- **Test all links** after making changes

### SEO Considerations
- **Use relevant keywords** naturally in content
- **Keep meta descriptions** under 160 characters
- **Include location-based terms** (Central New York, Binghamton)
- **Update page titles** to include target keywords

---

## 🔧 Troubleshooting

### Common Issues

#### Content Not Updating
- **Check file path** - ensure you're editing the correct file
- **Verify syntax** - look for missing quotes or brackets
- **Clear browser cache** - hard refresh the page

#### Formatting Problems
- **Check indentation** - maintain consistent spacing
- **Verify HTML tags** - ensure proper opening/closing tags
- **Test responsiveness** - check on different screen sizes

#### Contact Form Issues
- **Check API configuration** - verify contact form settings
- **Test form submission** - ensure all required fields work
- **Verify email settings** - check contact configuration

### Getting Help

#### For Technical Issues
- Check the browser console for errors
- Review the file syntax carefully
- Test changes in a development environment

#### For Content Questions
- Refer to this guide for content locations
- Check existing content for consistency
- Maintain the established brand voice

---

## 📞 Support Contacts

**For Technical Support:**
- Contact the development team
- Reference this guide for content locations

**For Content Questions:**
- Review this guide thoroughly
- Check existing content for examples
- Maintain brand consistency

---

## 📋 Quick Reference

### Most Common Edits
1. **Contact Information** - Update in `src/config/contact.ts` and `src/constants/data.ts`
2. **Service Descriptions** - Edit in `src/constants/services.ts`
3. **Company Story** - Modify in `src/app/about/page.tsx`
4. **Testimonials** - Update in `src/components/sections/Testimonials.tsx`
5. **Hero Content** - Edit in `src/components/sections/Hero.tsx`

### File Locations
- **Homepage:** `src/app/page.tsx` + component files
- **About:** `src/app/about/page.tsx`
- **Services:** `src/app/services/page.tsx` + `src/constants/services.ts`
- **Industries:** `src/app/industries/page.tsx`
- **Contact:** `src/app/contact/page.tsx`
- **Config:** `src/config/` directory
- **Constants:** `src/constants/` directory

---

*This guide was prepared by BJANDCO for Triple Cities Tech to facilitate easy content management and updates through GitHub.*
