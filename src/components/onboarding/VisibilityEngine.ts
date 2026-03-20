// ---------------------------------------------------------------------------
// VisibilityEngine — evaluates conditional visibility rules for form questions
// ---------------------------------------------------------------------------

interface VisibilityCondition {
  field: string
  op: string
  value: unknown
}

interface VisibilityRules {
  operator: 'and' | 'or'
  conditions: VisibilityCondition[]
}

function evaluateCondition(
  condition: VisibilityCondition,
  answers: Record<string, unknown>
): boolean {
  const fieldValue = answers[condition.field]
  const { op, value: expected } = condition

  switch (op) {
    case 'eq':
      return fieldValue === expected

    case 'neq':
      return fieldValue !== expected

    case 'in': {
      if (!Array.isArray(expected)) return false
      return expected.includes(fieldValue)
    }

    case 'nin': {
      if (!Array.isArray(expected)) return false
      return !expected.includes(fieldValue)
    }

    case 'contains': {
      if (typeof fieldValue === 'string') {
        return fieldValue.includes(String(expected))
      }
      if (Array.isArray(fieldValue)) {
        return fieldValue.includes(expected)
      }
      return false
    }

    case 'not_empty':
      if (fieldValue === undefined || fieldValue === null || fieldValue === '') return false
      if (Array.isArray(fieldValue)) return fieldValue.length > 0
      return true

    case 'empty':
      if (fieldValue === undefined || fieldValue === null || fieldValue === '') return true
      if (Array.isArray(fieldValue)) return fieldValue.length === 0
      return false

    default:
      return true
  }
}

export function evaluateVisibility(
  rules: VisibilityRules | Record<string, unknown> | null | undefined,
  answers: Record<string, unknown>
): boolean {
  if (!rules) return true

  const typedRules = rules as VisibilityRules
  if (!typedRules.conditions || typedRules.conditions.length === 0) return true

  const results = typedRules.conditions.map((c) => evaluateCondition(c, answers))

  if (typedRules.operator === 'or') {
    return results.some(Boolean)
  }

  // Default to 'and'
  return results.every(Boolean)
}
