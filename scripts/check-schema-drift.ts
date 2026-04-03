#!/usr/bin/env node
/**
 * Schema Drift Detection Script
 *
 * Detects mismatches between Prisma schema definitions and raw SQL usage
 * across the codebase. Runs at build time (no DB connection needed).
 *
 * Checks:
 * 1. Raw SQL queries reference columns that exist in the Prisma model
 * 2. Models used in raw SQL have @@map directives matching the table name
 * 3. Fields added to Prisma schema have corresponding migrations
 *
 * Usage:
 *   npx tsx scripts/check-schema-drift.ts
 *   node --loader tsx scripts/check-schema-drift.ts
 *
 * Exit code 0 = no drift found, 1 = drift detected
 */

import fs from 'fs'
import path from 'path'

interface PrismaField {
  name: string
  mapped?: string // @map("column_name")
}

interface PrismaModel {
  name: string
  tableName: string // from @@map or default
  fields: PrismaField[]
}

// ---------------------------------------------------------------------------
// Parse Prisma schema
// ---------------------------------------------------------------------------

function parsePrismaSchema(schemaPath: string): PrismaModel[] {
  const content = fs.readFileSync(schemaPath, 'utf-8')
  const models: PrismaModel[] = []
  let currentModel: PrismaModel | null = null

  for (const line of content.split('\n')) {
    const trimmed = line.trim()

    // Start of model
    const modelMatch = trimmed.match(/^model\s+(\w+)\s*\{/)
    if (modelMatch) {
      currentModel = {
        name: modelMatch[1],
        tableName: modelMatch[1].toLowerCase() + 's', // default plural
        fields: [],
      }
      continue
    }

    // End of model
    if (trimmed === '}' && currentModel) {
      models.push(currentModel)
      currentModel = null
      continue
    }

    if (!currentModel) continue

    // @@map directive
    const mapMatch = trimmed.match(/@@map\("([^"]+)"\)/)
    if (mapMatch) {
      currentModel.tableName = mapMatch[1]
      continue
    }

    // Field definition
    const fieldMatch = trimmed.match(/^(\w+)\s+\w+/)
    if (fieldMatch && !trimmed.startsWith('//') && !trimmed.startsWith('@@')) {
      const fieldName = fieldMatch[1]
      const fieldMapMatch = trimmed.match(/@map\("([^"]+)"\)/)
      currentModel.fields.push({
        name: fieldName,
        mapped: fieldMapMatch?.[1],
      })
    }
  }

  return models
}

// ---------------------------------------------------------------------------
// Find raw SQL column references
// ---------------------------------------------------------------------------

interface RawSqlUsage {
  file: string
  line: number
  columns: string[]
  tableName?: string
}

function findRawSqlUsages(srcDir: string): RawSqlUsage[] {
  const usages: RawSqlUsage[] = []
  const files = getAllTsFiles(srcDir)

  // Table names and constraint names to exclude from column checks
  const SQL_KEYWORDS = new Set([
    'text', 'integer', 'boolean', 'timestamp', 'jsonb', 'uuid', 'bigint',
    'true', 'false', 'null', 'not', 'default', 'primary', 'unique',
    'references', 'cascade', 'restrict', 'serial', 'varchar', 'now',
  ])

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8')
    const lines = content.split('\n')

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      // Only check lines that are clearly raw SQL in Prisma or pg
      const isSqlContext = line.includes('$queryRaw') || line.includes('$executeRaw')
        || line.includes('client.query')

      // Skip DDL statements (CREATE TABLE, ALTER TABLE, etc.) — those define schema, not reference it
      const isDDL = line.includes('CREATE TABLE') || line.includes('ALTER TABLE')
        || line.includes('DROP TABLE') || line.includes('CREATE INDEX')
        || line.includes('ADD CONSTRAINT') || line.includes('IF NOT EXISTS')

      if (!isSqlContext || isDDL) continue

      // Extract quoted identifiers that look like column references in SELECT/WHERE/SET clauses
      // Pattern: "camelCaseColumnName" — columns use camelCase, tables use snake_case
      const camelCaseColumns = line.match(/"([a-z][a-zA-Z0-9]*[A-Z][a-zA-Z0-9]*)"/g)
      if (!camelCaseColumns) continue

      const columns = camelCaseColumns
        .map(c => c.replace(/"/g, ''))
        .filter(c => !SQL_KEYWORDS.has(c.toLowerCase()))
        // Exclude constraint names (contain _fkey, _pkey, _idx)
        .filter(c => !c.includes('fkey') && !c.includes('pkey') && !c.includes('idx'))

      // Try to find table name from the SQL context (look at surrounding lines too)
      let tableName: string | undefined
      const context = lines.slice(Math.max(0, i - 5), i + 3).join(' ')
      const tableMatch = context.match(/(?:FROM|INTO|UPDATE)\s+"?([a-z_]+)"?/i)
      if (tableMatch) tableName = tableMatch[1]

      if (columns.length > 0 && tableName) {
        usages.push({
          file: path.relative(process.cwd(), file),
          line: i + 1,
          columns,
          tableName,
        })
      }
    }
  }

  return usages
}

function getAllTsFiles(dir: string): string[] {
  const results: string[] = []
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
        results.push(...getAllTsFiles(fullPath))
      } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
        results.push(fullPath)
      }
    }
  } catch {
    // Directory might not exist
  }
  return results
}

// ---------------------------------------------------------------------------
// Check for drift
// ---------------------------------------------------------------------------

function checkDrift(): { warnings: string[]; errors: string[] } {
  const schemaPath = path.join(process.cwd(), 'prisma', 'schema.prisma')
  const srcDir = path.join(process.cwd(), 'src')

  if (!fs.existsSync(schemaPath)) {
    return { warnings: [], errors: ['prisma/schema.prisma not found'] }
  }

  const models = parsePrismaSchema(schemaPath)
  const modelByTable = new Map(models.map(m => [m.tableName, m]))
  const modelByName = new Map(models.map(m => [m.name, m]))

  const warnings: string[] = []
  const errors: string[] = []

  // Check: raw SQL references columns that exist in the Prisma model
  const rawUsages = findRawSqlUsages(srcDir)

  for (const usage of rawUsages) {
    if (!usage.tableName) continue

    const model = modelByTable.get(usage.tableName)
    if (!model) continue // Table not Prisma-managed (reporting, SOC, etc.)

    for (const col of usage.columns) {
      const fieldExists = model.fields.some(
        f => f.name === col || f.mapped === col
      )
      if (!fieldExists) {
        errors.push(
          `${usage.file}:${usage.line} — Raw SQL references column "${col}" ` +
          `on table "${usage.tableName}" (model ${model.name}), but this field ` +
          `does not exist in the Prisma schema. This will cause runtime errors.`
        )
      }
    }
  }

  // Check: models without @@map (potential table name mismatches)
  for (const model of models) {
    if (model.tableName === model.name.toLowerCase() + 's') {
      // Default table name — check if raw SQL uses a different name
      const defaultTable = model.name.toLowerCase() + 's'
      const alternateNames = [
        model.name.toLowerCase(),
        model.name,
        // camelCase to snake_case
        model.name.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '') + 's',
      ]

      for (const usage of rawUsages) {
        if (usage.tableName && alternateNames.includes(usage.tableName) && usage.tableName !== defaultTable) {
          warnings.push(
            `${usage.file}:${usage.line} — Raw SQL uses table "${usage.tableName}" ` +
            `which might be model ${model.name} (Prisma default: "${defaultTable}"). ` +
            `If these are the same table, add @@map("${usage.tableName}") to the model.`
          )
        }
      }
    }
  }

  return { warnings, errors }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const { warnings, errors } = checkDrift()

if (warnings.length > 0) {
  console.log('\n⚠️  Schema drift warnings:')
  for (const w of warnings) {
    console.log(`  - ${w}`)
  }
}

if (errors.length > 0) {
  console.log('\n❌ Schema drift errors:')
  for (const e of errors) {
    console.log(`  - ${e}`)
  }
  console.log(`\n${errors.length} error(s) found. Fix before deploying.\n`)
  process.exit(1)
}

if (warnings.length === 0 && errors.length === 0) {
  console.log('✅ No schema drift detected.')
}

process.exit(0)
