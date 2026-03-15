import type { RouteDecision, TaskRoute } from './types.js';
import type { TaskExecutionProfileArtifact, TaskExecutionProfileProposal } from './executionRouter.js';

type SourceArtifactState = {
  available: boolean;
  artifactPath: string;
};

export type ExecutionPlanSourceArtifacts = {
  taskExecutionProfile: SourceArtifactState;
  learningState: SourceArtifactState;
};

export type BuildExecutionPlanInput = {
  task: string;
  decision: RouteDecision;
  generatedAt?: string;
  taskExecutionProfile?: TaskExecutionProfileArtifact;
  sourceArtifacts: ExecutionPlanSourceArtifacts;
};

export type ExecutionPlanArtifact = {
  schemaVersion: '1.0';
  kind: 'execution-plan';
  generatedAt: string;
  proposalOnly: true;
  task_family: string;
  route_id: string;
  rule_packs: string[];
  required_validations: string[];
  optional_validations: string[];
  parallel_lanes: string[];
  mutation_allowed: boolean;
  missing_prerequisites: string[];
  sourceArtifacts: ExecutionPlanSourceArtifacts;
  warnings: string[];
};

const sortUnique = (values: readonly string[]): string[] => [...new Set(values)].sort((a, b) => a.localeCompare(b));

const inferTaskFamilyFromTask = (task: string): string => {
  const normalized = task.toLowerCase();

  if (/\b(summarize|summary|show|read|describe|query|report|index|graph|context)\b/.test(normalized)) {
    return 'artifact_read';
  }

  if (/\b(plan|propose|suggest|recommend|fix|failure|issue|problem)\b/.test(normalized)) {
    return 'remediation_proposal';
  }

  if (/\b(apply|execute|run|patch|implement)\b/.test(normalized)) {
    return 'patch_execution';
  }

  return 'unknown';
};

const defaultsByRoute = (route: TaskRoute): Pick<ExecutionPlanArtifact, 'rule_packs' | 'required_validations' | 'optional_validations' | 'parallel_lanes'> => {
  if (route === 'deterministic_local') {
    return {
      rule_packs: ['route-deterministic-local'],
      required_validations: ['pnpm -r build'],
      optional_validations: ['pnpm playbook route "<task>" --json'],
      parallel_lanes: ['deterministic-inspection']
    };
  }

  if (route === 'model_reasoning') {
    return {
      rule_packs: ['route-bounded-model-reasoning'],
      required_validations: ['pnpm -r build'],
      optional_validations: ['pnpm test'],
      parallel_lanes: ['deterministic-evidence', 'bounded-reasoning']
    };
  }

  if (route === 'hybrid') {
    return {
      rule_packs: ['route-bounded-model-reasoning', 'route-approved-plan-gates'],
      required_validations: ['pnpm -r build', 'pnpm test'],
      optional_validations: ['pnpm playbook verify --ci --json'],
      parallel_lanes: ['deterministic-evidence', 'bounded-reasoning', 'approved-plan-execution']
    };
  }

  return {
    rule_packs: ['route-missing-prerequisites'],
    required_validations: [],
    optional_validations: ['pnpm playbook route "<task>" --json'],
    parallel_lanes: ['prerequisite-resolution']
  };
};

const pickProfile = (profileArtifact: TaskExecutionProfileArtifact | undefined): TaskExecutionProfileProposal | undefined => {
  if (!profileArtifact || profileArtifact.profiles.length === 0) {
    return undefined;
  }

  return [...profileArtifact.profiles].sort((a, b) => a.task_family.localeCompare(b.task_family))[0];
};

export const buildExecutionPlan = (input: BuildExecutionPlanInput): ExecutionPlanArtifact => {
  const profile = pickProfile(input.taskExecutionProfile);
  const routeDefaults = defaultsByRoute(input.decision.route);
  const taskFamily = profile?.task_family ?? inferTaskFamilyFromTask(input.task);

  const warnings: string[] = [];
  if (!input.sourceArtifacts.taskExecutionProfile.available) {
    warnings.push('task-execution-profile artifact unavailable; using route defaults for governance packs and validation bundles.');
  }
  if (!input.sourceArtifacts.learningState.available) {
    warnings.push('learning-state artifact unavailable; skipping learning-state refinement and using deterministic baseline route defaults.');
  }

  return {
    schemaVersion: '1.0',
    kind: 'execution-plan',
    generatedAt: input.generatedAt ?? new Date(0).toISOString(),
    proposalOnly: true,
    task_family: taskFamily,
    route_id: `${input.decision.route}:${taskFamily}`,
    rule_packs: sortUnique(profile?.rule_packs ?? routeDefaults.rule_packs),
    required_validations: sortUnique(profile?.required_validations ?? routeDefaults.required_validations),
    optional_validations: sortUnique(profile?.optional_validations ?? routeDefaults.optional_validations),
    parallel_lanes: sortUnique(routeDefaults.parallel_lanes),
    mutation_allowed: input.decision.repoMutationAllowed,
    missing_prerequisites: sortUnique(input.decision.missingPrerequisites),
    sourceArtifacts: input.sourceArtifacts,
    warnings: sortUnique(warnings)
  };
};
