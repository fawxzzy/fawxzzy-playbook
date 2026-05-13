import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildWorkflowPackEnvironmentBridgeDryRunReceipt } from '../src/workflowPack/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../../..');

const executorExamplePath = path.join(
  repoRoot,
  'exports',
  'playbook.workflow-pack.environment-bridge.executor.example.v1.json'
);
const receiptSchemaPath = path.join(
  repoRoot,
  'exports',
  'playbook.workflow-pack.environment-bridge.executor-receipt.schema.v1.json'
);
const receiptExamplePath = path.join(
  repoRoot,
  'exports',
  'playbook.workflow-pack.environment-bridge.executor-receipt.example.v1.json'
);

const executorExample = JSON.parse(fs.readFileSync(executorExamplePath, 'utf8')) as Record<string, unknown>;
const receiptSchema = JSON.parse(fs.readFileSync(receiptSchemaPath, 'utf8'));
const receiptExample = JSON.parse(
  fs.readFileSync(receiptExamplePath, 'utf8')
) as ReturnType<typeof buildWorkflowPackEnvironmentBridgeDryRunReceipt>;

const FORBIDDEN_OUTPUT_FIELDS = new Set([
  'command',
  'commands',
  'commandAvailability',
  'commandStatus',
  'availability',
  'workflow',
  'workflowAvailability',
  'workflowStatus',
  'workflowFile',
  'workflowPath',
  'workflowName',
  'generatedWorkflow',
  'generatedWorkflows',
  'generatedAt',
  'createdAt',
  'updatedAt',
  'timestamp',
  'absolutePath',
  'localPath',
  'workspaceRoot',
  'runtimePath',
  'runtimeRoot'
]);

const toTypeName = (value: unknown): string => {
  if (Array.isArray(value)) return 'array';
  if (value === null) return 'null';
  if (typeof value === 'number' && Number.isInteger(value)) return 'integer';
  return typeof value;
};

const typeMatches = (schemaType: unknown, value: unknown): boolean => {
  const typeName = toTypeName(value);
  if (Array.isArray(schemaType)) {
    return schemaType.includes(typeName) || (schemaType.includes('number') && typeName === 'integer');
  }
  return schemaType === typeName || (schemaType === 'number' && typeName === 'integer');
};

const validateAgainstSchema = (value: unknown, schema: unknown, context = '$'): string[] => {
  if (!schema || typeof schema !== 'object') {
    return [];
  }

  const schemaObject = schema as Record<string, unknown>;
  const errors: string[] = [];

  if (Object.prototype.hasOwnProperty.call(schemaObject, 'const') && value !== schemaObject.const) {
    errors.push(`${context} must equal ${JSON.stringify(schemaObject.const)}`);
    return errors;
  }

  if (Array.isArray(schemaObject.enum) && !schemaObject.enum.includes(value)) {
    errors.push(`${context} must be one of ${schemaObject.enum.map((entry) => JSON.stringify(entry)).join(', ')}`);
  }

  if (Object.prototype.hasOwnProperty.call(schemaObject, 'type') && !typeMatches(schemaObject.type, value)) {
    errors.push(`${context} must be ${JSON.stringify(schemaObject.type)} (received ${JSON.stringify(toTypeName(value))})`);
    return errors;
  }

  if (typeof schemaObject.minLength === 'number' && (typeof value !== 'string' || value.length < schemaObject.minLength)) {
    errors.push(`${context} must have minLength ${schemaObject.minLength}`);
  }

  if (typeof schemaObject.minimum === 'number' && (typeof value !== 'number' || value < schemaObject.minimum)) {
    errors.push(`${context} must be >= ${schemaObject.minimum}`);
  }

  if (Array.isArray(schemaObject.required)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      errors.push(`${context} must be an object with required properties`);
      return errors;
    }

    for (const key of schemaObject.required) {
      if (typeof key === 'string' && !Object.prototype.hasOwnProperty.call(value, key)) {
        errors.push(`${context} missing required property ${JSON.stringify(key)}`);
      }
    }
  }

  if (value && typeof value === 'object' && !Array.isArray(value) && schemaObject.properties && typeof schemaObject.properties === 'object') {
    const properties = schemaObject.properties as Record<string, unknown>;
    const recordValue = value as Record<string, unknown>;

    for (const [key, propertySchema] of Object.entries(properties)) {
      if (Object.prototype.hasOwnProperty.call(recordValue, key)) {
        errors.push(...validateAgainstSchema(recordValue[key], propertySchema, `${context}.${key}`));
      }
    }

    if (schemaObject.additionalProperties === false) {
      for (const key of Object.keys(recordValue)) {
        if (!Object.prototype.hasOwnProperty.call(properties, key)) {
          errors.push(`${context} contains unsupported property ${JSON.stringify(key)}`);
        }
      }
    }
  }

  if (Array.isArray(value) && schemaObject.items) {
    value.forEach((entry, index) => {
      errors.push(...validateAgainstSchema(entry, schemaObject.items, `${context}[${index}]`));
    });
  }

  if (typeof schemaObject.$ref === 'string' && schemaObject.$ref.startsWith('#/$defs/')) {
    const definitionKey = schemaObject.$ref.slice('#/$defs/'.length);
    const definitions = (receiptSchema as { $defs?: Record<string, unknown> }).$defs ?? {};
    const definition = definitions[definitionKey];
    if (!definition) {
      errors.push(`${context} references missing schema definition ${schemaObject.$ref}`);
    } else {
      errors.push(...validateAgainstSchema(value, definition, context));
    }
  }

  return errors;
};

const collectForbiddenFieldPaths = (value: unknown, currentPath = '$'): string[] => {
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => collectForbiddenFieldPaths(entry, `${currentPath}[${index}]`));
  }

  if (!value || typeof value !== 'object') {
    return [];
  }

  return Object.entries(value as Record<string, unknown>).flatMap(([key, nested]) => {
    const nextPath = `${currentPath}.${key}`;
    const matches = FORBIDDEN_OUTPUT_FIELDS.has(key) ? [nextPath] : [];
    return matches.concat(collectForbiddenFieldPaths(nested, nextPath));
  });
};

describe('workflow-pack environment bridge dry-run executor contract', () => {
  it('matches the committed stable receipt fixture for the committed executor example', () => {
    const receipt = buildWorkflowPackEnvironmentBridgeDryRunReceipt(
      executorExample as Parameters<typeof buildWorkflowPackEnvironmentBridgeDryRunReceipt>[0]
    );

    expect(receipt).toEqual(receiptExample);
  });

  it('validates the committed receipt example against the published receipt schema', () => {
    const errors = validateAgainstSchema(receiptExample, receiptSchema);
    expect(errors, JSON.stringify(errors, null, 2)).toEqual([]);
  });

  it('keeps completed steps, skipped steps, blockers, and receipt refs deterministic', () => {
    const first = buildWorkflowPackEnvironmentBridgeDryRunReceipt(
      executorExample as Parameters<typeof buildWorkflowPackEnvironmentBridgeDryRunReceipt>[0]
    );

    const second = buildWorkflowPackEnvironmentBridgeDryRunReceipt({
      ...(executorExample as Record<string, unknown>),
      allowedMutationTargets: [
        ...(((executorExample as { allowedMutationTargets: string[] }).allowedMutationTargets) ?? [])
      ].reverse(),
      forbiddenMutationTargets: [
        ...(((executorExample as { forbiddenMutationTargets: string[] }).forbiddenMutationTargets) ?? [])
      ].reverse(),
      requiredSecretRefs: [
        ...(((executorExample as { requiredSecretRefs: string[] }).requiredSecretRefs) ?? [])
      ].reverse(),
      requiredReceiptRefs: [
        ...(((executorExample as { requiredReceiptRefs: string[] }).requiredReceiptRefs) ?? [])
      ].reverse(),
      preflightChecks: [
        ...(((executorExample as { preflightChecks: Array<Record<string, unknown>> }).preflightChecks) ?? [])
      ].map((entry) => ({
        ...entry,
        evidenceRefs: [...(((entry.evidenceRefs as string[] | undefined) ?? []))].reverse()
      })),
      executionSteps: [
        ...(((executorExample as { executionSteps: Array<Record<string, unknown>> }).executionSteps) ?? [])
      ].map((entry) => ({
        ...entry,
        evidenceRefs: [...(((entry.evidenceRefs as string[] | undefined) ?? []))].reverse()
      }))
    } as Parameters<typeof buildWorkflowPackEnvironmentBridgeDryRunReceipt>[0]);

    expect(first).toEqual(second);
    expect(first.status).toBe('dry_run_complete');
    expect(first.blockers).toEqual([]);
    expect(first.warnings).toEqual([]);
    expect(collectForbiddenFieldPaths(first)).toEqual([]);
  });
});
