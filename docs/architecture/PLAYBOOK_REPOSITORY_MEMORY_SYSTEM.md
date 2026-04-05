# PLAYBOOK_REPOSITORY_MEMORY_SYSTEM

## Purpose

Define one canonical, read-only repository memory contract so Playbook memory/event/replay/compaction/promotion surfaces operate as one explicit runtime architecture.

Canonical artifact:

- `.playbook/memory-system.json`

This contract is v1 and **does not widen mutation authority**.

## Canonical memory layers

1. **Structural graph**
   - Source artifacts: `.playbook/repo-index.json`, `.playbook/repo-graph.json`
   - Role: repository-shape intelligence only (modules, graph nodes/edges)
2. **Temporal / episodic memory**
   - Source artifacts: `.playbook/memory/index.json`, `.playbook/memory/events/*`, replay/consolidation candidates
   - Role: execution/observation evidence
3. **Candidate knowledge**
   - Source artifacts: `.playbook/memory/replay-candidates.json`, `.playbook/memory/candidates.json`, `.playbook/memory/lifecycle-candidates.json`
   - Role: advisory, review-required candidate state
4. **Promoted doctrine**
   - Source artifacts: `.playbook/memory/knowledge/decisions.json`, `.playbook/memory/knowledge/patterns.json`, `.playbook/memory/knowledge/failure-modes.json`, `.playbook/memory/knowledge/invariants.json`
   - Role: reviewed, durable doctrine

## Deterministic boundaries

- **Graph vs temporal boundary:** structural graph artifacts must remain separate from temporal memory artifacts.
- **Episodic vs doctrine boundary:** episodic evidence cannot auto-promote into doctrine.
- **Replay/consolidation/promotion boundaries:** replay, consolidation, compaction, and promotion review surfaces remain explicit references with review-required authority.

## Deterministic inventory and lifecycle sections

The canonical `.playbook/memory-system.json` contract includes:

- current memory inventory by class
- replay/consolidation/promotion boundary refs
- pressure/retention class summary
- stale/superseded/candidate state summaries

## Authority

- mutation: `read-only`
- promotion: `review-required`
- execution: `unchanged`

## Operating doctrine

- Rule: Structural graph, temporal memory, candidate knowledge, and promoted doctrine must remain separate explicit layers.
- Pattern: observe -> store episodic evidence -> cluster/compact -> review -> promote doctrine.
- Failure Mode: Without a canonical memory-system contract, adjacent memory artifacts drift into overlapping authority and unclear lifecycle boundaries.
