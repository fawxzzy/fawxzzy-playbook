#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);

const readOption = (name) => {
  const index = args.indexOf(name);
  if (index === -1) return null;
  return args[index + 1] ?? null;
};

const repoRoot = path.resolve(readOption('--repo-root') ?? process.cwd());
const executorSchemaPath = path.resolve(
  repoRoot,
  readOption('--executor-schema') ?? 'exports/playbook.workflow-pack.environment-bridge.executor.schema.v1.json'
);
const executorExamplePath = path.resolve(
  repoRoot,
  readOption('--executor-example') ?? 'exports/playbook.workflow-pack.environment-bridge.executor.example.v1.json'
);
const receiptSchemaPath = path.resolve(
  repoRoot,
  readOption('--receipt-schema') ?? 'exports/playbook.workflow-pack.environment-bridge.executor-receipt.schema.v1.json'
);
const receiptExamplePath = path.resolve(
  repoRoot,
  readOption('--receipt-example') ?? 'exports/playbook.workflow-pack.environment-bridge.executor-receipt.example.v1.json'
);

const forbiddenCommandClaimFields = new Set([
  'command',
  'commands',
  'commandAvailability',
  'commandStatus',
  'workflowAvailability',
  'workflowStatus',
  'workflowFile',
  'workflowPath',
  'generatedWorkflow',
  'generatedWorkflows'
]);
const forbiddenUnstableFieldNames = new Set([
  'generatedAt',
  'createdAt',
  'updatedAt',
  'timestamp',
  'absolutePath',
  'localPath',
  'workspaceRoot',
  'runtimePath'
]);
const requiredForbiddenTargets = ['raw_secret_values', 'secret_materialization'];

const fail = (message) => {
  console.error(`workflow-pack-environment-bridge-executor: ${message}`);
  process.exit(1);
};

const readJsonFile = (filePath, label) => {
  if (!fs.existsSync(filePath)) {
    fail(`missing ${label}: ${path.relative(repoRoot, filePath)}`);
  }

  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    fail(`invalid JSON in ${label} (${path.relative(repoRoot, filePath)}): ${error.message}`);
  }
};

const toTypeName = (value) => {
  if (Array.isArray(value)) return 'array';
  if (value === null) return 'null';
  if (typeof value === 'number' && Number.isInteger(value)) return 'integer';
  return typeof value;
};

const typeMatches = (schemaType, value) => {
  const typeName = toTypeName(value);
  if (Array.isArray(schemaType)) {
    return schemaType.includes(typeName) || (schemaType.includes('number') && typeName === 'integer');
  }
  return schemaType === typeName || (schemaType === 'number' && typeName === 'integer');
};

const validateAgainstSchema = (value, schema, context = '$') => {
  if (!schema || typeof schema !== 'object') {
    return [];
  }

  const errors = [];

  if (Object.prototype.hasOwnProperty.call(schema, 'const') && value !== schema.const) {
    errors.push(`${context} must equal ${JSON.stringify(schema.const)}`);
    return errors;
  }

  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
    errors.push(`${context} must be one of ${schema.enum.map((entry) => JSON.stringify(entry)).join(', ')}`);
  }

  if (Object.prototype.hasOwnProperty.call(schema, 'type') && !typeMatches(schema.type, value)) {
    errors.push(`${context} must be ${JSON.stringify(schema.type)} (received ${JSON.stringify(toTypeName(value))})`);
    return errors;
  }

  if (typeof schema.minLength === 'number' && (typeof value !== 'string' || value.length < schema.minLength)) {
    errors.push(`${context} must have minLength ${schema.minLength}`);
  }

  if (typeof schema.minimum === 'number' && (typeof value !== 'number' || value < schema.minimum)) {
    errors.push(`${context} must be >= ${schema.minimum}`);
  }

  if (typeof schema.minItems === 'number' && (!Array.isArray(value) || value.length < schema.minItems)) {
    errors.push(`${context} must contain at least ${schema.minItems} item(s)`);
  }

  if (typeof schema.pattern === 'string' && (typeof value !== 'string' || !new RegExp(schema.pattern).test(value))) {
    errors.push(`${context} must match pattern ${JSON.stringify(schema.pattern)}`);
  }

  if (Array.isArray(schema.required)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      errors.push(`${context} must be an object with required properties`);
      return errors;
    }

    for (const property of schema.required) {
      if (!Object.prototype.hasOwnProperty.call(value, property)) {
        errors.push(`${context} missing required property ${JSON.stringify(property)}`);
      }
    }
  }

  if (value && typeof value === 'object' && !Array.isArray(value) && schema.properties && typeof schema.properties === 'object') {
    const properties = schema.properties;
    for (const [key, propertySchema] of Object.entries(properties)) {
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        errors.push(...validateAgainstSchema(value[key], propertySchema, `${context}.${key}`));
      }
    }

    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!Object.prototype.hasOwnProperty.call(properties, key)) {
          errors.push(`${context} contains unsupported property ${JSON.stringify(key)}`);
        }
      }
    }
  }

  if (Array.isArray(value) && schema.items) {
    value.forEach((entry, index) => {
      errors.push(...validateAgainstSchema(entry, schema.items, `${context}[${index}]`));
    });
  }

  return errors;
};

const isAbsolutePathLike = (value) =>
  /^[A-Za-z]:[\\/]/.test(value) ||
  /^\\\\/.test(value) ||
  /^\/(?:Users|home|var|tmp)\//.test(value);

const isIsoDateTime = (value) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value);

const validateStableContent = (value, context = '$') => {
  if (typeof value === 'string') {
    if (isAbsolutePathLike(value)) {
      fail(`${context} must not contain a local absolute path`);
    }
    if (isIsoDateTime(value)) {
      fail(`${context} must not depend on unstable timestamp content`);
    }
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((entry, index) => validateStableContent(entry, `${context}[${index}]`));
    return;
  }

  if (!value || typeof value !== 'object') {
    return;
  }

  for (const [key, entry] of Object.entries(value)) {
    if (forbiddenUnstableFieldNames.has(key)) {
      fail(`${context} must not include unstable field ${JSON.stringify(key)}`);
    }
    if (forbiddenCommandClaimFields.has(key)) {
      fail(`${context} must not claim command or workflow availability via ${JSON.stringify(key)}`);
    }
    validateStableContent(entry, `${context}.${key}`);
  }
};

const validateRepoRelativeRef = (value, context) => {
  if (typeof value !== 'string' || !value.trim()) {
    fail(`${context} must be a non-empty string`);
  }
  if (path.isAbsolute(value) || /^[A-Za-z]:[\\/]/.test(value)) {
    fail(`${context} must use a repo-relative ref`);
  }
};

const validateProviderNeutralSecretRef = (value, context) => {
  if (typeof value !== 'string' || !value.startsWith('ref://')) {
    fail(`${context} must use a provider-neutral secret ref`);
  }
};

const validateExplicitMutationTarget = (value, context) => {
  if (typeof value !== 'string' || !value.trim()) {
    fail(`${context} must be a non-empty string`);
  }
  if (/[*]/.test(value) || /(?:^|[._-])(all|any|implicit|automatic)(?:$|[._-])/i.test(value)) {
    fail(`${context} must remain explicit and finite`);
  }
};

const executorSchema = readJsonFile(executorSchemaPath, 'executor schema');
const executorExample = readJsonFile(executorExamplePath, 'executor example');
const receiptSchema = readJsonFile(receiptSchemaPath, 'executor receipt schema');
const receiptExample = readJsonFile(receiptExamplePath, 'executor receipt example');

const executorErrors = validateAgainstSchema(executorExample, executorSchema);
if (executorErrors.length > 0) {
  fail(`executor example does not validate against schema:\n- ${executorErrors.join('\n- ')}`);
}

const receiptErrors = validateAgainstSchema(receiptExample, receiptSchema);
if (receiptErrors.length > 0) {
  fail(`executor receipt example does not validate against schema:\n- ${receiptErrors.join('\n- ')}`);
}

validateStableContent(executorExample, 'workflow-pack-environment-bridge-executor');
validateStableContent(receiptExample, 'workflow-pack-environment-bridge-executor-receipt');

validateRepoRelativeRef(executorExample.sourcePlanRef, 'sourcePlanRef');
validateRepoRelativeRef(receiptExample.sourcePlanRef, 'receipt.sourcePlanRef');

if (executorExample.sourcePlanRef !== receiptExample.sourcePlanRef) {
  fail('executor example and receipt example must reference the same sourcePlanRef');
}

if (executorExample.executionMode === 'apply_requested' && executorExample.approvalRequired !== true) {
  fail('apply_requested executionMode requires approvalRequired=true');
}

if (receiptExample.status === 'applied' && receiptExample.executionMode !== 'apply_requested') {
  fail('applied receipt status requires executionMode=apply_requested');
}

if (receiptExample.executionMode !== executorExample.executionMode) {
  fail('receipt executionMode must match executor example executionMode');
}

if (receiptExample.status === 'dry_run_complete') {
  if (receiptExample.mutationSummary.attempted !== false) {
    fail('dry_run_complete receipts must report mutationSummary.attempted=false');
  }
  if (receiptExample.mutationSummary.appliedCount !== 0) {
    fail('dry_run_complete receipts must report mutationSummary.appliedCount=0');
  }
}

for (const [index, secretRef] of executorExample.requiredSecretRefs.entries()) {
  validateProviderNeutralSecretRef(secretRef, `requiredSecretRefs[${index}]`);
}

for (const [index, ref] of executorExample.requiredReceiptRefs.entries()) {
  validateRepoRelativeRef(ref, `requiredReceiptRefs[${index}]`);
}

for (const [index, ref] of receiptExample.evidenceRefs.entries()) {
  validateRepoRelativeRef(ref, `receipt.evidenceRefs[${index}]`);
}

for (const [index, ref] of receiptExample.receiptRefs.entries()) {
  validateRepoRelativeRef(ref, `receipt.receiptRefs[${index}]`);
}

for (const [index, ref] of executorExample.receiptRequirements.requiredEvidenceRefs.entries()) {
  validateRepoRelativeRef(ref, `receiptRequirements.requiredEvidenceRefs[${index}]`);
}

for (const [index, ref] of executorExample.receiptRequirements.requiredReceiptRefs.entries()) {
  validateRepoRelativeRef(ref, `receiptRequirements.requiredReceiptRefs[${index}]`);
}

for (const [index, target] of executorExample.allowedMutationTargets.entries()) {
  validateExplicitMutationTarget(target, `allowedMutationTargets[${index}]`);
}

const allowedTargets = new Set(executorExample.allowedMutationTargets);
for (const [index, target] of executorExample.executionSteps.entries()) {
  if (!allowedTargets.has(target.mutationTarget)) {
    fail(`executionSteps[${index}].mutationTarget must be declared in allowedMutationTargets`);
  }
}

for (const requiredTarget of requiredForbiddenTargets) {
  if (!executorExample.forbiddenMutationTargets.includes(requiredTarget)) {
    fail(`forbiddenMutationTargets must include ${JSON.stringify(requiredTarget)}`);
  }
}

if (executorExample.receiptRequirements.requiredStatuses.length === 0) {
  fail('receiptRequirements.requiredStatuses must remain explicit');
}
if (executorExample.receiptRequirements.requiredFields.length === 0) {
  fail('receiptRequirements.requiredFields must remain explicit');
}
if (executorExample.receiptRequirements.requiredEvidenceRefs.length === 0) {
  fail('receiptRequirements.requiredEvidenceRefs must remain explicit');
}
if (executorExample.receiptRequirements.requiredReceiptRefs.length === 0) {
  fail('receiptRequirements.requiredReceiptRefs must remain explicit');
}

const knownStepIds = new Set([
  ...executorExample.preflightChecks.map((check) => check.id),
  ...executorExample.executionSteps.map((step) => step.id)
]);
for (const stepId of receiptExample.completedSteps) {
  if (!knownStepIds.has(stepId)) {
    fail(`receipt.completedSteps contains unknown step ${JSON.stringify(stepId)}`);
  }
}
for (const stepId of receiptExample.skippedSteps) {
  if (!knownStepIds.has(stepId)) {
    fail(`receipt.skippedSteps contains unknown step ${JSON.stringify(stepId)}`);
  }
}

const completedSteps = new Set(receiptExample.completedSteps);
for (const stepId of receiptExample.skippedSteps) {
  if (completedSteps.has(stepId)) {
    fail(`receipt step ${JSON.stringify(stepId)} cannot appear in both completedSteps and skippedSteps`);
  }
}

if (!receiptExample.receiptRefs.includes(executorExample.sourcePlanRef)) {
  fail('receipt.receiptRefs must include sourcePlanRef');
}

if (!executorExample.receiptRequirements.requiredReceiptRefs.every((ref) => receiptExample.receiptRefs.includes(ref))) {
  fail('receipt.receiptRefs must preserve all receiptRequirements.requiredReceiptRefs');
}

if (!executorExample.requiredReceiptRefs.every((ref) => receiptExample.receiptRefs.includes(ref))) {
  fail('receipt.receiptRefs must preserve all requiredReceiptRefs');
}

console.log('workflow-pack-environment-bridge-executor: ok (2 artifacts validated)');
