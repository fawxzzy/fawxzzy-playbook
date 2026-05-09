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
const schemaPath = path.resolve(repoRoot, readOption('--schema') ?? 'exports/playbook.workflow-pack.environment-bridge.schema.v1.json');
const examplePath = path.resolve(repoRoot, readOption('--example') ?? 'exports/playbook.workflow-pack.environment-bridge.example.v1.json');
const forbiddenCommandClaimFields = new Set(['command', 'commands', 'commandAvailability', 'commandStatus', 'availability', 'workflowFile', 'workflowPath']);
const forbiddenUnstableFieldNames = new Set(['generatedAt', 'createdAt', 'updatedAt', 'timestamp', 'absolutePath', 'localPath', 'workspaceRoot']);

const fail = (message) => {
  console.error(`workflow-pack-environment-bridge: ${message}`);
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
      fail(`${context} must not claim workflow or command availability via ${JSON.stringify(key)}`);
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

const schema = readJsonFile(schemaPath, 'schema');
const example = readJsonFile(examplePath, 'example');

const schemaErrors = validateAgainstSchema(example, schema);
if (schemaErrors.length > 0) {
  fail(`example does not validate against schema:\n- ${schemaErrors.join('\n- ')}`);
}

validateStableContent(example, 'workflow-pack-environment-bridge');

if (example.secretRefsOnly !== true) {
  fail('secretRefsOnly must remain true');
}

for (const [index, secretRef] of example.requiredSecrets.entries()) {
  if (typeof secretRef !== 'string' || !secretRef.startsWith('ref://')) {
    fail(`requiredSecrets[${index}] must use a provider-neutral secret ref`);
  }
}

for (const [index, ref] of example.verificationGate.requiredEvidenceRefs.entries()) {
  validateRepoRelativeRef(ref, `verificationGate.requiredEvidenceRefs[${index}]`);
}

for (const [index, ref] of example.receiptRefs.entries()) {
  validateRepoRelativeRef(ref, `receiptRefs[${index}]`);
}

if (!example.verificationGate.requiredEvidenceRefs.every((ref) => example.receiptRefs.includes(ref))) {
  fail('verificationGate.requiredEvidenceRefs must be represented in receiptRefs');
}

if (!Array.isArray(example.consumerRules) || example.consumerRules.length === 0) {
  fail('consumerRules must contain one or more non-empty strings');
}

if (example.consumerRules.some((rule) => typeof rule !== 'string' || !rule.trim())) {
  fail('consumerRules must only contain non-empty strings');
}

if (example.deploymentMode === 'receipt_only' && example.publishMode === 'promotion_only') {
  fail('receipt_only deploymentMode requires a publishMode that preserves verification-before-publish sequencing');
}

console.log('workflow-pack-environment-bridge: ok (1 artifact validated)');
