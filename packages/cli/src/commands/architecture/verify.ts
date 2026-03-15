import { loadArchitecture } from '@zachariahredfield/playbook-core';
import { validateArtifacts } from '@zachariahredfield/playbook-engine';
import { commandMetadata } from '../../lib/commandMetadata.js';
import { emitJsonOutput } from '../../lib/jsonArtifact.js';
import { ExitCode } from '../../lib/cliContract.js';

type ArchitectureCommandOptions = {
  format: 'text' | 'json';
  quiet: boolean;
};

const printArchitectureHelp = (): void => {
  console.log(`Usage: playbook architecture verify [--json]`);
};

export const runArchitecture = async (
  cwd: string,
  args: string[],
  options: ArchitectureCommandOptions
): Promise<number> => {
  const subcommand = args.find((arg) => !arg.startsWith('-'));

  if (!subcommand || args.includes('--help') || args.includes('-h')) {
    printArchitectureHelp();
    return subcommand ? ExitCode.Success : ExitCode.Failure;
  }

  if (subcommand !== 'verify') {
    const message = 'playbook architecture: unsupported subcommand. Use "playbook architecture verify".';
    if (options.format === 'json') {
      emitJsonOutput({
        cwd,
        command: 'architecture',
        payload: { schemaVersion: '1.0', command: 'architecture', error: message }
      });
    } else {
      console.error(message);
    }
    return ExitCode.Failure;
  }

  const registry = loadArchitecture(cwd);
  const result = validateArtifacts(registry, {
    knownCommands: commandMetadata.map((command) => command.name)
  });

  const payload = {
    schemaVersion: '1.0',
    command: 'architecture',
    subcommand: 'verify',
    subsystemCount: registry.subsystems.length,
    artifactCount: result.ownership.length,
    valid: result.valid,
    errors: result.errors,
    warnings: result.warnings
  };

  if (options.format === 'json') {
    emitJsonOutput({ cwd, command: 'architecture', payload });
    return result.valid ? ExitCode.Success : ExitCode.Failure;
  }

  if (!options.quiet) {
    console.log('Playbook Architecture Verification');
    console.log('');
    console.log(`✓ ${registry.subsystems.length} subsystems registered`);
    console.log(`✓ ${result.ownership.length} artifacts mapped`);
    console.log(result.errors.some((error: string) => error.startsWith('Duplicate artifact ownership')) ? '✗ duplicate ownership detected' : '✓ no duplicate ownership');
    console.log(result.errors.some((error: string) => error.startsWith('Unknown command mapping')) ? '✗ command mapping invalid' : '✓ command mapping valid');

    if (result.errors.length > 0) {
      console.log('');
      console.log('Architecture integrity: FAIL');
      console.log('');
      for (const error of result.errors) {
        console.log(`- ${error}`);
      }
    } else {
      console.log('');
      console.log('Architecture integrity: PASS');
    }

    if (result.warnings.length > 0) {
      console.log('');
      console.log('Warnings:');
      for (const warning of result.warnings) {
        console.log(`- ${warning}`);
      }
    }
  }

  return result.valid ? ExitCode.Success : ExitCode.Failure;
};
