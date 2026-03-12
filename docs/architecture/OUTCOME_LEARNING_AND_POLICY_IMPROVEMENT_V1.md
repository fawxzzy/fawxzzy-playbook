# OUTCOME_LEARNING_AND_POLICY_IMPROVEMENT_V1

- feature_id: PB-V09-OUTCOME-LEARNING-001
- status: canonical future-state specification (v1)
- workflow anchor: `verify -> plan -> apply -> verify`

## Purpose

Define the canonical future-state contract for outcome learning and policy improvement in deterministic remediation planning.

This spec establishes how Playbook learns from remediation evidence while preserving deterministic trust boundaries, explicit control surfaces, and auditability.

## Scope

This document defines:

- The data model for learning from verify findings, generated plans, apply outcomes, and post-apply verify results.
- Safe learning boundaries that prevent hidden autonomy.
- Evidence recording semantics for successful and failed remediation attempts.
- Confidence, support, and scope-condition handling.
- Bounded planning improvements driven by learned outcomes.
- Non-goals and explicit failure modes.
- Rule / Pattern / Failure Mode note candidates for Playbook Notes promotion.

This document does **not** authorize autonomous policy mutation, hidden runtime behavior changes, or opaque reinforcement behavior that replaces deterministic rules.

---

## 1) Canonical remediation evidence lifecycle

Outcome learning is downstream of deterministic execution. The canonical lifecycle is:

1. `verify` produces pre-apply findings.
2. `plan` produces deterministic remediation tasks.
3. `apply` produces task-level execution outcomes.
4. `verify` produces post-apply findings.
5. `assess` computes net effect and emits bounded policy-improvement signals.

Learning is therefore an evidence interpretation layer, not an execution authority layer.

---

## 2) Data model for outcome learning

All learning artifacts are immutable, run-linked, and schema-versioned.

### 2.1 Core entities

### A. `RemediationRun`

Top-level record for a single remediation cycle.

Required fields:

- `run_id`
- `repo_fingerprint` (repo identity + revision + policy profile)
- `started_at`, `ended_at`
- `initiator` (`human`, `ci`, `automation`)
- `playbook_version`
- `workflow_version`

### B. `VerifySnapshot`

Captured for both pre-apply and post-apply verify invocations.

Required fields:

- `verify_snapshot_id`
- `run_id`
- `phase` (`pre_apply`, `post_apply`, optional `intermediate`)
- `findings[]`:
  - `finding_fingerprint`
  - `rule_id`
  - `severity`
  - `module_scope`
  - `file_scope`
  - `message`
  - `metadata`
- `summary` (counts by severity, rule, and scope)

### C. `PlanSnapshot`

Deterministic planning output tied to a source verify snapshot.

Required fields:

- `plan_snapshot_id`
- `run_id`
- `source_verify_snapshot_id`
- `tasks[]`:
  - `task_id`
  - `task_type`
  - `target_rule_id`
  - `target_scope`
  - `candidate_template_ids` (ordered)
  - `selected_template_id`
  - `deterministic_rationale_codes`
  - `depends_on`
- `plan_order`
- `plan_hash`

### D. `ApplySnapshot`

Task-level execution outcomes tied to plan snapshot.

Required fields:

- `apply_snapshot_id`
- `run_id`
- `source_plan_snapshot_id`
- `task_outcomes[]`:
  - `task_id`
  - `status` (`applied`, `skipped`, `failed`, `blocked`)
  - `failure_category`
  - `error_signature`
  - `artifact_delta`
  - `execution_time_ms`
- `apply_summary`

### E. `OutcomeAssessment`

Computed effect of the remediation cycle.

Required fields:

- `assessment_id`
- `run_id`
- `pre_verify_snapshot_id`
- `post_verify_snapshot_id`
- `plan_snapshot_id`
- `apply_snapshot_id`
- `resolved_findings[]`
- `unresolved_findings[]`
- `regressed_findings[]`
- `net_effect`:
  - `resolution_rate`
  - `regression_rate`
  - `weighted_improvement_score`

### 2.2 Learning entities

### F. `PatternOutcomeRecord`

Evidence row binding an attempted pattern/template to an observed outcome.

Required fields:

- `pattern_outcome_id`
- `pattern_or_template_id`
- `rule_id`
- `scope_conditions`:
  - runtime/language/framework
  - module archetype/file archetype
  - environment constraints
  - policy profile
- `attempt_context`
- `outcome_class` (`success`, `partial`, `failure`, `regression`)
- `support_weight`
- `confidence_band` (`low`, `medium`, `high`)
- `first_seen_at`, `last_seen_at`
- `evidence_refs` (run/snapshot identifiers)

### G. `PolicyImprovementSignal`

Non-executable signal derived from repeated evidence.

Required fields:

- `signal_id`
- `signal_type` (`ranking_bias`, `ordering_bias`, `prevention_suggestion`)
- `target`
- `scope_conditions`
- `signal_strength`
- `support_weight`
- `confidence_band`
- `evidence_refs`
- `explanation_codes`
- `status` (`candidate`, `approved`, `rejected`, `expired`)

---

## 3) Safe learning boundaries

### 3.1 No silent autonomous mutation

- Learning outputs MUST NOT mutate verify, plan, or apply logic implicitly.
- Behavior-impacting changes MUST pass explicit deterministic governance control surfaces.
- Every active signal MUST be inspectable and attributable to evidence.

### 3.2 No opaque reinforcement replacing deterministic rules

- Learned outcomes MUST NOT replace rule semantics.
- Verify findings remain rule-defined, deterministic, and transparent.
- Learning may tune ranking/ordering among valid deterministic candidates only.

### 3.3 Policy improvement informs ranking/template selection, not hidden action

- Signals may influence candidate ranking and task ordering.
- Signals MUST NOT create hidden tasks, hidden side effects, or undeclared execution.
- Plan output MUST retain deterministic rationale regardless of learned influence.

### 3.4 Controlled activation only

- Signals become active only through explicit policy state (e.g., approved signal set/profile).
- Unsupported or low-confidence contexts MUST fall back to baseline deterministic behavior.

---

## 4) Outcome recording contract

### 4.1 Successful remediation patterns

Playbook records success when:

- targeted findings resolve in post-apply verify,
- no material regression is introduced,
- apply outcomes match intended scope and complete successfully.

Success recording includes:

- pattern/template identifier,
- full scope conditions,
- pre/post verify evidence references,
- updated support/confidence with explanation codes.

### 4.2 Failed remediation attempts

Playbook records failure when:

- apply fails or is blocked,
- findings remain unresolved,
- regressions exceed tolerance,
- or environmental constraints invalidate expected execution.

Failure recording includes:

- normalized failure category,
- error signature and impacted scope,
- classification (`environmental`, `semantic`, `ordering`, `unknown`),
- evidence links equivalent in fidelity to success recording.

### 4.3 Confidence and support

- `support_weight` measures evidence quantity and independence.
- `confidence_band` expresses reliability under matched scope conditions.
- Confidence rises with repeated, independent, stable outcomes.
- Confidence decays or caps under contradictory outcomes.
- Low-support evidence remains advisory and weakly weighted.

### 4.4 Scope conditions

No generalized learning decision is valid without explicit scope conditions.

Minimum scope condition families:

- repository/runtime profile,
- language/framework/toolchain,
- module and file archetype,
- rule and finding class,
- execution environment and constraints.

---

## 5) Future planning impact (bounded)

### 5.1 Candidate template ranking

At plan-time, deterministic candidate enumeration remains unchanged; learned signals only reorder candidates within that deterministic candidate set.

### 5.2 Remediation ordering

For multi-task plans, learned ordering bias may promote sequences with better historical unblock/resolution outcomes, while preserving dependency correctness.

### 5.3 Prevention-target suggestions

Post-assessment signals may suggest prevention targets (guardrail, documentation, process hardening opportunities) for review. Suggestions are advisory and non-mutating.

---

## 6) Non-goals

- Autonomous self-modifying remediation behavior.
- Hidden runtime mutation of deterministic control logic.
- Opaque policy engines that bypass explicit plan artifacts.
- Unscoped generalization across incompatible repositories/environments.
- Optimizing short-term pass-rate at the expense of explainability and governance.

---

## 7) Failure modes

- **Opaque Policy Drift:** learned influence changes behavior without explicit policy visibility.
- **Scope Collapse:** narrow-context evidence over-generalized into incompatible contexts.
- **Survivorship Bias:** failures under-recorded relative to successes.
- **Feedback Lock-In:** early signals suppress alternative candidates prematurely.
- **Environment Confounding:** environmental failures misattributed to template quality.
- **Confidence Inflation:** confidence rises without auditable support.

---

## 8) Rule / Pattern / Failure Mode note candidates

- **Pattern:** Learn From Reviewed Outcomes, Not Hidden Autonomy.
- **Rule:** Outcome Learning Tunes Ranking, Not Mutation Authority.
- **Failure Mode:** Opaque Policy Drift.
- **Rule candidate:** Learned influence must remain traceable to immutable remediation evidence.
- **Pattern candidate:** Record failed remediation attempts with equal fidelity to successful attempts.
- **Failure Mode candidate:** Scope-tag omission causes unsafe policy transfer.

---

## 9) Canonical operating statement

For `feature_id: PB-V09-OUTCOME-LEARNING-001`, Playbook outcome learning is evidence-driven, scope-bounded, and governance-gated: it improves deterministic planning quality through transparent ranking, ordering, and prevention suggestions without acquiring hidden mutation authority.
