# SmartClass — System Architecture (Draft v0.1)

**Project:** FastRobox 1.0 — AI-Powered Smart Classroom (website & backend workstream)
**Owner:** Website/Backend developer. Firmware/electronics owned by a separate teammate.
**Status:** Draft — produced by Prompt 00 (Lead Architect & Repository Auditor).
**Date:** 2026-11-13 (Asia/Dhaka).

---

## 1. Repository assessment

The repository is effectively **greenfield**. Tracked contents at audit time:

- `docs/FastRobox_1.0_QuestionPaper_FOR_TEAMS.md` — competition question paper.
- `docs/fastrobox_1_0_grand_finale_master_blueprint_prompt_suite.md` — blueprint prompt suite.
- `docs/FastRobox_Website_Backend_Master_Prompts.md` — this workstream's master prompt suite (untracked at audit time).

There is **no** `package.json`, lockfile, Next.js app, Supabase project, migration, CI config or deployment config. Nothing to preserve or adapt. The stack is therefore adopted clean from the Technology Baseline (Part A3), with no existing working equivalent to defer to.

**Implication:** Prompt 01 scaffolds the minimum Next.js 15 + Supabase base. This document and its three siblings must be coherent before large implementation begins.

## 2. Technology stack (adopted)

| Concern | Choice |
|---|---|
| Frontend | Next.js 15 App Router, TypeScript (strict), React |
| Styling | Tailwind CSS + design tokens (Part D), shadcn/ui primitives selectively |
| Icons / Charts | Lucide / Recharts |
| Forms / Validation | React Hook Form + Zod (Zod validates every external input) |
| Server state | TanStack Query where it adds value (no duplicated stores) |
| Backend | Next.js Route Handlers / server services (BFF + device API) |
| Database | Supabase PostgreSQL + RLS |
| Auth | Supabase Auth (server-side session) |
| Realtime | Supabase Realtime (authorized tables only) |
| Storage | Supabase private buckets (snapshots, firmware) |
| Hosting | Vercel (web) + Supabase (db/auth/realtime/storage) |
| Heavy/long jobs | Separate worker/inference service (never a short serverless route holding a stream or long model job) |

## 3. System boundary (who owns what)

```
┌────────────────────────┐        HTTPS/TLS        ┌───────────────────────────────┐
│  ESP32-S3-CAM (teammate)│ ──────────────────────▶ │  SmartClass backend (this work)│
│  sensors, face detect,  │  telemetry / events /   │  Next.js Route Handlers        │
│  safety decisions, LED, │  sync / face / CSI /    │  device-token auth middleware  │
│  buzzer, BLE, CSI, cam, │  health / cmd ack       │  domain services + Zod adapters│
│  local AP + local page  │ ◀────────────────────── │  config / commands / OTA URL   │
└────────────────────────┘   config / commands     └───────────────┬───────────────┘
                                                                     │
                            ┌────────────────────────────────────────┼───────────────┐
                            │ Supabase PostgreSQL + RLS + Realtime + private Storage   │
                            └────────────────────────────────────────┼───────────────┘
                                                                     │ Realtime / BFF
                                                     ┌───────────────▼───────────────┐
                                                     │ Browser clients (role-aware)   │
                                                     │ Admin / Teacher / Student /    │
                                                     │ Guardian + Judge mode          │
                                                     └───────────────┬───────────────┘
                                                                     │ server-side HTTP adapters
                                      ┌──────────────────────────────┼───────────────────────────┐
                                      │ External services: Weather API, notification channel      │
                                      │ (email/Telegram/push), team-owned AI inference endpoints   │
                                      └───────────────────────────────────────────────────────────┘
```

**Hard boundary:** the web platform issues authorised commands and displays device-reported acknowledgements/results. It does not control physical light/buzzer/camera/door, and the door is simulated. Firmware owns all physical sensing, on-device face detection, safety decisions, BLE, CSI capture, local AP and local status page.

## 4. Layering

Requests flow one direction through explicit layers (Part A4.4):

```
UI components ─▶ typed hooks/services ─▶ domain services ─▶ db access (Supabase) + RLS
                                              │
                        device adapters ──────┤ (wire snake_case ⇄ canonical camelCase, one adapter)
                        external adapters ────┘ (weather, notifications, AI inference)
```

- UI components never query Supabase tables directly.
- Exactly one device-boundary adapter normalizes the Level 2 fixed wire format; raw payload JSON is preserved for audit.
- `(device_id, seq)` idempotency enforced at the database (unique constraint), not only in code.
- Device event time (`ts`) and server receipt time (`received_at`) stored separately.

## 5. Proposed folder architecture (feature-based)

```
/
├─ app/
│  ├─ (auth)/            login, forgot/reset password, invite accept
│  ├─ (platform)/        admin + teacher routes (overview, rooms, safety, vision, …)
│  ├─ (student)/         student dashboard/attendance/schedule
│  ├─ (guardian)/        guardian dashboard/children/attendance/notifications
│  ├─ (judge)/           judge mode + evidence centre
│  └─ api/device/v1/     telemetry, events, sync, config, commands, face, camera, csi, health
├─ src/
│  ├─ features/          auth, devices, telemetry, safety, attendance, access,
│  │                     vision, weather, reports, models, ota, judge, notifications
│  │                       └─ each: components/ hooks/ services/ schemas/ types/
│  ├─ server/            domain services, device adapters, external adapters, authz helpers
│  ├─ lib/               supabase clients (browser/server/service), env, time (Asia/Dhaka), utils
│  ├─ components/ui/     design-system primitives + Part D5 reusable components
│  └─ i18n/              en + bn translation keys
├─ supabase/migrations/  ordered SQL migrations (Prompt 02)
├─ mock-device/          dev-only ESP32 simulator (Prompt 01), disabled in production
└─ docs/                 this suite + generated API docs/ERD
```

## 6. Cross-cutting rules (enforced everywhere)

1. Strict TypeScript, no `any`; Zod at every trust boundary.
2. No service-role key / device secret / provider token in browser bundles or Git.
3. Server-side role + resource-scope check on every protected request; RLS as defense in depth.
4. Idempotent device ingestion; duplicates return explicit already-processed, never a second row.
5. UTC in storage/API; render Asia/Dhaka where a level requires local time.
6. Every important page has loading / empty / error / permission-denied / stale / offline / retry states.
7. Status is never faked: `PENDING/SENT/RECEIVED/APPLIED/FAILED/STALE/OFFLINE/UNKNOWN`.
8. No persistent storage of ordinary camera frames; only permitted intruder/mismatch/camera-fault snapshots.
9. Accessibility in scope (keyboard, focus, contrast, reduced motion, non-colour-only status).

## 7. Open architectural decisions

Tracked in [`hardware-contract-open-questions.md`](./hardware-contract-open-questions.md). The largest are: live-view/stream transport (dedicated worker vs device stream), notification channel selection, AI inference host location, and whether telemetry/events share one sequence namespace.
