#!/usr/bin/env node
/**
 * Start VITAL on this computer.
 *
 *     node start.mjs              build what is missing, start the server, open the browser
 *     node start.mjs --tour       same, and open straight into the guided walkthrough
 *     node start.mjs --build      rebuild the interface first, even if it looks up to date
 *     node start.mjs --port 8000  use another port (default 7860)
 *     node start.mjs --lan        also reachable from other devices on the same Wi-Fi
 *     node start.mjs --no-open    do not open the browser
 *
 * It only needs Node.js 22 and Python 3.11 or newer. The first run installs the packages
 * (a few minutes, needs internet); later runs start in seconds. Ctrl+C stops the server.
 *
 * It changes nothing in the code. It creates backend/.venv, frontend/node_modules and
 * frontend/dist when they are missing, which git ignores.
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const BACKEND = join(ROOT, 'backend');
const FRONTEND = join(ROOT, 'frontend');
const WINDOWS = process.platform === 'win32';
const VENV_PYTHON = WINDOWS ? join(BACKEND, '.venv', 'Scripts', 'python.exe') : join(BACKEND, '.venv', 'bin', 'python');

const args = process.argv.slice(2);
const has = (flag) => args.includes(flag);
const portArg = args.indexOf('--port');
const PORT = portArg >= 0 ? Number(args[portArg + 1]) : 7860;
const URL_BASE = `http://localhost:${PORT}`;

const say = (text) => console.log(`\n[VITAL] ${text}`);
function stop(text) {
  console.error(`\n[VITAL] ${text}\n`);
  process.exit(1);
}

if (has('--help') || has('-h')) {
  console.log('Usage: node start.mjs [--tour] [--build] [--port N] [--lan] [--no-open]');
  process.exit(0);
}
if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) stop('--port needs a number between 1 and 65535.');
if (!existsSync(join(BACKEND, 'requirements.txt')) || !existsSync(join(FRONTEND, 'package.json'))) {
  stop('Keep start.mjs in the top folder of the project, next to backend/ and frontend/.');
}

/** Run a command and wait for it. Its output goes straight to this window. */
function run(command, commandArgs, cwd, what) {
  const result = spawnSync(command, commandArgs, { cwd, stdio: 'inherit', shell: WINDOWS && !command.endsWith('.exe') });
  if (result.status !== 0) stop(`${what} failed. The messages above say why.`);
}

/** "3.13" for a Python that runs, or null. */
function pythonVersion(command, extra = []) {
  try {
    const result = spawnSync(command, [...extra, '-c', 'import sys; print("%d.%d" % sys.version_info[:2])'], { encoding: 'utf8' });
    const version = result.status === 0 ? result.stdout.trim() : '';
    return /^\d+\.\d+$/.test(version) ? version : null;
  } catch {
    return null;
  }
}
const newEnough = (version) => {
  const [major, minor] = version.split('.').map(Number);
  return major === 3 && minor >= 11;
};

/** A Python 3.11+ on this computer: the one named in VITAL_PYTHON, one on the PATH, or a usual Windows place. */
function findPython() {
  const candidates = [];
  if (process.env.VITAL_PYTHON) candidates.push([process.env.VITAL_PYTHON, []]);
  candidates.push(['python3', []], ['python', []]);
  if (WINDOWS) {
    candidates.push(['py', ['-3']]);
    for (const base of [homedir(), join(homedir(), 'AppData', 'Local', 'Programs', 'Python'), 'C:\\', 'C:\\Program Files']) {
      try {
        for (const name of readdirSync(base).filter((n) => /^Python3\d+$/i.test(n)).sort().reverse()) {
          candidates.push([join(base, name, 'python.exe'), []]);
        }
      } catch {
        // that folder is not there: fine
      }
    }
  }
  for (const [command, extra] of candidates) {
    const version = pythonVersion(command, extra);
    if (version && newEnough(version)) return { command, extra, version };
  }
  return null;
}

/** The newest change time of anything under a folder (skipping a few names). */
function newestIn(path, skip = new Set(['node_modules', 'dist', 'test-results', '__tests__'])) {
  let newest = 0;
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    if (skip.has(entry.name)) continue;
    const full = join(path, entry.name);
    newest = Math.max(newest, entry.isDirectory() ? newestIn(full, skip) : statSync(full).mtimeMs);
  }
  return newest;
}

async function healthy() {
  try {
    const response = await fetch(`http://127.0.0.1:${PORT}/api/v1/health`, { signal: AbortSignal.timeout(1500) });
    return response.ok && (await response.json()).status === 'ok';
  } catch {
    return false;
  }
}

function openBrowser(url) {
  if (has('--no-open')) return;
  const [command, commandArgs] = WINDOWS
    ? ['rundll32', ['url.dll,FileProtocolHandler', url]]
    : process.platform === 'darwin'
      ? ['open', [url]]
      : ['xdg-open', [url]];
  try {
    spawn(command, commandArgs, { stdio: 'ignore', detached: true }).on('error', () => undefined).unref();
  } catch {
    // no browser to open: the address is printed anyway
  }
}

const address = URL_BASE + (has('--tour') ? '/?tour' : '/');

// Already running? Then there is nothing to start.
if (await healthy()) {
  say(`VITAL is already running. Opening ${address}`);
  openBrowser(address);
  process.exit(0);
}

// 1. Python and the backend's packages.
if (!existsSync(VENV_PYTHON)) {
  const python = findPython();
  if (!python) {
    stop('Python 3.11 or newer was not found. Install it from python.org, or set VITAL_PYTHON to the full path of python.');
  }
  say(`Setting up the backend with Python ${python.version} (first run only)...`);
  run(python.command, [...python.extra, '-m', 'venv', join(BACKEND, '.venv')], BACKEND, 'Creating the Python environment');
}
if (spawnSync(VENV_PYTHON, ['-c', 'import fastapi, uvicorn'], { stdio: 'ignore' }).status !== 0) {
  say('Installing the backend packages (first run only)...');
  run(VENV_PYTHON, ['-m', 'pip', 'install', '--disable-pip-version-check', '-r', 'requirements.txt'], BACKEND, 'Installing the backend packages');
}

// 2. The interface: install its packages and build it when it is missing or out of date.
const major = Number(process.versions.node.split('.')[0]);
if (major < 20) stop(`Node.js ${process.versions.node} is too old. Install Node.js 22 from nodejs.org.`);
if (!existsSync(join(FRONTEND, 'node_modules', '.bin'))) {
  say('Installing the interface packages (first run only)...');
  run('npm', ['ci'], FRONTEND, 'Installing the interface packages');
}
const built = join(FRONTEND, 'dist', 'index.html');
const sources = Math.max(newestIn(join(FRONTEND, 'src')), statSync(join(FRONTEND, 'index.html')).mtimeMs, statSync(join(FRONTEND, 'package.json')).mtimeMs);
if (has('--build') || !existsSync(built) || statSync(built).mtimeMs < sources) {
  say('Building the interface...');
  run('npm', ['run', 'build'], FRONTEND, 'Building the interface');
}

// 3. The server. It serves the API and the interface on one address.
say(`Starting the server on port ${PORT}...`);
const server = spawn(VENV_PYTHON, ['-m', 'uvicorn', 'app.main:app', '--port', String(PORT), ...(has('--lan') ? ['--host', '0.0.0.0'] : [])], {
  cwd: BACKEND,
  stdio: 'inherit',
});
let stopping = false;
server.on('exit', (code) => {
  if (!stopping && code !== 0) {
    stop(`The server stopped (code ${code}). If the message above says the address is already in use, try: node start.mjs --port ${PORT + 1}`);
  }
  process.exit(code ?? 0);
});
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    stopping = true;
    server.kill();
  });
}

for (let attempt = 0; attempt < 60 && !(await healthy()); attempt += 1) {
  await new Promise((resolve) => setTimeout(resolve, 500));
}
if (await healthy()) {
  say(`VITAL is running at ${address}\n        Leave this window open while you use it. Ctrl+C stops it.`);
  if (has('--lan')) say(`From another device on the same Wi-Fi: http://<this computer's IP address>:${PORT}`);
  openBrowser(address);
} else {
  say(`The server has not answered yet. Try opening ${address} in a moment.`);
}
