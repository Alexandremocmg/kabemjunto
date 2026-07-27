/* global process, console */

import { spawn } from 'node:child_process';

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const children = [];
let shuttingDown = false;

function start(name, args) {
  const child = spawn(npmCommand, args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  children.push({ name, child });

  child.on('exit', (code, signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.error(`[dev] ${name} terminou (code=${code ?? 'null'}, signal=${signal ?? 'none'}).`);
    for (const current of children) {
      if (current.child !== child && current.child.exitCode === null) current.child.kill('SIGTERM');
    }
    process.exitCode = code ?? 1;
  });
}

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const { child } of children) {
    if (child.exitCode === null) child.kill(signal);
  }
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

start('backend', ['--prefix', 'apps/server', 'run', 'dev']);
start('frontend', ['--prefix', 'apps/web', 'run', 'dev', '--', '--host', '--port', '5173']);
