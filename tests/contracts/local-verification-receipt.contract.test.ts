import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PLAYBOOK_SCHEMA_PATHS } from '../../packages/contracts/src/index.js';

describe('local verification receipt contract', () => {
  it('registers the local verification receipt schema path', () => {
    expect(PLAYBOOK_SCHEMA_PATHS.localVerificationReceipt).toBe('packages/contracts/src/local-verification-receipt.schema.json');
  });

  it('separates verification, publishing, and deployment workflow state', () => {
    const schemaPath = path.resolve(process.cwd(), PLAYBOOK_SCHEMA_PATHS.localVerificationReceipt);
    const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8')) as any;

    expect(schema.required).toEqual([
      'schemaVersion',
      'kind',
      'receipt_id',
      'generated_at',
      'repo_root',
      'verification_mode',
      'provider',
      'workflow',
      'local_verification',
      'governance',
      'summary',
    ]);
    expect(schema.properties.kind?.const).toBe('local-verification-receipt');
    expect(schema.properties.workflow?.properties?.verification?.properties?.state?.enum).toEqual(['passed', 'failed', 'not-run']);
    expect(schema.properties.workflow?.properties?.publishing?.properties?.state?.enum).toEqual(['not-configured', 'not-observed', 'synced', 'failed']);
    expect(schema.properties.workflow?.properties?.deployment?.properties?.state?.enum).toEqual(['not-configured', 'not-observed', 'promoted', 'failed']);
  });
});
