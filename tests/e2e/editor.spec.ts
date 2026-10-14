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
  // dnd-kit updates keyboard collision after its sortable transition.
  await page.waitForTimeout(450);
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
