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
const schemaSpecs = [
  {
    label: 'golden-path-template',
    schemaPath: 'exports/playbook.golden-path-template.schema.v1.json',
    examplePath: 'exports/playbook.golden-path-template.example.v1.json'
  },
  {
    label: 'golden-path-template-registry',
    schemaPath: 'exports/playbook.golden-path-template-registry.schema.v1.json',
    examplePath: 'exports/playbook.golden-path-template-registry.example.v1.json'
  }
];
const requiredTemplateIds = [
  'nextjs_supabase_app',
  'local_operator_repo',
  'contract_first_engine_feature'
];
const forbiddenCommandClaimFields = new Set(['command', 'commands', 'commandAvailability', 'commandStatus', 'availability', 'scaffoldCommand', 'generatorCommand']);
const forbiddenUnstableFieldNames = new Set(['generatedAt', 'createdAt', 'updatedAt', 'timestamp', 'absolutePath', 'localPath', 'workspaceRoot']);

const fail = (message) => {
  console.error(`golden-path-template-registry: ${message}`);
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

  if (typeof schema.minItems === 'number' && (!Array.isArray(value) || value.length < schema.minItems)) {
    errors.push(`${context} must contain at least ${schema.minItems} item(s)`);
  }

  if (typeof schema.pattern === 'string' && (typeof value !== 'string' || !(new RegExp(schema.pattern).test(value)))) {
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
      fail(`${context} must not claim command or scaffolding availability via ${JSON.stringify(key)}`);
    }
    validateStableContent(entry, `${context}.${key}`);
  }
};

const validateTemplateEntry = (entry, context) => {
  for (const field of ['requiredSurfaces', 'guardedDefaults', 'adoptionChecklist']) {
    if (!Array.isArray(entry[field]) || entry[field].length === 0) {
      fail(`${context}.${field} must contain one or more entries`);
    }
    if (entry[field].some((value) => typeof value !== 'string' || !value.trim())) {
      fail(`${context}.${field} must only contain non-empty strings`);
    }
  }

  for (const field of forbiddenCommandClaimFields) {
    if (Object.prototype.hasOwnProperty.call(entry, field)) {
      fail(`${context} must not claim command or scaffolding availability via ${JSON.stringify(field)}`);
    }
  }
};

let validatedArtifactCount = 0;
let registryExample = null;

for (const spec of schemaSpecs) {
  const schema = readJsonFile(path.resolve(repoRoot, spec.schemaPath), `${spec.label} schema`);
  const example = readJsonFile(path.resolve(repoRoot, spec.examplePath), `${spec.label} example`);
  const schemaErrors = validateAgainstSchema(example, schema);

  if (schemaErrors.length > 0) {
    fail(`${spec.label} example does not validate against schema:\n- ${schemaErrors.join('\n- ')}`);
  }

  validateStableContent(example, spec.label);

  if (spec.label === 'golden-path-template') {
    validateTemplateEntry(example.template, 'golden-path-template.template');
  }

  if (spec.label === 'golden-path-template-registry') {
    registryExample = example;
  }

  validatedArtifactCount += 1;
}

if (!registryExample || !Array.isArray(registryExample.templates)) {
  fail('registry example must contain templates');
}

const seenIds = new Set();
for (const [index, template] of registryExample.templates.entries()) {
  const context = `golden-path-template-registry.templates[${index}]`;
  validateTemplateEntry(template, context);

  if (seenIds.has(template.id)) {
    fail(`${context}.id must be unique; duplicate ${JSON.stringify(template.id)} detected`);
  }

  seenIds.add(template.id);
}

for (const requiredId of requiredTemplateIds) {
  if (!seenIds.has(requiredId)) {
    fail(`registry example must include required template ${JSON.stringify(requiredId)}`);
  }
}

console.log(`golden-path-template-registry: ok (${validatedArtifactCount} artifacts validated)`);
