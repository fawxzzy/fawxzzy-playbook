import type { VerifyReport } from '../commands/verify.js';
import { notesEmptyRule } from '../rules/verify/notesEmptyRule.js';
import { notesMissingRule } from '../rules/verify/notesMissingRule.js';
import { requireNotesOnChangesRule } from '../rules/verify/requireNotesOnChangesRule.js';

export type VerifyFailure = VerifyReport['failures'][number];

export type VerifyRule = {
  id: string;
  description: string;
  check: (ctx: { failure: VerifyFailure }) => boolean;
  explanation?: string;
  remediation?: string[];
};

export const loadVerifyRules = (): VerifyRule[] => [notesMissingRule, notesEmptyRule, requireNotesOnChangesRule];
