import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import AxeBuilder from "@axe-core/playwright";
import { emptyBlock, snapshotSchema } from "../../src/lib/editor/model";
async function login(page: Page, email: string) {
  await page.goto("/ingresar");
  await page.getByRole("textbox", { name: "Correo electrónico" }).fill(email);
  await page
    .getByRole("textbox", { name: "Contraseña" })
    .fill(process.env.E2E_TEST_PASSWORD!);
  await page.getByRole("button", { name: "Ingresar a mi cuenta" }).click();
  await expect(page).toHaveURL(/\/inicio$/);
}
function sql(query: string) {
  const db = process.env.E2E_DB_URL!;
  if (!/^postgresql?:\/\/[^@]+@127\.0\.0\.1:54322\/postgres(?:\?.*)?$/.test(db))
    throw Error("Solo fixtures locales");
  return execFileSync(
    "psql",
    [db, "-X", "-v", "ON_ERROR_STOP=1", "-Atc", query],
    { encoding: "utf8" },
  ).trim();
}
test("feedback: scheduler real, aviso propio, respuesta y privacidad administrativa", async ({
  page,
  browser,
}, info) => {
  test.setTimeout(120000);
  const client = createClient(
    process.env.E2E_SUPABASE_URL!,
    process.env.E2E_PUBLISHABLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  expect(
    (
      await client.auth.signInWithPassword({
        email: "e2e-admin@cronounidos.invalid",
        password: process.env.E2E_TEST_PASSWORD!,
      })
    ).error,
  ).toBeNull();
  const org = await client
    .from("organizations")
    .select("id")
    .eq("slug", "crono-e2e")
    .single();
  expect(org.error).toBeNull();
  const orgId = org.data!.id;
  const suffix = `${info.project.name}-${Date.now()}`;
  const memberEmail = `e2e-member-feedback-${suffix}@cronounidos.invalid`;
  const service = createClient(
    process.env.E2E_SUPABASE_URL!,
    process.env.E2E_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const member = await service.auth.admin.createUser({
    email: memberEmail,
    password: process.env.E2E_TEST_PASSWORD!,
    email_confirm: true,
    user_metadata: { display_name: `Feedback ficticio ${suffix}` },
  });
  expect(member.error).toBeNull();
  const userId = member.data.user!.id;
  for (const id of [orgId, userId]) expect(id).toMatch(/^[0-9a-f-]{36}$/i);
  sql(
    `insert into public.memberships(org_id,user_id,status) values('${orgId}','${userId}','approved');update public.profiles set approved_at=now() where user_id='${userId}';`,
  );
  const metadata = {
    title: `Feedback ${suffix}`,
    date: "2029-10-01",
    startLocalTime: "10:00",
    timezone: "America/Argentina/Buenos_Aires",
    meetingTypeId: null,
    seriesId: null,
  };
  const created = await client.rpc("create_editor_meeting", {
    p_org: orgId,
    p_metadata: metadata,
    p_template: null,
  });
  expect(created.error).toBeNull();
  const m = snapshotSchema.parse(created.data);
  expect(
    (
      await client.rpc("publish_editor_snapshot", {
        p_meeting: m.meetingId,
        p_expected_version: m.version,
        p_metadata: metadata,
        p_blocks: [emptyBlock("Actividad feedback")],
      })
    ).error,
  ).toBeNull();
  await login(page, "e2e-admin@cronounidos.invalid");
  await page.goto(`/en-vivo/${m.meetingId}`);
  await page
    .getByRole("button", {
      name: "Iniciar reunión y primera actividad",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("button", { name: "Finalizar y avanzar", exact: true }),
  ).toBeEnabled();
  sql(
    `select private.capture_live_participant('${m.meetingId}',null,'${userId}');`,
  );
  // Close through the normal authorized operator UI, not by fabricating a state.
  await page.getByText("Cerrar reunión", { exact: true }).click();
  await page.getByRole("checkbox").check();
  await page
    .getByRole("button", {
      name: "Cerrar reunión definitivamente",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("heading", { name: "Reunión cerrada", exact: true }),
  ).toBeVisible();
  expect(
    sql(
      `select count(*) from private.feedback_requests where meeting_id='${m.meetingId}'`,
    ),
  ).toBe("0");
  const baseline = Number(
    sql(
      "select coalesce(max(runid),0) from cron.job_run_details where jobid in(select jobid from cron.job where jobname='crono-unidos-feedback-dispatch')",
    ),
  );
  // Test time travel in guarded local fixtures only. No browser dispatch RPC.
  sql(
    `update public.meeting_live_state set closed_at=clock_timestamp()-interval '11 minutes' where meeting_id='${m.meetingId}';`,
  );
  await expect
    .poll(
      () =>
        sql(
          `select count(*) from private.feedback_requests where meeting_id='${m.meetingId}' and user_id='${userId}'`,
        ),
      { timeout: 75000, intervals: [1000, 2000, 5000] },
    )
    .toBe("1");
  expect(
    Number(
      sql(
        "select coalesce(max(runid),0) from cron.job_run_details where status='succeeded' and jobid in(select jobid from cron.job where jobname='crono-unidos-feedback-dispatch')",
      ),
    ),
  ).toBeGreaterThan(baseline);
  const context = await browser.newContext({
    viewport: page.viewportSize() ?? undefined,
  });
  try {
    const own = await context.newPage();
    await login(own, memberEmail);
    await expect(
      own.getByRole("link", { name: /Responder feedback/ }),
    ).toBeVisible();
    await own.goto("/feedback");
    const card = own.getByRole("region", {
      name: `Feedback de ${metadata.title}`,
      exact: true,
    });
    await expect(card).toBeVisible();
    const requestId = await card
      .locator('input[name="requestId"]')
      .inputValue();
    await card
      .getByRole("radio", { name: "Hubo problema", exact: true })
      .check();
    const comment = `Comentario privado ficticio ${suffix}`;
    await card
      .getByRole("textbox", {
        name: "Comentario opcional (máximo 500 caracteres)",
      })
      .fill(comment);
    expect((await new AxeBuilder({ page: own }).analyze()).violations).toEqual(
      [],
    );
    await own.screenshot({
      path: info.outputPath("feedback-form.png"),
      fullPage: true,
    });
    await card.getByRole("button", { name: "Enviar feedback" }).click();
    await expect(
      own.getByRole("status").filter({ hasText: "Feedback enviado" }),
    ).toBeVisible();
    await expect(
      own.getByText("Respuesta enviada", { exact: true }),
    ).toBeVisible();
    const memberClient = createClient(
      process.env.E2E_SUPABASE_URL!,
      process.env.E2E_PUBLISHABLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
    expect(
      (
        await memberClient.auth.signInWithPassword({
          email: memberEmail,
          password: process.env.E2E_TEST_PASSWORD!,
        })
      ).error,
    ).toBeNull();
    const privateRead = await memberClient.rpc("admin_meeting_feedback", {
      p_org: orgId,
      p_meeting: m.meetingId,
    });
    expect(privateRead.error?.message).toContain("Forbidden");
    const ownState = await memberClient.rpc("my_feedback_requests", {
      p_org: orgId,
    });
    expect(ownState.error).toBeNull();
    expect(JSON.stringify(ownState.data)).not.toContain(comment);
    expect(JSON.stringify(ownState.data)).not.toMatch(/"comment"|"category"/);
    expect(
      (
        await memberClient.rpc("submit_meeting_feedback", {
          p_request: requestId,
          p_category: "problem",
          p_comment: comment,
        })
      ).error,
    ).toBeNull();
    expect(
      (
        await memberClient.rpc("submit_meeting_feedback", {
          p_request: requestId,
          p_category: "all_good",
          p_comment: null,
        })
      ).error?.message,
    ).toContain("Already submitted");
    const notices = await memberClient
      .from("personal_notifications")
      .select("*");
    expect(notices.error).toBeNull();
    expect(notices.data).toHaveLength(1);
    expect(notices.data![0].user_id).toBe(userId);
    expect(JSON.stringify(notices.data)).not.toContain(comment);
    const ownResponse = await context.request.get("/feedback");
    expect(await ownResponse.text()).not.toContain(comment);
    const denied = await context.request.get(
      `/feedback/admin?meeting=${m.meetingId}`,
    );
    expect(denied.status()).toBe(404);
    expect(await denied.text()).not.toContain(comment);
    await own.goto("/inicio");
    await expect(
      own.getByRole("link", { name: /Responder feedback/ }),
    ).toHaveCount(0);
    await page.goto(`/feedback/admin?meeting=${m.meetingId}`);
    await expect(page.getByText(comment, { exact: true })).toBeVisible();
    await expect(
      page.getByRole("heading", {
        name: `Feedback ficticio ${suffix}`,
        exact: true,
      }),
    ).toBeVisible();
    await page.screenshot({
      path: info.outputPath("feedback-admin.png"),
      fullPage: true,
    });
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  } finally {
    await context.close();
  }
});
