import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.beforeEach(async ({ page }, info) => {
  test.skip(
    info.project.name !== "desktop",
    "El rediseño móvil está fuera de esta entrega.",
  );
  await page.goto("/demo/editor");
  await expect(
    page.getByText("Demostración con datos ficticios", { exact: true }),
  ).toBeVisible();
});

test("selector guiado: cancelar no crea y confirmar crea con nombre y duración", async ({
  page,
}) => {
  const rows = page.locator(".editor-timeline > li");
  await expect(rows).toHaveCount(4);
  const add = page
    .getByRole("button", { name: "Agregar bloque", exact: true })
    .first();
  await add.click();
  const dialog = page.getByRole("dialog", { name: "Agregar bloque" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Buscar tipo de bloque")).toBeFocused();
  await dialog.getByRole("button", { name: /Actividad personalizada/ }).click();
  await dialog.getByLabel("Nombre del bloque").fill("Cierre técnico");
  await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(rows).toHaveCount(4);
  await expect(add).toBeFocused();
  await add.click();
  await dialog.getByLabel("Buscar tipo de bloque").fill("mensaje");
  await dialog.getByRole("button", { name: /Mensaje/ }).click();
  await expect(dialog.getByLabel("Nombre del bloque")).toHaveValue("Mensaje");
  await dialog.getByLabel("Nombre del bloque").fill("Mensaje del domingo");
  await dialog.getByLabel("Duración inicial, minutos").fill("12.5");
  await dialog
    .getByRole("button", { name: "Crear bloque", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect(rows).toHaveCount(5);
  await expect(rows.last()).toContainText("Mensaje del domingo");
  await expect(
    page.getByLabel("Duración de Mensaje del domingo, minutos", {
      exact: true,
    }),
  ).toHaveValue("12.5");
  await expect(page.getByLabel("Nombre de la actividad")).toHaveValue(
    "Mensaje del domingo",
  );
});

test("búsqueda de biblioteca conserva selección y permite quitarla con filtro activo", async ({
  page,
}) => {
  await page
    .getByRole("button", { name: "Ir a canciones", exact: true })
    .click();
  const choices = page.locator("details").filter({
    has: page.locator("summary", { hasText: "Canciones en orden" }),
  });
  await choices
    .getByRole("checkbox", { name: "Canción de prueba", exact: true })
    .check();
  const search = choices.getByLabel("Buscar en Canciones en orden");
  await search.fill("no existe");
  await expect(
    choices.getByText("Sin coincidencias. Probá otra búsqueda."),
  ).toBeVisible();
  await expect(choices.locator(".selection-row")).toContainText(
    "Canción de prueba",
  );
  await choices
    .getByRole("button", { name: "Quitar Canción de prueba", exact: true })
    .click();
  await search.fill("artista ficticio");
  await expect(
    choices.getByRole("checkbox", { name: "Canción de prueba", exact: true }),
  ).not.toBeChecked();
});

test("salir con cambios advierte, guardar elimina el aviso y las notas no se pierden al navegar", async ({
  page,
}) => {
  await page
    .getByLabel("Notas privadas", { exact: true })
    .fill("Nota ficticia pendiente");
  await page.getByRole("button", { name: "Ir a equipo", exact: true }).click();
  await page
    .getByRole("button", { name: "Ir a actividad", exact: true })
    .click();
  await expect(page.getByLabel("Notas privadas", { exact: true })).toHaveValue(
    "Nota ficticia pendiente",
  );
  const leaveDialogSeen = page.waitForEvent("dialog");
  const leave = page
    .getByRole("link", { name: "Cronograma", exact: true })
    .first()
    .click();
  const leaveDialog = await leaveDialogSeen;
  expect(leaveDialog.type()).toBe("confirm");
  await leaveDialog.dismiss();
  await leave;
  await expect(page).toHaveURL(/\/demo\/editor$/);
  await expect(page.getByLabel("Notas privadas", { exact: true })).toHaveValue(
    "Nota ficticia pendiente",
  );
  const dialogSeen = page.waitForEvent("dialog");
  const reload = page.evaluate(() => window.location.reload());
  const dialog = await dialogSeen;
  expect(dialog.type()).toBe("beforeunload");
  await dialog.dismiss();
  await reload;
  await expect(page.getByLabel("Notas privadas", { exact: true })).toHaveValue(
    "Nota ficticia pendiente",
  );
  await page
    .getByRole("button", { name: "Guardar borrador", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Cambio simulado" }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Notas privadas", { exact: true })).toHaveValue(
    "",
  );
});

test("desktop claro/oscuro: selector accesible y sin desbordes", async ({
  page,
}, info) => {
  for (const theme of ["light", "dark"]) {
    await page.emulateMedia({
      colorScheme: theme as "light" | "dark",
      reducedMotion: "reduce",
    });
    await page
      .getByRole("button", { name: "Agregar bloque", exact: true })
      .first()
      .click();
    const dialog = page.getByRole("dialog", { name: "Agregar bloque" });
    await expect(dialog).toBeVisible();
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.screenshot({
      path: info.outputPath(`selector-${theme}.png`),
      fullPage: true,
    });
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("fin planificado identifica el cambio de día", async ({ page }) => {
  await page.getByText("Datos de la reunión", { exact: true }).click();
  await page.getByLabel("Hora de inicio", { exact: true }).fill("23:50");
  await expect(page.getByLabel("Resumen del cronograma")).toContainText(
    "00:55 (2026-10-19)",
  );
});

test("la navegación muestra espera sin introducir un boundary de streaming", async ({
  page,
}) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/cronograma**", async (route) => {
    await gate;
    await route.continue();
  });
  try {
    await page.reload();
    await page
      .getByRole("link", { name: "Cronograma", exact: true })
      .first()
      .click();
    await expect(
      page.getByRole("status").filter({ hasText: "Abriendo…" }),
    ).toBeVisible();
    release();
    await expect(page).toHaveURL(/\/cronograma$/);
    await expect(
      page.getByRole("status").filter({ hasText: "Abriendo…" }),
    ).toHaveCount(0);
  } finally {
    release();
  }
});

test("arrastre anticipa el destino, mantiene legibilidad y respeta movimiento reducido", async ({
  page,
}) => {
  const rows = page.locator(".editor-timeline > li");
  const handle = page.getByRole("button", {
    name: "Arrastrar Prueba de sonido",
    exact: true,
  });
  await rows.nth(1).scrollIntoViewIfNeeded();
  const from = (await handle.boundingBox())!;
  const to = (await rows.nth(1).boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  try {
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, {
      steps: 15,
    });
    await expect(rows.first()).toHaveAttribute("data-dragging", "true");
    await expect(rows.first()).toHaveCSS("opacity", "0.88");
    await expect(rows.nth(1)).toHaveClass(/keyboard-target/);
    await expect
      .poll(() =>
        rows.nth(1).evaluate((row) => getComputedStyle(row).transform),
      )
      .not.toBe("none");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(rows.nth(1)).toHaveCSS("transition-duration", "0s");
  } finally {
    await page.mouse.up();
  }
  await expect(rows.first()).toContainText("Alabanza y Adoración");
});

test("desktop ancho: filas compactas y detalle legible en ambos temas", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  for (const theme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const row = page.locator(".editor-timeline > li").first();
    expect((await row.boundingBox())!.height).toBeLessThan(110);
    expect(
      (await page.locator(".block-detail").boundingBox())!.width,
    ).toBeGreaterThan(360);
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.screenshot({
      path: info.outputPath(`editor-desktop-${theme}.png`),
      fullPage: true,
    });
  }
});

test("controles no se superponen y opciones avanzadas es la última sección", async ({
  page,
}) => {
  await page
    .getByLabel("Nombre de la actividad", { exact: true })
    .fill(
      "Prueba de sonido y repaso musical con todos los equipos de la celebración",
    );
  for (const width of [1100, 1280, 1450, 1600]) {
    await page.setViewportSize({ width, height: 1000 });
    const row = page.locator(".editor-timeline > li").first();
    const boxes = await row
      .locator(
        ":scope > button, :scope > .planned-time, :scope > .duration-field, :scope > .move-actions",
      )
      .evaluateAll((elements) =>
        elements.map((e) => {
          const r = e.getBoundingClientRect();
          return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
        }),
      );
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i],
          b = boxes[j];
        expect(
          a.right <= b.left ||
            b.right <= a.left ||
            a.bottom <= b.top ||
            b.bottom <= a.top,
        ).toBe(true);
      }
    await expect(row.locator(".drag-handle")).toHaveCSS("min-width", "44px");
    expect(
      (await row.locator(".duration-field input").boundingBox())!.width,
    ).toBeLessThanOrEqual(64);
  }
  const sections = page.locator(".block-detail > details");
  await expect(sections.last().locator(":scope > summary")).toHaveText(
    "Opciones avanzadas",
  );
  await page
    .getByRole("button", { name: "Ir a avanzado", exact: true })
    .click();
  await expect(sections.last()).toHaveAttribute("open", "");
});
