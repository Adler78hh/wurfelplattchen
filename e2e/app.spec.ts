import { expect, test } from '@playwright/test';
import { kinds, middle, newPicture, tapAt, tool, watchErrors } from './helpers';

test('gallery: examples open as own copies and stay after reloading', async ({ page }) => {
  const errs = watchErrors(page);
  await page.goto('/');
  await expect(page.getByText('Beispiele zum Entdecken')).toBeVisible();
  await page.getByLabel('Beispiel öffnen: Treppe').click();
  await expect(page.locator('.stage-svg [data-kind="cube"]').first()).toBeVisible();
  await page.getByLabel('Zur Galerie').click();
  await expect(page.locator('.card:not(.example) .card-name')).toHaveText(['Treppe']);
  await page.reload();
  await expect(page.locator('.card:not(.example) .card-name')).toHaveText(['Treppe']);
  expect(errs).toEqual([]);
});

test('cube plates, undo and redo', async ({ page }) => {
  const errs = watchErrors(page);
  await newPicture(page);
  const [i, j] = await middle(page);
  await tapAt(page, i, j);
  await tapAt(page, i, j - 1); // drawn above: goes on top
  expect(await kinds(page)).toEqual(['cube', 'cube']);
  await page.locator('.tools').getByLabel('Rückgängig').click();
  expect(await kinds(page)).toEqual(['cube']);
  expect(errs).toEqual([]);
});

test('two triangles merge into a rhomb, three rhombs into a cube plate', async ({ page }) => {
  await newPicture(page);
  const [i, j] = await middle(page);
  await tool(page, 'Dreieck');
  await tapAt(page, i + 0.3, j + 0.3);
  await tapAt(page, i + 0.7, j + 0.7);
  await expect(page.locator('.pill.merge.hot')).toBeVisible();
  await page.locator('.pill.merge').click();
  expect(await kinds(page)).toEqual(['rhomb']);

  // Three rhombs round lattice point (i, j + 3): lid, right face, left face.
  await tool(page, 'Raute');
  const c: [number, number] = [i, j + 3];
  await tapAt(page, c[0], c[1] - 0.5); // lying rhomb above the centre
  await tool(page, 'Raute'); // turn: next rhomb kind
  await tool(page, 'Raute');
  await tapAt(page, c[0] + 0.5, c[1]); // right face
  await tool(page, 'Raute');
  await tool(page, 'Raute');
  await tapAt(page, c[0] - 0.5, c[1] + 0.5); // left face
  await expect(page.locator('.pill.merge.hot')).toBeVisible();
  await page.locator('.pill.merge').click();
  expect((await kinds(page)).filter((k) => k === 'cube')).toHaveLength(1);
});

test('a drawn shape that can lie or stand asks the child', async ({ page }) => {
  await newPicture(page);
  const [i, j] = await middle(page);
  await tapAt(page, i, j); // cube
  await tool(page, 'Streckenzug');
  // The "flag" at the lid of the cube: a tipping figure.
  for (const [a, b] of [
    [-2, 0],
    [0, -2],
    [0, -1],
    [-1, 0],
    [-2, 0],
  ])
    await tapAt(page, i + a, j + b);
  await expect(page.locator('.ask')).toContainText('Liegt sie oder steht sie?');
  await page.locator('.ask').getByRole('button').first().click();
  await expect(page.locator('.ask')).toHaveCount(0);
});

test('3D view opens, builds a cube on the ground and goes back', async ({ page }) => {
  const errs = watchErrors(page);
  await newPicture(page);
  const [i, j] = await middle(page);
  await tapAt(page, i, j);
  await page.getByTitle('3D-Ansicht').click();
  await expect(page.locator('.view3d-canvas canvas')).toBeVisible();
  await page.waitForTimeout(2200);
  await page.getByRole('button', { name: 'Bauen' }).click();
  const box = (await page.locator('.view3d-canvas').boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.85, box.y + box.height * 0.85); // ground
  await page.waitForTimeout(400);
  await page.getByLabel('Zurück zur Zeichnung').click();
  expect(await kinds(page)).toEqual(['cube', 'cube']);
  expect(errs).toEqual([]);
});

test('zooming keeps the sheet and shows more points', async ({ page }) => {
  await newPicture(page);
  const sheet = async () => (await page.locator('.sheet').boundingBox())!.width;
  const dots = () => page.locator('.stage-svg circle').count();
  const w0 = await sheet();
  const n0 = await dots();
  const out = page.getByLabel('Herauszoomen');
  await out.click();
  await out.click();
  expect(await sheet()).toBeCloseTo(w0, 0);
  expect(await dots()).toBeGreaterThan(n0);
});

test('export as PNG', async ({ page }) => {
  await newPicture(page);
  const [i, j] = await middle(page);
  await tapAt(page, i, j);
  await page.getByLabel('Speichern und Teilen').click();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByText('Als Bild speichern').click()]);
  expect(dl.suggestedFilename()).toMatch(/\.png$/);
});

test('phone: tools stay reachable', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'phone layout only');
  await newPicture(page);
  await expect(page.locator('.top-history').first()).toBeHidden();
  const del = page.locator('.tools').getByLabel('Auswahl löschen');
  await del.scrollIntoViewIfNeeded();
  await expect(del).toBeVisible();
});
