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

/** The address a presenter or judge is sent: it adds Presenter mode and the Judge drawer to the header. */
async function openDemo(page: Page) {
  await page.goto('/?demo');
  await expect(page.locator('#main')).toBeVisible();
}

/** On a phone a vitals card is a compact row until it is tapped. Make sure its chart is showing. */
async function expand(page: Page, id: string) {
  const toggle = card(page, id).getByTestId('indicator-toggle');
  if ((await toggle.count()) && (await toggle.getAttribute('aria-expanded')) === 'false') await toggle.click();
  await expect(card(page, id).getByTestId('indicator-details')).toBeVisible();
}

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
  await expect(page.getByTestId('attention-banner')).toBeVisible(); // and the dashboard says so at the top

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
  await expect(page.getByTestId('attention-banner')).toHaveCount(0);

  // A value that cannot be right is refused, the field is named and marked, and nothing changes.
  expected = /status of 422/; // the browser logs the server's refusal; that is the point of this step
  await page.getByTestId('check-in-spo2').fill('140');
  await page.getByTestId('check-in-save').click();
  await expect(page.getByTestId('check-in').getByRole('alert')).toContainText('Blood oxygen');
  await expect(page.locator('[data-field="spo2"]')).toHaveAttribute('data-refused', 'true');
  await expect(card(page, 'spo2').getByTestId('source')).toHaveAttribute('data-source', 'sensor');

  // Mood is chosen with a tap and saved with the check-in, like everything else in it.
  await page.getByTestId('check-in-spo2').fill('');
  await page.getByTestId('check-in-spo2').fill('98');
  await expect(card(page, 'mood').getByTestId('source')).toHaveText('· simulated'); // a mood has no sensor
  await page.getByTestId('check-in-mood-2').click();
  await expect(page.getByTestId('check-in-mood-2')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('check-in-mood-unsaved')).toBeVisible();
  await expect(card(page, 'mood').getByTestId('latest')).not.toHaveText('2'); // nothing saved yet
  await page.getByTestId('check-in-mood-2').click(); // tapping it again takes it off
  await expect(page.getByTestId('check-in-mood-2')).toHaveAttribute('aria-pressed', 'false');
  await page.getByTestId('check-in-mood-2').click();
  await page.getByTestId('check-in-save').click();
  await expect(card(page, 'mood').getByTestId('latest')).toHaveText('2');
  await expect(card(page, 'mood').getByTestId('source')).toHaveAttribute('data-source', 'manual');
  await expect(page.getByTestId('check-in-mood-2')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('check-in-mood-unsaved')).toHaveCount(0);
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

test('call ground: the dashboard says why at the top and offers "I\'m OK" there', async ({ page }) => {
  await open(page);
  await expect(page.getByTestId('attention-banner')).toHaveCount(0); // a Watch does not ask for an answer
  await page.getByTestId('check-in-heart_rate').fill('75');
  await page.getByTestId('check-in-save').click();
  const line = page.locator('[data-attention="heart_rate"]');
  await expect(line).toHaveAttribute('data-status', 'call_ground');
  await expect(line).toContainText('Far above your normal today');
  await page.getByTestId('attention-ok').click();
  await expect(page.getByTestId('acknowledged')).toBeVisible();
  await expect(page.getByTestId('attention-banner')).toHaveCount(0);
  await expect(line).toBeVisible(); // answering does not hide the reading that is off
});

test('header: every control is on screen, on one row on a laptop', async ({ page, isMobile }) => {
  const oneRow = async () => {
    if (isMobile) return;
    const header = await page.locator('header').first().boundingBox();
    expect(header?.height ?? 0).toBeLessThan(80); // two rows would be over 100
  };
  // A plain link is the crew tool: no demo buttons in the header.
  await open(page);
  for (const id of ['day-stepper', 'viewer-select', 'night-toggle']) {
    await expect(page.getByTestId(id)).toBeInViewport({ ratio: 1 });
  }
  await expect(page.getByTestId('presenter-toggle')).toHaveCount(0);
  await expect(page.getByTestId('judge-toggle')).toHaveCount(0);
  await oneRow();
  if (isMobile) {
    // Without the demo row the phone header is two rows, not three.
    const header = await page.locator('header').first().boundingBox();
    expect(header?.height ?? 0).toBeLessThan(120);
  }
  // A demo link adds Presenter mode and the Judge drawer.
  await openDemo(page);
  for (const id of ['day-stepper', 'viewer-select', 'presenter-toggle', 'judge-toggle', 'night-toggle']) {
    await expect(page.getByTestId(id)).toBeInViewport({ ratio: 1 });
  }
  await oneRow();
});

test('phone: all six screens are in the tab bar and the dashboard leads with compact vitals', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'phone layout only');
  await open(page);
  // Two rows of three: nothing is off to the side, and the names are not cut.
  for (const [route] of ROUTES) await expect(page.locator(`[data-nav="${route}"]`)).toBeInViewport({ ratio: 1 });
  const nav = await page.locator('nav').first().evaluate((el) => el.scrollWidth <= el.clientWidth);
  expect(nav).toBe(true);
  // Vitals are compact rows, and they come before the body scan.
  await expect(page.getByTestId('indicator-card')).toHaveCount(6);
  await expect(page.getByTestId('indicator-details')).toHaveCount(0);
  await expect(page.getByTestId('sparkline')).toHaveCount(6);
  const grid = await page.getByTestId('indicator-grid').boundingBox();
  const body = await page.getByTestId('body-scan').boundingBox();
  expect((grid?.y ?? 0) + (grid?.height ?? 0)).toBeLessThanOrEqual(body?.y ?? 0);
  // What needs attention shows without opening anything.
  await expect(card(page, 'heart_rate').getByTestId('drift-message')).toBeVisible();
  // A tap opens the chart; another closes it.
  await card(page, 'sleep_hours').getByTestId('latest').click();
  await expect(card(page, 'sleep_hours').getByTestId('indicator-details')).toBeVisible();
  await expect(card(page, 'sleep_hours').getByRole('button', { name: 'Show as table' })).toBeVisible();
  await card(page, 'sleep_hours').getByTestId('indicator-toggle').click();
  await expect(card(page, 'sleep_hours').getByTestId('indicator-details')).toHaveCount(0);
  // The page was 4,530 px tall with six full charts; the compact rows take over a thousand off.
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThan(3500);
});

test('dashboard tells the drift story on the demo day', async ({ page }) => {
  await open(page);
  const heart = card(page, 'heart_rate');
  await expect(heart.locator('[data-status="watch"]')).toBeVisible();
  await expect(heart.locator('[data-icon="heart"]')).toBeVisible();
  await expect(heart.getByTestId('drift-message')).toContainText('Slowly drifting above your normal for 5 days');
  // Plain words on the card; the method names are a hover away, not on screen.
  await expect(heart.getByTestId('drift-checks')).toHaveText('Two independent checks agree this is a real drift.');
  await expect(heart.getByTestId('drift-checks')).toHaveAttribute('title', /EWMA.*CUSUM/);
  await expect(heart).not.toContainText('EWMA');
  // One legend above the cards says what the marks mean.
  const legend = page.getByTestId('chart-legend');
  for (const word of ['Reading', 'Trend', 'Your normal', 'mission days']) await expect(legend).toContainText(word);
  await expect(page.getByTestId('chart-legend')).toHaveCount(1);
  // "Simulated data" once in the header, not again in the member panel.
  await expect(page.getByTestId('dashboard').getByText('Simulated data', { exact: true })).toHaveCount(0);
  await expect(page.getByTestId('header-status')).toContainText('Simulated data');
  await expand(page, 'heart_rate');
  await expect(heart.getByTestId('confidence')).toContainText('Based on 7 pre-flight');
  await expect(page.getByTestId('header-status').locator('[data-status="watch"]')).toBeVisible();
  // The reason is at the top of the dashboard, and it jumps to the card.
  const line = page.locator('[data-attention="heart_rate"]');
  await expect(line).toContainText('Slowly drifting above your normal for 5 days');
  await line.click();
  await expect(heart).toBeInViewport();
  await expect(heart.getByTestId('indicator-details')).toBeVisible(); // jumping to a card opens it
  await expect(page.getByTestId('body-scan')).toBeVisible();
  await expect(card(page, 'spo2').locator('p').filter({ hasText: /^[A-Z].{120,}/ })).toHaveCount(0); // no reading material on the cards
  // "Show as table" works on a chart
  await heart.getByRole('button', { name: 'Show as table' }).click();
  await expect(heart.getByRole('table')).toBeVisible();
});

test('what is not built yet is shown as planned, in plain words', async ({ page }) => {
  await open(page, '/mission');
  for (const id of ['distance-comm-delay', 'radiation-dose-rate']) {
    await expect(page.locator(`[data-pending-id="${id}"]`)).toHaveText('Planned · Not in this version yet');
  }
  await page.locator('[data-env="pressurized-rover"]').click();
  await expect(page.locator('[data-pending-id="env-pressurized-rover"]')).toBeVisible();
  await open(page, '/modules');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Planned next');
  await expect(page.getByTestId('modules').getByTestId('planned')).toHaveCount(4);
  // No developer wording on screen.
  for (const word of ['Feature flag', 'LIVE_SPACE_WEATHER', 'approve live data', 'Scaffolded', 'Pending']) {
    await expect(page.locator('#main')).not.toContainText(word);
  }
});

test('quick actions: log, I am OK, report, palette', async ({ page }) => {
  await open(page);
  await expect(page.getByTestId('quick-bar').locator('[data-icon]')).toHaveCount(6);
  await page.locator('[data-quick="quick-log"]').click();
  // Nothing chosen yet: nothing to save.
  await expect(page.getByTestId('quick-log-save')).toBeDisabled();
  // A mood and several entries go in together; tapping a choice again takes it off.
  await page.locator('[data-mood="4"]').click();
  await page.locator('[data-entry="exercise"]').click();
  await page.locator('[data-entry="ateWell"]').click();
  await page.locator('[data-entry="tired"]').click();
  await page.locator('[data-entry="tired"]').click();
  await expect(page.locator('[data-entry="tired"]')).toHaveAttribute('aria-pressed', 'false');
  // Opposites cannot both be chosen.
  await page.locator('[data-entry="sleptPoorly"]').click();
  await page.locator('[data-entry="sleptWell"]').click();
  await expect(page.locator('[data-entry="sleptPoorly"]')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByTestId('quick-log')).toBeVisible(); // choosing does not close it
  await expect(page.getByTestId('quick-log-save')).toHaveText('Save (4)');
  await page.getByTestId('quick-log-save').click();
  await expect(page.getByTestId('toast')).toHaveCount(1); // one confirmation for the batch
  await expect(page.getByTestId('toast').first()).toContainText('Saved');
  await expect(page.getByTestId('quick-log')).toBeHidden();
  for (const text of ['Exercise done', 'Ate well', 'Slept well']) await expect(page.getByTestId('notes')).toContainText(text);
  await expect(page.getByTestId('notes')).not.toContainText('Feeling tired');

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
  // "Your normal" can be read without scrolling sideways, on a phone too.
  const normal = await page.getByTestId('report').getByText(/· 7 readings/).locator('visible=true').first().boundingBox();
  expect(normal).not.toBeNull();
  expect((normal?.x ?? 0) + (normal?.width ?? 0)).toBeLessThanOrEqual(page.viewportSize()?.width ?? 0);
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
  await expect(page.locator('#main').getByText('140 million miles', { exact: false })).toHaveCount(1); // not under both panels
  await page.getByRole('button', { name: 'Mission day 183' }).click();
  await expect(page.getByTestId('phase-name')).toHaveText('Mars surface');
  await expect(page.locator('[data-env="mars-surface"]')).toHaveAttribute('data-current', 'true');
  await expect(page.getByTestId('emphasised-hazards').locator('[data-hazard="gravity"]')).toBeVisible();
  await expect(page.locator('#main')).toContainText('three-eighths');
  // Each sentence is on the screen once, not under both the phase and the environment.
  await expect(page.locator('#main').getByText('three-eighths', { exact: false })).toHaveCount(1);
  // Every phase name can be read in full, at any width.
  for (const name of ['Transit to Mars', 'Mars surface', 'Return to Earth']) {
    const phase = page.getByTestId('phase-list').getByRole('button', { name });
    await expect(phase).toBeInViewport({ ratio: 1 });
    expect(await phase.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  }
  await expect(page.locator('[data-phase="mars-surface"]')).toHaveAttribute('aria-current', 'step');
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
  await expect(page.getByTestId('member-name')).toHaveText('G. Kiousopoulos');
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
  await openDemo(page);
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
  await openDemo(page);
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
  // The toggle is an icon with no text: a moon by day, a sun by night. It keeps its spoken name.
  const toggle = page.getByTestId('night-toggle');
  await expect(toggle).toHaveText('');
  await expect(toggle).toHaveAttribute('data-icon', 'moon');
  await expect(toggle).toHaveAccessibleName('Night mode');
  await toggle.click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'night');
  await expect(toggle).toHaveAttribute('data-icon', 'sun');
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await toggle.click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'day');
  await expect(toggle).toHaveAttribute('data-icon', 'moon');
  await page.getByRole('button', { name: 'Flat view' }).click();
  await expect(page.getByTestId('body-scan')).toHaveAttribute('data-mode', '2d');
  await expect(page.getByTestId('flat-figure').locator('[data-outline]')).toBeVisible(); // a traced human outline
  await page.locator('[data-zone="heart"]').click();
  const detail = page.getByTestId('zone-detail');
  await expect(detail).toContainText('Heart and blood vessels');
  await expect(detail).toContainText('Resting heart rate');
  await expect(detail).toContainText('bpm');
  await expect(detail).toContainText('Risk of Cardiovascular Adaptations');
});

test('an entry made while the server cannot be reached is kept and sent later', async ({ page }) => {
  await open(page);
  expected = /requestfailed: .*\/logs|console: Failed to load resource/;
  await page.route('**/api/v1/members/*/logs*', (route) => route.abort());

  await page.locator('[data-quick="ok"]').click();
  const notice = page.getByTestId('outbox-notice');
  await expect(notice).toContainText('Waiting to send: 1');
  await expect(page.getByTestId('toast').first()).toContainText('Not sent yet');
  await expect(page.getByTestId('acknowledged')).toBeHidden(); // nothing claims it was saved

  // A reload does not lose it, and the app tries again by itself (still cut off here).
  const retried = page.waitForEvent('requestfailed', (r) => r.url().includes('/logs'));
  await page.reload();
  await expect(page.getByTestId('outbox-notice')).toContainText('Waiting to send: 1');
  await retried;
  await expect(page.getByTestId('outbox-notice')).toContainText('Waiting to send: 1');

  // The server answers again: the entry goes through and the notice clears.
  await page.unroute('**/api/v1/members/*/logs*');
  await page.getByTestId('outbox-notice').getByRole('button').click();
  await expect(page.getByTestId('outbox-notice')).toBeHidden();
  await expect(page.getByTestId('acknowledged')).toBeVisible();
  await expect(page.getByTestId('notes')).toContainText("I'm OK");
});

test('the medical officer gets the crew report and can send it to the Commander', async ({ page }) => {
  await open(page);
  // The engineer writes a note. It must never reach anyone else's crew report.
  await page.locator('[data-quick="quick-log"]').click();
  await page.locator('#quick-note').fill('engineer private note');
  await page.getByTestId('quick-log-save').click();
  await expect(page.getByTestId('notes')).toContainText('engineer private note');

  // Anyone but the medical officer only has their own report and no way to switch.
  await page.locator('[data-quick="report"]').click();
  await expect(page.getByTestId('report')).toHaveAttribute('data-scope', 'own');
  await expect(page.getByTestId('report-scope')).toHaveCount(0);
  await page.getByTestId('viewer-select').selectOption('commander');
  await expect(page.getByTestId('report')).toHaveAttribute('data-scope', 'own');
  await expect(page.getByTestId('report-scope')).toHaveCount(0);
  await expect(page.getByTestId('crew-notice')).toHaveCount(0);

  // The medical officer opens on the whole crew.
  await page.getByTestId('viewer-select').selectOption('cmo');
  await page.locator('[data-quick="quick-log"]').click();
  await page.locator('#quick-note').fill('medical officer private note');
  await page.getByTestId('quick-log-save').click();
  await page.locator('[data-quick="report"]').click();
  await expect(page.getByTestId('report')).toHaveAttribute('data-scope', 'crew');
  await expect(page.getByTestId('report-crew').locator('[data-member]')).toHaveCount(4);
  await expect(page.getByTestId('report-crew-summary').getByRole('listitem')).toHaveCount(4);
  const text = page.getByTestId('report-text');
  await expect(text).toContainText('VITAL CREW REPORT FOR GROUND');
  await expect(text).toContainText('SIMULATED DATA');
  for (const name of ['S. Sinnis', 'R. Falelaki', 'P. Kotsomitopoulos', 'G. Kiousopoulos']) await expect(text).toContainText(name);
  await expect(page.getByTestId('report')).not.toContainText('engineer private note');
  const engineer = page.locator('[data-member="engineer"]');
  await expect(engineer).toContainText('Slowly drifting above their normal');
  await expect(engineer.getByTestId('report-notes-private')).toBeVisible();
  await expect(engineer.getByText('Private', { exact: true }).locator('visible=true')).toHaveCount(1); // the mood value
  // The medical officer's own section keeps their own details.
  await expect(page.locator('[data-member="cmo"]')).toContainText('medical officer private note');
  // Nothing runs off the side of the screen.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  // Send it to the Commander.
  await expect(page.getByTestId('report-notify-button')).toHaveText('Notify the Commander');
  await page.getByTestId('report-notify-button').click();
  await expect(page.getByTestId('toast').filter({ hasText: 'sent to the Commander' })).toBeVisible();
  await expect(page.getByTestId('report-notify')).toContainText('Sent to the Commander at');
  await expect(page.getByTestId('report-notify-button')).toHaveText('Send again');
  await expect(page.getByTestId('crew-notice')).toHaveCount(0); // the sender gets no notice

  // The Commander sees the notice on whatever screen they are on, and opens the report from it.
  await page.getByTestId('viewer-select').selectOption('commander');
  await page.locator('[data-quick="palette"]').click();
  await page.getByTestId('command-palette').getByRole('combobox').fill('crew');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('crew-grid')).toBeVisible();
  const notice = page.getByTestId('crew-notice');
  await expect(notice).toContainText('Chief Medical Officer R. Falelaki sent you the crew report for mission day 20');
  await page.getByTestId('crew-notice-open').click();
  await expect(page.getByTestId('report')).toHaveAttribute('data-scope', 'received');
  await expect(page.getByTestId('report-received')).toContainText('Sent by Chief Medical Officer R. Falelaki');
  await expect(page.getByTestId('report-crew').locator('[data-member]')).toHaveCount(4);
  // Built for the Commander: nobody else's notes, not even the sender's.
  await expect(page.getByTestId('report')).not.toContainText('engineer private note');
  await expect(page.getByTestId('report')).not.toContainText('medical officer private note');
  await expect(page.locator('[data-member="cmo"]').getByTestId('report-notes-private')).toBeVisible();
  await expect(page.locator('[data-member="commander"]').getByTestId('report-notes-private')).toHaveCount(0);
  await expect(page.getByTestId('report-notify')).toHaveCount(0); // only the medical officer sends
  // Once opened, the notice is gone; the report stays one tap away.
  await expect(page.getByTestId('crew-notice')).toHaveCount(0);
  await page.locator('[data-scope-choice="own"]').click();
  await expect(page.getByTestId('report-text')).toContainText('Commander S. Sinnis');
  await expect(page.getByTestId('report-text')).not.toContainText('G. Kiousopoulos');
  await page.locator('[data-scope-choice="received"]').click();
  await expect(page.getByTestId('report-text')).toContainText('G. Kiousopoulos');
});

test('a link ending in ?tour opens straight into the guided walkthrough', async ({ page }) => {
  await page.goto('/?tour');
  await expect(page.getByTestId('presenter')).toBeVisible();
  await expect(page.getByTestId('presenter-step')).toHaveText('1 / 10');
  await expect(page.getByTestId('calibrate')).toBeVisible(); // step 1 has already moved the app
  await page.getByTestId('presenter-next').click();
  await expect(page.getByTestId('presenter-step')).toHaveText('2 / 10');
  await expect(page.getByTestId('check-in')).toBeVisible();

  // A plain link opens the app itself, with no walkthrough in the way.
  await page.goto('/');
  await expect(page.locator('#main')).toBeVisible();
  await expect(page.getByTestId('presenter')).toHaveCount(0);
});

test('the ear zone is called "Ear canal" everywhere', async ({ page }) => {
  await open(page);
  const zone = page.locator('[data-zone="inner_ear"]').first();
  await expect(page.getByRole('button', { name: /^Ear canal/ }).first()).toBeVisible();
  await expect(page.locator('#main')).not.toContainText('Inner ear');
  await page.getByRole('button', { name: /^Ear canal/ }).first().click();
  await expect(page.getByRole('heading', { name: 'Ear canal' })).toBeVisible();
  // Find knows it by the new name too.
  await page.locator('[data-quick="palette"]').click();
  await page.getByTestId('command-palette').getByRole('combobox').fill('ear canal');
  await expect(page.getByTestId('command-palette')).toContainText('Ear canal');
  await expect(page.getByTestId('command-palette')).not.toContainText('Inner ear');
  void zone;
});

test('the heart beats at the resting heart rate on screen', async ({ page }) => {
  await open(page);
  const scan = page.getByTestId('body-scan');
  await expect(scan).toHaveAttribute('data-heart-bpm', '63');
  // Type a faster rate in the check-in: the pulse follows what is on screen.
  await page.getByTestId('check-in-heart_rate').fill('75');
  await page.getByTestId('check-in-save').click();
  await expect(scan).toHaveAttribute('data-heart-bpm', '75');
  // The flat view beats too, once per heartbeat: 75 a minute is 0.8 s a beat.
  await page.getByRole('button', { name: 'Flat view' }).click();
  const heart = page.getByTestId('flat-figure').locator('path.heart-beat');
  await expect(heart).toHaveCount(1);
  await expect(heart).toHaveAttribute('style', /animation-duration:\s*0\.8/);
  // Nothing is drawn as beating when nobody has asked for it to move less.
  await page.getByTestId('check-in-heart_rate').fill('');
  await page.getByTestId('check-in-save').click();
  await expect(scan).toHaveAttribute('data-heart-bpm', '63'); // the sensor value is back
});

test('the heart stays still when the system asks for less motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(page);
  await expect(page.getByTestId('body-scan')).toBeVisible();
  await expect(page.getByTestId('body-scan')).not.toHaveAttribute('data-heart-bpm', /.+/);
});

test('one reading is laid on every crew member\'s own normal', async ({ page }) => {
  await open(page, '/crew');
  const panel = page.getByTestId('same-reading');
  await expect(panel).toBeVisible();
  await expect(panel.locator('li[data-member]')).toHaveCount(4);
  const z = async (member: string) => Number(await panel.locator(`li[data-member="${member}"]`).getByTestId('same-spreads').getAttribute('data-z'));

  // The engineer's 63 bpm: far above the Commander's own normal, below the Systems Officer's.
  await expect(panel.getByTestId('same-value')).toHaveValue('63');
  expect(await z('commander')).toBeGreaterThan(3);
  expect(await z('engineer')).toBeGreaterThan(1.4);
  expect(await z('engineer')).toBeLessThan(2.1);
  expect(await z('systems')).toBeLessThan(0);
  await expect(panel.locator('li[data-member="commander"]')).toContainText('spreads above their normal');
  await expect(panel.locator('li[data-member="systems"]')).toContainText('spreads below their normal');
  await expect(panel.locator('li[data-member="engineer"]')).toContainText('above your normal'); // the viewer's own row
  await expect(panel.getByTestId('same-marker')).toHaveCount(4);

  // Try another value: every row follows.
  await panel.getByTestId('same-value').fill('56.1');
  await expect(panel.locator('li[data-member="commander"]')).toContainText('right at their normal');
  expect(await z('engineer')).toBeLessThan(-0.5);
  await panel.getByTestId('same-reset').click();
  await expect(panel.getByTestId('same-value')).toHaveValue('63');
  await expect(panel.getByTestId('same-reset')).toHaveCount(0);

  // Another vital, from the same crew: its own unit, and the private one is not offered.
  await panel.locator('[data-vital="sleep_hours"]').click();
  await expect(panel.locator('[data-vital="sleep_hours"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(panel.locator('[data-vital="mood"]')).toHaveCount(0);
  await expect(panel.getByTestId('same-value')).toHaveValue('7.6');
  await expect(panel).toContainText('h');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('the background follows the status of the person on screen', async ({ page }) => {
  await open(page);
  const field = page.getByTestId('particle-field');
  await expect(field).toHaveAttribute('data-mood', 'ripple'); // the engineer is on Watch
  await page.getByTestId('viewer-select').selectOption('commander');
  await expect(field).toHaveAttribute('data-mood', 'calm');
  await page.getByTestId('viewer-select').selectOption('systems');
  await expect(field).toHaveAttribute('data-mood', 'tense'); // Call ground
  // It is decoration only: not read out, and it never takes a click.
  await expect(field).toHaveAttribute('aria-hidden', 'true');
  expect(await field.evaluate((el) => getComputedStyle(el).pointerEvents)).toBe('none');
});

test('the mission timeline plays: the whole app moves with the day', async ({ page }) => {
  await open(page);
  const play = page.getByTestId('play-toggle');
  const label = page.getByTestId('day-label');
  const progress = page.getByTestId('mission-progress');
  await expect(play).toHaveAttribute('aria-pressed', 'false');
  await expect(label).toHaveText('Mission day 20');
  await expect(progress).toHaveAttribute('aria-valuenow', '20');
  await expect(play).toHaveText(''); // an icon, no words

  await play.click();
  await expect(play).toHaveAttribute('aria-pressed', 'true');
  await expect(play).toHaveAttribute('data-state', 'playing');
  await expect(label).not.toHaveText('Mission day 20');
  const first = Number(await progress.getAttribute('aria-valuenow'));
  expect(first).toBeGreaterThan(20);
  await expect.poll(async () => Number(await progress.getAttribute('aria-valuenow')), { timeout: 5000 }).toBeGreaterThan(first);
  // The dashboard follows the day: its charts and status are for the day on the clock.
  await expect(page.getByTestId('dashboard')).toBeVisible();
  await expect(page.getByRole('heading', { name: /^Check-in · mission day (2[1-9]|[3-9]\d)/ })).toBeVisible();

  // Faster, then paused: the day stays where it stops.
  await page.getByTestId('play-speed').click();
  await expect(page.getByTestId('play-speed')).toHaveText('×4');
  await play.click();
  await expect(play).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByTestId('play-speed')).toHaveCount(0);
  const stopped = await label.innerText();
  await page.waitForTimeout(1300);
  await expect(label).toHaveText(stopped);

  // Choosing a day by hand takes over from playback.
  await play.click();
  await expect(play).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('day-next').click();
  await expect(play).toHaveAttribute('aria-pressed', 'false');

  // The T key does the same as the button.
  await page.keyboard.press('t');
  await expect(play).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('t');
  await expect(play).toHaveAttribute('aria-pressed', 'false');
});

test('playback runs to the last day and stops there', async ({ page }) => {
  await open(page, '/mission');
  await page.getByRole('button', { name: 'Mission day 913' }).click();
  await expect(page.getByTestId('phase-name')).toHaveText('Return to Earth');
  const play = page.getByTestId('play-toggle');
  await play.click();
  await page.getByTestId('play-speed').click(); // ×4
  await page.getByTestId('play-speed').click(); // ×16
  await expect(page.getByTestId('play-speed')).toHaveAttribute('data-speed', '16');
  await expect(play).toHaveAttribute('aria-pressed', 'false', { timeout: 20000 });
  await expect(page.getByTestId('day-label')).toHaveText('Mission day 1095');
  await expect(page.getByTestId('mission-progress')).toHaveAttribute('aria-valuenow', '1095');
  // Play again from the end starts over from before launch.
  await play.click();
  await expect(page.getByTestId('day-label')).not.toHaveText('Mission day 1095');
  await play.click();
});

test('playback is reachable from Find and by voice words', async ({ page }) => {
  await open(page);
  await page.locator('[data-quick="palette"]').click();
  await page.getByTestId('command-palette').getByRole('combobox').fill('play');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('play-toggle')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('play-toggle').click();
  await expect(page.getByTestId('play-toggle')).toHaveAttribute('aria-pressed', 'false');
});
