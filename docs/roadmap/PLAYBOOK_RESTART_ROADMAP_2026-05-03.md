# Playbook Restart Roadmap - 2026-05-03

## Status read

Playbook is already more than a repo helper. The current product truth frames it as a deterministic runtime and trust layer between humans/AI agents and real repositories, with repo intelligence, governance, safe remediation, local/private-first runtime artifacts, and explicit plan/apply/verify boundaries.

The ATLAS mission context makes Playbook one continuous guardrail attached to every serious lane: governance, verification, reusable patterns, failure modes, worker prompts, and honest adoption/verification status. The reset should therefore avoid building a second Atlas inside Playbook. Playbook should become the reusable governance and verification owner, while Atlas remains the coordination root and owner-truth router.

## Restart thesis

The next Playbook lane should be: **source-verified convergence and adoption tooling**.

Playbook already exports a contract and supports deterministic repo intelligence. Atlas, Fitness, Mazer, and Lifeline now contain adoption/verification patterns that should be normalized into Playbook-owned contracts, templates, schemas, and scan/report commands.

The point is not to copy Atlas docs into Playbook. The point is to give Playbook first-class machinery for these questions:

1. What contract version does this repo claim?
2. What owner truth does this repo reference?
3. Which adoption patterns are implemented, not applicable, missing, or exceptioned?
4. Which verification report proves the claim?
5. Which source artifacts back the claim?
6. Does the repo duplicate owner truth instead of referencing it?
7. Is the trust posture negative-safe?
8. What next slice would move the repo from `partial` to `adopted` or `verified`?

## Source-backed inputs to absorb

### 1. Playbook owner contract

Keep and harden:

- `docs/contracts/PLAYBOOK-CONTRACT.md`
- `exports/playbook.contract.example.v1.json`
- `exports/playbook.contract.schema.v1.json`

Next hardening:

- Add a convergence scan contract.
- Add repo-local adoption evidence template generation.
- Add deterministic report rendering that maps repo artifacts to contract checks.

### 2. Atlas convergence and adoption matrix

Atlas currently owns the stack-level adoption matrix and root projection. Playbook should not absorb that root projection as truth. It should absorb the reusable scoring/reporting contract that makes each owner repo's adoption claim measurable.

Migration target:

- reusable adoption status vocabulary,
- evidence-type vocabulary,
- verification report shape,
- negative-safe status rules,
- source refs and scope declarations.

Stay in Atlas:

- stack inventory,
- root projection,
- initiative/portfolio truth,
- `docs/ops/PLAYBOOK-ADOPTION-MATRIX.md` as root-owned visibility.

### 3. Atlas playbook ingest policy

Atlas has a clean third-party playbook intake model: import, evaluate, normalize, catalog, selectively adopt/reject. Playbook should absorb this as a repo-level command/template surface for external playbook packs.

Migration target:

- source inventory schema,
- import/evaluate/normalize/catalog vocabulary,
- rejection reasons,
- vendor-neutral adoption rule,
- provenance and safety metadata.

Stay in Atlas:

- root runtime catalog paths,
- Cortex future recommendations,
- stack-level pack routing.

### 4. Fitness and Mazer verified adoption lanes

Fitness and Mazer are the best current examples of repo-local adoption evidence plus verification reports. Playbook should template these patterns.

Migration target:

- `docs/ops/<REPO>-PLAYBOOK-ADOPTION.md` template,
- `docs/ops/<REPO>-PLAYBOOK-VERIFICATION.md` template,
- `exports/<repo>.playbook.adoption.evidence.v1.json` schema/template,
- `exports/<repo>.playbook.verification.report.v1.json` schema/template,
- tests that validate owner-contract ids, version, scope, status, implemented/not-applicable checks, and drift posture.

Stay in owner repos:

- domain-specific truth,
- current-truth docs,
- app-specific artifacts,
- product-specific verification logic.

### 5. Lifeline approval/execution boundary

Lifeline has the execution/approval/receipt boundary and already consumes Playbook archetype exports. Playbook should keep publishing stable exports and a compatibility contract for Lifeline, but not take over execution.

Migration target:

- stable `exports/lifeline/**` version semantics,
- command docs for export validation,
- compatibility checks that prevent export-family drift.

Stay in Lifeline:

- privileged execution,
- approvals,
- receipts,
- proof-pass logic,
- server/operator boundary.

### 6. Supabase/Fitness production surface

The active Supabase project surfaced here is `FawxzzyFitness`, with RLS-enabled app tables. This does not become Playbook domain truth. It should inform a future production-observation adapter pattern: Playbook can inspect and report schema/security posture as evidence, while owner apps keep their data model truth.

Migration target:

- optional production-observation evidence adapter contract,
- table/RLS/row-count digest snapshots,
- no secrets, no data dumping, no owner-truth rewrite.

## Roadmap phases

### Phase 0 - Restart Pack and Review Gate

Goal: land the roadmap, inventory, and migration matrix before changing command behavior.

Deliverables:

- `docs/roadmap/PLAYBOOK_RESTART_ROADMAP_2026-05-03.md`
- `docs/migration/ATLAS_TO_PLAYBOOK_SOURCE_INVENTORY_2026-05-03.md`
- `docs/migration/ATLAS_TO_PLAYBOOK_MIGRATION_MATRIX_2026-05-03.md`
- `docs/contracts/PLAYBOOK_CONVERGENCE_SCAN_CONTRACT_DRAFT.md`
- `docs/roadmap/ROADMAP.json` appended with new feature ids after review.

Exit criteria:

- Docs audit passes.
- Roadmap contract validation passes.
- No owner truth is copied into Playbook as canonical app/root truth.

### Phase 1 - Convergence Scan Contract

Goal: make cross-repo Playbook adoption measurable from owner-repo artifacts.

Proposed commands:

```bash
pnpm playbook convergence scan --repo <path> --json
pnpm playbook convergence report --from .playbook/convergence-scan.json --format markdown
pnpm playbook convergence template adoption --repo-id <id>
```

Artifacts:

- `.playbook/convergence-scan.json`
- `.playbook/convergence-report.md`
- `.playbook/convergence-next-actions.json`

Rules:

- repo-local evidence is primary;
- root projection is read-only context;
- missing or malformed evidence is non-green;
- `verified` requires declared scope and reproducible verification command;
- app/domain docs are referenced, not copied.

### Phase 2 - Adoption Evidence Templates

Goal: turn Fitness/Mazer adoption patterns into reusable Playbook templates.

Deliverables:

- adoption evidence schema,
- verification report schema,
- docs templates,
- test fixture templates,
- `pnpm playbook convergence template ...` output.

Exit criteria:

- A fresh owner repo can generate a repo-local adoption slice without inventing local dialects.
- Generated template says what is not applicable rather than silently omitting role-required checks.

### Phase 3 - External Playbook Pack Ingest

Goal: migrate the Atlas playbook-ingest discipline into Playbook-owned reusable tooling.

Proposed commands:

```bash
pnpm playbook pack import --source <path-or-url> --out data/imports/playbooks/<source>/<slug>
pnpm playbook pack evaluate --input data/imports/playbooks/<source>/<slug> --json
pnpm playbook pack normalize --input .playbook/pack-evaluation.json --json
pnpm playbook pack catalog --from .playbook/pack-normalized.json --json
```

Rules:

- executable content is never trusted by default;
- vendor-specific content can be reviewed but only adopted as Playbook-owned vendor-neutral abstractions;
- raw import preservation and license/provenance metadata are required;
- pack adoption never mutates active repos during intake.

### Phase 4 - Fleet Readiness and Atlas Projection Bridge

Goal: connect Playbook convergence scan outputs to Atlas root read models without making Playbook the root store.

Deliverables:

- export bundle for Atlas consumption,
- root-safe status vocabulary,
- report format that Atlas can project read-only,
- drift detection for owner export changes.

Exit criteria:

- Atlas can read Playbook adoption/verification truth without reinterpreting or duplicating it.
- Playbook can emit the owner-truth evidence that Atlas needs.

### Phase 5 - Production Observation Adapter

Goal: support production-adjacent evidence snapshots such as Supabase schema/RLS health without taking ownership of app data or secrets.

Deliverables:

- production observation schema,
- provider adapter interface,
- Supabase read-only schema snapshot example,
- security/advisor gate documentation.

Rules:

- never dump row data;
- prefer structural metadata and policy status;
- include project id/name, schema/table names, RLS enabled state, counts as optional metadata only;
- treat production observations as evidence, not domain truth.

### Phase 6 - Self-hosted Playbook Doctrine Loop

Goal: use the convergence and ingest surfaces as the first practical self-improving loop.

Loop:

`scan -> evidence -> candidate pattern -> review -> promote -> template/check/report -> downstream adoption -> receipt -> scan`

Exit criteria:

- promoted patterns alter downstream template/report behavior only after explicit review;
- candidate-only knowledge cannot influence execution or verification gates silently.

## Immediate build queue

1. Land docs and migration matrix.
2. Append roadmap feature ids.
3. Add source-inventory schema and example artifact.
4. Add deterministic source classifier in engine.
5. Add tests for source classifier.
6. Design CLI wrapper for `convergence scan` after classifier is reviewed.
7. Generate adoption templates from Fitness/Mazer patterns.
8. Add Atlas projection export only after repo-local reports work.

## Non-goals

- Do not move Atlas mission docs into Playbook as canonical stack truth.
- Do not move Lifeline approvals/execution into Playbook.
- Do not copy Fitness/Mazer domain docs into Playbook.
- Do not make Playbook a hidden cross-repo queue runner.
- Do not treat raw transcripts as memory.
- Do not make visibility equal trust.

## Acceptance definition for this restart

This restart is successful when Playbook can answer, from explicit artifacts:

- which repos claim the contract,
- which contract version they claim,
- what evidence proves the claim,
- what verification scope is declared,
- what remains missing or not applicable,
- what next slice is needed,
- and what Atlas may safely project read-only.
