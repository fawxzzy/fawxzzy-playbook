import type { LaneStateArtifact, LaneStateEntry } from './laneState.js';
import type { WorksetPlanArtifact } from './worksetPlan.js';

export type WorkerAssignmentLaneStatus = 'assigned' | 'blocked' | 'skipped';

export type WorkerAssignmentEntry = {
  lane_id: string;
  worker_type: string;
  status: WorkerAssignmentLaneStatus;
  task_ids: string[];
  assigned_prompt: string;
  dependencies_satisfied: boolean;
};

export type WorkerAssignmentWorker = {
  worker_id: string;
  worker_type: string;
  lane_ids: string[];
  status: 'assigned' | 'idle';
};

export type WorkerAssignmentsArtifact = {
  schemaVersion: '1.0';
  kind: 'worker-assignments';
  proposalOnly: true;
  generatedAt: string;
  lanes: WorkerAssignmentEntry[];
  workers: WorkerAssignmentWorker[];
  warnings: string[];
};

const sortUnique = (values: readonly string[]): string[] => [...new Set(values)].sort((left, right) => left.localeCompare(right));

const determineWorkerType = (laneEntry: LaneStateEntry, fallbackTaskFamilies: readonly string[] | undefined): string => {
  const families = sortUnique(fallbackTaskFamilies ?? []);
  if (families.some((family) => family.includes('docs'))) {
    return 'codex-docs';
  }
  if (families.some((family) => family.includes('test') || family.includes('validation'))) {
    return 'codex-validation';
  }

  return laneEntry.dependency_level === 'high' ? 'codex-high-safety' : 'codex-general';
};

const promptPathForLane = (laneId: string): string => `.playbook/prompts/${laneId}.md`;

export const buildAssignedPrompt = (laneId: string, codexPrompt: string): string => {
  const normalizedPrompt = codexPrompt.trim();
  return [`# Worker Assignment Prompt: ${laneId}`, '', normalizedPrompt.length > 0 ? normalizedPrompt : 'No prompt content available for this lane.'].join('\n');
};

const sortLanes = <T extends { lane_id: string }>(lanes: readonly T[]): T[] => [...lanes].sort((left, right) => left.lane_id.localeCompare(right.lane_id));

export const assignWorkersToLanes = (laneState: LaneStateArtifact, worksetPlan?: WorksetPlanArtifact): WorkerAssignmentsArtifact => {
  const planLanesById = new Map((worksetPlan?.lanes ?? []).map((lane) => [lane.lane_id, lane]));
  const lanes: WorkerAssignmentEntry[] = [];
  const warnings = new Set<string>(laneState.warnings);

  for (const laneEntry of sortLanes(laneState.lanes)) {
    const planLane = planLanesById.get(laneEntry.lane_id);
    const worker_type = determineWorkerType(laneEntry, planLane?.task_families);
    const assigned_prompt = promptPathForLane(laneEntry.lane_id);
    let status: WorkerAssignmentLaneStatus = 'skipped';

    if (laneEntry.status === 'blocked' || !laneEntry.dependencies_satisfied) {
      status = 'blocked';
    } else if (laneEntry.status === 'ready') {
      status = 'assigned';
    }

    if (!planLane) {
      warnings.add(`missing workset lane details for ${laneEntry.lane_id}; using fallback worker assignment metadata`);
    }

    lanes.push({
      lane_id: laneEntry.lane_id,
      worker_type,
      status,
      task_ids: [...laneEntry.task_ids].sort((left, right) => left.localeCompare(right)),
      assigned_prompt,
      dependencies_satisfied: laneEntry.dependencies_satisfied
    });
  }

  const workerGroups = new Map<string, string[]>();
  for (const lane of lanes.filter((entry) => entry.status === 'assigned')) {
    const existing = workerGroups.get(lane.worker_type) ?? [];
    workerGroups.set(lane.worker_type, sortUnique([...existing, lane.lane_id]));
  }

  const workers = [...workerGroups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([worker_type, lane_ids], index) => ({
      worker_id: `worker-${index + 1}`,
      worker_type,
      lane_ids,
      status: lane_ids.length > 0 ? ('assigned' as const) : ('idle' as const)
    }));

  if (workers.length === 0) {
    warnings.add('no ready lanes available for assignment; blocked and dependency-gated lanes were preserved');
  }

  return {
    schemaVersion: '1.0',
    kind: 'worker-assignments',
    proposalOnly: true,
    generatedAt: new Date().toISOString(),
    lanes,
    workers,
    warnings: sortUnique([...warnings])
  };
};
