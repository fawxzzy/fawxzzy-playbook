import type { ReconciledRepoState, FleetUpdatedAdoptionState } from './executionUpdatedState.js';
import type { FleetAdoptionWorkQueue, AdoptionGroupedActionLane, AdoptionWorkItem, AdoptionWorkWave, WorkQueueParallelGroup } from './workQueue.js';
import type { RepoAdoptionBlocker } from './readiness.js';

const PRIORITY_ORDER: Record<ReconciledRepoState['reconciliation_status'], number> = {
  failed: 0,
  partial: 1,
  not_run: 2,
  stale_plan_or_superseded: 3,
  blocked: 4,
  completed_with_drift: 5,
  completed_as_planned: 6
};

const GROUP_ORDER: Record<WorkQueueParallelGroup, number> = {
  'connect lane': 0,
  'init lane': 1,
  'index lane': 2,
  'verify/plan lane': 3,
  'apply lane': 4,
  'retry lane': 5,
  'replan lane': 6
};

const sortStrings = (values: Iterable<string>): string[] => [...new Set(values)].sort((a, b) => a.localeCompare(b));

const promptLaneSegment = (promptId: string): string | null => promptId.split(':')[1] ?? null;

const commandForRetry = (repo: ReconciledRepoState): string => {
  const laneSegment = repo.prompt_ids.map(promptLaneSegment).find((value): value is string => typeof value === 'string' && value.length > 0);
  if (laneSegment === 'verify/plan_lane') return 'pnpm playbook verify --json && pnpm playbook plan --json';
  if (laneSegment === 'index_lane') return 'pnpm playbook index --json';
  if (laneSegment === 'init_lane') return 'pnpm playbook init';
  if (laneSegment === 'connect_lane') return 'pnpm playbook observer repo add <path>';
  return 'pnpm playbook apply --json';
};

const queueItemForRepo = (repo: ReconciledRepoState): AdoptionWorkItem | null => {
  if (repo.reconciliation_status === 'blocked' || repo.reconciliation_status === 'completed_as_planned' || repo.reconciliation_status === 'completed_with_drift') {
    return null;
  }

  const nextAction = repo.reconciliation_status === 'stale_plan_or_superseded' ? 'replan' : 'retry';
  const parallelGroup: WorkQueueParallelGroup = nextAction === 'replan' ? 'replan lane' : 'retry lane';
  const recommendedCommand = nextAction === 'replan' ? 'pnpm playbook verify --json && pnpm playbook plan --json' : commandForRetry(repo);
  const wave = repo.prompt_ids.slice().sort((a, b) => a.localeCompare(b))[0]?.startsWith('wave_2:') ? 'wave_2' : 'wave_1';
  return {
    item_id: `${repo.repo_id}:${nextAction}`,
    repo_id: repo.repo_id,
    lifecycle_stage: repo.updated_lifecycle_stage,
    blocker_codes: repo.blocker_codes.slice() as RepoAdoptionBlocker['code'][],
    recommended_command: recommendedCommand,
    priority_stage: repo.updated_lifecycle_stage === 'ready' ? 'ready' : 'apply_pending',
    severity: nextAction === 'replan' ? 'medium' : 'low',
    parallel_group: parallelGroup,
    dependencies: [],
    rationale: nextAction === 'replan'
      ? 'Updated state marked the prior plan stale or superseded, so the next adoption step is deterministic replanning.'
      : 'Updated state marked the prior execution outcome as retryable, so the next adoption step is a deterministic retry of the same command family.',
    wave,
    queue_source: 'updated_state',
    next_action: nextAction,
    prompt_lineage: sortStrings(repo.prompt_ids)
  };
};

export const deriveNextAdoptionQueueFromUpdatedState = (
  updatedState: FleetUpdatedAdoptionState,
  options?: { generatedAt?: string }
): FleetAdoptionWorkQueue => {
  const generatedAt = options?.generatedAt ?? new Date().toISOString();
  const orderedRepos = [...updatedState.repos].sort((left, right) =>
    PRIORITY_ORDER[left.reconciliation_status] - PRIORITY_ORDER[right.reconciliation_status] ||
    left.repo_id.localeCompare(right.repo_id)
  );
  const workItems = orderedRepos
    .map(queueItemForRepo)
    .filter((item): item is AdoptionWorkItem => item !== null)
    .sort((left, right) =>
      (left.wave === right.wave ? 0 : left.wave === 'wave_1' ? -1 : 1) ||
      GROUP_ORDER[left.parallel_group] - GROUP_ORDER[right.parallel_group] ||
      left.repo_id.localeCompare(right.repo_id)
    );

  const waves: AdoptionWorkWave[] = (['wave_1', 'wave_2'] as const).map((wave) => {
    const items = workItems.filter((item) => item.wave === wave);
    return {
      wave,
      item_ids: items.map((item) => item.item_id),
      repo_ids: sortStrings(items.map((item) => item.repo_id)),
      action_count: items.length
    };
  });

  const groupedMap = new Map<string, { parallel_group: WorkQueueParallelGroup; command: string; repo_ids: Set<string>; item_ids: Set<string> }>();
  for (const item of workItems) {
    const key = `${item.parallel_group}::${item.recommended_command}`;
    const current = groupedMap.get(key) ?? { parallel_group: item.parallel_group, command: item.recommended_command, repo_ids: new Set<string>(), item_ids: new Set<string>() };
    current.repo_ids.add(item.repo_id);
    current.item_ids.add(item.item_id);
    groupedMap.set(key, current);
  }
  const groupedActions: AdoptionGroupedActionLane[] = [...groupedMap.values()]
    .map((entry) => ({
      parallel_group: entry.parallel_group,
      command: entry.command,
      repo_ids: sortStrings(entry.repo_ids),
      item_ids: sortStrings(entry.item_ids)
    }))
    .sort((left, right) => GROUP_ORDER[left.parallel_group] - GROUP_ORDER[right.parallel_group] || left.command.localeCompare(right.command));

  return {
    schemaVersion: '1.0',
    kind: 'fleet-adoption-work-queue',
    generated_at: generatedAt,
    total_repos: updatedState.summary.repos_total,
    queue_source: 'updated_state',
    work_items: workItems,
    waves,
    grouped_actions: groupedActions,
    blocked_items: []
  };
};
