// Measures every admin screen at 360 px and names the elements that stick out past the screen. This is the check
// that found F9's M5 (the Scores screen up to 415 px wide). Usage: node probe-wide.mjs
import { ADMIN, apiRegister, joinTeams, launch, newPerson, signIn, sleep, startApi, stopApi, untilPath } from './lib.mjs';
const CODE = `UAT-probe-${Date.now() % 100000}`;
await startApi({ joinCode: CODE });
const teams = await joinTeams(CODE);
for (let i = 0; i < 18; i += 1) {
  await apiRegister(CODE, { realName: `Extra Person ${i + 1}`, displayName: `Extra ${i + 1}`, pin: '7777', teamId: teams[i % teams.length].id });
}
const browser = await launch();
const host = await newPerson(browser, 'host');
await signIn(host, CODE, ADMIN);
await untilPath(host.page, '/admin');
const widest = (when) => host.page.evaluate((when) => {
  const limit = visualViewport.width;
  const offenders = [...document.querySelectorAll('body *')]
    .map((el) => ({ el, rect: el.getBoundingClientRect() }))
    .filter(({ rect }) => rect.width > 0 && rect.right > limit + 1)
    // Only the innermost offenders: an element none of whose children also sticks out.
    .filter(({ el }) => ![...el.children].some((child) => child.getBoundingClientRect().right > limit + 1))
    .slice(0, 8)
    .map(({ el, rect }) => `${el.tagName.toLowerCase()}[${(el.getAttribute('aria-label') ?? el.id ?? '').slice(0, 30)}] "${el.textContent.trim().slice(0, 40)}" left ${Math.round(rect.left)} width ${Math.round(rect.width)} right ${Math.round(rect.right)}`);
  return `${when}: window ${innerWidth}, document ${document.documentElement.scrollWidth}\n  ${offenders.join('\n  ') || 'nothing sticks out'}`;
}, when);
for (const screen of ['Host', 'Teams', 'Scores', 'Event']) {
  await host.page.locator('nav a', { hasText: screen }).click({ force: true });
  await sleep(1500);
  console.log(await widest(screen));
}
await browser.close();
await stopApi();
