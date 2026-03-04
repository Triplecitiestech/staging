# Changelog

All notable changes to the Triple Cities Tech platform.

## [Unreleased]

### Added
- **Project spine**: README.md, docs/ARCHITECTURE.md, docs/UI_STANDARDS.md, docs/SELF_HEALING_AND_RELIABILITY.md, docs/RUNBOOK.md, docs/CHANGELOG.md
- **Structured server logging** (`src/lib/server-logger.ts`): correlation IDs, latency timing, JSON format
- **Admin error boundary** (`src/components/admin/AdminErrorBoundary.tsx`): catches client errors on all admin pages
- **Standard API response envelope** (`src/lib/api-response.ts`): `{ success, data, error, requestId }` for all create actions
- **AI call timeouts**: 25s AbortController on all Anthropic API calls
- **Idempotency support**: `Idempotency-Key` header on create company flow
- **Verified-create flow**: Company creation returns `{ success, id, url, requestId }` — UI only shows success on confirmation
- **NewCompanyForm reliability**: inline error/success banners, timeout handling, no more `alert()`
- **Integration tests**: Vitest + verified-create test for company creation
- **CI workflow**: GitHub Actions runs lint + tests on PRs

### Fixed
- AI chat calls could hang indefinitely — now timeout at 25s with user-visible error
- Company creation returned raw Prisma object — now returns standard envelope
- Error boundary only covered `/services` page — now covers all admin routes
- No request tracing — all API routes now log `requestId` for support correlation
