# Banking Ledger Backend

A backend engineering project implementing the core mechanics of a double-entry financial ledger. The focus is transaction integrity, deterministic balance calculation, immutable journal entries, idempotent posting, validation and auditable domain behaviour.

> **Portfolio status:** Core in-memory ledger implementation and automated tests are being built first. PostgreSQL persistence, transactional locking and production observability are planned as subsequent stages.

## Engineering Goals

- Model accounts and journal entries using double-entry accounting principles.
- Guarantee that every posted transaction balances: total debits must equal total credits.
- Store money as integer minor units to avoid floating-point precision errors.
- Prevent mutation of posted ledger entries.
- Support idempotency keys for safe retry behaviour.
- Expose predictable REST endpoints and structured errors.
- Provide automated unit and API-level tests.
- Package the service for containerized execution and CI validation.

## Technology Stack

| Concern | Technology |
| --- | --- |
| Runtime | Node.js |
| Language | TypeScript |
| HTTP API | Express |
| Validation | Zod |
| Testing | Vitest / Supertest |
| Planned persistence | PostgreSQL |
| Planned ORM | Prisma |
| Containers | Docker |
| CI | GitHub Actions |

## Ledger Model

A journal entry contains two or more postings. Each posting references an account and contains either a debit or credit amount.

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
- Posting amounts must be positive integers.
- Each posting must be exactly one of `DEBIT` or `CREDIT`.
- The debit total must equal the credit total.
- A transaction reference/idempotency key may only be posted once.
- Posted journal entries are immutable in the service API.

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
Validation / Controller
    |
    v
Ledger Service
    |
    +--> Account Repository
    |
    +--> Journal Repository
    |
    v
Domain Rules / Balance Projection
```

The current implementation uses in-memory repositories behind interfaces. PostgreSQL adapters can therefore be introduced without changing the core ledger service contract.

## Proposed Repository Structure

```text
banking-ledger-backend/
├── src/
│   ├── domain/
│   │   ├── account.ts
│   │   ├── journal-entry.ts
│   │   └── errors.ts
│   ├── repositories/
│   ├── services/
│   ├── validation/
│   ├── app.ts
│   └── server.ts
├── tests/
├── docs/
│   └── architecture.md
├── .github/workflows/
│   └── ci.yml
├── Dockerfile
├── .env.example
├── package.json
├── tsconfig.json
└── README.md
```

## Testing Strategy

Tests cover both domain rules and HTTP behaviour, including:

- successful balanced journal posting;
- rejection of unbalanced entries;
- rejection of unknown accounts;
- duplicate reference/idempotency handling;
- account balance projection;
- API validation and error responses.

## Persistence Roadmap

The PostgreSQL stage will introduce:

- `accounts`, `journal_entries` and `postings` tables;
- foreign keys and database constraints;
- unique transaction references;
- atomic posting transactions;
- row-level locking where required;
- migration history;
- integration tests against PostgreSQL.

## Reliability Roadmap

Planned production concerns include:

- structured logs and correlation IDs;
- readiness checks that verify database connectivity;
- request timeouts;
- graceful shutdown;
- idempotency persistence;
- metrics for transaction volume, posting failures and latency;
- tracing around persistence operations.

## Engineering Roadmap

- [x] Define double-entry ledger invariants.
- [x] Define REST API and error semantics.
- [ ] Implement account domain model.
- [ ] Implement journal posting service.
- [ ] Implement balance projection.
- [ ] Add API validation and handlers.
- [ ] Add unit and E2E tests.
- [ ] Add Docker packaging.
- [ ] Add GitHub Actions CI.
- [ ] Add PostgreSQL persistence.
- [ ] Add Prisma migrations and integration tests.
- [ ] Add production observability.

## What This Project Demonstrates

This repository is designed to demonstrate backend engineering with strong transactional domain modelling: immutability, idempotency, accounting invariants, deterministic projections, strict validation, testability and an architecture that can evolve from an in-memory implementation to a relational production datastore.
