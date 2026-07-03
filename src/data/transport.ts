import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { RunFn } from './wallet.ts';

const execFileAsync = promisify(execFile);

// ponytail: dev/local transport — spawns the onchainos CLI. The deployed Vercel
// endpoint will replace this with a direct REST call (needs an OKX dev-portal
// API key). Only this file changes for that swap; parsing/analysis are untouched.
// ONCHAINOS_BIN lets the container point at wherever it installed the CLI; falls
// back to the default install path used by the skills installer locally.
const BIN =
  process.env.ONCHAINOS_BIN ||
  join(homedir(), '.local', 'bin', process.platform === 'win32' ? 'onchainos.exe' : 'onchainos');

export const runOnchainos: RunFn = async (args) => {
  // Balances for busy wallets can exceed 1MB, so raise the pipe buffer well past default.
  const { stdout } = await execFileAsync(BIN, args, { maxBuffer: 64 * 1024 * 1024 });
  return JSON.parse(stdout);
};
