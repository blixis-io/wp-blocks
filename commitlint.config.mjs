// Conventional Commits (docs/engineering/GITFLOW.md) plus the attribution policy: no AI-agent names,
// generated-by footers or AI co-author trailers in commit messages.
const AI_NAMES =
  '(claude|anthropic|codex|openai|chatgpt|gpt-?\\d*|copilot|gemini|cursor|windsurf|\\bai\\b|ai assistant|language model|llm)';
const AI_PATTERNS = [
  new RegExp(`co-authored-by:[^\\n]*${AI_NAMES}`, 'i'),
  new RegExp(`(generated|written|authored|created)\\s+(with|by|using)[^\\n]*${AI_NAMES}`, 'i'),
  new RegExp(`🤖`),
];

export const attributionPlugin = {
  rules: {
    'no-ai-attribution': (parsed) => {
      const text = parsed.raw ?? '';
      const hit = AI_PATTERNS.find((p) => p.test(text));
      return [
        !hit,
        'commit message must not contain AI-agent attribution, generated-by lines or AI co-author trailers (GITFLOW.md)',
      ];
    },
  },
};

export default {
  extends: ['@commitlint/config-conventional'],
  plugins: [attributionPlugin],
  rules: {
    'type-enum': [2, 'always', ['feat', 'fix', 'docs', 'refactor', 'perf', 'test', 'build', 'ci', 'chore', 'revert']],
    'scope-case': [2, 'always', 'kebab-case'],
    'subject-case': [0],
    'header-max-length': [2, 'always', 100],
    'body-max-line-length': [0],
    'footer-max-line-length': [0],
    'no-ai-attribution': [2, 'always'],
  },
};
