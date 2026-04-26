import { NextRequest, NextResponse } from 'next/server'
import { checkSecretAuth } from '@/lib/api-auth'
import { Prisma } from '@prisma/client'

export const dynamic = 'force-dynamic'

// Schema-drift audit. Iterates every Prisma model via DMMF, gets the table name
// (@@map) and every field's column name (@map or field name), then compares
// against information_schema.columns for the live DB. Returns:
//   - missing[]: { table, column, expectedType }  (in schema but not in DB)
//   - extras[]:  { table, column }                (in DB but not in schema — informational)
//   - alterStatements: ready-to-run SQL to add the missing columns
//
// Gated by MIGRATION_SECRET. Read-only — does not modify the DB.
//
//   Invoke-RestMethod -Uri 'https://www.triplecitiestech.com/api/debug/schema-drift' \
//     -Headers @{ Authorization = 'Bearer <MIGRATION_SECRET>' }
export async function GET(request: NextRequest) {
  const denied = checkSecretAuth(request)
  if (denied) return denied

  const { prisma } = await import('@/lib/prisma')

  // Map Prisma scalar field types → Postgres column types for ALTER TABLE
  // generation. Covers everything currently in this schema.prisma.
  const pgType = (
    fieldType: string,
    nativeType: { name: string; args: readonly string[] } | null,
    isList: boolean,
    kind: string
  ): string => {
    if (isList) return 'TEXT[]' // crude — Prisma scalar lists are rare here
    if (kind === 'enum') return `"${fieldType}"` // Postgres enum, name matches Prisma
    if (nativeType) {
      const { name, args } = nativeType
      switch (name) {
        case 'Text': return 'TEXT'
        case 'VarChar': return args[0] ? `VARCHAR(${args[0]})` : 'VARCHAR'
        case 'Date': return 'DATE'
        case 'Decimal': return args.length === 2 ? `DECIMAL(${args[0]}, ${args[1]})` : 'DECIMAL'
        case 'Bytes':
        case 'ByteA': return 'BYTEA'
        default: break
      }
    }
    switch (fieldType) {
      case 'String': return 'TEXT'
      case 'Boolean': return 'BOOLEAN'
      case 'Int': return 'INTEGER'
      case 'BigInt': return 'BIGINT'
      case 'Float': return 'DOUBLE PRECISION'
      case 'Decimal': return 'DECIMAL(65,30)'
      case 'DateTime': return 'TIMESTAMP(3)'
      case 'Json': return 'JSONB'
      case 'Bytes': return 'BYTEA'
      default: return 'TEXT'
    }
  }

  // Format a Prisma default value for SQL.
  const sqlDefault = (
    def: unknown,
    fieldType: string,
    kind: string
  ): string | null => {
    if (def === undefined || def === null) return null
    // Function defaults like now(), uuid(), cuid(), autoincrement(), dbgenerated()
    if (typeof def === 'object' && def !== null && 'name' in def) {
      const name = (def as { name: string }).name
      if (name === 'now') return 'NOW()'
      if (name === 'uuid' || name === 'cuid') return null // no SQL equivalent — skip
      if (name === 'autoincrement') return null
      if (name === 'dbgenerated') return null
      return null
    }
    if (kind === 'enum') return `'${String(def)}'::"${fieldType}"`
    if (fieldType === 'String') return `'${String(def).replace(/'/g, "''")}'`
    if (fieldType === 'Boolean') return def ? 'TRUE' : 'FALSE'
    if (fieldType === 'Int' || fieldType === 'BigInt' || fieldType === 'Float' || fieldType === 'Decimal') return String(def)
    return null
  }

  type ExpectedColumn = {
    column: string
    pgType: string
    nullable: boolean
    default: string | null
    isRelation: boolean
  }
  type ExpectedTable = {
    model: string
    table: string
    columns: ExpectedColumn[]
  }

  // Build the expected-shape map from Prisma DMMF.
  const dmmf = Prisma.dmmf
  const expected: ExpectedTable[] = dmmf.datamodel.models.map((m) => {
    const table = m.dbName ?? m.name
    const columns: ExpectedColumn[] = []
    for (const f of m.fields) {
      // Skip relation fields (they're virtual on the Prisma side; foreign-key
      // scalars are listed separately as their own field).
      if (f.kind === 'object') continue
      const column = f.dbName ?? f.name
      // Some fields are computed/unsupported — those have no DB column
      if (f.kind === 'unsupported') continue
      const nativeType = f.nativeType ? { name: f.nativeType[0], args: f.nativeType[1] ?? [] } : null
      columns.push({
        column,
        pgType: pgType(f.type, nativeType, f.isList, f.kind),
        nullable: !f.isRequired,
        default: sqlDefault(f.default, f.type, f.kind),
        isRelation: false,
      })
    }
    return { model: m.name, table, columns }
  })

  // Pull every table's columns from the live DB in one query.
  const liveRows = await prisma.$queryRawUnsafe<Array<{ table_name: string; column_name: string }>>(
    `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public'`
  )
  const liveByTable = new Map<string, Set<string>>()
  for (const row of liveRows) {
    if (!liveByTable.has(row.table_name)) liveByTable.set(row.table_name, new Set())
    liveByTable.get(row.table_name)!.add(row.column_name)
  }

  type MissingRow = {
    table: string
    column: string
    pgType: string
    nullable: boolean
    default: string | null
  }
  const missing: MissingRow[] = []
  const missingTables: string[] = []
  const expectedColsByTable = new Map<string, Set<string>>()

  for (const t of expected) {
    const live = liveByTable.get(t.table)
    expectedColsByTable.set(t.table, new Set(t.columns.map((c) => c.column)))
    if (!live) {
      missingTables.push(t.table)
      continue
    }
    for (const c of t.columns) {
      if (!live.has(c.column)) {
        missing.push({
          table: t.table,
          column: c.column,
          pgType: c.pgType,
          nullable: c.nullable,
          default: c.default,
        })
      }
    }
  }

  // Extras — columns in the DB that the schema doesn't know about. Informational.
  const extras: Array<{ table: string; column: string }> = []
  liveByTable.forEach((cols, table) => {
    const expectedCols = expectedColsByTable.get(table)
    if (!expectedCols) return // unknown table — ignore (might be raw-SQL tables like report_*)
    cols.forEach((col) => {
      if (!expectedCols.has(col)) extras.push({ table, column: col })
    })
  })

  // Generate idempotent ALTER TABLE statements for every missing column.
  const alterStatements = missing.map((m) => {
    const parts = [`ALTER TABLE "${m.table}" ADD COLUMN IF NOT EXISTS "${m.column}" ${m.pgType}`]
    if (!m.nullable) {
      // For NOT NULL, only safe to add if there's a default; otherwise mark
      // nullable so the ALTER doesn't fail on existing rows.
      if (m.default !== null) {
        parts.push(`NOT NULL DEFAULT ${m.default}`)
      } else {
        // strip NOT NULL — caller can backfill + tighten later
      }
    } else if (m.default !== null) {
      parts.push(`DEFAULT ${m.default}`)
    }
    return parts.join(' ') + ';'
  })

  return NextResponse.json(
    {
      summary: {
        models: expected.length,
        missingTables: missingTables.length,
        missingColumns: missing.length,
        extras: extras.length,
      },
      missingTables,
      missing,
      extras,
      alterStatements,
    },
    { status: 200 }
  )
}
