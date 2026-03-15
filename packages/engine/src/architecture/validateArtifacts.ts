import path from 'node:path';
import type { ArchitectureRegistry, ArtifactOwnership } from '@zachariahredfield/playbook-core';

export type ArchitectureValidationResult = {
  valid: boolean;
  errors: string[];
  warnings: string[];
  ownership: ArtifactOwnership[];
};

export type ValidateArtifactsOptions = {
  knownCommands: string[];
};

const isValidArtifactPath = (artifact: string): boolean => {
  if (!artifact.startsWith('.playbook/')) {
    return false;
  }

  const normalized = path.posix.normalize(artifact);
  if (normalized !== artifact) {
    return false;
  }

  return !artifact.includes('..') && !path.posix.isAbsolute(artifact);
};

export const validateArtifacts = (
  registry: ArchitectureRegistry,
  options: ValidateArtifactsOptions
): ArchitectureValidationResult => {
  const errors: string[] = [];
  const warnings: string[] = [];
  const ownership: ArtifactOwnership[] = [];

  const knownCommands = new Set(options.knownCommands);
  const subsystemNames = new Set<string>();
  const artifactOwners = new Map<string, string[]>();

  for (const subsystem of registry.subsystems) {
    if (subsystemNames.has(subsystem.name)) {
      errors.push(`Duplicate subsystem name: ${subsystem.name}`);
    }
    subsystemNames.add(subsystem.name);

    for (const command of subsystem.commands) {
      if (!knownCommands.has(command)) {
        errors.push(`Unknown command mapping "${command}" in subsystem "${subsystem.name}".`);
      }
    }

    for (const artifact of subsystem.artifacts) {
      if (!isValidArtifactPath(artifact)) {
        errors.push(`Invalid artifact path "${artifact}" in subsystem "${subsystem.name}".`);
      }

      const owners = artifactOwners.get(artifact) ?? [];
      owners.push(subsystem.name);
      artifactOwners.set(artifact, owners);
      ownership.push({ artifact, subsystem: subsystem.name });
    }

    if (subsystem.commands.length === 0 && subsystem.artifacts.length === 0) {
      warnings.push(`Subsystem "${subsystem.name}" has no command or artifact mappings.`);
    }
  }

  for (const [artifact, owners] of artifactOwners.entries()) {
    if (owners.length > 1) {
      errors.push(`Duplicate artifact ownership: ${artifact} -> ${owners.join(', ')}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    ownership
  };
};
