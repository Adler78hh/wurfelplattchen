import { type Page, expect, test } from '@playwright/test';

/** Screen position of lattice point (i, j) on the sheet. */
export async function at(page: Page, i: number, j: number): Promise<{ x: number; y: number }> {
  return page.evaluate(
    ([i, j]) => {
      const wrap = document.querySelector('.stage-wrap') as HTMLElement;
      const v = JSON.parse(wrap.dataset.view!);
      const g = document.querySelector('.stage-svg > g') as SVGGElement;
      const m = g.getCTM()!;
      const r = (document.querySelector('.stage-svg') as SVGSVGElement).getBoundingClientRect();
      const x = v.ox + (i * v.s * Math.sqrt(3)) / 2;
      const y = v.oy + (i / 2 + j) * v.s;
      return { x: r.left + m.a * x + m.e, y: r.top + m.d * y + m.f };
    },
    [i, j],
  );
}

/** Lattice point near the middle of the sheet, so tests work on every screen. */
export async function middle(page: Page): Promise<[number, number]> {
  return page.evaluate(() => {
    const wrap = document.querySelector('.stage-wrap') as HTMLElement;
    const v = JSON.parse(wrap.dataset.view!);
    const sheet = (document.querySelector('.sheet') as SVGRectElement).getBBox();
    const fi = (sheet.width / 2 - v.ox) / ((v.s * Math.sqrt(3)) / 2);
    const fj = (sheet.height / 2 - v.oy) / v.s - fi / 2;
    return [Math.round(fi), Math.round(fj)] as [number, number];
  });
}

/** Tap (touch) or click at lattice point (i, j). */
export async function tapAt(page: Page, i: number, j: number) {
  const q = await at(page, i, j);
  if (test.info().project.use.hasTouch) await page.touchscreen.tap(q.x, q.y);
  else await page.mouse.click(q.x, q.y);
  await page.waitForTimeout(60);
}

/** Kinds of the shapes on the sheet, bottom to top. */
export const kinds = (page: Page) => page.locator('.stage-svg [data-kind]').evaluateAll((els) => els.map((e) => e.getAttribute('data-kind')));

export async function newPicture(page: Page) {
  await page.goto('/');
  await page.getByText('Neues Bild').click();
  await page.getByText('Los geht').click();
  await expect(page.locator('.stage-svg')).toBeVisible();
}

/** Pick a tool from the tool row (it scrolls sideways on phones). */
export async function tool(page: Page, label: string) {
  const b = page.locator('.tools').getByLabel(label, { exact: true });
  await b.scrollIntoViewIfNeeded();
  await b.click();
}

/** Collect page errors; check at the end of a test. */
export function watchErrors(page: Page): string[] {
  const errs: string[] = [];
  page.on('pageerror', (e) => errs.push(e.message));
  return errs;
}
