import { describe, expect, it } from 'vitest';
import { loadAnalyzeRules } from './loadAnalyzeRules.js';
import { loadVerifyRules } from './loadVerifyRules.js';

describe('rule loaders', () => {
  it('loads verify rules with unique ids', () => {
    const rules = loadVerifyRules();
    const ids = rules.map((rule) => rule.id);

    expect(ids).toEqual(['notes.missing', 'notes.empty', 'requireNotesOnChanges']);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('loads analyze rules with unique ids', () => {
    const rules = loadAnalyzeRules();
    const ids = rules.map((rule) => rule.id);

    expect(ids).toEqual(['analyze-no-signals', 'analyze-run-init', 'analyze-run-verify']);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
