import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
test.beforeEach(async ({ page }) => {
  await page.goto("/demo/editor");
  await expect(
    page.getByText("Demostración con datos ficticios", { exact: true }),
  ).toBeVisible();
});
test("reordenar con botones recalcula y rollback restaura orden previo", async ({
  page,
}) => {
  const items = page.locator(".editor-timeline .editor-block");
  await expect(items.first()).toContainText("Prueba de sonido");
  await page
    .getByRole("button", { name: "Mover Prueba de sonido abajo", exact: true })
    .click();
  await expect(items.first()).toContainText("Alabanza y Adoración");
  await expect(items.first()).toContainText("10:00");
  await page
    .getByLabel("Simular fallo al guardar para probar rollback")
    .check();
  await page
    .getByRole("button", {
      name: "Mover Alabanza y Adoración abajo",
      exact: true,
    })
    .click();
  await expect(page.locator(".notice.error[role=alert]")).toContainText("Fallo simulado");
  await expect(items.first()).toContainText("Alabanza y Adoración");
});
test("duración recalcula hora siguiente y se revierte si falla", async ({
  page,
}) => {
  const duration = page.getByLabel("Duración de Prueba de sonido, minutos", {
    exact: true,
  });
  await duration.fill("15");
  await duration.press("Tab");
  await expect(
    page.locator(".editor-block").nth(1).locator(".planned-time"),
  ).toContainText("10:15");
  await page
    .getByLabel("Simular fallo al guardar para probar rollback")
    .check();
  await duration.fill("20");
  await duration.press("Tab");
  await expect(page.locator(".notice.error[role=alert]")).toContainText("Fallo simulado");
  await expect(duration).toHaveValue("15");
});
test("drag por teclado mantiene alternativa accesible", async ({ page }) => {
  const handle = page.getByRole("button", {
    name: "Arrastrar Prueba de sonido",
    exact: true,
  });
  await handle.focus();
  await page.keyboard.press("Space");
  await expect(handle).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("ArrowDown");
  const target = page.locator(".editor-block").nth(1);
  const targetKey = await target.getAttribute("data-drag-key");
  await expect(page.locator(".editor-timeline")).toHaveAttribute("data-drag-over", targetKey!);
  await page.keyboard.press("Space");
  await expect(page.locator(".editor-block").first()).toContainText(
    "Alabanza y Adoración",
  );
});
test("duplicar no copia notas si la casilla está desmarcada", async ({
  page,
}) => {
  await page
    .getByLabel("Notas privadas", { exact: true })
    .fill("Nota privada ficticia");
  await page.getByText("Duplicar reunión", { exact: true }).click();
  await page
    .getByRole("button", { name: "Simular duplicación", exact: true })
    .click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "(copia)",
  );
  await expect(page.getByLabel("Notas privadas", { exact: true })).toHaveValue(
    "",
  );
});
test("editor no desborda y tiene controles etiquetados", async ({
  page,
}, testInfo) => {
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  const accessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(accessibility.violations).toEqual([]);
  await page.screenshot({
    path: testInfo.outputPath("editor.png"),
    fullPage: true,
  });
});

test("drag físico con mouse o dedo cambia el orden", async ({ page }, testInfo) => {
  const source = page.getByRole("button", { name: "Arrastrar Prueba de sonido", exact: true });
  const target = page.locator(".editor-block").nth(1);
  await target.scrollIntoViewIfNeeded();
  const from = await source.boundingBox();
  const to = await target.boundingBox();
  expect(from && to).toBeTruthy();
  const x = from!.x + from!.width / 2;
  const y = from!.y + from!.height / 2;
  const endX = to!.x + to!.width / 2;
  const endY = to!.y + to!.height / 2;
  if (testInfo.project.name === "desktop") {
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(endX, endY, { steps: 15 });
    await page.mouse.up();
  } else {
    const session = await page.context().newCDPSession(page);
    await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
    // The touch sensor intentionally waits 180 ms to distinguish scroll from drag.
    await page.waitForTimeout(220);
    for (let step = 1; step <= 12; step++) {
      await session.send("Input.dispatchTouchEvent", {
        type: "touchMove", touchPoints: [{ x, y: y + (endY - y) * step / 12 }],
      });
    }
    await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await session.detach();
  }
  await expect(page.locator(".editor-block").first()).toContainText("Alabanza y Adoración");
  await expect(page.locator(".editor-block").first().locator(".planned-time")).toContainText("10:00");
});
