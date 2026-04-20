// Canonical referral agreement templates. Templates are stored in code
// (not DB) so admins can always pull a fresh copy and edit per agent
// without touching other agents' signed agreements.

const TCT_ADDRESS_BLOCK = '1109 Monroe St, Endicott, NY 13760'

export type AgreementTemplateKey = 'short' | 'full'

export interface AgreementTemplate {
  key: AgreementTemplateKey
  label: string
  description: string
  body: string
}

// Plain-text substitution token the server replaces with the live
// reference URL before sending the template to the admin UI.
const FULL_URL_TOKEN = '{FULL_AGREEMENT_URL}'

const SHORT_BODY = `TRIPLE CITIES TECH — REFERRAL AGENT AGREEMENT (SUMMARY)

This one-page summary is between Triple Cities Tech, ${TCT_ADDRESS_BLOCK} ("TCT"), and the individual identified in the electronic signature block below ("the Agent"). It incorporates by reference the complete Referral Agent Agreement available at ${FULL_URL_TOKEN} (the "Full Agreement"). In the event of any conflict, the Full Agreement controls. By signing this summary, the Agent accepts both documents.

1. ROLE. The Agent introduces prospective clients to TCT. The Agent does not sell, quote, or sign contracts on TCT's behalf. TCT services customers throughout the United States, including customers whose employees or operations may be located internationally.

2. QUALIFIED REFERRAL. A referral qualifies only if the Agent (a) submits it through the TCT agent portal before TCT has any active pipeline record for that business, (b) the business was not a TCT client within the preceding 12 months, and (c) the business executes and pays under a recurring managed-services agreement with TCT.

3. COMMISSION. For each Qualified Referral, TCT pays the Agent a one-time commission equal to 100% of the client's third monthly invoice, once TCT has received the third payment in full (example: $3,500/month agreement → $3,500 commission). Payment is made within thirty (30) days after the month in which that third payment clears.

4. NO CLAWBACK. Once earned under Section 3, a commission is not reduced or recovered if the client later cancels, downgrades, or fails to renew.

5. INDEPENDENT CONTRACTOR. The Agent is an independent contractor, not an employee of TCT. The Agent receives no salary, benefits, or reimbursement, and is solely responsible for the Agent's own taxes on commissions. The Agent has no authority to bind TCT.

6. CONDUCT. The Agent will obtain each prospect's permission before submitting their information, will comply with all applicable laws (including anti-spam and privacy laws), will not make false or unauthorized statements about TCT, and will not submit a business in which the Agent (or an immediate family member) holds a controlling interest without TCT's prior written consent.

7. CONFIDENTIALITY. The Agent will keep TCT's non-public information (including pricing, pipeline, and client details) confidential both during and after the term of this Agreement, as more fully described in the Full Agreement.

8. TERM. Either party may end this Agreement at any time on written notice. Commissions earned before termination remain payable; commissions on referrals still in-flight are handled under Section 10 of the Full Agreement.

9. GOVERNING LAW. This Agreement is governed by the laws of the State of New York. Exclusive venue for any dispute is the state and federal courts located in Broome County, New York.

10. CONTACT. Notices to TCT: sales@triplecitiestech.com.

ELECTRONIC SIGNATURE. By typing the Agent's full legal name in the portal's signature field and submitting this Agreement, the Agent adopts the typed name as a legally binding electronic signature under the E-SIGN Act and the New York Electronic Signatures and Records Act, confirms the Agent has read and agrees to this summary and the Full Agreement at ${FULL_URL_TOKEN}, and intends the electronic signature to have the same legal effect as a handwritten signature.`

const FULL_BODY = `TRIPLE CITIES TECH — REFERRAL AGENT AGREEMENT

This Referral Agent Agreement ("Agreement") is entered into by and between Triple Cities Tech, with its principal place of business at ${TCT_ADDRESS_BLOCK} ("TCT"), and the individual identified in the electronic signature block below ("the Agent"). This Agreement is effective as of the date of the Agent's electronic signature ("Effective Date").

1. BACKGROUND

TCT provides managed information technology services, cybersecurity, cloud, backup, compliance, and related professional services to businesses throughout the United States, including businesses whose employees or operations may be located internationally. TCT wishes to engage referral partners to introduce prospective clients, and the Agent wishes to make such introductions, on the terms set out below.

2. THE REFERRAL PROGRAM

2.1 Introductions, not selling. The Agent's role is limited to introducing prospective clients ("Prospects") to TCT. The Agent is not required or expected to quote, negotiate, price, scope, deliver, or support any TCT services.

2.2 Submission. The Agent shall submit each referral through TCT's agent portal, providing the Prospect's business name, primary contact, contact details, and such other information as the portal requests. The Agent represents that, prior to each submission, the Agent has obtained the Prospect's permission to share that information with TCT.

2.3 TCT's discretion. TCT has sole discretion over whether and how to engage any Prospect, including pricing, service scope, and the decision to accept or decline any opportunity. TCT may, in good faith, decline a referral for any reason.

3. QUALIFIED REFERRALS

A referral is a "Qualified Referral" only if all of the following are true:

(a) the Agent submits the referral through the TCT agent portal before TCT has any active engagement, pipeline record, or prior conversation with that Prospect;

(b) the Prospect was not a current or former TCT client within the 12 months preceding submission;

(c) the Prospect executes a recurring managed-services agreement with TCT (a "Signed Agreement") as a direct result of the Agent's introduction; and

(d) the Prospect pays TCT in accordance with Section 4 below.

One-time project work, hardware sales, or non-recurring engagements are not Qualified Referrals unless they convert into a recurring Signed Agreement.

4. COMMISSION

4.1 Amount. For each Qualified Referral, TCT will pay the Agent a one-time commission equal to 100% of the Prospect's third (3rd) recurring monthly invoice under the Signed Agreement ("Commission"). For example, if the Prospect's Signed Agreement is $3,500 per month and TCT has received the Prospect's first, second, and third monthly payments in full, the Commission payable to the Agent is $3,500.

4.2 When earned. The Commission is earned only after TCT has received the Prospect's third (3rd) monthly payment in full and cleared funds.

4.3 When paid. TCT will pay the earned Commission to the Agent within thirty (30) days after the end of the calendar month in which the third payment clears, via ACH, check, or other mutually agreed method.

4.4 No clawback after earned. Once a Commission is earned under Section 4.2, later cancellation, non-renewal, or downgrade of the Signed Agreement does not reduce or claw back that Commission.

4.5 Partial payments, discounts, credits. Commission is calculated on the actual amount TCT receives and retains for the third monthly invoice, net of refunds, credits, chargebacks, and sales tax. Pass-through hardware, licensing, or third-party costs billed through TCT are excluded from the calculation.

4.6 No other compensation. Except for the Commission described in this Section 4, the Agent is not entitled to any salary, wages, benefits, bonuses, expense reimbursement, equity, or other compensation from TCT.

5. ATTRIBUTION AND CONFLICTS

5.1 First-submitted wins. If two or more agents submit the same Prospect, credit is assigned to the first agent whose submission was received through the TCT agent portal, provided the Prospect was not already in TCT's pipeline at that time.

5.2 Pipeline precedence. A Prospect that was already in TCT's pipeline, under active conversation, or a current or former client within the preceding 12 months is not eligible for Commission regardless of submission order.

5.3 Good-faith disputes. TCT will resolve attribution disputes in good faith and in its reasonable discretion. TCT's determination is final.

6. INDEPENDENT CONTRACTOR

6.1 The Agent is an independent contractor. Nothing in this Agreement creates an employment, partnership, joint-venture, franchise, or agency relationship between the Agent and TCT.

6.2 The Agent has no authority to bind TCT, to accept contracts on TCT's behalf, to quote pricing, to commit TCT to any scope of work, or to represent to any third party that the Agent has such authority.

6.3 The Agent is solely responsible for all federal, state, and local taxes on Commissions received. TCT will issue a Form 1099 (or successor form) for Commissions paid, where required by law.

6.4 The Agent shall not hold the Agent out as a TCT employee, officer, or representative. The Agent may describe the Agent's role as "referral partner" or "independent referral agent" of TCT.

7. AGENT REPRESENTATIONS AND COMPLIANCE

The Agent represents, warrants, and covenants that:

(a) the Agent has full authority to enter into this Agreement;

(b) the Agent will obtain the Prospect's permission before submitting the Prospect's contact information to TCT;

(c) the Agent will comply with all applicable laws in performing under this Agreement, including anti-spam laws (including CAN-SPAM and TCPA), privacy laws (including state privacy laws applicable to the Prospect's jurisdiction and, where applicable, international privacy laws), and consumer-protection laws;

(d) the Agent will not make any false, misleading, or unauthorized statements about TCT's services, capabilities, pricing, or personnel;

(e) the Agent will not offer or pay any bribe, kickback, or inducement to any Prospect or Prospect's employee in connection with a referral;

(f) the Agent will not submit as a referral any entity in which the Agent, an immediate family member, or a common-ownership affiliate has a majority ownership or controlling interest, without TCT's prior written consent.

8. CONFIDENTIALITY

8.1 "Confidential Information" means non-public information that TCT designates as confidential or that a reasonable person would understand to be confidential, including TCT pricing, client lists, pipeline data, service details, and this Agreement's commercial terms.

8.2 The Agent will not disclose Confidential Information to any third party and will use it only to perform under this Agreement. This obligation survives termination for two (2) years.

8.3 Confidential Information does not include information that is publicly known through no fault of the Agent, was lawfully known to the Agent before disclosure by TCT, or is independently developed without use of TCT's Confidential Information.

9. INTELLECTUAL PROPERTY AND MARKETING

9.1 TCT retains all right, title, and interest in its trademarks, logos, content, and materials ("TCT Marks"). The Agent may use TCT Marks only in the form and context TCT approves in writing and solely to identify the Agent as a TCT referral partner.

9.2 The Agent will not register, use, or bid on any TCT Marks, or any confusingly similar term, as a domain name, social-media handle, or paid-search keyword without TCT's prior written consent.

10. TERM AND TERMINATION

10.1 Term. This Agreement begins on the Effective Date and continues until terminated under this Section 10.

10.2 Termination for convenience. Either party may terminate this Agreement at any time, with or without cause, by giving the other party written notice (email to sales@triplecitiestech.com is sufficient from the Agent; email to the Agent's on-file address is sufficient from TCT).

10.3 Termination for cause. TCT may terminate this Agreement immediately on written notice if the Agent breaches Section 7 (Representations and Compliance), Section 8 (Confidentiality), or Section 9 (IP and Marketing), or otherwise engages in conduct that TCT reasonably believes is harmful to TCT's business or reputation.

10.4 Effect on pending Commissions. On termination:

(a) Commissions that were earned under Section 4.2 before termination remain payable and will be paid in the normal course;

(b) Referrals that were submitted before termination but have not yet reached the third-payment threshold remain eligible to earn a Commission if and when Section 4.2 is later satisfied, provided the Agent was not terminated for cause under Section 10.3;

(c) If the Agent was terminated for cause under Section 10.3, TCT may, at its sole discretion, withhold Commissions on referrals that have not yet been earned as of the termination date.

10.5 Survival. Sections 4.4, 6, 7, 8, 9, 10.4, 11, 12, 13, 14, 15, 16, and 17 survive termination.

11. LIMITATION OF LIABILITY

To the maximum extent permitted by law, TCT's total cumulative liability to the Agent arising out of or related to this Agreement is limited to the total Commissions paid to the Agent under this Agreement during the twelve (12) months immediately preceding the event giving rise to the claim. Neither party is liable for indirect, incidental, consequential, special, or punitive damages, or for lost profits, even if advised of their possibility.

12. INDEMNIFICATION

The Agent will defend, indemnify, and hold harmless TCT and its owners, officers, employees, and affiliates from and against any claims, damages, losses, penalties, and reasonable attorneys' fees arising out of (a) the Agent's breach of this Agreement, (b) the Agent's negligent or willful misconduct, or (c) any unauthorized statements the Agent makes about TCT or its services.

13. NON-SOLICITATION OF CLIENTS

During the term of this Agreement and for twelve (12) months after termination, the Agent will not directly or indirectly solicit, divert, or attempt to divert any TCT client the Agent learned of through this Agreement to any managed-services provider other than TCT. This Section does not restrict the Agent's ordinary social, professional, or employment activities unrelated to managed IT services.

14. GOVERNING LAW AND DISPUTES

This Agreement is governed by the laws of the State of New York, without regard to its conflict-of-laws rules. The parties consent to the exclusive jurisdiction of the state and federal courts located in Broome County, New York, for any dispute arising out of or related to this Agreement. Each party waives any right to a jury trial.

15. NOTICES

Notices to TCT must be sent to sales@triplecitiestech.com or to ${TCT_ADDRESS_BLOCK}. Notices to the Agent will be sent to the email address on file in the TCT agent portal. Email notice is effective on the business day after transmission.

16. ENTIRE AGREEMENT; AMENDMENTS

This Agreement is the entire agreement between the parties regarding its subject matter and supersedes all prior understandings, written or oral. No amendment is effective unless in writing and accepted by both parties (an email acceptance or a new electronically signed version of this Agreement counts as "in writing" for this purpose).

17. ASSIGNMENT; SEVERABILITY; WAIVER

The Agent may not assign this Agreement without TCT's prior written consent. TCT may assign this Agreement to an affiliate or to a successor in a merger, acquisition, or sale of substantially all of its assets. If any provision of this Agreement is held unenforceable, the remaining provisions remain in full force. A party's failure to enforce any right under this Agreement is not a waiver of that right.

18. ELECTRONIC SIGNATURE

The Agent acknowledges that this Agreement is being executed electronically through the TCT agent portal. By typing the Agent's full legal name in the signature field and affirmatively accepting this Agreement in the portal, the Agent:

(a) adopts the typed name as the Agent's legally binding electronic signature under the Electronic Signatures in Global and National Commerce Act (E-SIGN), the New York Electronic Signatures and Records Act, and any other applicable electronic-signature law;

(b) confirms that the Agent has read, understood, and agreed to this Agreement in its entirety; and

(c) intends the electronic signature to have the same legal effect as a handwritten signature.

TCT accepts this Agreement electronically by enabling the Agent's account in the TCT agent portal.`

// Public URL where agents can always read the full-terms reference copy
// referenced by the one-page summary. Absolute URL so the link works inside
// emailed / printed copies of the agreement too.
export function fullAgreementUrl(): string {
  const base = process.env.NEXT_PUBLIC_BASE_URL || 'https://www.triplecitiestech.com'
  return `${base}/agents/agreement/full-terms`
}

export function renderTemplate(key: AgreementTemplateKey): string {
  if (key === 'short') return SHORT_BODY.split(FULL_URL_TOKEN).join(fullAgreementUrl())
  return FULL_BODY
}

export function getTemplates(): AgreementTemplate[] {
  return [
    {
      key: 'short',
      label: 'One-page summary',
      description: 'Short summary that links to the full agreement. Good default for most agents.',
      body: renderTemplate('short'),
    },
    {
      key: 'full',
      label: 'Full agreement',
      description: 'Complete long-form agreement. Use when the agent wants the full terms in the signed document itself.',
      body: renderTemplate('full'),
    },
  ]
}

// The canonical long-form text used by /agents/agreement/full-terms. This is
// always the same for every agent (it's the reference copy) — distinct from
// whatever text the admin pastes into each agent's signable agreement.
export function canonicalFullAgreementBody(): string {
  return FULL_BODY
}
