Implemented BWB-037 on `test/37-child-theme-switching`, with no commit or push.

Added three mounted theme fixtures, switch and persistence smoke checks, a parent stylesheet enqueue fix with PHPUnit coverage, packaging checks, and the “Child themes and switching” section in [THEME.md](docs/architecture/THEME.md). The smoke test restores Blixis after its switch checks.

Prettier, PHPUnit, sequential PHPStan, JavaScript unit tests, targeted tooling tests, and `pnpm build` passed. `pnpm run check` did not pass: pnpm reported a missing package index, and its PHPStan tooling tests could not open a local listener. `composer run check` hit the same listener restriction; its checks passed when run separately. Docker smoke remains unverified because this session cannot access the Docker socket. The requested final runtime verification is `pnpm wp:smoke`.

The working tree contains only the intended changes and fixtures; no stray files remain.