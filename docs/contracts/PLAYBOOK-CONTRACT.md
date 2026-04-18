# Playbook Contract

## Purpose

Playbook is the governance and verification owner for cross-repo operating truth in the ATLAS stack.

This contract defines the canonical principles, patterns, continuity requirements, adoption checks, and verification hooks that downstream consumers must read as owner truth rather than rephrasing into a second store.

## Non-Goals

- Playbook does not vendor Atlas root runtime state into the repo.
- Playbook does not copy owner-repo doctrine or implementation docs out of downstream repos.
- Playbook does not collapse the ATLAS polyrepo into a monorepo.
- Playbook does not treat raw chat transcripts as canonical memory.
- Playbook does not widen write or apply power from read-only visibility surfaces.

## Canonical Principles

- Awareness before action.
- Memory before intelligence.
- Federate, do not duplicate.
- Determinism over ambiguity.
- Nothing meaningful stays dark.
- Nothing meaningful stays unowned.
- Systems over prompts.
- Not everything knows everything.

## Operating Loop

The default operating loop is:

`awareness -> attention -> initiative -> proposed_session -> approval -> execution -> receipt -> memory_refinement`

The loop stays meaningful only when read models, approvals, receipts, and promotion surfaces remain explicit.

## Owner Domains

| Domain | Owner | Responsibility |
| --- | --- | --- |
| Stack coordination | ATLAS root | Selection, orchestration posture, repo inventory, read-only stack visibility |
| Governance contract | Playbook repo | Canonical contract, policy, verification, convergence rules |
| Execution boundary | Lifeline repo | Capability surfacing, approval boundary, receipts |
| Orchestration | `_stack` repo | Worker flow, resume, merge, orchestration state |
| Platform doctrine | Atlas repo | UAPI, platform contracts, architecture doctrine |
| Knowledge lane | Knowledge surfaces | Evidence ingestion, promotion, queryability |
| Vertical truth | Owner repos | Domain truth, repo-local workflows, repo-local evidence |

Owner repos keep owner truth. Playbook defines the contract for convergence, but it does not become the canonical implementation store for child-repo doctrine.

## Conformance Classes

- `core_required`: required for any participating repo or stack surface
- `role_required`: required only for specific roles or boundaries
- `supported_optional`: supported but not mandatory in every slice
- `not_applicable`: declared not applicable for the target slice
- `exception_documented`: allowed only with explicit owner, rationale, risk, control, and retirement trigger

## Required Patterns

- Proposal before execution: action-seeking flows stay proposal-only until the governed execution boundary is crossed.
- Explicit trust posture: visibility must not imply trust or verification.
- Owner repo keeps owner truth: repo-local truth stays in the owning repo and is consumed read-only downstream.
- No second truth store: downstream consumers must not recreate owner doctrine as competing canonical content.
- Convergence is measurable: adoption must be evidenced through explicit checks and verification hooks.
- Receipts and observations matter: meaningful actions emit reviewable proof.
- Context is intent-routed: consumers select the relevant contract slice instead of dumping the whole stack.

## Continuity Model

- Raw transcript is traceability, not canonical memory.
- Structured handoff is required for meaningful Codex or ChatGPT work.
- Durable outputs promote into initiative, working memory, plan, knowledge, or receipt surfaces.
- Promotion requires explicit review and provenance; transcript residue alone is insufficient.

Required handoff fields:

- `artifact_id`
- `created_at`
- `source_channel`
- `repo_refs`
- `initiative_refs`
- `durable_facts`
- `decisions`
- `next_actions`
- `open_questions`
- `risks`
- `promotion_targets`
- `transcript_refs`

## Adoption Checks

- A versioned human-readable contract exists in Playbook.
- A versioned machine-readable export exists in Playbook.
- Downstream consumers read the export without copying owner truth into a second canonical store.
- Proposal and execution remain visibly separated.
- Continuity uses structured handoff and promotable durable outputs.
- Trust posture renders clearly, including negative or unverified states.

## Verification Hooks

- Validate the example export against the published schema.
- Reject duplicate ids across principles, patterns, adoption checks, and verification hooks.
- Reject continuity models that omit raw trace, structured handoff, or promotion targets.
- Warn when contract text or exports drift toward transcript-as-memory or duplicate-truth guidance.

## Anti-Patterns

- Transcript as memory.
- Duplicate truth store for owner-repo content.
- Visibility implying trust.
- Read-only surfaces silently widening write power.
- Stale session residue outranking current initiative or proposal truth.
- Root-level vendoring of child-repo implementation truth.

## Downstream Consumption Note

Downstream consumers should read:

- Human contract: `docs/contracts/PLAYBOOK-CONTRACT.md`
- Schema: `exports/playbook.contract.schema.v1.json`
- Example export: `exports/playbook.contract.example.v1.json`

Consumers should reference these files directly and add their own evidence locally. They should not copy the contract into a second canonical store.
