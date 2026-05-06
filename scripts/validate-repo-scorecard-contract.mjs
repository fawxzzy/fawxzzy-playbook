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
const schemaPath = path.resolve(repoRoot, readOption('--schema') ?? 'exports/playbook.repo-scorecard.schema.v1.json');
const examplePath = path.resolve(repoRoot, readOption('--example') ?? 'exports/playbook.repo-scorecard.example.v1.json');
const requiredDimensions = [
  'owner_truth',
  'command_truth',
  'verification_truth',
  'artifact_hygiene',
  'docs_governance',
  'workflow_pack_adoption',
  'local_verification',
  'roadmap_governance'
];
const forbiddenCommandClaimFields = new Set(['command', 'commands', 'commandAvailability', 'commandStatus', 'availability']);
const forbiddenUnstableFieldNames = new Set(['generatedAt', 'createdAt', 'updatedAt', 'timestamp', 'absolutePath', 'localPath', 'workspaceRoot']);

const fail = (message) => {
  console.error(`repo-scorecard-contract: ${message}`);
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

  if (typeof schema.minLength === 'number') {
    if (typeof value !== 'string' || value.length < schema.minLength) {
      errors.push(`${context} must have minLength ${schema.minLength}`);
    }
  }

  if (typeof schema.minimum === 'number') {
    if (typeof value !== 'number' || value < schema.minimum) {
      errors.push(`${context} must be >= ${schema.minimum}`);
    }
  }

  if (typeof schema.minItems === 'number') {
    if (!Array.isArray(value) || value.length < schema.minItems) {
      errors.push(`${context} must contain at least ${schema.minItems} item(s)`);
    }
  }

  if (typeof schema.pattern === 'string') {
    if (typeof value !== 'string' || !new RegExp(schema.pattern).test(value)) {
      errors.push(`${context} must match pattern ${JSON.stringify(schema.pattern)}`);
    }
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
    validateStableContent(entry, `${context}.${key}`);
  }
};

const schema = readJsonFile(schemaPath, 'schema');
const example = readJsonFile(examplePath, 'example');

const schemaErrors = validateAgainstSchema(example, schema);
if (schemaErrors.length > 0) {
  fail(`example does not validate against schema:\n- ${schemaErrors.join('\n- ')}`);
}

validateStableContent(example, 'scorecard');

if (!Array.isArray(example.dimensions) || example.dimensions.length !== requiredDimensions.length) {
  fail(`dimensions must contain exactly ${requiredDimensions.length} required entries`);
}

const seenDimensions = new Set();
for (const [index, dimension] of example.dimensions.entries()) {
  const context = `dimensions[${index}]`;

  if (seenDimensions.has(dimension.id)) {
    fail(`${context}.id must be unique; duplicate ${JSON.stringify(dimension.id)} detected`);
  }
  seenDimensions.add(dimension.id);

  for (const forbiddenField of forbiddenCommandClaimFields) {
    if (Object.prototype.hasOwnProperty.call(dimension, forbiddenField)) {
      fail(`${context} must not claim command availability via ${JSON.stringify(forbiddenField)}`);
    }
  }

  if (!Array.isArray(dimension.evidence) || dimension.evidence.length === 0) {
    fail(`${context}.evidence must contain at least one repo-relative evidence path`);
  }

  for (const evidencePath of dimension.evidence) {
    if (typeof evidencePath !== 'string' || !evidencePath.trim()) {
      fail(`${context}.evidence entries must be non-empty strings`);
    }
    if (path.isAbsolute(evidencePath) || /^[A-Za-z]:[\\/]/.test(evidencePath)) {
      fail(`${context}.evidence must use repo-relative paths`);
    }
  }
}

for (const requiredDimension of requiredDimensions) {
  if (!seenDimensions.has(requiredDimension)) {
    fail(`missing required dimension ${JSON.stringify(requiredDimension)}`);
  }
}

const counts = {
  verified: 0,
  partial: 0,
  missing: 0,
  notApplicable: 0
};

for (const dimension of example.dimensions) {
  if (dimension.status === 'verified') counts.verified += 1;
  if (dimension.status === 'partial') counts.partial += 1;
  if (dimension.status === 'missing') counts.missing += 1;
  if (dimension.status === 'not_applicable') counts.notApplicable += 1;
}

for (const [key, value] of Object.entries(counts)) {
  if (example.summary[key] !== value) {
    fail(`summary.${key} must equal the counted dimension statuses (${value})`);
  }
}

if (Object.values(example.summary).reduce((sum, value) => sum + value, 0) !== requiredDimensions.length) {
  fail('summary counts must total the required dimension count');
}

console.log(`repo-scorecard-contract: ok (${example.dimensions.length} dimensions validated)`);
