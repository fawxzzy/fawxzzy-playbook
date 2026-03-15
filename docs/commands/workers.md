# Workers (`pnpm playbook workers`)

`workers` assigns deterministic, proposal-only workers to lane-state entries and writes `.playbook/worker-assignments.json`.

It consumes `.playbook/workset-plan.json` and `.playbook/lane-state.json`, then emits lane-level prompt files under `.playbook/prompts/<lane_id>.md` for assigned lanes.

Rule — Worker assignment must respect lane readiness and dependency edges.

Pattern — Parallel development becomes safe when work is isolated by surface and assigned per lane.

Failure Mode — Assigning workers without surface isolation leads to merge conflicts and broken CI.

## Usage

```bash
pnpm playbook workers --json
pnpm playbook workers assign
pnpm playbook workers assign --json
```

## Behavior

- Only lanes with `status: ready` and `dependencies_satisfied: true` are assigned.
- Blocked/dependency-gated lanes remain unassigned and are preserved in output.
- Ordering is deterministic by `lane_id`.
- Output remains proposal-only: no worker launch, no branch creation, no PR automation.

## Artifacts

Writes:

- `.playbook/worker-assignments.json`
- `.playbook/prompts/<lane_id>.md` for each assigned lane

`worker-assignments` includes:

- `schemaVersion`
- `kind = worker-assignments`
- `proposalOnly`
- `generatedAt`
- `lanes`
- `workers`
- `warnings`

Each lane assignment entry includes:

- `lane_id`
- `worker_type`
- `status`
- `task_ids`
- `assigned_prompt`
- `dependencies_satisfied`
