# OUTCOME_LEARNING_AND_POLICY_IMPROVEMENT_V1

## Purpose

Define the canonical future-state specification for **outcome learning** and **policy improvement** in Playbook's deterministic remediation workflow.

This specification governs how evidence from `verify -> plan -> apply -> verify` is captured, interpreted, and fed back into future planning **without** violating deterministic trust boundaries.

## Scope

This document defines:

- A data model for lifecycle evidence.
- Safe learning boundaries and control constraints.
- Recording semantics for successful and failed remediation patterns.
- Confidence/support and scope condition handling.
- Policy-improvement influence points in future deterministic planning.
- Non-goals and expected failure modes.
- Candidate Rule / Pattern / Failure Mode notes for governance integration.

This document does **not** authorize autonomous mutation of deterministic rule execution behavior.

---

## 1) Outcome learning in deterministic remediation

Playbook's canonical deterministic remediation workflow remains:

1. `verify`
2. `plan`
3. `apply`
4. `verify`

Outcome learning augments this flow by producing a transparent, auditable evidence layer that informs:

- template candidate ranking,
- task ordering preferences,
- prevention-target suggestions,

while preserving explicit, inspectable, deterministic plan generation and application semantics.

---

## 2) Canonical learning data model

Outcome learning should operate on immutable event records tied to a single remediation cycle.

## 2.1 Entity model

### A. `RemediationRun`

Represents one full or partial execution of deterministic remediation.

Suggested fields:

- `run_id` (stable unique id)
- `repo_fingerprint` (repo identity + branch/revision context)
- `started_at`, `ended_at`
- `initiator` (`human`, `ci`, `automation`)
- `playbook_version`
- `workflow_version` (schema/version for the remediation lifecycle)

### B. `VerifySnapshot`

Represents one invocation of `verify` within a `RemediationRun`.

Suggested fields:

- `verify_snapshot_id`
- `run_id`
- `phase` (`pre_apply`, `post_apply`, optional `intermediate`)
- `findings` (normalized set)
  - `rule_id`
  - `severity`
  - `module_scope`
  - `file_scope`
  - `finding_fingerprint`
  - `message`
  - `metadata`
- `summary`
  - counts by severity
  - counts by rule

### C. `PlanSnapshot`

Represents generated plan state from `plan`.

Suggested fields:

- `plan_snapshot_id`
- `run_id`
- `source_verify_snapshot_id`
- `tasks`
  - `task_id`
  - `task_type`
  - `target_rule_id`
  - `target_scope`
  - `candidate_template_ids` (ranked candidates considered)
  - `selected_template_id`
  - `deterministic_rationale` (machine-readable reason codes)
  - `depends_on`
- `plan_order` (ordered task ids)
- `plan_hash` (canonical content hash)

### D. `ApplySnapshot`

Represents observed outcomes from `apply`.

Suggested fields:

- `apply_snapshot_id`
- `run_id`
- `source_plan_snapshot_id`
- `task_outcomes`
  - `task_id`
  - `status` (`applied`, `skipped`, `failed`, `blocked`)
  - `failure_category` (if failed/blocked)
  - `error_signature`
  - `artifact_delta` (high-level diff stats + touched scope)
  - `execution_time_ms`
- `apply_summary`
  - applied count
  - failed count
  - skipped/blocked counts

### E. `OutcomeAssessment`

Represents deltas between pre/post verification and plan/apply trace.

Suggested fields:

- `assessment_id`
- `run_id`
- `pre_verify_snapshot_id`
- `post_verify_snapshot_id`
- `plan_snapshot_id`
- `apply_snapshot_id`
- `resolved_findings` (fingerprints closed)
- `unresolved_findings`
- `regressed_findings` (new or worsened)
- `net_effect`
  - `resolution_rate`
  - `regression_rate`
  - weighted improvement score

## 2.2 Linkable pattern evidence model

### F. `PatternOutcomeRecord`

Evidence row linking an attempted remediation strategy to a result.

Suggested fields:

- `pattern_outcome_id`
- `pattern_id` (or template id if pre-promotion)
- `rule_id`
- `scope_conditions` (normalized)
  - language/runtime
  - framework
  - module type
  - file archetype
  - constraint flags
- `attempt_context`
  - repo/profile class
  - plan task type
  - execution environment class
- `outcome_class` (`success`, `partial`, `failure`, `regression`)
- `support_weight` (derived from evidence quality and count)
- `confidence_band` (`low`, `medium`, `high`)
- `first_seen_at`, `last_seen_at`

### G. `PolicyImprovementSignal`

Derived, non-executable recommendation signal for future planning.

Suggested fields:

- `signal_id`
- `signal_type` (`ranking_bias`, `ordering_bias`, `prevention_suggestion`)
- `target`
  - template id / task type / rule-prevention pair
- `scope_conditions`
- `signal_strength`
- `evidence_refs` (list of `pattern_outcome_id` / `assessment_id`)
- `explanation` (traceable reason codes)
- `status` (`candidate`, `approved`, `rejected`, `expired`)

---

## 3) Safe learning boundaries

Outcome learning must remain subordinate to deterministic governance.

## 3.1 Boundary: no silent autonomous mutation

- Learning outputs must **not** directly mutate verify rules, plan generation logic, or apply behavior at runtime.
- Any behavior-impacting change must enter explicit deterministic configuration or reviewed promotion flow.
- Every influence from learned evidence must be inspectable and attributable.

## 3.2 Boundary: no opaque reinforcement replacing deterministic rules

- Learned signals cannot replace rule semantics.
- Rule interpretation and violation detection remain deterministic and transparent.
- Ranking improvements may influence *which candidate is preferred*, not whether a rule is enforced.

## 3.3 Boundary: policy improvement is advisory and bounded

- Policy improvements may inform ranking/template selection and ordering.
- Policy improvements must not trigger hidden actions outside declared plan tasks.
- Deterministic plan output must preserve explicit rationale for each selected action.

## 3.4 Boundary: explicit control surfaces only

- Learned signal activation should occur only via known control surfaces (e.g., policy profile, approved signal set).
- Unsupported contexts should gracefully fall back to baseline deterministic behavior.

---

## 4) Recording semantics for remediation outcomes

## 4.1 Successful remediation patterns

Playbook records success when:

- targeted finding fingerprints are resolved post-apply,
- no material regressions are introduced,
- task/application succeeded under declared scope conditions.

Success records should include:

- the template/pattern attempted,
- scope conditions,
- before/after verify evidence,
- confidence/support updates.

## 4.2 Failed remediation attempts

Playbook records failure when:

- apply fails or is blocked,
- post-apply verify does not resolve targeted findings,
- regressions exceed tolerated threshold.

Failure records should include:

- normalized failure category,
- error signature,
- affected scope,
- whether failure is environmental, semantic, or ordering-related.

## 4.3 Confidence and support

Confidence is a bounded interpretation of evidence quality and consistency.

Suggested principles:

- **Support** grows with independent successful observations in matching scope conditions.
- **Confidence** increases when outcomes are stable across repositories and contexts.
- Confidence decays or is capped when contradictory outcomes accumulate.
- Low-support signals should remain advisory with conservative weight.

## 4.4 Scope conditions

Scope conditions are mandatory for safe generalization.

Minimum condition families:

- repository/runtime profile,
- language + framework,
- module archetype,
- rule id and finding class,
- environmental constraints (CI/local, permissions, tooling availability).

Signals lacking explicit scope conditions should not influence planning.

---

## 5) Policy-improvement effects on future planning

Outcome learning affects future planning at bounded decision points.

## 5.1 Candidate template ranking

During plan generation:

- candidate templates for a task are enumerated deterministically,
- learned ranking bias reorders candidates by scoped evidence,
- planner still emits deterministic rationale including why candidate A outranked B.

If evidence is insufficient or conflicting, fallback to baseline ranking.

## 5.2 Remediation ordering

For multi-task plans:

- learned ordering bias can prioritize historically unblock-first sequences,
- ordering changes must preserve dependency correctness,
- ordering rationale must cite evidence class (e.g., reduced failures for specific ordering under matching conditions).

## 5.3 Prevention-target suggestions

Post-remediation analysis may emit prevention suggestions, such as:

- candidate guardrail tightening,
- docs/process hardening opportunities,
- recurring root-cause prevention candidates.

These suggestions are advisory outputs for human/governance review, not implicit rule mutations.

---

## 6) Non-goals

- Building a self-modifying autonomous remediation agent.
- Replacing deterministic verify rules with opaque learned policies.
- Applying learned actions that bypass explicit plan artifacts.
- Optimizing solely for short-term pass rate at the expense of governance transparency.
- Generalizing patterns across scopes without explicit scope condition compatibility.

---

## 7) Failure modes

## 7.1 AI contract drift via hidden behavior changes

Learning signals silently alter plan/apply behavior without explicit surfaced policy state.

## 7.2 Scope collapse / unsafe over-generalization

Outcomes from narrow contexts are applied broadly, reducing reliability and increasing regressions.

## 7.3 Survivorship bias in pattern promotion

Only successful runs are captured; failed attempts are under-recorded, causing inflated confidence.

## 7.4 Feedback loop lock-in

Early high-confidence signals dominate ranking and suppress exploration, preserving suboptimal policy choices.

## 7.5 Environment-confounded learning

Environmental failures are misclassified as template/pattern failures, contaminating policy signals.

## 7.6 Opaque confidence inflation

Confidence scores rise without auditable support traces or independent corroboration.

---

## 8) Rule / Pattern / Failure Mode note candidates

Candidate governance notes for future integration:

- **Rule candidate:** Outcome learning signals must remain advisory unless explicitly promoted through deterministic governance controls.
- **Rule candidate:** Planning influenced by learned signals must emit deterministic rationale with evidence references.
- **Rule candidate:** Pattern promotion requires both success and failure evidence accounting for matched scope conditions.
- **Pattern candidate:** Store remediation outcome evidence as immutable run-linked snapshots to preserve auditability.
- **Pattern candidate:** Prefer scoped ranking biases over direct behavioral mutation for safe policy improvement.
- **Failure Mode candidate:** Outcome-learning drift occurs when signals influence action selection outside explicit policy control surfaces.
- **Failure Mode candidate:** Evidence skew occurs when failed remediation attempts are not captured with the same fidelity as successful attempts.

---

## 9) Canonical operating statement

Playbook's future-state outcome learning architecture is **evidence-driven, scope-bounded, and governance-gated**.

Learning improves deterministic planning quality by shaping ranked choices and prevention suggestions, while deterministic rules, explicit plans, and transparent apply behavior remain the canonical enforcement and execution contract.
