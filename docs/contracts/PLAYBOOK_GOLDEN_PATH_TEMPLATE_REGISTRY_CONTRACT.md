# Playbook Golden-Path Template Registry Contract

## Purpose

This contract defines a commandless registry of repeatable setup templates for common Playbook-owned repo and feature archetypes.

The registry exists to stabilize template semantics before any scaffolding executor, generated repo output, or command surface is introduced.

## Contract boundary

The template registry must:

- stay machine-readable and schema-versioned
- define repeatable setup intent rather than generated file output
- keep examples stable, repo-relative, and free of local absolute paths
- publish guarded defaults and adoption checklists explicitly

The template registry must not:

- provide a scaffolding executor
- claim command availability
- introduce runtime writes
- depend on unstable timestamps
- hide conventions in untyped generator behavior

## Required templates

The initial canonical registry must include exactly these template ids:

- `nextjs_supabase_app`
- `local_operator_repo`
- `contract_first_engine_feature`

## Template shape

Each template entry must include:

- `id`
- `title`
- `archetype`
- `purpose`
- `requiredSurfaces`
- `guardedDefaults`
- `adoptionChecklist`

Allowed archetypes:

- `application`
- `operator`
- `engine_feature`

## Promotion path

Pattern: template registry -> schema/examples -> validator -> static registry fixture -> engine planner later -> optional scaffolder last

Rule: golden paths should define repeatable setup contracts before they create files.

Failure mode: shipping a scaffolder before registry semantics are stable creates another copy-paste generator with hidden conventions.
