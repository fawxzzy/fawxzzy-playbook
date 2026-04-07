export type PlaybookConfig = {
  version: 1;
  docs: {
    notesPath: string;
    architecturePath: string;
    governancePath: string;
    checklistPath: string;
  };
  analyze: {
    detectors: string[];
  };
  plugins: string[];
  verify: {
    policy: {
      rules: string[];
    };
    local: {
      enabled: boolean;
      scriptName: string;
      fallbackScriptName: string | null;
      command: string | null;
    };
    rules: {
      requireNotesOnChanges: Array<{
        whenChanged: string[];
        mustTouch: string[];
      }>;
    };
  };
  memory: {
    pressurePolicy: {
      budgetBytes: number;
      budgetFiles: number;
      budgetEvents: number;
      watermarks: {
        warm: number;
        pressure: number;
        critical: number;
      };
      hysteresis: number;
    };
  };
};

export const defaultConfig: PlaybookConfig = {
  version: 1,
  docs: {
    notesPath: 'docs/PLAYBOOK_NOTES.md',
    architecturePath: 'docs/ARCHITECTURE.md',
    governancePath: 'docs/PROJECT_GOVERNANCE.md',
    checklistPath: 'docs/PLAYBOOK_CHECKLIST.md'
  },
  analyze: {
    detectors: ['nextjs', 'supabase', 'tailwind']
  },
  plugins: [],
  verify: {
    policy: {
      rules: ['protected-doc.governance']
    },
    local: {
      enabled: true,
      scriptName: 'verify:local',
      fallbackScriptName: null,
      command: null
    },
    rules: {
      requireNotesOnChanges: [
        {
          whenChanged: ['src/**', 'app/**', 'server/**', 'supabase/**'],
          mustTouch: ['docs/PLAYBOOK_NOTES.md']
        }
      ]
    }
  },
  memory: {
    pressurePolicy: {
      budgetBytes: 50 * 1024 * 1024,
      budgetFiles: 2000,
      budgetEvents: 5000,
      watermarks: {
        warm: 0.65,
        pressure: 0.85,
        critical: 1
      },
      hysteresis: 0.05
    }
  }
};
