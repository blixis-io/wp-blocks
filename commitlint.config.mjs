// Conventional Commits (docs/engineering/GITFLOW.md) plus the attribution policy: no AI-agent names, generated-by
// lines, assisted-by trailers or AI co-author trailers in commit messages. Matching is line-based and linear-time.
// A name list cannot recognise every assistant: human review remains part of the policy.
const AI_NAME =
  /\b(claude|anthropic|codex|openai|chatgpt|gpt-?\d+(\.\d+)?|copilot|gemini|cursor|windsurf|devin|aider|ai[ -](assistant|agent|model|generated)|language model|llm)\b/i;
const AI_EMAIL_DOMAIN = /@([\w-]+\.)*(anthropic|openai|claude)\.(com|ai)\b/i;
const ALWAYS_FLAGGED_TRAILER = /^\s*(assisted-by|generated-by|created-by|written-by)\s*:/i;
const IDENTITY_TRAILER = /^\s*(co-authored-by|authored-by|signed-off-by)\s*:\s*(.*)$/i;
const GENERATED_LINE = /^\s*(generated|written|authored|created)\s+(with|by|using)\b(.{0,200})/i;
const SIGNATURE_LINE = /^\s*[-—–~*_>]*\s*(claude|codex|chatgpt|copilot|gemini)(\s+code)?\b[\w .,()-]{0,40}$/i;

/** Returns the first offending line, or null. */
export function findAttribution(raw) {
  const lines = String(raw ?? '').split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.length > 2000) continue; // pathological line: handled by the length-bounded checks below only
    if (line.includes('🤖')) return line;
    if (ALWAYS_FLAGGED_TRAILER.test(line)) return line;
    const trailer = IDENTITY_TRAILER.exec(line);
    if (trailer) {
      let identity = trailer[2] ?? '';
      if (identity.trim() === '') identity = lines[i + 1] ?? ''; // value on the next line
      const email = /<([^>]*)>/.exec(identity)?.[1] ?? '';
      const name = identity.replace(/<[^>]*>/, '');
      if (AI_NAME.test(name) || AI_EMAIL_DOMAIN.test(email)) return line;
    }
    const generated = GENERATED_LINE.exec(line);
    if (generated && AI_NAME.test(generated[3] ?? '')) return line;
    if (SIGNATURE_LINE.test(line)) return line;
  }
  return null;
}

export const attributionPlugin = {
  rules: {
    'no-ai-attribution': (parsed) => {
      const hit = findAttribution(parsed.raw);
      return [
        hit === null,
        'commit message must not contain AI-agent attribution, generated-by or assisted-by lines, or AI co-author trailers (GITFLOW.md)',
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
