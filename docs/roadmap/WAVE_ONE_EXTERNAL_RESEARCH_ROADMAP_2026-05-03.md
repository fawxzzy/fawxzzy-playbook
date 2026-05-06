# Wave One External Research Roadmap

Status: review-only synthesis for future roadmap promotion. This document is not live command truth and not a canonical implementation contract.

## Purpose

Translate Wave One external research across Playbook, Fitness, and Lifeline into a Playbook-first pattern library, integration map, and sequencing proposal.

Rule: standardize reusable contracts in Playbook first, then let Fitness and Lifeline consume those contracts through existing seams.

Rule: do not introduce a `playbook research <project>` command until the underlying artifacts, schemas, validators, and report builders are stable.

## Repo baseline

Playbook already behaves like a deterministic repo runtime and trust layer, so the highest-leverage move is to publish reusable contracts and scoreable reports rather than widen the command surface first.

Fitness already has a governed seam where product signals can flow into Playbook planning and Lifeline execution. The near-term leverage is activation, experimentation hygiene, and monetization scaffolding, not a platform rewrite.

Lifeline is already a bounded local operator. The highest-value borrow from external systems is boring operator discipline: health checks, backups, secret indirection, approvals, and preview-style profiles.

## Pattern Library

| Pattern | Why it matters | First Playbook use |
| --- | --- | --- |
| Catalog before orchestration | Shared metadata has to stabilize before automation can be trusted. | Research artifact family and repo inventory/report surfaces. |
| Scorecards turn standards into an operating system | Prose doctrine drifts unless it becomes measurable. | Repo scorecard report contract for Wave One repos. |
| Golden paths beat one-off setup docs | Reuse sticks when defaults are encoded into checked-in templates. | Template registry for common repo and feature archetypes. |
| Contracts before command surfaces | Stable artifacts and validators should exist before CLI UX expands. | Keep the research lane commandless until contracts and reports are real. |
| Health checks and recovery are trust primitives | Execution systems need readiness and recovery proof, not just commands. | Future Lifeline consumer slices after Playbook contracts exist. |

## Integration Map

| Repo | Best fit now | Minimal adoption shape |
| --- | --- | --- |
| Playbook | Research artifacts, scorecards, templates, workflow-pack/environment contracts | Schemas, examples, validators, engine report builders, and review docs |
| Fitness | Guided activation, experiment hygiene, monetization entitlement seams | Consume accepted Playbook patterns through repo-local contracts and server-side boundaries |
| Lifeline | Runtime readiness, backup proof, secret indirection | Consume accepted Playbook patterns through manifest contracts and receipts |

## Playbook-First Build Order

| Proposed slice | Why it should exist now | Minimal first deliverable |
| --- | --- | --- |
| Research contract foundation | Converts external-research work into a deterministic artifact family. | Published schemas and examples for `project-profile`, `pattern-set`, `integration-map`, and `roadmap-diff` |
| Repo scorecard engine/report | Imports the strongest external IDP pattern without cloning a portal. | Engine builder, stable report schema, example, and validator |
| Golden-path template registry | Standardizes adoption without widening runtime authority. | Checked-in template descriptors for common repo and feature archetypes |
| Workflow-pack environment bridge | Aligns reusable workflows and approval boundaries with existing workflow-pack doctrine. | Contract docs for reusable workflows, inputs/outputs, and environment gates |

## Downstream Consumer Lanes

These belong after the Playbook slices above and should land in their own repos, not as Playbook command claims.

| Repo | Future slice | First deliverable |
| --- | --- | --- |
| Fitness | Activation and experiment hardening | Guided activation wizard plus one explicit exposure-and-guardrail experiment contract |
| Fitness | Monetization entitlement contract | `plans`, `entitlements`, and `subscription_state` schemas before billing integration |
| Lifeline | Runtime readiness contract | Manifest `healthcheck`, `startupBudget`, and `dependsOn` contracts plus receipts |
| Lifeline | Backup and secret-indirection contract | Backup plan/report contract and provider-agnostic `secretRef` schema |

## Non-Goals For This Lane

- No `docs/commands/research.md`
- No `pnpm playbook research`
- No hidden repo scanning or Atlas-root orchestration
- No automatic `.playbook` writes from research inputs
- No Fitness or Lifeline implementation claims inside Playbook roadmap truth

## Promotion Guidance

Promote only the smallest contract-first Playbook slices into canonical `docs/roadmap/ROADMAP.json`.

Keep the rest as review-only proposals until the underlying artifacts exist and targeted validation passes.
