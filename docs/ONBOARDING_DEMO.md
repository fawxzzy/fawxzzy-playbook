# Demo and Onboarding

## Purpose

`playbook-demo` is the official fast onboarding repository artifact for first-run adoption.

Goal: let developers quickly experience deterministic repository intelligence and reviewed remediation in a stable, low-setup environment.

## Adoption role

The demo repo is part of product adoption strategy:

- shortens time-to-value for new users
- provides a stable walkthrough for docs/videos/live demos
- gives contributors and AI agents a known-good environment for examples

## Current status

`playbook-demo` is an active product artifact and is exposed directly through `playbook demo` (deterministic text/JSON onboarding contract).

## Canonical serious-user ladder

Use the demo to practice the same operating ladder used in real repositories:

```bash
playbook ai-context --json
playbook ai-contract --json
playbook context --json
playbook index --json
playbook query modules --json
playbook explain architecture --json
playbook verify --json
playbook plan --json > .playbook/plan.json
playbook apply --from-plan .playbook/plan.json
playbook verify --json
```

`analyze` can still be used as a compatibility-friendly shortcut for lightweight stack inspection, but it is not the primary serious-user narrative.

## Rule: Demo Terminology Sync

Whenever the main product changes command framing, output language, or architecture positioning, revalidate the demo repository in the same phase or immediately after.

The demo README, scenario docs, and command wording should not lag behind the core product narrative.

## Pattern: demo as narrative surface

The demo repository is not just a testbed.

It is the fastest explanation of what Playbook is.

## Pattern: Product Demo Contract

A good demo repo should provide a stable before/after story:

- known initial findings
- clear educational meaning
- deterministic remediation
- verifiable clean end state

This keeps the demo useful as both an onboarding surface and a governance learning artifact.

## Rule: optimize for product clarity over command breadth

The demo repo is the product perception layer.

Design decisions in `playbook-demo` should prioritize explaining Playbook's value clearly, even if that means covering fewer commands in a single walkthrough.

## Pattern: deterministic intelligence + remediation loop

The core demo narrative should be intentionally sequenced:

1. `ai-context`, `ai-contract`, and `context` establish runtime/trust-layer context.
2. `index`, `query`, and `explain` establish deterministic repository intelligence.
3. `verify` confirms governance findings.
4. `plan` generates reviewed remediation tasks for those findings.
5. `apply` executes bounded tasks from the reviewed plan.
6. `verify` confirms the post-remediation end state.

All steps should describe the same small set of intentional issues so users can trust the flow from diagnosis to action.

## Pattern: model realistic architectural drift

Intentional demo issues should resemble real repository drift (for example, docs lagging after architectural changes), not random or artificial breakage.

This keeps outputs educational, credible, and easy to transfer to real repos.

## Failure mode: too many unrelated findings

If demo scenarios include too many unrelated issues, users cannot map diagnosis to remediation.

Keep scenarios narrow, explainable, and deterministic.
