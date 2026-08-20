# Data Room API

[![NestJS Logo](https://nestjs.com/img/logo-small.svg)](https://nestjs.com)

> Backend for a secure virtual data room — folders, files, and
> permissioned/public sharing for due-diligence-style document review.
> Built with NestJS, PostgreSQL (Prisma), and Supabase Storage.

---

## Table of Contents

- [Project Description](#project-description)
- [Tech Stack](#tech-stack)
- [Design Decisions](#design-decisions)
- [Data Model & ERD](#data-model--erd)
- [How It Scales](#how-it-scales)
- [Environment Variables](#environment-variables)
- [Project Setup](#project-setup)
- [API Documentation](#api-documentation)
- [Deployed URLs](#deployed-urls)
- [AI Usage](#ai-usage)
- [Known Limitations](#known-limitations)
- [License](#license)

---

## Project Description

This backend provides a full-stack Data Room MVP: a top-level container
(a Data Room, analogous to a Google Drive "My Drive") that holds nested
folders and files, with two sharing models — inviting a specific user by
email (read-only) or generating a public link. A user can own multiple
Data Rooms and, independently, have read-only access to rooms, folders,
or individual files that other users have shared with them.

Core functionality:

- Email/password authentication (JWT)
- Data Rooms: create, list owned rooms
- Folders: create, nest, view contents (with breadcrumbs), rename, delete
  (cascades to nested folders and files)
- Files: upload, download (via short-lived signed URL), rename (with
  automatic conflict resolution), move between folders, delete
- Sharing: per-user permissioned access (by email), public links, access
  inheritance down the folder hierarchy, revocation
- Rate limiting on auth and public-link endpoints
- Full OpenAPI/Swagger documentation

---

## Tech Stack

- **Framework:** NestJS
- **Language:** TypeScript
- **Database:** PostgreSQL (hosted on Supabase)
- **ORM:** Prisma 7
- **File storage:** Supabase Storage (private bucket, signed URLs)
- **Auth:** JWT (Passport), bcrypt password hashing
- **Validation:** class-validator / class-transformer
- **Docs:** @nestjs/swagger (OpenAPI)
- **Rate limiting:** @nestjs/throttler

---

## Design Decisions

**Auth: email/password over social login.** Faster to implement
correctly than OAuth, and sufficient to satisfy the requirement
("social auth OR email/password"). Passwords are hashed with bcrypt
(cost factor 10); login and register are rate-limited (5 requests /
15 min per IP) to slow down credential-stuffing and brute-force
attempts.

**File storage: Supabase over AWS S3.** Supabase bundles Postgres and
object storage under one free-tier account, avoiding the overhead of a
separate AWS account/IAM setup for a time-boxed assignment. Files are
stored in a **private** bucket; the API is the only party with the
service-role key, and clients only ever receive short-lived (5-minute)
signed URLs — the storage layer is never exposed directly, whether the
requester is authenticated or arrived via a public share link.

**Sharing model: per-item ACL over role-based access control (RBAC).**
An earlier version of a related project used a full RBAC system
(dynamic Roles, Resources, and Permissions as separate database
entities, managed through an admin UI). That's the right shape for
"an admin manages who can do what across an entire system," but this
task needed the opposite: "does _this specific user_ have access to
_this specific file_." The implemented model is a lean per-item ACL —
a single `Share` row ties one user (or a public token) to one target
(a Data Room, Folder, or File) with a role. Extending it to more
granular roles (e.g. `EDITOR`) later is a one-line enum change, not a
schema redesign — see [How It Scales](#how-it-scales).

**Access inheritance, not duplication.** Sharing a folder grants
read access to everything nested inside it, resolved at request time by
walking the target's ancestor chain (folder → parent folder → ... →
Data Room) and checking for a `Share` row at any level, rather than
copying share records down to every descendant. This keeps writes
cheap (one row per share, regardless of how much it "covers") at the
cost of a bounded number of extra lookups per read — see
[How It Scales](#how-it-scales) for the indexing story as folder trees
grow.

**Public links: existence-check first, full browsing deferred.**
`GET /public/shares/:token` currently confirms a link is valid and
returns the shared item's name/type — it does not yet let an anonymous
visitor browse into a shared folder's contents. Building that safely
requires threading an alternate, non-JWT auth path (a public token)
through `FoldersService`/`FilesService` alongside the existing
JWT-based checks, which was deliberately deferred in favor of finishing
owner/invited-viewer flows correctly first. See
[Known Limitations](#known-limitations).

**Cascading deletes at the database level.** Deleting a folder deletes
its nested folders and files (and any `Share` rows pointing at them) via
Postgres `ON DELETE CASCADE`, rather than recursive application-level
delete logic. This is both simpler and safer — it can't be bypassed by
a code path that forgets to walk the tree.

---

## Data Model & ERD

```mermaid
erDiagram
    User ||--o{ DataRoom : owns
    User ||--o{ Share : "has access via"
    DataRoom ||--o{ Folder : contains
    DataRoom ||--o{ File : contains
    DataRoom ||--o{ Share : "can be shared"
    Folder ||--o{ Folder : "nests (parentId)"
    Folder ||--o{ File : contains
    Folder ||--o{ Share : "can be shared"
    File ||--o{ Share : "can be shared"

    User {
        string id PK
        string email UK
        string fullName
        string passwordHash
    }
    DataRoom {
        string id PK
        string name
        string ownerId FK
    }
    Folder {
        string id PK
        string name
        string dataRoomId FK
        string parentId FK "nullable, self-relation"
    }
    File {
        string id PK
        string name
        int size
        string storageKey
        string folderId FK "nullable — null means room root"
        string dataRoomId FK
    }
    Share {
        string id PK
        enum targetType "ROOM | FOLDER | FILE"
        enum role "VIEWER"
        string dataRoomId FK "nullable"
        string folderId FK "nullable"
        string fileId FK "nullable"
        string userId FK "nullable — null means public link"
        string publicToken UK "nullable"
    }
```

A `Share` row points at exactly one target (`dataRoomId` /
`folderId` / `fileId` — whichever matches `targetType`) and exactly
one grantee (`userId` for an invited user, or a generated
`publicToken` for a public link). `File.folderId` is nullable — a
`null` folder means the file lives at the Data Room's root, not
inside any folder.

---

## How It Scales

**Computing a folder's total size and item count (including its whole
subtree).** Currently uncomputed — the API returns direct children
only. At the current scale, a recursive Postgres CTE
(`WITH RECURSIVE`) walking `Folder.parentId` gives an exact answer
on demand. Once folders regularly hold thousands of descendants, that
recursive query becomes too slow to run per request; the next step is
a denormalized `totalSize`/`itemCount` column on `Folder`, kept current
by incrementing/decrementing it on every upload, delete, and move
inside a transaction (or via a background job if strict consistency
isn't required).

**A Data Room with 100,000 files.** The current `File`/`Folder`
listing endpoints return a flat, unpaginated list per folder, which is
fine for a demo-sized tree but would not hold up at that scale.
Needed: cursor-based pagination (not offset — offset pagination
degrades linearly with table size) on `GET /folders/:id`, and the
existing indexes already cover the access pattern (`@@index([folderId,
parentId])` on `Folder`, `@@index([folderId])` and
`@@unique([folderId, name])` on `File`) — both are used for exactly
the "list this folder's contents" and "does this name already exist
here" queries that would run most often at scale.

**Extending sharing to per-user roles (viewer/editor) without
remodeling.** `Share.role` is already a Prisma enum
(`enum ShareRole { VIEWER }`), not a boolean or a hardcoded string.
Adding `EDITOR` is a one-line enum addition plus a new migration —
no changes to the `Share` table's shape, its relations, or the
`checkAccess` inheritance-walking logic, which already returns the
resolved role string and leaves the read/write decision to the caller.
Call sites that currently do `if (role) allow-read` would change to
`if (role === 'OWNER' || role === 'EDITOR') allow-write`.

---

## Environment Variables

Create a `.env` file (based on `.env.example`) in the root folder.

```dotenv
DATABASE_URL=postgresql://user:password@host:6543/db   # pooled connection, used at runtime
DIRECT_URL=postgresql://user:password@host:5432/db     # direct connection, used for migrations
JWT_SECRET=a-long-random-string

SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

`DATABASE_URL` should point at Supabase's connection pooler (port
6543); `DIRECT_URL` at the direct connection (port 5432) — Prisma
Migrate requires a non-pooled connection. See
[prisma.config.ts](./prisma.config.ts) for how these are wired in.

---

## Project Setup

```bash
npm install
npx prisma generate
npx prisma migrate dev   # first run: creates the schema

# Development
npm run start:dev

# Production build
npm run build
npm run start:prod
```

The app listens on `http://localhost:3000` by default.

### Seeding demo data

```bash
npm run seed
```

Populates the database with a deliberately varied set of scenarios
(multiple owners, an empty room, nested folders three levels deep,
a name conflict, folder-level and file-level sharing, a public link)
by calling the live API — see `scripts/seed.ts`. Prints login
credentials and a checklist of what to look for in each account once
it finishes. Expects a fresh database (re-run `npx prisma migrate
reset` first if re-seeding).

---

## API Documentation

Full interactive OpenAPI/Swagger documentation is available at
**`/api-docs`** once the server is running
(e.g. `http://localhost:3000/api-docs`), covering every endpoint,
request/response shape, and example payload across all six modules
(auth, data-rooms, folders, files, sharing, public-shares).

---

## Deployed URLs

- **Backend (this repo):** `https://<your-render-url>.onrender.com`
- **Frontend:** `https://<your-vercel-url>.vercel.app`
- **Frontend repo:** `https://github.com/RoksolanaMarusiak1/dataroom-frontend`

---

## AI Usage

Claude (chat) and Claude Code were used throughout this project for:

- Scaffolding NestJS modules (controllers/services/DTOs) following a
  consistent pattern once the first module (auth) established it
- Architectural discussion and review — evaluating trade-offs (RBAC vs.
  per-item ACL for sharing, Supabase vs. S3, cascade-delete strategy)
  before implementation, and reviewing the resulting code for
  consistency (exception message wording, guard coverage, unused code)
  in a dedicated self-review pass before submission
- Debugging environment/tooling issues (Prisma 7's config migration,
  Supabase connection pooling, ESM/CJS interop)
- Generating the seed script and this README

All architectural decisions, trade-off evaluations, and final code were
reviewed and understood before being accepted — the design choices
described above reflect my own reasoning, not an unreviewed AI
suggestion.

---

## Known Limitations

- **Public links don't yet support browsing folder contents** —
  `GET /public/shares/:token` validates the link and returns the
  target's name/type, but doesn't expose nested files/folders to an
  anonymous visitor. See [Design Decisions](#design-decisions).
- **No true JWT revocation** — `JwtStrategy` re-checks that the user
  still exists on every request, but a valid, unexpired token can't be
  invalidated early (no logout-everywhere). A `tokenVersion` column on
  `User`, checked alongside the user lookup, would close this without
  a schema redesign.
- **No rate limiting beyond auth and public-link lookups** — other
  endpoints rely on JWT auth as their primary protection.
- **Folders can't be moved** — only renamed and deleted. Files can be
  moved between folders (`PATCH /files/:id/move`); the equivalent for
  folders was out of scope for the task's explicit requirements.
- **A file can't be moved back to a Data Room's root** once it's inside
  a folder — `MoveFileDto.folderId` is required. Moving between
  folders works; moving out to the room root does not yet.
- **No orphaned-storage cleanup job** — deleting a file removes its
  database row first, then attempts to delete the underlying Supabase
  Storage object; if the storage delete fails, the error is logged but
  doesn't fail the request, which can leave an orphaned object in
  storage. A periodic reconciliation job would be the production
  follow-up.

---

## License

MIT Licensed
