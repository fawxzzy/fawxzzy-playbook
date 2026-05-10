import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildWorkflowPackEnvironmentBridgeReport } from '../src/workflowPack/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../../..');

const inputExamplePath = path.join(repoRoot, 'exports', 'playbook.workflow-pack.environment-bridge.example.v1.json');
const reportSchemaPath = path.join(repoRoot, 'exports', 'playbook.workflow-pack.environment-bridge.report.schema.v1.json');
const reportExamplePath = path.join(repoRoot, 'exports', 'playbook.workflow-pack.environment-bridge.report.example.v1.json');

const inputExample = JSON.parse(fs.readFileSync(inputExamplePath, 'utf8')) as Record<string, unknown>;
const reportSchema = JSON.parse(fs.readFileSync(reportSchemaPath, 'utf8'));
const reportExample = JSON.parse(fs.readFileSync(reportExamplePath, 'utf8')) as ReturnType<typeof buildWorkflowPackEnvironmentBridgeReport>;

const FORBIDDEN_OUTPUT_FIELDS = new Set([
  'command',
  'commands',
  'commandAvailability',
  'commandStatus',
  'availability',
  'workflow',
  'workflowFile',
  'workflowPath',
  'workflowName',
  'generatedAt',
  'createdAt',
  'updatedAt',
  'timestamp',
  'absolutePath',
  'localPath',
  'workspaceRoot'
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

  if (typeof schemaObject.pattern === 'string' && (typeof value !== 'string' || !(new RegExp(schemaObject.pattern).test(value)))) {
    errors.push(`${context} must match pattern ${schemaObject.pattern}`);
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
    const definitions = (reportSchema as { $defs?: Record<string, unknown> }).$defs ?? {};
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

describe('workflow-pack environment bridge report contract', () => {
  it('matches the published stable report fixture for the committed bridge example', () => {
    const report = buildWorkflowPackEnvironmentBridgeReport(inputExample as Parameters<typeof buildWorkflowPackEnvironmentBridgeReport>[0]);
    expect(report).toEqual(reportExample);
  });

  it('validates the published report example against the published report schema', () => {
    const errors = validateAgainstSchema(reportExample, reportSchema);
    expect(errors, JSON.stringify(errors, null, 2)).toEqual([]);
  });

  it('keeps normalized refs, ordering, and output boundaries deterministic', () => {
    const report = buildWorkflowPackEnvironmentBridgeReport({
      ...(inputExample as Record<string, unknown>),
      verificationGate: {
        ...((inputExample as { verificationGate: Record<string, unknown> }).verificationGate ?? {}),
        requiredEvidenceRefs: [
          ...((((inputExample as { verificationGate: { requiredEvidenceRefs: string[] } }).verificationGate?.requiredEvidenceRefs) ?? []))
        ].reverse()
      },
      approvalPolicy: {
        ...((inputExample as { approvalPolicy: Record<string, unknown> }).approvalPolicy ?? {}),
        approverRoles: [
          ...((((inputExample as { approvalPolicy: { approverRoles: string[] } }).approvalPolicy?.approverRoles) ?? []))
        ].reverse()
      },
      requiredSecrets: [...(((inputExample as { requiredSecrets: string[] }).requiredSecrets) ?? [])].reverse(),
      receiptRefs: [...(((inputExample as { receiptRefs: string[] }).receiptRefs) ?? [])].reverse()
    } as Parameters<typeof buildWorkflowPackEnvironmentBridgeReport>[0]);

    expect(report.verificationGate.requiredEvidenceRefs).toEqual([
      '.playbook/local-verification-receipt.json',
      '.playbook/promotion-receipt.json'
    ]);
    expect(report.requiredSecrets).toEqual([
      'ref://github/environment/PLAYBOOK_PUBLISH_TOKEN',
      'ref://lifeline/secret/PLAYBOOK_RECEIPT_SIGNING_KEY'
    ]);
    expect(report.receiptRefs).toEqual([
      '.playbook/local-verification-receipt.json',
      '.playbook/promotion-receipt.json'
    ]);
    expect(report.requiredSecrets.every((entry) => !path.isAbsolute(entry))).toBe(true);
    expect(report.receiptRefs.every((entry) => !path.isAbsolute(entry))).toBe(true);
    expect(report.verificationGate.requiredEvidenceRefs.every((entry) => !path.isAbsolute(entry))).toBe(true);
    expect(report.receiptRefs.every((entry) => !entry.includes('\\'))).toBe(true);
    expect(report.verificationGate.requiredEvidenceRefs.every((entry) => !entry.includes('\\'))).toBe(true);
    expect(collectForbiddenFieldPaths(report)).toEqual([]);
  });
});
