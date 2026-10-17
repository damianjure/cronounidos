import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { emptyBlock } from "../../src/lib/editor/model";
const email = "e2e-admin@cronounidos.invalid";
async function login(page: Page) {
  await page.goto("/ingresar");
  await page.getByRole("textbox", { name: "Correo electrónico" }).fill(email);
  await page
    .getByRole("textbox", { name: "Contraseña" })
    .fill(process.env.E2E_TEST_PASSWORD!);
  await page.getByRole("button", { name: "Ingresar a mi cuenta" }).click();
  await expect(page).toHaveURL(/\/inicio$/);
}
for (const failure of [0, 1, 2]) {
  test(`cola del editor: múltiples movimientos y ${failure ? `rollback del guardado ${failure}` : "persistencia"}`, async ({
    page,
  }) => {
    const client = createClient(
      process.env.E2E_SUPABASE_URL!,
      process.env.E2E_PUBLISHABLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const session = await client.auth.signInWithPassword({
      email,
      password: process.env.E2E_TEST_PASSWORD!,
    });
    expect(session.error).toBeNull();
    const membership = await client
      .from("memberships")
      .select("org_id")
      .eq("user_id", session.data.user!.id)
      .eq("status", "approved")
      .single();
    expect(membership.error).toBeNull();
    const metadata = {
      title: "Cola E2E ficticia",
      date: "2026-11-19",
      startLocalTime: "10:00",
      timezone: "America/Argentina/Buenos_Aires",
      meetingTypeId: null,
      seriesId: null,
    };
    const created = await client.rpc("create_editor_meeting", {
      p_org: membership.data!.org_id,
      p_metadata: metadata,
      p_template: null,
    });
    expect(created.error).toBeNull();
    const id = created.data.meetingId;
    const saved = await client.rpc("save_editor_snapshot", {
      p_meeting: id,
      p_expected_version: created.data.version,
      p_metadata: metadata,
      p_blocks: ["A", "B", "C"].map((name) => emptyBlock(name)),
    });
    expect(saved.error).toBeNull();
    const version = saved.data.version;
    await login(page);
    await page.goto(`/cronograma/${id}`);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let entered!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    let posts = 0;
    await page.route(`**/cronograma/${id}`, async (route) => {
      if (
        route.request().method() === "POST" &&
        route.request().headers()["next-action"]
      ) {
        const number = ++posts;
        if (number === 1) {
          entered();
          await gate;
        }
        if (number === failure) {
          await route.fulfill({
            status: 503,
            contentType: "text/plain",
            body: "Fallo de transporte E2E",
          });
          return;
        }
      }
      await route.continue();
    });
    const names = () =>
      page.locator(".editor-block .block-select strong").allTextContents();
    try {
      await page
        .getByRole("button", { name: "Mover A abajo", exact: true })
        .click();
      await started;
      await expect(
        page.getByRole("button", { name: "Guardar borrador", exact: true }),
      ).toBeDisabled();
      await expect(
        page.getByRole("spinbutton", {
          name: "Duración de A, minutos",
          exact: true,
        }),
      ).toBeDisabled();
      await page
        .getByRole("button", { name: "Mover B abajo", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Mover C arriba", exact: true })
        .click();
      const handle = page.getByRole("button", {
        name: "Arrastrar A",
        exact: true,
      });
      await handle.focus();
      await handle.press("Space");
      await handle.press("ArrowDown");
      await handle.press("Space");
      await expect.poll(names).toEqual(["C", "A", "B"]);
      await expect(
        page.getByText("Movimiento en cola:", { exact: false }),
      ).toBeVisible();
    } finally {
      release();
    }
    if (failure) {
      await expect(page.locator(".notice.error")).toBeVisible();
      if (failure === 1)
        await expect(page.locator(".notice.error")).toContainText(
          "movimientos pendientes también se descartaron",
        );
    } else {
      await expect.poll(() => posts).toBe(2);
    }
    await expect(
      page.getByRole("button", { name: "Guardar borrador", exact: true }),
    ).toBeEnabled();
    const expected =
      failure === 1
        ? ["A", "B", "C"]
        : failure === 2
          ? ["B", "A", "C"]
          : ["C", "A", "B"];
    await expect.poll(names).toEqual(expected);
    expect(posts).toBe(failure === 1 ? 1 : 2);
    const actual = await client.rpc("get_editor_snapshot", { p_meeting: id });
    expect(actual.error).toBeNull();
    expect(actual.data.version).toBe(
      version + (failure === 1 ? 0 : failure === 2 ? 1 : 2),
    );
    expect(actual.data.blocks.map((b: { name: string }) => b.name)).toEqual(
      expected,
    );
    await page.reload();
    await expect.poll(names).toEqual(expected);
    // A failed batch must not poison the next save or replay discarded moves.
    if (failure) {
      await page.unroute(`**/cronograma/${id}`);
      await page
        .getByRole("button", {
          name: `Mover ${expected[0]} abajo`,
          exact: true,
        })
        .click();
      await expect(
        page.getByRole("button", { name: "Guardar borrador", exact: true }),
      ).toBeEnabled();
      await page.reload();
      await expect.poll(names).toEqual([expected[1], expected[0], expected[2]]);
    }
  });
}
