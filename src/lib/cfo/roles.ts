/**
 * Pod/account role detection. Ported from the standalone tool's roles.mjs.
 * Maps Sequence accounts to their financial roles (Operations, Owner's Pay,
 * income source, credit-card pods, etc.) by name/type convention.
 */

import type { Account } from './types'

const norm = (s?: string | null) => (s || '').toLowerCase().trim()

const ROLE_MATCHERS: Record<string, (a: Account) => boolean> = {
  operations: (a) => a.type === 'POD' && norm(a.name) === 'operations',
  ownerPay: (a) => a.type === 'POD' && (norm(a.name) === "owner's pay" || norm(a.name) === 'owners pay'),
  incomeTax: (a) => a.type === 'POD' && norm(a.name) === 'income tax',
  salesTax: (a) => a.type === 'POD' && norm(a.name) === 'sales tax',
  davidsonFox: (a) => a.type === 'POD' && norm(a.name).startsWith('davidson'),
  thirteenthMonth: (a) => a.type === 'POD' && norm(a.name).includes('13th'),
  businessInsurance: (a) => a.type === 'POD' && norm(a.name).includes('insurance'),
  payrollPod: (a) => a.type === 'POD' && norm(a.name) === 'payroll',
  incomeSource: (a) => a.type === 'INCOME_SOURCE',
}

const CREDIT_CARD_POD = (a: Account) => a.type === 'POD' && !a.deletedAt && /card/i.test(a.name)
const LOAN_POD = (a: Account) =>
  a.type === 'POD' && !a.deletedAt &&
  (/\bloan\b/i.test(a.name) || /\bmortgage\b/i.test(a.name) || /line of cred/i.test(a.name))
const EMPOWER_CHECKING = (a: Account) =>
  a.type === 'EXTERNAL_ACCOUNT' && /empower business checking/i.test(a.name || '')

export function findByRole(accounts: Account[], role: string): Account | null {
  return accounts.find(ROLE_MATCHERS[role]) || null
}

export function isLiabilityExternal(account: Account): boolean {
  return account.type === 'EXTERNAL_ACCOUNT' && account.externalAccountType === 'LIABILITY'
}

export interface AccountRoles {
  operations: Account | null
  ownerPay: Account | null
  incomeTax: Account | null
  salesTax: Account | null
  davidsonFox: Account | null
  thirteenthMonth: Account | null
  businessInsurance: Account | null
  payrollPod: Account | null
  incomeSource: Account | null
  creditCardPods: Account[]
  loanPods: Account[]
  liabilityAccounts: Account[]
  empowerChecking: Account | null
}

export function summarizeRoles(accounts: Account[]): AccountRoles {
  return {
    operations: findByRole(accounts, 'operations'),
    ownerPay: findByRole(accounts, 'ownerPay'),
    incomeTax: findByRole(accounts, 'incomeTax'),
    salesTax: findByRole(accounts, 'salesTax'),
    davidsonFox: findByRole(accounts, 'davidsonFox'),
    thirteenthMonth: findByRole(accounts, 'thirteenthMonth'),
    businessInsurance: findByRole(accounts, 'businessInsurance'),
    payrollPod: findByRole(accounts, 'payrollPod'),
    incomeSource: findByRole(accounts, 'incomeSource'),
    creditCardPods: accounts.filter(CREDIT_CARD_POD),
    loanPods: accounts.filter(LOAN_POD),
    liabilityAccounts: accounts.filter(isLiabilityExternal),
    empowerChecking: accounts.find(EMPOWER_CHECKING) || null,
  }
}
