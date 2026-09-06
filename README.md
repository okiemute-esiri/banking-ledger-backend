# Banking Ledger Backend

A backend engineering project implementing the core mechanics of a double-entry financial ledger. The current in-memory implementation focuses on transaction integrity, deterministic balance calculation, immutable journal entries, idempotent posting, currency isolation, validation and auditable domain behaviour.

> **Portfolio status:** The core in-memory ledger, REST API, automated E2E tests, Docker packaging and GitHub Actions CI are implemented and passing. PostgreSQL persistence, transactional locking and production observability remain planned.

## Engineering Goals

- Model accounts and journal entries using double-entry accounting principles.
- Guarantee that every posted transaction balances: total debits must equal total credits.
- Store money as integer minor units to avoid floating-point precision errors.
- Prevent mutation of posted ledger entries.
- Support safe idempotent retries while rejecting conflicting reuse of a transaction reference.
- Prevent cross-currency journal posting until explicit FX handling exists.
- Expose predictable REST endpoints and structured errors.
- Package the service for containerized execution and CI validation.

## Technology Stack

| Concern | Technology |
| --- | --- |
| Runtime | Node.js 22+ |
| Language | TypeScript |
| HTTP API | Express |
| Validation | Zod |
| Testing | Vitest / Supertest |
| Current persistence | In-memory repository |
| Planned persistence | PostgreSQL + Prisma |
| Containers | Docker |
| CI | GitHub Actions |

## Ledger Model

A journal entry contains two or more postings. Each posting references an account and contains a debit or credit amount.

```text
Journal Entry
   |
   +-- Debit  Account A   10,000
   +-- Credit Account B   10,000
```

The entry is valid only when:

```text
sum(debits) = sum(credits)
```

Amounts are represented in **minor currency units**. For EUR, `1000` represents `€10.00`.

## Implemented Domain Invariants

- Account identifiers must exist before posting.
- A journal entry must contain at least two postings.
- Posting amounts must be positive safe integers.
- Each posting must be exactly one of `DEBIT` or `CREDIT`.
- Total debits must equal total credits.
- All accounts in one journal entry must use the same currency.
- An identical retry using the same reference returns the original posted entry.
- Reusing the same reference with a different description or posting payload returns `409 IDEMPOTENCY_CONFLICT`.
- Posted journal entries are immutable through the service API.

## API Surface

```text
GET  /health
GET  /ready

POST /api/v1/accounts
GET  /api/v1/accounts
GET  /api/v1/accounts/:accountId
GET  /api/v1/accounts/:accountId/balance

POST /api/v1/journal-entries
GET  /api/v1/journal-entries
GET  /api/v1/journal-entries/:entryId
```

### Create Account

```json
{
  "name": "Operating Cash",
  "type": "ASSET",
  "currency": "EUR"
}
```

### Post Journal Entry

```json
{
  "reference": "PAYMENT-2026-0001",
  "description": "Customer payment received",
  "postings": [
    {
      "accountId": "cash-account-id",
      "side": "DEBIT",
      "amountMinor": 10000
    },
    {
      "accountId": "revenue-account-id",
      "side": "CREDIT",
      "amountMinor": 10000
    }
  ]
}
```

## Idempotency Semantics

A transaction reference acts as the current idempotency key.

```text
same reference + same payload      -> original entry returned
same reference + different payload -> 409 IDEMPOTENCY_CONFLICT
```

This protects clients from creating duplicate financial transactions during safe retries while also preventing accidental reference reuse for a different transaction.

## Currency Isolation

The current ledger does not model exchange rates or FX gain/loss accounts. Therefore, a journal entry may only post against accounts with one common currency.

```text
EUR -> EUR : allowed
USD -> USD : allowed
EUR -> USD : rejected with CURRENCY_MISMATCH
```

Explicit foreign-exchange support is intentionally deferred to a later milestone rather than silently treating different currencies as equivalent values.

## Balance Calculation

The ledger derives balances from postings rather than storing a mutable balance as the source of truth.

For asset and expense accounts:

```text
balance = debits - credits
```

For liability, equity and revenue accounts:

```text
balance = credits - debits
```

This design preserves auditability because the balance is a projection of immutable journal history.

## Architecture

```text
HTTP Request
    |
    v
Zod Validation / Controller
    |
    v
Ledger Service
    |
    v
In-Memory Ledger Repository
    |
    v
Accounts + Immutable Journal History
```

The repository boundary allows PostgreSQL persistence to be introduced without rewriting the HTTP or core ledger domain behaviour.

## Current Repository Structure

```text
banking-ledger-backend/
├── src/
│   ├── domain/
│   │   ├── account.ts
│   │   ├── journal-entry.ts
│   │   └── errors.ts
│   ├── repositories/
│   │   └── in-memory-ledger-repository.ts
│   ├── services/
│   │   └── ledger-service.ts
│   ├── app.ts
│   └── server.ts
├── tests/
│   └── ledger.e2e.test.ts
├── .github/workflows/
│   └── ci.yml
├── Dockerfile
├── .env.example
├── package.json
├── tsconfig.json
└── README.md
```

## Test Coverage

The current E2E suite verifies:

- successful balanced journal posting;
- asset and revenue balance projection;
- liability natural-credit balance projection;
- rejection of unbalanced entries;
- identical idempotent retries;
- conflicting idempotency-key reuse;
- cross-currency posting rejection;
- API-level validation and structured error handling.

## Persistence Roadmap

The PostgreSQL stage will introduce:

- `accounts`, `journal_entries` and `postings` tables;
- foreign keys and database constraints;
- unique transaction references;
- durable idempotency request fingerprints;
- atomic posting transactions;
- row-level locking where required;
- migration history;
- integration tests against PostgreSQL.

## Reliability Roadmap

Planned production concerns include:

- structured logs and correlation IDs;
- readiness checks that verify database connectivity;
- request timeouts;
- graceful shutdown hardening;
- persistent idempotency records;
- metrics for transaction volume, posting failures and latency;
- tracing around persistence operations;
- account lifecycle states such as ACTIVE and CLOSED;
- explicit foreign-exchange transaction modelling.

## Engineering Roadmap

- [x] Define double-entry ledger invariants.
- [x] Implement account domain model.
- [x] Implement journal posting service.
- [x] Implement deterministic balance projection.
- [x] Add REST API validation and structured errors.
- [x] Add E2E tests.
- [x] Add Docker packaging.
- [x] Add GitHub Actions CI.
- [x] Add safe idempotent retry semantics.
- [x] Reject conflicting idempotency-key reuse.
- [x] Enforce same-currency journal entries.
- [ ] Add PostgreSQL persistence.
- [ ] Add Prisma migrations and database integration tests.
- [ ] Add production observability.
- [ ] Add account lifecycle controls.
- [ ] Add explicit FX transaction support.

## What This Project Demonstrates

This repository demonstrates backend engineering with transactional domain modelling: double-entry invariants, immutability, safe idempotency, currency boundaries, deterministic projections, strict validation, automated testing and an architecture that can evolve from an in-memory model to a relational production datastore.
