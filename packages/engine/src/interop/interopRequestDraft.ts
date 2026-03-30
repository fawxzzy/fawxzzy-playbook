import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import {
  getFitnessActionContract,
  getFitnessReceiptTypeForAction,
  isFitnessActionName,
  validateFitnessActionInput,
  type FitnessActionInput
} from '../integrations/fitnessContract.js';
import type { AiProposal } from '../ai/aiProposal.js';

export const INTEROP_REQUEST_DRAFT_SCHEMA_VERSION = '1.0' as const;
export const INTEROP_REQUEST_DRAFT_DEFAULT_FILE = '.playbook/interop-request-draft.json' as const;

const AI_PROPOSAL_DEFAULT_FILE = '.playbook/ai-proposal.json' as const;
const FITNESS_CONTRACT_CANONICAL_INPUT = 'playbook-engine:fitnessIntegrationContract' as const;
const DEFAULT_INTEROP_CAPABILITY = 'lifeline-remediation-v1' as const;

export type InteropRequestDraftArtifact = {
  schemaVersion: typeof INTEROP_REQUEST_DRAFT_SCHEMA_VERSION;
  kind: 'interop-request-draft';
  command: 'interop draft';
  draftId: string;
  proposalId: string;
  target: 'fitness';
  capability: string;
  action: string;
  bounded_action_input: FitnessActionInput;
  expected_receipt_type: string;
  routing_metadata: {
    channel: string;
    target: string;
    priority: string;
    maxDeliveryLatencySeconds: number;
    constraints: string[];
  };
  blockers: string[];
  assumptions: string[];
  confidence: number;
  provenance_refs: string[];
  nextActionText: string;
};

const deterministicStringify = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;

const assertRecord = (value: unknown, label: string): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Invalid ${label}: expected object.`);
  }
  return value as Record<string, unknown>;
};

const assertString = (value: unknown, label: string): string => {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Invalid ${label}: expected non-empty string.`);
  }
  return value;
};

const assertStringArray = (value: unknown, label: string): string[] => {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) {
    throw new Error(`Invalid ${label}: expected string array.`);
  }
  return [...value];
};

const assertNumber = (value: unknown, label: string): number => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new Error(`Invalid ${label}: expected number.`);
  }
  return value;
};

const parseAiProposal = (cwd: string, filePath: string): AiProposal => {
  const absolute = path.resolve(cwd, filePath);
  if (!fs.existsSync(absolute)) {
    throw new Error(`Cannot compile interop request draft: missing ${filePath}.`);
  }

  const parsed = JSON.parse(fs.readFileSync(absolute, 'utf8')) as unknown;
  const record = parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : null;
  if (record && record.artifact === 'playbook.artifact' && record.data && typeof record.data === 'object') {
    return record.data as AiProposal;
  }
  return parsed as AiProposal;
};

const parseInteropRequestDraft = (cwd: string, filePath: string): InteropRequestDraftArtifact => {
  const canonicalPath = path.resolve(cwd, INTEROP_REQUEST_DRAFT_DEFAULT_FILE);
  const requestedPath = path.resolve(cwd, filePath);
  if (requestedPath !== canonicalPath) {
    throw new Error(
      `Cannot read interop request draft: only canonical ${INTEROP_REQUEST_DRAFT_DEFAULT_FILE} is supported for emit-fitness-plan --from-draft.`
    );
  }
  if (!fs.existsSync(canonicalPath)) {
    throw new Error(`Cannot read interop request draft: missing ${INTEROP_REQUEST_DRAFT_DEFAULT_FILE}.`);
  }
  const parsed = JSON.parse(fs.readFileSync(canonicalPath, 'utf8')) as unknown;
  const record = assertRecord(parsed, 'interop request draft');
  if (record.kind !== 'interop-request-draft') {
    throw new Error('Cannot read interop request draft: kind must be interop-request-draft.');
  }
  if (record.target !== 'fitness') {
    throw new Error('Cannot read interop request draft: target must be fitness.');
  }

  const capability = assertString(record.capability, 'interop request draft capability');
  const action = assertString(record.action, 'interop request draft action');
  if (!isFitnessActionName(action)) {
    throw new Error(`Cannot read interop request draft: action ${action} is not part of the canonical Fitness contract.`);
  }
  const boundedActionInput = assertRecord(record.bounded_action_input, 'interop request draft bounded_action_input');
  const inputValidation = validateFitnessActionInput(action, boundedActionInput);
  if (!inputValidation.valid) {
    throw new Error(
      `Cannot read interop request draft: bounded_action_input validation failed for ${action}: ${inputValidation.errors.join(' ')}`
    );
  }

  const expectedReceiptType = assertString(record.expected_receipt_type, 'interop request draft expected_receipt_type');
  const canonicalReceiptType = getFitnessReceiptTypeForAction(action);
  if (expectedReceiptType !== canonicalReceiptType) {
    throw new Error(
      `Cannot read interop request draft: expected receipt type mismatch for ${action}. expected=${canonicalReceiptType} actual=${expectedReceiptType}.`
    );
  }

  const routing = assertRecord(record.routing_metadata, 'interop request draft routing_metadata');
  const channel = assertString(routing.channel, 'interop request draft routing_metadata.channel');
  const target = assertString(routing.target, 'interop request draft routing_metadata.target');
  const priority = assertString(routing.priority, 'interop request draft routing_metadata.priority');
  const maxDeliveryLatencySeconds = assertNumber(routing.maxDeliveryLatencySeconds, 'interop request draft routing_metadata.maxDeliveryLatencySeconds');
  const constraints = assertStringArray(routing.constraints, 'interop request draft routing_metadata.constraints');
  const actionContract = getFitnessActionContract(action);
  if (
    channel !== actionContract.routing.channel
    || target !== actionContract.routing.target
    || priority !== actionContract.routing.priority
    || maxDeliveryLatencySeconds !== actionContract.routing.maxDeliveryLatencySeconds
  ) {
    throw new Error(`Cannot read interop request draft: routing metadata mismatch for ${action}.`);
  }
  const expectedConstraints = [...actionContract.constraints].sort();
  const receivedConstraints = [...constraints].sort();
  if (expectedConstraints.length !== receivedConstraints.length || expectedConstraints.some((entry, index) => entry !== receivedConstraints[index])) {
    throw new Error(`Cannot read interop request draft: constraint metadata mismatch for ${action}.`);
  }

  return {
    schemaVersion: INTEROP_REQUEST_DRAFT_SCHEMA_VERSION,
    kind: 'interop-request-draft',
    command: 'interop draft',
    draftId: assertString(record.draftId, 'interop request draft draftId'),
    proposalId: assertString(record.proposalId, 'interop request draft proposalId'),
    target: 'fitness',
    capability,
    action,
    bounded_action_input: boundedActionInput,
    expected_receipt_type: expectedReceiptType,
    routing_metadata: {
      channel,
      target,
      priority,
      maxDeliveryLatencySeconds,
      constraints: [...actionContract.constraints]
    },
    blockers: assertStringArray(record.blockers ?? [], 'interop request draft blockers'),
    assumptions: assertStringArray(record.assumptions ?? [], 'interop request draft assumptions'),
    confidence: assertNumber(record.confidence ?? 0.5, 'interop request draft confidence'),
    provenance_refs: assertStringArray(record.provenance_refs ?? [], 'interop request draft provenance_refs'),
    nextActionText: assertString(record.nextActionText, 'interop request draft nextActionText')
  };
};

export const compileInteropRequestDraft = (
  cwd: string,
  options: { proposalPath?: string; outFile?: string; capability?: string } = {}
): { artifactPath: string; draft: InteropRequestDraftArtifact } => {
  const proposalPath = options.proposalPath ?? AI_PROPOSAL_DEFAULT_FILE;
  const outFile = options.outFile ?? INTEROP_REQUEST_DRAFT_DEFAULT_FILE;
  const proposal = parseAiProposal(cwd, proposalPath);

  if (proposal.command !== 'ai-propose') {
    throw new Error('Cannot compile interop request draft: source proposal command must be ai-propose.');
  }
  if (proposal.scope?.target !== 'fitness') {
    throw new Error('Cannot compile interop request draft: proposal target must be fitness.');
  }
  if (!proposal.fitnessRequestSuggestion) {
    throw new Error('Cannot compile interop request draft: missing fitnessRequestSuggestion in AI proposal.');
  }

  const suggestion = assertRecord(proposal.fitnessRequestSuggestion, 'fitnessRequestSuggestion');
  const action = assertString(suggestion.canonicalActionName, 'fitnessRequestSuggestion.canonicalActionName');
  if (!isFitnessActionName(action)) {
    throw new Error(`Cannot compile interop request draft: canonical action ${action} is not part of the canonical Fitness contract.`);
  }

  const boundedActionInput = assertRecord(suggestion.boundedActionInput, 'fitnessRequestSuggestion.boundedActionInput');
  const inputValidation = validateFitnessActionInput(action, boundedActionInput);
  if (!inputValidation.valid) {
    throw new Error(
      `Cannot compile interop request draft: bounded action input is invalid for ${action}: ${inputValidation.errors.join(' ')}`
    );
  }

  const expectedReceiptType = assertString(
    suggestion.canonicalExpectedReceiptType,
    'fitnessRequestSuggestion.canonicalExpectedReceiptType'
  );
  const canonicalReceiptType = getFitnessReceiptTypeForAction(action);
  if (expectedReceiptType !== canonicalReceiptType) {
    throw new Error(
      `Cannot compile interop request draft: expected receipt type mismatch for ${action}. expected=${canonicalReceiptType} actual=${expectedReceiptType}.`
    );
  }

  const actionContract = getFitnessActionContract(action);
  const routing = assertRecord(suggestion.routingMetadataSummary, 'fitnessRequestSuggestion.routingMetadataSummary');
  const channel = assertString(routing.channel, 'fitnessRequestSuggestion.routingMetadataSummary.channel');
  const target = assertString(routing.target, 'fitnessRequestSuggestion.routingMetadataSummary.target');
  const priority = assertString(routing.priority, 'fitnessRequestSuggestion.routingMetadataSummary.priority');
  const maxDeliveryLatencySeconds = assertNumber(
    routing.maxDeliveryLatencySeconds,
    'fitnessRequestSuggestion.routingMetadataSummary.maxDeliveryLatencySeconds'
  );
  const constraints = assertStringArray(routing.constraints, 'fitnessRequestSuggestion.routingMetadataSummary.constraints');

  if (
    channel !== actionContract.routing.channel
    || target !== actionContract.routing.target
    || priority !== actionContract.routing.priority
    || maxDeliveryLatencySeconds !== actionContract.routing.maxDeliveryLatencySeconds
  ) {
    throw new Error(`Cannot compile interop request draft: routing metadata mismatch for ${action}.`);
  }

  const expectedConstraints = [...actionContract.constraints].sort();
  const receivedConstraints = [...constraints].sort();
  if (expectedConstraints.length !== receivedConstraints.length || expectedConstraints.some((entry, index) => entry !== receivedConstraints[index])) {
    throw new Error(`Cannot compile interop request draft: constraint metadata mismatch for ${action}.`);
  }

  const blockers = Array.isArray(proposal.blockers) ? proposal.blockers : [];
  const assumptions = Array.isArray(proposal.assumptions) ? proposal.assumptions : [];
  const confidence = typeof proposal.confidence === 'number' ? proposal.confidence : 0.5;
  const provenanceRefs = [
    proposalPath,
    FITNESS_CONTRACT_CANONICAL_INPUT,
    ...(Array.isArray(proposal.provenance) ? proposal.provenance.map((entry) => entry.artifactPath) : [])
  ];
  const dedupedProvenanceRefs = Array.from(new Set(provenanceRefs));

  const capability = options.capability ?? DEFAULT_INTEROP_CAPABILITY;
  const draftSeed = JSON.stringify({
    proposalId: proposal.proposalId,
    action,
    boundedActionInput,
    expectedReceiptType,
    routing: { channel, target, priority, maxDeliveryLatencySeconds, constraints: expectedConstraints },
    capability,
    provenanceRefs: dedupedProvenanceRefs
  });

  const draftId = `interop-draft-${createHash('sha256').update(draftSeed).digest('hex').slice(0, 12)}`;
  const draft: InteropRequestDraftArtifact = {
    schemaVersion: INTEROP_REQUEST_DRAFT_SCHEMA_VERSION,
    kind: 'interop-request-draft',
    command: 'interop draft',
    draftId,
    proposalId: proposal.proposalId,
    target: 'fitness',
    capability,
    action,
    bounded_action_input: boundedActionInput,
    expected_receipt_type: expectedReceiptType,
    routing_metadata: {
      channel,
      target,
      priority,
      maxDeliveryLatencySeconds,
      constraints: [...actionContract.constraints]
    },
    blockers,
    assumptions,
    confidence,
    provenance_refs: dedupedProvenanceRefs,
    nextActionText: `Run \`pnpm playbook interop emit-fitness-plan --capability ${capability} --action ${action} --action-input-json '<json>'\` after explicit human review and approval.`
  };

  const absoluteOut = path.resolve(cwd, outFile);
  fs.mkdirSync(path.dirname(absoluteOut), { recursive: true });
  fs.writeFileSync(absoluteOut, deterministicStringify(draft));

  return { artifactPath: outFile, draft };
};

export const readInteropRequestDraft = (
  cwd: string,
  options: { draftPath?: string } = {}
): { artifactPath: typeof INTEROP_REQUEST_DRAFT_DEFAULT_FILE; draft: InteropRequestDraftArtifact } => {
  const draftPath = options.draftPath ?? INTEROP_REQUEST_DRAFT_DEFAULT_FILE;
  const draft = parseInteropRequestDraft(cwd, draftPath);
  return { artifactPath: INTEROP_REQUEST_DRAFT_DEFAULT_FILE, draft };
};
