import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
test("agenda pública y navegación sin desbordes", async ({
  page,
  isMobile,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Nos encontramos. Nos organizamos." }),
  ).toBeVisible();
  await expect(page.getByText("Falta conectar Supabase")).toBeVisible();
  const nav = page.getByRole("navigation", {
    name: isMobile ? "Navegación móvil" : "Navegación principal",
  });
  await expect(nav).toBeVisible();
  if (isMobile)
    await expect(page.getByRole("button", { name: /Vista/ })).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("agenda.png"),
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
test("tema persiste y tiene las tres opciones", async ({ page }) => {
  await page.goto("/configuracion");
  const select = page.getByLabel("Tema", { exact: true });
  await select.selectOption("dark");
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.reload();
  await expect(select).toHaveValue("dark");
  await select.selectOption("light");
  await expect(page.locator("html")).not.toHaveClass(/dark/);
  await select.selectOption("system");
  await expect(select).toHaveValue("system");
});
test("vista Mobile de previsualización solo desktop", async ({
  page,
  isMobile,
}) => {
  await page.goto("/");
  const switcher = page.getByRole("button", { name: "Vista Desktop" });
  if (isMobile) {
    await expect(switcher).toHaveCount(0);
    return;
  }
  await switcher.click();
  await expect(page.locator(".shell")).toHaveAttribute(
    "data-preview",
    "mobile",
  );
  await expect(
    page.getByRole("navigation", { name: "Navegación móvil" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Vista Mobile" }).click();
  await expect(
    page.getByRole("navigation", { name: "Navegación principal" }),
  ).toBeVisible();
});
test("tablet táctil no ofrece selector desktop", async ({ page }) => {
  await page.addInitScript(() => {
    const original = window.matchMedia.bind(window);
    window.matchMedia = (query) => {
      const media = original(query);
      if (query.includes("hover:hover") || query.includes("pointer:fine"))
        return {
          ...media,
          matches: false,
          addEventListener: () => {},
          removeEventListener: () => {},
        };
      return media;
    };
  });
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto("/");
  await expect(page.getByRole("button", { name: /Vista/ })).toHaveCount(0);
});
test("manifiesto, íconos, service worker y offline sin datos privados", async ({
  page,
  context,
}) => {
  await page.goto("/");
  const manifest = await (
    await page.request.get("/manifest.webmanifest")
  ).json();
  expect(manifest.display).toBe("standalone");
  expect(manifest.icons).toHaveLength(3);
  for (const icon of manifest.icons) {
    const response = await page.request.get(icon.src);
    expect(response.ok()).toBe(true);
    expect(response.headers()["content-type"]).toContain("image/png");
  }
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
    .toBe(true);
  const cached = await page.evaluate(async () => {
    const keys = await caches.keys();
    return (
      await Promise.all(
        keys.map(async (k) =>
          (await (await caches.open(k)).keys()).map(
            (r) => new URL(r.url).pathname,
          ),
        ),
      )
    ).flat();
  });
  expect(cached.sort()).toEqual([
    "/icons/icon-192.png",
    "/icons/icon-512.png",
    "/offline.html",
  ]);
  await context.setOffline(true);
  await page.goto("/inicio");
  await expect(
    page.getByRole("heading", { name: "Estás sin conexión" }),
  ).toBeVisible();
  await context.setOffline(false);
});
test("logout limpia cachés y no quedan documentos privados", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    const testCache = await caches.open("user-test");
    await testCache.put("/internal-test", new Response("test only"));
  });
  await page.goto("/salida");
  await expect(
    page.getByText("Ya podés volver a la agenda pública."),
  ).toBeVisible();
  expect(await page.evaluate(() => caches.keys())).toEqual([]);
});
test("login/registro con etiquetas y aviso sin backend", async ({ page }) => {
  await page.goto("/ingresar");
  await page.getByLabel("Correo electrónico").fill("persona@example.invalid");
  await page
    .getByLabel("Contraseña", { exact: true })
    .fill("clave-ficticia-segura");
  await page.getByRole("button", { name: "Ingresar a mi cuenta" }).click();
  await expect(page.locator(".form-message.error[role=alert]")).toContainText(
    "Falta conectar Supabase",
  );
  await page.getByRole("link", { name: "Crear cuenta" }).click();
  await expect(
    page.getByText("El registro no habilita acceso interno"),
  ).toBeVisible();
});
test("auditoría automatizada de accesibilidad y foco por teclado", async ({
  page,
}) => {
  await page.goto("/");
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(results.violations).toEqual([]);
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Saltar al contenido" }),
  ).toBeFocused();
});
test("rutas protegidas no presentan un demo como datos reales", async ({
  page,
}) => {
  await page.goto("/personas");
  await expect(
    page.getByRole("heading", { name: "Espacio del equipo" }),
  ).toBeVisible();
  await expect(page.getByText("Alex Ejemplo")).toHaveCount(0);
  await page.goto("/reuniones/invalid");
  await expect(
    page.getByRole("heading", { name: "No encontramos esta reunión" }),
  ).toBeVisible();
});
