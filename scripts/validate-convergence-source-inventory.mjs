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
const schemaPath = path.resolve(repoRoot, readOption('--schema') ?? 'exports/playbook.convergence.source-inventory.schema.v1.json');
const examplePath = path.resolve(repoRoot, readOption('--example') ?? 'exports/playbook.convergence.source-inventory.example.v1.json');
const stableIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const requiredSourceStringFields = ['id', 'repo', 'path', 'classification', 'migrationDecision', 'rationale'];
const forbiddenCommandClaimFields = new Set(['command', 'commands', 'commandAvailability', 'commandStatus', 'availability']);

const fail = (message) => {
  console.error(`convergence-source-inventory: ${message}`);
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

  if (schema.format === 'date-time' && typeof value === 'string' && Number.isNaN(Date.parse(value))) {
    errors.push(`${context} must be a valid date-time string`);
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

const schema = readJsonFile(schemaPath, 'schema');
const example = readJsonFile(examplePath, 'example');

const schemaErrors = validateAgainstSchema(example, schema);
if (schemaErrors.length > 0) {
  fail(`example does not validate against schema:\n- ${schemaErrors.join('\n- ')}`);
}

if (!Array.isArray(example.sources) || example.sources.length === 0) {
  fail('example must contain a non-empty sources array');
}

const seenIds = new Set();
for (const [index, source] of example.sources.entries()) {
  const context = `sources[${index}]`;

  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    fail(`${context} must be an object`);
  }

  for (const field of requiredSourceStringFields) {
    if (typeof source[field] !== 'string' || !source[field].trim()) {
      fail(`${context}.${field} must be a non-empty string`);
    }
  }

  if (!stableIdPattern.test(source.id)) {
    fail(`${context}.id must use stable kebab-case format`);
  }

  if (seenIds.has(source.id)) {
    fail(`${context}.id must be unique; duplicate ${JSON.stringify(source.id)} detected`);
  }
  seenIds.add(source.id);

  for (const forbiddenField of forbiddenCommandClaimFields) {
    if (Object.prototype.hasOwnProperty.call(source, forbiddenField)) {
      fail(`${context} must not claim command availability via ${JSON.stringify(forbiddenField)}`);
    }
  }

  if (['migrate', 'template'].includes(source.migrationDecision)) {
    if (typeof source.targetSurface !== 'string' || !source.targetSurface.trim()) {
      fail(`${context}.targetSurface is required when migrationDecision is ${JSON.stringify(source.migrationDecision)}`);
    }
  }
}

console.log(`convergence-source-inventory: ok (${example.sources.length} sources validated)`);
