import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Only this project's tests (not copies inside .claude/worktrees/).
  test: { include: ['test/**/*.test.ts'] },
});
