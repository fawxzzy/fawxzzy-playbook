# Playbook Governed Interface / API Surfaces for Multi-Repo Control Planes

## Purpose

This document defines the canonical **Governed Interface / API Surfaces for Multi-Repo Control Planes** architecture slice for Playbook.

It describes how future dashboards, CI control planes, internal platforms, and server-side integrations can orchestrate many Playbook-enabled repositories through thin, policy-aware interfaces over the same deterministic runtime.

This architecture is an optional interface expansion layer. It does not replace local CLI workflows, and it does not redefine core engine semantics.

This layer is downstream of:

1. Session + Evidence
2. Control Plane
3. PR Review Loop
4. Repo Longitudinal State + Knowledge Promotion
5. Knowledge Query / Inspection Surfaces
6. Automation Synthesis (Governed Knowledge Consumption)
7. Outcome Feedback + Automation Runtime Learning
8. Governed Cross-Repo Pattern Promotion / Transfer

## Docs summary labels

- Pattern: Thin Interfaces Over One Deterministic Runtime
- Pattern: Multi-Repo Control Planes Coordinate, They Do Not Collapse Repo Boundaries
- Pattern: Aggregation With Per-Repo Evidence Drill-Down
- Rule: Browser clients use validated server/API actions, not arbitrary CLI execution
- Rule: Repo-local facts stay local unless intentionally promoted/exported
- Rule: Aggregated control-plane views must preserve per-repo provenance
- Rule: Batch mutation is exceptional and strongly policy-gated
- Failure Mode: Cloud shell disguised as control plane
- Failure Mode: Aggregated UI that loses per-repo evidence lineage
- Failure Mode: Browser-side arbitrary command execution
- Failure Mode: One repo’s local policy silently becoming org-wide truth
- Failure Mode: Multi-repo data pooling without explicit governance

## Core model

Playbook interface expansion follows these invariants:

- Playbook Core remains the shared deterministic runtime.
- Each repository retains project-local Playbook state ownership.
- Multi-repo control planes coordinate repositories through governed server/API surfaces.
- Interface surfaces are thin wrappers over canonical runtime/session/evidence/control-plane behavior.
- Interface layers do not redefine engine semantics.

This architecture must not reposition Playbook into a cloud-first SaaS dependency, generic remote shell, or open-ended agent runtime.

## Control-plane scope hierarchy

Canonical control-plane scope should be explicit and ordered:

1. actor
2. session
3. repository
4. workspace / project group
5. organization / tenant
6. optional upstream/core promotion scope

Policy decisions and approvals should resolve against this scope hierarchy rather than implicit global defaults.

## Actor classes and permission families

Control planes should model actor classes explicitly:

- human operator
- CI workflow
- maintenance workflow
- internal platform service
- AI assistant / future agent
- reviewer / approver
- admin / policy owner

Permission assignment should be action-class aware and scope-bound so the same operation can be allowed, blocked, or escalated per actor/scope/policy context.

## Interface/API action classes

Governed interface surfaces should classify requests into deterministic action classes:

1. read-only intelligence actions
2. policy/inspection actions
3. session/evidence inspection actions
4. PR/review actions
5. longitudinal knowledge inspection actions
6. governed transfer/import/export actions
7. approved mutation/orchestration actions
8. admin/control-plane configuration actions

Default posture should bias toward exposing read-only/inspection actions before mutation/orchestration classes.

## Default safety posture

- Read-only actions are easiest to expose first.
- Mutation actions require policy, scope, and approval checks.
- Browser clients call validated server endpoints/actions only.
- Browser clients do not run arbitrary local CLI commands.
- Ambiguous policy or incomplete evidence fails closed.

## Canonical request envelope concepts

Every governed interface action should carry a deterministic request envelope conceptually including:

- actor identity
- target repo / repo set
- workspace/tenant scope
- requested operation
- mode (`read-only`, `verify-only`, `approved-mutation`, `orchestration`)
- session ID or idempotency key
- evidence/policy context references
- requested output format
- approval token / approval context where required

Envelope validation should fail closed if required fields are missing for the requested action class.

## Canonical response/output concepts

Governed interface responses should preserve deterministic runtime semantics and include:

- structured deterministic result
- linked session ID
- linked evidence references
- policy decision metadata
- mutation eligibility metadata
- repo-local vs transferable knowledge classification
- partial-success / blocked / fail-closed status semantics

Response contracts should make policy and provenance explicit enough for audit/review without requiring hidden internal interpretation.

## Multi-repo batch semantics

Batch operations must preserve per-repo trust boundaries:

- batch read operations may aggregate deterministic per-repo outputs
- batch mutation should remain rare and strongly policy-gated
- cross-repo actions must preserve per-repo evidence and approval boundaries
- one repo’s policy outcome must not silently override another’s
- cross-repo summaries should remain explainable as composed per-repo results

Aggregation should improve operator visibility, not collapse repository-level accountability.

## Server/runtime boundary rules

- API/server surfaces are wrappers over canonical Playbook runtime behavior.
- adapters/integrations must not leak tool-specific semantics into core behavior.
- local CLI remains valid even when control-plane APIs exist.
- cloud or hosted control planes must remain optional, not required for baseline use.

This keeps engine determinism and local portability intact across interface transports.

## Interface family examples (directional)

Directional endpoint families may include:

- `/api/playbook/ask`
- `/api/playbook/query`
- `/api/playbook/explain`
- `/api/playbook/index`
- future session/evidence inspection endpoints
- future knowledge inspection endpoints
- future governed transfer/import endpoints
- future approved orchestration endpoints

These are interface wrappers over canonical runtime behavior rather than independent semantics.

## Relationship to existing architecture layers

- **Session + Evidence** provides traceable unit-of-work identity.
- **Control Plane** governs permissions, mutation scopes, export, and approvals.
- **PR Review Loop** provides review-native multi-repo workflows.
- **Repo Longitudinal State + Knowledge Promotion** provides durable local learning.
- **Knowledge Query / Inspection Surfaces** provide readable memory/intelligence.
- **Automation Synthesis** and **Outcome Feedback** remain downstream governed flows.
- **Cross-Repo Pattern Promotion / Transfer** governs what reusable knowledge can move across repositories.
- **Governed Interface/API Surfaces** expose these layers safely to control-plane products.

Recommended architecture ordering:

`deterministic runtime -> session/evidence -> control plane -> PR review loop -> repo longitudinal state/knowledge promotion -> knowledge query/inspection surfaces -> automation synthesis consuming governed/promoted knowledge -> outcome feedback/automation runtime learning -> governed cross-repo pattern promotion/transfer -> governed interface/API surfaces for multi-repo control planes`

## Privacy and locality rules

- repo-local facts remain local by default
- no hidden telemetry
- export/sync remains explicit opt-in
- multi-repo control planes should consume governed summaries and approved artifacts, not unrestricted raw repo memory by default
- receiving/aggregating systems must preserve provenance and scope boundaries

Control-plane convenience must not become implicit cross-repo memory pooling.

## Inspection and audit expectations

- every API action should be traceable to a session/evidence chain
- approvals should remain auditable
- policy decisions should be inspectable
- multi-repo summaries should preserve drill-down to per-repo evidence
- imported/transferred patterns should remain identifiable as external inputs until locally reviewed

## Guardrails and non-goals

- Not a cloud-first SaaS requirement for baseline Playbook operation.
- Not a replacement for local CLI-first and offline-capable workflows.
- Not arbitrary browser-side CLI or shell execution.
- Not a generic remote-shell API or open-ended agent hosting surface.
- Not a bypass around Session + Evidence, Control Plane, or per-repo adoption authority.
- Not opaque global memory aggregation that erases provenance boundaries.

## Cross-links

- `docs/architecture/PLAYBOOK_SESSION_EVIDENCE_ARCHITECTURE.md`
- `docs/architecture/PLAYBOOK_CONTROL_PLANE_ARCHITECTURE.md`
- `docs/architecture/PLAYBOOK_PR_REVIEW_LOOP_ARCHITECTURE.md`
- `docs/architecture/PLAYBOOK_REPO_LONGITUDINAL_STATE_AND_KNOWLEDGE_PROMOTION.md`
- `docs/architecture/PLAYBOOK_KNOWLEDGE_QUERY_AND_INSPECTION_SURFACES.md`
- `docs/architecture/PLAYBOOK_AUTOMATION_SYNTHESIS_GOVERNED_KNOWLEDGE_CONSUMPTION.md`
- `docs/architecture/PLAYBOOK_OUTCOME_FEEDBACK_AND_AUTOMATION_RUNTIME_LEARNING.md`
- `docs/architecture/PLAYBOOK_GOVERNED_CROSS_REPO_PATTERN_PROMOTION_AND_TRANSFER.md`
- `docs/PLAYBOOK_PRODUCT_ROADMAP.md`
- `docs/roadmap/IMPROVEMENTS_BACKLOG.md`
- `docs/roadmap/ROADMAP.json`
- `docs/CONSUMER_INTEGRATION_CONTRACT.md`
- `docs/AUTOMATION_SYNTHESIS_VISION.md`
