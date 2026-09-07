import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const cwd = fileURLToPath(new URL('../', import.meta.url));
for (const args of [['status', '--short', '--branch'], ['worktree', 'list'], ['branch', '-vv']]) {
  process.stdout.write(execFileSync('git', args, { cwd, encoding: 'utf8', windowsHide: true }));
}
