import { queryRepositoryIndex } from '../query/repoQuery.js';
import type { RepositoryModule } from '../indexer/repoIndexer.js';


const toModuleNames = (modules: string[] | RepositoryModule[]): string[] => {
  if (modules.length === 0) {
    return [];
  }

  const first = modules[0];
  if (typeof first === 'string') {
    return modules as string[];
  }

  return (modules as RepositoryModule[]).map((moduleEntry) => moduleEntry.name);
};


const ASK_USER_QUESTION_PREFIX = 'User question:';

const extractUserQuestion = (question: string): string => {
  const markerIndex = question.lastIndexOf(ASK_USER_QUESTION_PREFIX);
  if (markerIndex === -1) {
    return question;
  }

  const extracted = question.slice(markerIndex + ASK_USER_QUESTION_PREFIX.length).trim();
  return extracted.length > 0 ? extracted : question;
};

type AskContext = {
  architecture: string;
  framework: string;
  modules: string[];
  rules: string[];
};

export type AskEngineResult = {
  question: string;
  answer: string;
  reason: string;
  context: {
    architecture: string;
    framework: string;
    modules: string[];
  };
};

const normalizeQuestion = (question: string): string => extractUserQuestion(question).trim().toLowerCase();

const gatherContext = (projectRoot: string): AskContext => {
  const architecture = queryRepositoryIndex(projectRoot, 'architecture').result as string;
  const modules = toModuleNames(queryRepositoryIndex(projectRoot, 'modules').result as string[] | RepositoryModule[]);
  const framework = queryRepositoryIndex(projectRoot, 'framework').result as string;
  const rules = queryRepositoryIndex(projectRoot, 'rules').result as string[];

  return {
    architecture,
    modules,
    framework,
    rules
  };
};

const formatRulesHint = (rules: string[]): string => {
  if (rules.length === 0) {
    return 'No repository rules were detected in the current index.';
  }

  return `Rule registry signals in the index: ${rules.join(', ')}.`;
};

const includesAny = (question: string, values: string[]): boolean => values.some((value) => question.includes(value));

export const answerRepositoryQuestion = (projectRoot: string, question: string): AskEngineResult => {
  const userQuestion = extractUserQuestion(question);
  const normalizedQuestion = normalizeQuestion(userQuestion);
  const context = gatherContext(projectRoot);

  if (normalizedQuestion.includes('where') && includesAny(normalizedQuestion, ['feature', 'features'])) {
    if (context.architecture === 'modular-monolith') {
      return {
        question: userQuestion,
        answer: 'Recommended location: src/features/<feature>',
        reason:
          'Playbook detected modular-monolith architecture with feature boundaries under src/features. ' +
          formatRulesHint(context.rules),
        context: {
          architecture: context.architecture,
          framework: context.framework,
          modules: context.modules
        }
      };
    }

    return {
      question: userQuestion,
      answer: 'Recommended location: src/<feature>',
      reason: `Playbook did not detect a modular-monolith layout. ${formatRulesHint(context.rules)}`,
      context: {
        architecture: context.architecture,
        framework: context.framework,
        modules: context.modules
      }
    };
  }

  if (normalizedQuestion.includes('architecture')) {
    return {
      question: userQuestion,
      answer: `Architecture: ${context.architecture}`,
      reason: `Derived from repository index architecture signal. ${formatRulesHint(context.rules)}`,
      context: {
        architecture: context.architecture,
        framework: context.framework,
        modules: context.modules
      }
    };
  }

  if (includesAny(normalizedQuestion, ['module', 'modules'])) {
    return {
      question: userQuestion,
      answer: context.modules.length > 0 ? `Modules: ${context.modules.join(', ')}` : 'Modules: none',
      reason: `Derived from repository index module graph. ${formatRulesHint(context.rules)}`,
      context: {
        architecture: context.architecture,
        framework: context.framework,
        modules: context.modules
      }
    };
  }

  return {
    question: userQuestion,
    answer: 'Playbook cannot answer this question yet.',
    reason: 'Suggested commands:\nplaybook query modules\nplaybook query architecture',
    context: {
      architecture: context.architecture,
      framework: context.framework,
      modules: context.modules
    }
  };
};
