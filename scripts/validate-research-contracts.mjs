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
const artifactSpecs = [
  {
    label: 'project-profile',
    schemaPath: 'exports/playbook.research.project-profile.schema.v1.json',
    examplePath: 'exports/playbook.research.project-profile.example.v1.json'
  },
  {
    label: 'pattern-set',
    schemaPath: 'exports/playbook.research.pattern-set.schema.v1.json',
    examplePath: 'exports/playbook.research.pattern-set.example.v1.json'
  },
  {
    label: 'integration-map',
    schemaPath: 'exports/playbook.research.integration-map.schema.v1.json',
    examplePath: 'exports/playbook.research.integration-map.example.v1.json'
  },
  {
    label: 'roadmap-diff',
    schemaPath: 'exports/playbook.research.roadmap-diff.schema.v1.json',
    examplePath: 'exports/playbook.research.roadmap-diff.example.v1.json'
  }
];
const forbiddenCommandClaimFields = new Set(['command', 'commandAvailability', 'commandStatus', 'availability']);
const forbiddenUnstableFieldNames = new Set(['generatedAt', 'createdAt', 'updatedAt', 'timestamp', 'absolutePath', 'localPath', 'workspaceRoot']);
const patternClassifications = ['Pattern', 'Rule', 'Failure Mode'];
const stableIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const roadmapFeaturePattern = /^PB-V[0-9]+-[A-Z0-9-]+$/;

const fail = (message) => {
  console.error(`research-contracts: ${message}`);
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

  if (typeof schema.maxItems === 'number') {
    if (!Array.isArray(value) || value.length > schema.maxItems) {
      errors.push(`${context} must contain at most ${schema.maxItems} item(s)`);
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

const validatePatternSet = (example) => {
  const seen = new Set();
  for (const [index, pattern] of example.patterns.entries()) {
    const context = `pattern-set.patterns[${index}]`;
    if (!stableIdPattern.test(pattern.id)) {
      fail(`${context}.id must use stable kebab-case format`);
    }
    seen.add(pattern.classification);
  }

  for (const classification of patternClassifications) {
    if (!seen.has(classification)) {
      fail(`pattern-set must include at least one ${classification} row`);
    }
  }
};

const validateIntegrationMap = (example) => {
  for (const [index, entry] of example.entries.entries()) {
    const context = `integration-map.entries[${index}]`;
    for (const field of ['project', 'architectureFit', 'improvesOrReplaces', 'minimalImplementation']) {
      if (typeof entry[field] !== 'string' || !entry[field].trim()) {
        fail(`${context}.${field} must be a non-empty string`);
      }
    }
  }
};

const validateRoadmapDiff = (example) => {
  for (const [index, entry] of example.entries.entries()) {
    const context = `roadmap-diff.entries[${index}]`;

    if (!stableIdPattern.test(entry.id)) {
      fail(`${context}.id must use stable kebab-case format`);
    }

    if (!roadmapFeaturePattern.test(entry.featureId)) {
      fail(`${context}.featureId must use roadmap feature id format`);
    }

    for (const forbiddenField of forbiddenCommandClaimFields) {
      if (Object.prototype.hasOwnProperty.call(entry, forbiddenField)) {
        fail(`${context} must not claim command availability via ${JSON.stringify(forbiddenField)}`);
      }
    }

    if (!Array.isArray(entry.commands) || entry.commands.length !== 0) {
      fail(`${context}.commands must remain empty for commandless research roadmap diffs`);
    }

    if (typeof entry.reviewSource !== 'string' || path.isAbsolute(entry.reviewSource)) {
      fail(`${context}.reviewSource must be a repo-relative path`);
    }
  }
};

let validatedArtifactCount = 0;

for (const spec of artifactSpecs) {
  const schema = readJsonFile(path.resolve(repoRoot, spec.schemaPath), `${spec.label} schema`);
  const example = readJsonFile(path.resolve(repoRoot, spec.examplePath), `${spec.label} example`);
  const schemaErrors = validateAgainstSchema(example, schema);

  if (schemaErrors.length > 0) {
    fail(`${spec.label} example does not validate against schema:\n- ${schemaErrors.join('\n- ')}`);
  }

  validateStableContent(example, spec.label);

  if (spec.label === 'pattern-set') {
    validatePatternSet(example);
  }

  if (spec.label === 'integration-map') {
    validateIntegrationMap(example);
  }

  if (spec.label === 'roadmap-diff') {
    validateRoadmapDiff(example);
  }

  validatedArtifactCount += 1;
}

console.log(`research-contracts: ok (${validatedArtifactCount} artifacts validated)`);
