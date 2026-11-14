import { expect, test, type Page } from '@playwright/test';

/**
 * End-to-end pass over the whole app at three viewport sizes (see playwright.config.ts).
 * Every test fails on any console error, page error or failed request.
 * Each test runs in a fresh browser context, so it gets its own server-side session.
 */
const ROUTES: [string, string][] = [
  ['/', 'dashboard'],
  ['/crew', 'crew-grid'],
  ['/mission', 'mission-scrubber'],
  ['/report', 'report'],
  ['/calibrate', 'calibrate'],
  ['/modules', 'modules'],
];

let problems: string[] = [];
/** A test that provokes an error on purpose names the one console message it expects. */
let expected: RegExp | null = null;

test.beforeEach(async ({ page }) => {
  problems = [];
  expected = null;
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(`console: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('requestfailed', (r) => problems.push(`requestfailed: ${r.url()}`));
});

test.afterEach(() => {
  const unexpected = problems.filter((p) => !expected?.test(p));
  expect(unexpected, 'no console errors').toEqual([]);
});

async function open(page: Page, route = '/') {
  await page.goto(`/#${route}`);
  await expect(page.locator('#main')).toBeVisible();
}

const card = (page: Page, id: string) => page.locator(`[data-indicator="${id}"]`);

test('every nav item opens its screen, each with an icon', async ({ page }) => {
  await open(page);
  await expect(page.locator('[data-nav]')).toHaveCount(ROUTES.length);
  await expect(page.locator('[data-nav] [data-icon]')).toHaveCount(ROUTES.length);
  for (const [route, testId] of ROUTES) {
    await page.locator(`[data-nav="${route}"]`).click();
    await expect(page.getByTestId(testId)).toBeVisible();
  }
});

test('crew tool, not a showcase: no source links, no removed screens', async ({ page }) => {
  for (const [route, testId] of ROUTES) {
    await open(page, route);
    await expect(page.getByTestId(testId)).toBeVisible();
    await expect(page.locator('a[href^="http"]')).toHaveCount(0);
    await expect(page.getByText(/Source:/)).toHaveCount(0);
  }
  for (const gone of ['/research', '/earth', '/sources', '/patches', '/risks', '/radiation']) {
    await expect(page.locator(`[data-nav="${gone}"]`)).toHaveCount(0);
    await open(page, gone);
    await expect(page.getByTestId('dashboard')).toBeVisible(); // unknown routes land on the dashboard
  }
});

test('daily check-in: what the crew member enters drives the dashboard', async ({ page }) => {
  await open(page);
  const heart = card(page, 'heart_rate');
  await expect(heart.getByTestId('source')).toHaveAttribute('data-source', 'sensor');
  const sensorValue = (await heart.getByTestId('latest').textContent()) ?? '';

  const field = page.getByTestId('check-in-heart_rate');
  await expect(field).toHaveValue(sensorValue);
  await expect(page.getByTestId('check-in-save')).toBeDisabled(); // nothing changed yet
  await field.fill('75');
  await page.getByTestId('check-in-save').click();
  await expect(page.getByTestId('toast').first()).toContainText('Check-in saved');
  await expect(heart.getByTestId('latest')).toHaveText('75');
  await expect(heart.getByTestId('source')).toHaveAttribute('data-source', 'manual');
  await expect(heart.locator('[data-status="call_ground"]')).toBeVisible(); // far outside this person's normal
  await expect(page.getByTestId('header-status').locator('[data-status="call_ground"]')).toBeVisible();

  // The entry belongs to its day: yesterday still shows the sensor value.
  await page.getByTestId('day-prev').click();
  await expect(page.getByTestId('day-label')).toHaveText('Mission day 19');
  await expect(heart.getByTestId('source')).toHaveAttribute('data-source', 'sensor');
  await page.getByTestId('day-next').click();
  await expect(heart.getByTestId('latest')).toHaveText('75');

  // Clearing the field withdraws the entry.
  await field.fill('');
  await page.getByTestId('check-in-save').click();
  await expect(heart.getByTestId('latest')).toHaveText(sensorValue);
  await expect(heart.getByTestId('source')).toHaveAttribute('data-source', 'sensor');

  // A value that cannot be right is refused and nothing changes.
  expected = /status of 422/; // the browser logs the server's refusal; that is the point of this step
  await page.getByTestId('check-in-spo2').fill('140');
  await page.getByTestId('check-in-save').click();
  await expect(page.getByTestId('check-in').getByRole('alert')).toBeVisible();
  await expect(card(page, 'spo2').getByTestId('source')).toHaveAttribute('data-source', 'sensor');

  // Mood is entered with one tap and stays private to the crew member.
  await page.getByTestId('check-in-mood-2').click();
  await expect(card(page, 'mood').getByTestId('latest')).toHaveText('2');
  await expect(page.getByTestId('check-in-mood-2')).toHaveAttribute('aria-pressed', 'true');
});

test('check-in fills a reading the sensor missed', async ({ page }) => {
  await open(page);
  await page.getByTestId('viewer-select').selectOption('cmo');
  const temperature = card(page, 'temperature');
  await expect(temperature.getByTestId('missing-reminder')).toBeVisible();
  await expect(page.getByTestId('check-in-temperature')).toHaveValue('');
  await page.getByTestId('check-in-temperature').fill('36.7');
  await page.getByTestId('check-in-save').click();
  await expect(temperature.getByTestId('latest')).toHaveText('36.7');
  await expect(temperature.getByTestId('missing-reminder')).toHaveCount(0);
});

test('dashboard tells the drift story on the demo day', async ({ page }) => {
  await open(page);
  const heart = card(page, 'heart_rate');
  await expect(heart.locator('[data-status="watch"]')).toBeVisible();
  await expect(heart.locator('[data-icon="heart"]')).toBeVisible();
  await expect(heart.getByTestId('drift-message')).toContainText('Slowly drifting above your normal for 5 days');
  await expect(heart.getByTestId('confidence')).toContainText('Based on 7 pre-flight readings');
  await expect(page.getByTestId('header-status').locator('[data-status="watch"]')).toBeVisible();
  await expect(page.getByTestId('body-scan')).toBeVisible();
  await expect(card(page, 'spo2').locator('p').filter({ hasText: /^[A-Z].{120,}/ })).toHaveCount(0); // no reading material on the cards
  // "Show as table" works on a chart
  await heart.getByRole('button', { name: 'Show as table' }).click();
  await expect(heart.getByRole('table')).toBeVisible();
});

test('pending placeholders show where content is awaited', async ({ page }) => {
  await open(page, '/mission');
  await expect(page.locator('[data-pending-id="distance-comm-delay"]')).toBeVisible();
  await expect(page.locator('[data-pending-id="radiation-dose-rate"]')).toBeVisible();
  await page.locator('[data-env="pressurized-rover"]').click();
  await expect(page.locator('[data-pending-id="env-pressurized-rover"]')).toBeVisible();
  await open(page, '/modules');
  await expect(page.getByTestId('modules').getByTestId('pending')).toHaveCount(4);
});

test('quick actions: log, I am OK, report, palette', async ({ page }) => {
  await open(page);
  await expect(page.getByTestId('quick-bar').locator('[data-icon]')).toHaveCount(6);
  await page.locator('[data-quick="quick-log"]').click();
  await page.locator('[data-mood="4"]').click(); // second tap saves
  await expect(page.getByTestId('toast').first()).toContainText('Saved');
  await expect(page.getByTestId('quick-log')).toBeHidden();

  await page.locator('[data-quick="ok"]').click();
  await expect(page.getByTestId('acknowledged')).toBeVisible();
  await expect(page.getByTestId('notes')).toContainText("I'm OK");

  await page.locator('[data-quick="palette"]').click();
  await page.getByTestId('command-palette').getByRole('combobox').fill('crew');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('crew-grid')).toBeVisible();

  await page.locator('[data-quick="report"]').click();
  await expect(page.getByTestId('report-text')).toContainText('SIMULATED DATA');
  await expect(page.getByTestId('report-text')).not.toContainText('http');
  await expect(page.getByTestId('report-risks').getByRole('listitem')).toHaveCount(2);
});

test('hazard lens filters the dashboard', async ({ page }) => {
  await open(page);
  await page.locator('[data-lens-chip="gravity"]').click();
  const caption = page.getByTestId('lens-caption');
  await expect(caption).toContainText('Gravity Fields');
  await expect(caption.locator('p')).toHaveCount(2); // one line for the hazard, one for the counts
  await expect(card(page, 'heart_rate')).not.toHaveAttribute('data-dim', 'true');
  await expect(card(page, 'spo2')).toHaveAttribute('data-dim', 'true');
  await expect(page.locator('[data-zone="bones"]')).not.toHaveAttribute('data-dim', 'true');
  await expect(page.locator('[data-zone="eyes"]')).toHaveAttribute('data-dim', 'true');
  // multi-select
  await page.locator('[data-lens-chip="radiation"]').click();
  await expect(card(page, 'mood')).not.toHaveAttribute('data-dim', 'true');
  await page.getByRole('button', { name: 'Clear' }).click();
  await expect(caption).toBeHidden();
  await expect(card(page, 'spo2')).not.toHaveAttribute('data-dim', 'true');
  // the lens belongs to the dashboard only
  await open(page, '/crew');
  await expect(page.getByTestId('lens')).toHaveCount(0);
});

test('mission scrubber changes phase, environment and emphasised hazards', async ({ page }) => {
  await open(page, '/mission');
  await expect(page.getByTestId('phase-name')).toHaveText('Transit to Mars');
  await page.getByRole('button', { name: 'Mission day 183' }).click();
  await expect(page.getByTestId('phase-name')).toHaveText('Mars surface');
  await expect(page.locator('[data-env="mars-surface"]')).toHaveAttribute('data-current', 'true');
  await expect(page.getByTestId('emphasised-hazards').locator('[data-hazard="gravity"]')).toBeVisible();
  await expect(page.getByTestId('environment-facts')).toContainText('three-eighths');
  await page.getByRole('button', { name: 'Show on dashboard' }).click();
  await expect(page.getByTestId('dashboard')).toBeVisible();
  await expect(page.locator('[data-lens-chip="gravity"]')).toHaveAttribute('aria-pressed', 'true');
});

test('crew view: urgent first, and privacy holds for the medical officer', async ({ page }) => {
  await open(page);
  await page.getByTestId('viewer-select').selectOption('cmo');
  await open(page, '/crew');
  const tiles = page.getByTestId('crew-tile');
  await expect(tiles).toHaveCount(4);
  await expect(tiles.nth(0)).toHaveAttribute('data-status', 'call_ground');
  await expect(tiles.nth(1)).toHaveAttribute('data-status', 'watch');
  await expect(page.getByTestId('privacy-note')).toBeVisible();
  await tiles.nth(1).click();
  await expect(page.getByTestId('member-name')).toHaveText('M. Ruiz');
  await expect(card(page, 'mood').getByTestId('privacy-lock')).toBeVisible();
  await expect(page.getByTestId('notes-locked')).toBeVisible();
  await expect(page.getByTestId('check-in')).toHaveCount(0); // nobody checks in for someone else
});

test('calibration wizard produces a personal baseline', async ({ page }) => {
  await open(page, '/calibrate');
  await page.getByTestId('cal-simulate').click();
  await expect(page.getByTestId('cal-grid').locator('input').first()).not.toHaveValue('');
  await page.getByTestId('cal-save').click();
  await expect(page.getByTestId('cal-result')).toContainText('calibrated by you');
});

test('keyboard shortcuts', async ({ page, isMobile }) => {
  test.skip(isMobile, 'hardware keyboard only');
  await open(page, '/crew');
  await page.keyboard.press('Shift+Digit4'); // the lens lives on the dashboard, so it takes you there
  await expect(page.getByTestId('dashboard')).toBeVisible();
  await expect(page.locator('[data-lens-chip="gravity"]')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('h');
  await expect(page.locator('[data-lens-chip="gravity"]')).toHaveAttribute('aria-pressed', 'false');
  await page.keyboard.press('l');
  await expect(page.getByTestId('quick-log')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('quick-log')).toBeHidden();
  await page.keyboard.press('k');
  await expect(page.getByTestId('acknowledged')).toBeVisible();
  await page.keyboard.press('/');
  await expect(page.getByTestId('command-palette')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.keyboard.press('n');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'night');
  await page.keyboard.press('n');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'day');
  await page.keyboard.press('r');
  await expect(page.getByTestId('report')).toBeVisible();
});

test('presenter mode runs end to end and resets', async ({ page }) => {
  await open(page);
  await page.getByTestId('presenter-toggle').click();
  const expected = ['calibrate', 'check-in', 'dashboard', 'dashboard', 'dashboard', 'dashboard', 'report', 'lens-caption', 'mission-scrubber', 'crew-grid'];
  const total = expected.length;
  for (const [i, testId] of expected.entries()) {
    if (i > 0) await page.getByTestId('presenter-next').click();
    await expect(page.getByTestId('presenter-step')).toHaveText(`${i + 1} / ${total}`);
    await expect(page.getByTestId(testId)).toBeVisible();
    await expect(page.getByTestId('presenter-caption')).not.toBeEmpty();
  }
  await expect(page.getByTestId('presenter-next')).toBeDisabled();
  await page.getByTestId('reset-demo').click();
  await expect(page.getByTestId('presenter')).toBeHidden();
  await expect(page.getByTestId('viewer-select')).toHaveValue('engineer');
});

test('judge drawer: mission day and scenario seeds', async ({ page }) => {
  await open(page);
  await page.getByTestId('judge-toggle').click();
  const drawer = page.getByTestId('judge-drawer');
  await expect(drawer.getByTestId('mission-scrubber')).toBeVisible();
  await drawer.getByRole('radio', { name: /nominal/ }).check();
  await expect(page.getByTestId('header-status').locator('[data-status="nominal"]')).toBeVisible();
  await drawer.getByRole('radio', { name: /acute/ }).check();
  await expect(page.getByTestId('header-status').locator('[data-status="call_ground"]')).toBeVisible();
});

test('night mode and the flat body view', async ({ page }) => {
  await open(page);
  await page.getByTestId('night-toggle').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'night');
  await page.getByTestId('night-toggle').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'day');
  await page.getByRole('button', { name: 'Flat view' }).click();
  await expect(page.getByTestId('body-scan')).toHaveAttribute('data-mode', '2d');
  await page.locator('[data-zone="heart"]').click();
  const detail = page.getByTestId('zone-detail');
  await expect(detail).toContainText('Heart and blood vessels');
  await expect(detail).toContainText('Resting heart rate');
  await expect(detail).toContainText('bpm');
  await expect(detail).toContainText('Risk of Cardiovascular Adaptations');
});
