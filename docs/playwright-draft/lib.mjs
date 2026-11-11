// Helpers for the F9 live walkthrough. A draft kept as the starting point for the post-MVP Playwright tests
// (PlanMVP §11, O10): read README.md in this folder first. Nothing here is run by `npm test` or CI.
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const here = dirname(fileURLToPath(import.meta.url));
export const PORT = Number(process.env.PORT ?? 5290);
export const BASE = process.env.BASE ?? `http://localhost:${PORT}`;
export const API = process.env.API ?? `http://localhost:${PORT}`;
export const shotsDir = join(here, 'shots');
mkdirSync(shotsDir, { recursive: true });

export const ADMIN = { realName: 'Uat Host', displayName: 'Hosty', pin: '4321' };

// ---------------------------------------------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------------------------------------------
const results = [];
export function check(name, ok, detail = '') {
  results.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  [${detail}]` : ''}`);
}
export function section(title) {
  console.log(`\n=== ${title}`);
}
export function summary() {
  const failed = results.filter((result) => !result.ok);
  console.log(`\n${results.length - failed.length} of ${results.length} checks passed.`);
  failed.forEach((result) => console.log(`  FAILED: ${result.name} ${result.detail}`));
  return failed.length;
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Polls until `probe()` is truthy; returns its value, or `undefined` after the timeout. */
export async function until(probe, timeoutMs = 8000, everyMs = 100) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const value = await probe();
      if (value) return value;
    } catch {
      // The page may be mid-navigation; try again.
    }
    if (Date.now() > deadline) return undefined;
    await sleep(everyMs);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// The API process (published copy, Production mode, its own database)
// ---------------------------------------------------------------------------------------------------------------
// Where the published API is and which database it uses come from the environment, so no path of one machine and
// no password is written here. The database must be a throwaway one, never the developer's.
function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Set the environment variable ${name} (see README.md).`);
  return value;
}

let apiProcess;
export async function startApi({ joinCode, environment = 'Production', port = PORT } = {}) {
  apiProcess = spawn('dotnet', ['BuzzerApp.Api.dll'], {
    cwd: required('UAT_API_DIR'),
    env: {
      ...process.env,
      ASPNETCORE_ENVIRONMENT: environment,
      ASPNETCORE_URLS: `http://localhost:${port}`,
      ConnectionStrings__BuzzerDb: required('UAT_CONNECTION_STRING'),
      Event__JoinCode: joinCode,
      Admins__0__RealName: ADMIN.realName,
      Admins__0__DisplayName: ADMIN.displayName,
      Admins__0__Pin: ADMIN.pin,
      Database__MigrateOnStartup: 'true',
      Logging__LogLevel__Default: 'Warning',
    },
    stdio: 'ignore',
  });
  const up = await until(async () => (await fetch(`http://localhost:${port}/healthz`)).ok, 30000, 300);
  if (!up) throw new Error('The API did not start.');
}
export async function stopApi() {
  if (!apiProcess) return;
  const exited = new Promise((resolve) => apiProcess.once('exit', resolve));
  apiProcess.kill();
  await exited;
  apiProcess = undefined;
}

// ---------------------------------------------------------------------------------------------------------------
// Browsers and people
// ---------------------------------------------------------------------------------------------------------------
export async function launch() {
  return chromium.launch({ channel: 'msedge', headless: true });
}

/** One person = one browser context (its own cookie jar) with one phone-sized page. */
export async function newPerson(browser, label, { width = 360, height = 740, touch = true } = {}) {
  const context = await browser.newContext({
    viewport: { width, height },
    hasTouch: touch,
    isMobile: touch,
    acceptDownloads: true,
    reducedMotion: 'no-preference',
  });
  const page = await context.newPage();
  const problems = [];
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`console: ${message.text()}`);
  });
  let loads = 0;
  page.on('load', () => {
    loads += 1;
  });
  return { label, context, page, problems, loads: () => loads };
}

export async function shot(person, name) {
  // What the person sees (the viewport), and the whole scrolled page next to it.
  await person.page.screenshot({ path: join(shotsDir, `${name}.png`) });
  await person.page.screenshot({ path: join(shotsDir, `${name}-full.png`), fullPage: true });
}

export const bodyText = (page) => page.locator('body').innerText();
export const has = async (page, text) => (await bodyText(page)).includes(text);
export const path = (page) => new URL(page.url()).pathname;
export const untilPath = (page, expected, timeoutMs) => until(() => path(page) === expected, timeoutMs);
export const untilText = (page, text, timeoutMs) => until(() => has(page, text), timeoutMs);
export const untilNoText = (page, text, timeoutMs) => until(async () => !(await has(page, text)), timeoutMs);

/** True when the page is wider than the screen (horizontal scrolling). */
export const overflowsSideways = (page) =>
  page.evaluate((width) => document.documentElement.scrollWidth > width + 1, page.viewportSize().width);

// --- Join ----------------------------------------------------------------------------------------------------
export async function openJoin(page, code) {
  await page.goto(`${BASE}/join${code ? `?code=${encodeURIComponent(code)}` : ''}`);
  await page.getByRole('heading', { name: 'Join the game' }).waitFor();
}

export async function fillRegistration(page, { realName, displayName, pin, team }) {
  await page.getByRole('tab', { name: 'New player' }).click();
  await page.getByLabel('Your real name').fill(realName);
  await page.getByLabel('Display name').fill(displayName);
  await page.getByLabel('PIN').fill(pin);
  if (team) {
    await page.getByRole('radio', { name: new RegExp(escapeRegExp(team)) }).check();
  }
}

export async function register(person, code, who) {
  await openJoin(person.page, code);
  await fillRegistration(person.page, who);
  await person.page.getByRole('button', { name: 'Join', exact: true }).click();
  return untilPath(person.page, '/play');
}

export async function signIn(person, code, { realName, pin }) {
  await openJoin(person.page, code);
  await person.page.getByRole('tab', { name: 'Sign in' }).click();
  await person.page.getByLabel('Your real name').fill(realName);
  await person.page.getByLabel('PIN').fill(pin);
  await person.page.getByRole('button', { name: 'Sign in', exact: true }).click();
}

/** Registers through the REST API only (no browser), for filling the event with people. */
export async function apiRegister(code, { realName, displayName, pin, teamId }) {
  const response = await fetch(`${API}/api/session/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ joinCode: code, realName, displayName, pin, teamId }),
  });
  return response.status;
}

export async function joinTeams(code) {
  const response = await fetch(`${API}/api/event/teams?code=${encodeURIComponent(code)}`);
  return response.ok ? response.json() : [];
}

// --- Shell ---------------------------------------------------------------------------------------------------
export async function nav(page, label) {
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: label }).click();
}

// --- Play ----------------------------------------------------------------------------------------------------
export const buzzer = (page) => page.locator('button[data-state]');
export const buzzerState = (page) => buzzer(page).getAttribute('data-state');
export const untilBuzzer = (page, state, timeoutMs) => until(async () => (await buzzerState(page)) === state, timeoutMs);

/** The queue rows as text, without the "(You)" marker, so two people's screens can be compared. */
export async function queueRows(page, scope = '') {
  const rows = await page.locator(`${scope} ol li`).allInnerTexts();
  return rows.map((row) =>
    row
      .replace(/\s*\((you)\)/i, '')
      .replace(/\s+/g, ' ')
      .trim(),
  );
}
export const hostQueueRows = (page) => queueRows(page, 'section[aria-labelledby="queue-heading"]');
export const hostBuzzLines = async (page) =>
  (await page.locator('section[aria-labelledby="buzzes-heading"] ol li').allInnerTexts()).map((line) => line.trim());

// --- Teams ---------------------------------------------------------------------------------------------------
export async function teamMenu(page, teamName, item) {
  await page.getByRole('button', { name: `Actions for ${teamName}`, exact: true }).click();
  await page.getByRole('menuitem', { name: item }).click();
}
export async function memberMenu(page, displayName, item) {
  await page.getByRole('button', { name: `Actions for ${displayName}`, exact: true }).click();
  await page.getByRole('menuitem', { name: item }).click();
}
export const dialog = (page) => page.getByRole('dialog');

export function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
