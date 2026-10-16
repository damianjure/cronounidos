import { expect, request as apiRequest, test, type Page } from "@playwright/test";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { emptyBlock, snapshotSchema } from "../../src/lib/editor/model";
import AxeBuilder from "@axe-core/playwright";

const email = "e2e-admin@cronounidos.invalid";

async function login(page: Page) {
  await page.goto("/ingresar");
  await page.getByRole("textbox", { name: "Correo electrónico" }).fill(email);
  await page.getByRole("textbox", { name: "Contraseña" }).fill(process.env.E2E_TEST_PASSWORD!);
  await page.getByRole("button", { name: "Ingresar a mi cuenta" }).click();
  await expect(page).toHaveURL(/\/inicio$/);
}

test("directorio: persona, equipo, rol e integrante por UI", async ({ page }, info) => {
  await login(page);
  await page.goto("/personas");
  const suffix = `${info.project.name}-${Date.now()}`;
  const personName = `Persona ${suffix}`;
  const teamName = `Equipo ${suffix}`;
  const roleName = `Rol ${suffix}`;

  const addPerson = page.locator("details").filter({ has: page.locator("summary", { hasText: "Agregar persona" }) });
  await addPerson.locator("summary").click();
  await addPerson.locator('input[name="firstName"]').fill(personName);
  await addPerson.locator('input[name="lastName"]').fill("Ficticia");
  await addPerson.getByRole("button", { name: "Agregar" }).click();
  await expect(page.getByRole("status")).toContainText("Directorio actualizado");
  await expect(page.locator("strong").filter({ hasText: `${personName} Ficticia` })).toBeVisible();

  const addTeam = page.locator("details").filter({ has: page.locator("summary", { hasText: "Agregar equipo" }) });
  await addTeam.locator("summary").click();
  await addTeam.locator('input[name="name"]').fill(teamName);
  await addTeam.getByRole("button", { name: "Agregar" }).click();
  await expect(page.getByRole("heading", { name: teamName })).toBeVisible();

  const team = page.locator("li").filter({ has: page.getByRole("heading", { name: teamName }) });
  const addRole = team.locator("details").filter({ has: page.locator("summary", { hasText: "Agregar rol" }) });
  await addRole.locator("summary").click();
  await addRole.locator('input[name="name"]').fill(roleName);
  await addRole.getByRole("button", { name: "Agregar" }).click();
  await expect(page.getByText(roleName)).toBeVisible();

  const updatedTeam = page.locator("li").filter({ has: page.getByRole("heading", { name: teamName }) });
  await updatedTeam.locator('select[name="personId"]').selectOption({ label: `${personName} Ficticia` });
  await updatedTeam.getByRole("button", { name: "Agregar al equipo" }).click();
  await expect(page.getByRole("status")).toContainText("Directorio actualizado");
  const finalTeam = page.locator("li").filter({ has: page.getByRole("heading", { name: teamName }) });
  await expect(finalTeam).toContainText(`${personName} Ficticia`);
});

test("contenidos y Storage privado: crea catálogo, sube PNG y exige sesión", async ({ page }, info) => {
  await login(page);
  await page.goto("/cronograma/contenidos");
  const suffix = `${info.project.name}-${Date.now()}`;
  const songName = `Canción ${suffix}`;
  const fileName = `Imagen ${suffix}`;
  const addSong = page.locator("details").filter({ has: page.locator("summary", { hasText: "Agregar canciones" }) });
  await addSong.locator("summary").click();
  await addSong.locator('input[name="title"]').fill(songName);
  await addSong.getByRole("button", { name: "Agregar al catálogo" }).click();
  await expect(page.getByRole("heading", { name: songName })).toBeVisible();

  const upload = page.locator("details").filter({ has: page.locator("summary", { hasText: "Subir archivo privado" }) });
  await upload.locator("summary").click();
  await upload.locator('input[name="title"]').fill(fileName);
  await upload.locator('input[type="file"]').setInputFiles(path.resolve("public/icons/icon-192.png"));
  await upload.getByRole("button", { name: "Subir recurso" }).click();
  const row = page.locator("li").filter({ has: page.getByRole("heading", { name: fileName }) });
  const link = row.getByRole("link", { name: "Abrir archivo privado" });
  await expect(link).toBeVisible();
  const resourceUrl = await link.getAttribute("href");
  expect(resourceUrl).toMatch(/^\/recursos\/[0-9a-f-]+$/);
  const authorized = await page.context().request.get(resourceUrl!, { maxRedirects: 0 });
  expect(authorized.status()).toBe(307);
  expect(authorized.headers().location).toContain("/storage/v1/object/sign/");
  const anonymous = await apiRequest.newContext({ baseURL: new URL(page.url()).origin });
  try {
    const denied = await anonymous.get(resourceUrl!, { maxRedirects: 0 });
    expect(denied.status()).toBe(307);
    expect(denied.headers().location).toContain("/ingresar");
  } finally {
    await anonymous.dispose();
  }

  const replacement = row.locator("details").filter({ has: page.locator("summary", { hasText: "Reemplazar archivo privado" }) });
  await replacement.locator("summary").click();
  const previousPath = await replacement.locator('input[name="oldPath"]').inputValue();
  const storageClient = createClient(process.env.E2E_SUPABASE_URL!, process.env.E2E_PUBLISHABLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const signedIn = await storageClient.auth.signInWithPassword({ email, password: process.env.E2E_TEST_PASSWORD! });
  expect(signedIn.error).toBeNull();
  const existsForUser = async (filePath: string) => {
    const slash = filePath.lastIndexOf("/");
    const { data, error } = await storageClient.storage.from("crono-resources").list(filePath.slice(0, slash), { search: filePath.slice(slash + 1), limit: 100 });
    expect(error).toBeNull();
    return data?.some((entry) => entry.name === filePath.slice(slash + 1)) ?? false;
  };
  expect(await existsForUser(previousPath)).toBe(true);
  const deniedDirectDelete = await storageClient.storage.from("crono-resources").remove([previousPath]);
  expect(deniedDirectDelete.error).toBeNull();
  expect(deniedDirectDelete.data).toHaveLength(0);
  expect(await existsForUser(previousPath)).toBe(true);
  await replacement.locator('input[type="file"]').setInputFiles(path.resolve("public/icons/icon-512.png"));
  await replacement.getByRole("button", { name: "Reemplazar archivo" }).click();
  await expect.poll(() => page.locator("li").filter({ has: page.getByRole("heading", { name: fileName }) }).locator('input[name="oldPath"]').first().inputValue()).not.toBe(previousPath);
  await expect(page.getByRole("status")).toContainText("Catálogo actualizado");
  const newPath = await page.locator("li").filter({ has: page.getByRole("heading", { name: fileName }) }).locator('input[name="oldPath"]').first().inputValue();
  expect(await existsForUser(previousPath)).toBe(false);
  expect(await existsForUser(newPath)).toBe(true);
  const replaced = await page.context().request.get(resourceUrl!, { maxRedirects: 0 });
  expect(replaced.status()).toBe(307);
  const updatedRow = page.locator("li").filter({ has: page.getByRole("heading", { name: fileName }) });
  const deletion = updatedRow.locator("details").filter({ has: page.locator("summary", { hasText: "Eliminar archivo privado" }) });
  await deletion.locator("summary").click();
  await deletion.locator('input[name="confirm"]').check();
  await deletion.getByRole("button", { name: "Eliminar archivo privado" }).click();
  await expect(page.locator("li").filter({ has: page.getByRole("heading", { name: fileName }) })).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText("Catálogo actualizado");
  const removed = await page.context().request.get(resourceUrl!, { maxRedirects: 0 });
  expect(removed.status()).toBe(404);
  expect(await existsForUser(newPath)).toBe(false);
});

test("tipos y plantillas: crea tipo versionado y guarda estructura", async ({ page }, info) => {
  await login(page);
  const suffix = `${info.project.name}-${Date.now()}`;
  const typeName = `Tipo ${suffix}`;
  const meetingName = `Base ${suffix}`;
  const templateName = `Plantilla ${suffix}`;
  await page.goto("/cronograma/catalogos");
  const addType = page.locator("details").filter({ has: page.locator("summary", { hasText: "Crear tipo de actividad" }) });
  await addType.locator("summary").click();
  await addType.getByRole("textbox", { name: "Nombre del tipo" }).fill(typeName);
  await addType.getByRole("textbox", { name: "Identificador del campo" }).fill("referencia_e2e");
  await addType.getByRole("textbox", { name: "Etiqueta" }).fill("Referencia ficticia");
  await addType.getByRole("button", { name: "Agregar campo al tipo" }).click();
  await addType.getByRole("button", { name: "Crear tipo" }).click();
  const typeRow = page.locator("li").filter({ has: page.getByRole("heading", { name: new RegExp(typeName) }) });
  await expect(typeRow).toContainText("v1");
  const editType = typeRow.locator("details");
  await editType.locator("summary").click();
  await editType.getByRole("textbox", { name: "Nombre del tipo" }).fill(typeName);
  await editType.getByRole("button", { name: "Guardar nueva versión del tipo" }).click();
  await expect(page.locator("li").filter({ has: page.getByRole("heading", { name: new RegExp(typeName) }) })).toContainText("v2");

  await page.goto("/cronograma/nueva");
  await page.locator('input[name="title"]').fill(meetingName);
  await page.locator('input[name="date"]').fill("2026-11-16");
  await page.getByRole("button", { name: "Crear borrador" }).click();
  await expect(page).toHaveURL(/\/cronograma\/[0-9a-f-]{36}$/);
  await page.getByRole("combobox", { name: "Tipo de actividad" }).selectOption({ label: typeName });
  await page.getByRole("button", { name: "Agregar actividad" }).click();
  await page.getByRole("button", { name: "Guardar borrador" }).click();
  await expect(page.getByRole("button", { name: "Guardar como plantilla" })).toBeEnabled();
  await page.getByRole("textbox", { name: "Nombre de la plantilla" }).fill(templateName);
  await page.getByRole("button", { name: "Guardar como plantilla" }).click();
  await expect(page.getByRole("heading", { name: new RegExp(templateName) })).toBeVisible();

  const selectedName = `Seleccionada ${suffix}`;
  await page.goto("/cronograma/nueva");
  await page.locator('input[name="title"]').fill(selectedName);
  await page.locator('input[name="date"]').fill("2026-11-17");
  await page.locator('select[name="templateId"]').selectOption({ label: templateName });
  await page.getByRole("button", { name: "Crear borrador" }).click();
  await expect(page).toHaveURL(/\/cronograma\/[0-9a-f-]{36}$/);
  await page.goto("/cronograma/catalogos");
  const templateRow = page.locator("li").filter({ has: page.getByRole("heading", { name: new RegExp(templateName) }) });
  const actionFits = await templateRow.evaluate((row) => {
    const button = row.querySelector<HTMLButtonElement>(".catalog-template-action")!;
    const buttonBox = button.getBoundingClientRect();
    const rowBox = row.getBoundingClientRect();
    return { left: buttonBox.left, right: buttonBox.right, rowLeft: rowBox.left, rowRight: rowBox.right };
  });
  expect(actionFits.left >= actionFits.rowLeft && actionFits.right <= actionFits.rowRight - 8).toBe(true);
  const selective = templateRow.locator("details").filter({ has: page.locator("summary", { hasText: "Aplicar v1 a reuniones existentes" }) });
  await selective.locator("summary").click();
  await selective.getByLabel(new RegExp(selectedName)).check();
  await selective.locator('input[name="confirm"]').check();
  await selective.getByRole("button", { name: "Crear borradores desde esta plantilla" }).click();
  await expect(page.getByRole("status")).toContainText("Cambio guardado");
});

test("reunión: crea borrador y cancela conservando historial", async ({ page }, info) => {
  await login(page);
  await page.goto("/cronograma/nueva");
  const title = `Reunión ${info.project.name}-${Date.now()}`;
  await page.locator('input[name="title"]').fill(title);
  await page.locator('input[name="date"]').fill("2026-11-15");
  await page.getByRole("button", { name: "Crear borrador" }).click();
  await expect(page).toHaveURL(/\/cronograma\/[0-9a-f-]{36}$/);
  await page.goto("/cronograma");
  const row = page.locator("li").filter({ has: page.getByRole("heading", { name: title }) });
  await expect(row).toContainText("Borrador");
  page.once("dialog", (dialog) => dialog.accept());
  await row.getByRole("button", { name: "Cancelar reunión" }).click();
  await expect(page).toHaveURL(/\/cronograma\?cancelled=1$/);
  await expect(page.locator("li").filter({ has: page.getByRole("heading", { name: title }) })).toContainText("Cancelada");
});

test("edición parcial: notas, campos y enlaces no exponen otros bloques", async ({ page }, info) => {
  await login(page);
  const suffix = `${info.project.name}-${Date.now()}`;
  const teamName = `Equipo notas ${suffix}`;
  await page.goto("/personas");
  const addTeam = page.locator("details").filter({ has: page.locator("summary", { hasText: "Agregar equipo" }) });
  await addTeam.locator("summary").click();
  await addTeam.locator('input[name="name"]').fill(teamName);
  await addTeam.getByRole("button", { name: "Agregar" }).click();
  await expect(page.getByRole("heading", { name: teamName })).toBeVisible();

  const personName = `Responsable ${suffix}`;
  const addPerson = page.locator("details").filter({ has: page.locator("summary", { hasText: "Agregar persona" }) });
  await addPerson.locator("summary").click();
  await addPerson.locator('input[name="firstName"]').fill(personName);
  await addPerson.locator('input[name="lastName"]').fill("Ficticio");
  await addPerson.getByRole("button", { name: "Agregar" }).click();
  await expect(page.getByRole("status")).toContainText("Directorio actualizado");
  const team = page.locator("li").filter({ has: page.getByRole("heading", { name: teamName }) });
  await team.locator('select[name="personId"]').selectOption({ label: `${personName} Ficticio` });
  await team.getByRole("button", { name: "Agregar al equipo" }).click();
  await expect(page.getByRole("status")).toContainText("Directorio actualizado");

  await page.goto("/cronograma/nueva");
  await page.locator('input[name="title"]').fill(`Reunión notas ${suffix}`);
  await page.locator('input[name="date"]').fill("2026-11-18");
  await page.getByRole("button", { name: "Crear borrador" }).click();
  await expect(page).toHaveURL(/\/cronograma\/[0-9a-f-]{36}$/);
  const meetingId = page.url().split("/").pop();
  await page.getByRole("button", { name: "Agregar actividad" }).click();
  await page.getByRole("combobox", { name: "Equipo principal" }).selectOption({ label: teamName });
  const teamId = await page.getByRole("combobox", { name: "Equipo principal" }).inputValue();
  await page.getByRole("textbox", { name: "Notas privadas" }).fill("Nota de mi equipo");
  await page.getByText("Agregar campo personalizado").click();
  await page.getByRole("textbox", { name: "Identificador" }).fill("guion_url");
  await page.getByRole("textbox", { name: "Etiqueta" }).fill("Guion del equipo");
  await page.getByRole("combobox", { name: "Tipo", exact: true }).selectOption("url");
  await page.getByRole("button", { name: "Agregar campo" }).click();
  await page.getByRole("textbox", { name: "Guion del equipo" }).fill("https://example.invalid/guion");
  await page.getByRole("button", { name: "Agregar actividad" }).click();
  await page.getByRole("textbox", { name: "Notas privadas" }).fill("Nota oculta de otro bloque");
  await page.getByRole("button", { name: "Guardar borrador" }).click();
  await expect(page.locator("p.notice[role=status]")).toContainText("Borrador guardado");

  await page.goto(`/cronograma/${meetingId}/equipos/${teamId}`);
  await expect(page.getByRole("heading", { name: "Contenido de tu equipo" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Nota interna" })).toHaveValue("Nota de mi equipo");
  await expect(page.getByRole("textbox", { name: "Guion del equipo" })).toHaveValue("https://example.invalid/guion");
  await expect(page.getByText("Nota oculta de otro bloque")).toHaveCount(0);
  await page.getByRole("textbox", { name: "Nota interna" }).fill("Nota editada de mi equipo");
  await page.getByRole("button", { name: "Guardar nota" }).click();
  await expect(page.getByRole("status")).toContainText("Nota guardada en borrador");
  await expect(page.getByRole("textbox", { name: "Nota interna" })).toHaveValue("Nota editada de mi equipo");
  await page.getByRole("textbox", { name: "Guion del equipo" }).fill("https://example.invalid/nuevo");
  await page.getByRole("button", { name: "Guardar campos" }).click();
  await expect(page.getByRole("status")).toContainText("Campos guardados en borrador");
  await expect(page.getByRole("textbox", { name: "Guion del equipo" })).toHaveValue("https://example.invalid/nuevo");
  await page.getByRole("textbox", { name: "Nombre del enlace" }).fill("Plan del equipo");
  await page.getByRole("textbox", { name: "URL HTTPS" }).fill("https://example.invalid/plan");
  await page.getByRole("button", { name: "Agregar enlace" }).click();
  await expect(page.getByRole("status")).toContainText("Enlace agregado al borrador");
  await expect(page.getByRole("link", { name: "Plan del equipo" })).toHaveAttribute("href", "https://example.invalid/plan");
  await page.getByText("Desvincular Plan del equipo").click();
  await page.getByRole("button", { name: "Confirmar desvinculación" }).click();
  await expect(page.getByRole("status")).toContainText("Recurso desvinculado del borrador");
  await expect(page.getByRole("link", { name: "Plan del equipo" })).toHaveCount(0);
  await page.getByRole("combobox", { name: "Persona del equipo" }).selectOption({ label: `${personName} Ficticio` });
  await page.getByRole("button", { name: "Agregar responsable del equipo" }).click();
  await expect(page.getByRole("status")).toContainText("Responsables actualizados en borrador");
  const assignments = page.getByRole("region", { name: "Responsables del equipo" });
  await expect(assignments).toContainText(`${personName} Ficticio`);
  await expect(assignments).toContainText("Pendiente");
  await assignments.getByText(`Quitar ${personName} Ficticio del borrador`).click();
  await assignments.getByRole("button", { name: "Confirmar quitar responsable" }).click();
  await expect(page.getByRole("status")).toContainText("Responsables actualizados en borrador");
  await expect(assignments).toContainText("No hay responsables de este equipo");
});


test("confirmaciones: lote por persona, rechazo individual e historial sin sobrescribir respuesta obsoleta", async ({ page }, info) => {
  const client = createClient(process.env.E2E_SUPABASE_URL!, process.env.E2E_PUBLISHABLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
  const auth = await client.auth.signInWithPassword({ email, password: process.env.E2E_TEST_PASSWORD! });
  expect(auth.error).toBeNull();
  const membership = await client.from("memberships").select("org_id").eq("user_id", auth.data.user!.id).eq("status", "approved").single();
  expect(membership.error).toBeNull();
  const orgId = membership.data!.org_id;
  const name = `Persona confirmación ${info.project.name}-${Date.now()}`;
  const person = await client.from("people").insert({ org_id: orgId, first_name: name, last_name: "Ficticia" }).select("id").single();
  expect(person.error).toBeNull();
  const blocks = ["Primer rol ficticio", "Segundo rol ficticio"].map(title => ({
    ...emptyBlock(title), responsibles: [{ assignmentId: null, personId: person.data!.id, teamId: null, roleId: null }],
  }));
  const metadata = { title: `Confirmaciones ${info.project.name}`, date: "2026-11-20", startLocalTime: "10:00", timezone: "America/Argentina/Buenos_Aires", meetingTypeId: null, seriesId: null };
  const created = await client.rpc("create_editor_meeting", { p_org: orgId, p_metadata: metadata, p_template: null });
  expect(created.error).toBeNull();
  const meeting = snapshotSchema.parse(created.data);
  const published = await client.rpc("publish_editor_snapshot", { p_meeting: meeting.meetingId, p_expected_version: meeting.version, p_metadata: metadata, p_blocks: blocks });
  expect(published.error).toBeNull();
  await login(page);
  const url = `/confirmaciones?meeting=${meeting.meetingId}`;
  await page.goto(url);
  const group = page.getByRole("region", { name: `Asignaciones de ${name} Ficticia` });
  await expect(group).toBeVisible();
  await group.getByRole("button", { name: "Confirmar todos", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Respuestas guardadas");
  await expect(group.locator("li > p > strong")).toHaveText(["Confirmado", "Confirmado"]);
  const stale = await page.context().newPage();
  await stale.goto(url);
  const first = group.locator("li").filter({ has: page.getByRole("heading", { name: "Primer rol ficticio" }) });
  await first.getByRole("button", { name: "No disponible", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Respuestas guardadas");
  await expect(first.locator(":scope > p > strong")).toHaveText("No disponible");
  await expect(group.locator("li").filter({ has: page.getByRole("heading", { name: "Segundo rol ficticio" }) }).locator(":scope > p > strong")).toHaveText("Confirmado");
  await stale.getByRole("button", { name: "Todos pendientes", exact: true }).click();
  await expect(stale.locator("p.notice.error[role=alert]")).toContainText("La respuesta cambió");
  await page.reload();
  await expect(first.locator(":scope > p > strong")).toHaveText("No disponible");
  await expect(group.locator("li").filter({ has: page.getByRole("heading", { name: "Segundo rol ficticio" }) }).locator(":scope > p > strong")).toHaveText("Confirmado");
  await first.locator("summary").click();
  await expect(first.locator("details")).toContainText("antes: Confirmado");
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await stale.close();
  await page.goto("/calendario?month=2026-11");
  await expect(page.getByRole("heading", { name: "noviembre de 2026" })).toBeVisible();
  const daySelector=page.locator('section.calendar-day[aria-label="2026-11-20"] > details > summary');
  if(await daySelector.count()) await daySelector.click();
  await expect(page.getByRole("region", { name: "Calendario mensual" }).getByRole("link", { name: new RegExp(`${metadata.title}.*Sin puestos requeridos`) })).toBeVisible();
  await expect(page.getByRole("link", { name: "Mes siguiente" })).toHaveAttribute("href", "/calendario?month=2026-12");
  await expect(page.getByRole("region", { name: "Próximas tres reuniones" }).locator(".member-list > li")).toHaveCount(3);
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `/tmp/crono-calendar-${info.project.name}.png`, fullPage: true });
});

test("Sprint 3: puestos, reemplazos, conflictos, matriz y sesiones de integrante/responsable", async ({
  page,
  browser,
}, info) => {
  const { execFileSync } = await import("node:child_process");
  const client = createClient(
    process.env.E2E_SUPABASE_URL!,
    process.env.E2E_PUBLISHABLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const auth = await client.auth.signInWithPassword({
    email,
    password: process.env.E2E_TEST_PASSWORD!,
  });
  expect(auth.error).toBeNull();
  const membership = await client
    .from("memberships")
    .select("org_id")
    .eq("user_id", auth.data.user!.id)
    .single();
  expect(membership.error).toBeNull();
  const org = membership.data!.org_id;
  const suffix = `${info.project.name}-${Date.now()}`;
  const team = await client
    .from("teams")
    .insert({ org_id: org, name: `Equipo puestos ${suffix}` })
    .select("id")
    .single();
  expect(team.error).toBeNull();
  const role = await client
    .from("roles")
    .insert({ org_id: org, team_id: team.data!.id, name: `Operador ${suffix}` })
    .select("id")
    .single();
  expect(role.error).toBeNull();
  const people = await client
    .from("people")
    .insert([
      {
        org_id: org,
        first_name: `Integrante ${suffix}`,
        last_name: "Ficticio",
      },
      { org_id: org, first_name: `Reemplazo ${suffix}`, last_name: "Ficticio" },
    ])
    .select("id,first_name");
  expect(people.error).toBeNull();
  const [person, replacement] = people.data!;
  expect(
    (
      await client
        .from("team_memberships")
        .insert(
          people.data!.map((p) => ({
            org_id: org,
            team_id: team.data!.id,
            person_id: p.id,
          })),
        )
    ).error,
  ).toBeNull();
  const metadata = {
    title: `Puestos ${suffix}`,
    date: "2029-03-18",
    startLocalTime: "10:00",
    timezone: "America/Argentina/Buenos_Aires",
    meetingTypeId: null,
    seriesId: null,
  };
  const created = await client.rpc("create_editor_meeting", {
    p_org: org,
    p_metadata: metadata,
    p_template: null,
  });
  expect(created.error).toBeNull();
  let meeting = snapshotSchema.parse(created.data);
  const block = {
    ...emptyBlock("Actividad de prueba"),
    durationSeconds: 600,
    responsibles: [
      {
        personId: person.id,
        teamId: team.data!.id,
        roleId: role.data!.id,
        assignmentId: null,
      },
    ],
    subactivities: [
      {
        clientKey: crypto.randomUUID(),
        title: "Paralela",
        teamId: team.data!.id,
        personId: person.id,
        offsetSeconds: 0,
        durationSeconds: 300,
        notes: "",
        fieldSchema: [],
        customFields: {},
      },
    ],
  };
  const published = await client.rpc("publish_editor_snapshot", {
    p_meeting: meeting.meetingId,
    p_expected_version: meeting.version,
    p_metadata: metadata,
    p_blocks: [block],
  });
  expect(published.error).toBeNull();
  meeting = snapshotSchema.parse(published.data);
  await login(page);
  await page.goto(`/cronograma/${meeting.meetingId}/puestos`);
  await expect(
    page.getByRole("heading", { name: "Solapamientos", exact: true }),
  ).toBeVisible();
  const exception = page
    .locator("form")
    .filter({ has: page.locator('textarea[name="reason"]') })
    .first();
  await exception
    .locator("textarea")
    .fill("Actividad compatible supervisada para prueba");
  await exception.getByRole("button", { name: "Registrar excepción" }).click();
  await expect(
    page.getByText("Excepción registrada:", { exact: false }),
  ).toBeVisible();
  const add = page
    .locator("section.panel")
    .filter({
      has: page.getByRole("heading", {
        name: `Equipo puestos ${suffix}`,
        exact: true,
      }),
    })
    .locator("details")
    .filter({
      has: page.locator("summary", { hasText: "Agregar puestos requeridos" }),
    });
  await add.locator("summary").click();
  await add.locator('select[name="roleId"]').selectOption(role.data!.id);
  await add.locator('select[name="priority"]').selectOption("critical");
  await add
    .getByRole("button", { name: "Agregar puestos", exact: true })
    .click();
  const position = page
    .locator(".member-list > li")
    .filter({
      has: page.getByRole("heading", {
        name: `Operador ${suffix} #1 · Crítico`,
        exact: true,
      }),
    });
  await expect(position).toContainText("Vacante");
  await position.locator("summary", { hasText: "Asignar persona" }).click();
  await position.locator('select[name="personId"]').selectOption(person.id);
  await position.locator('input[name="ack"]').last().check();
  await position.getByRole("button", { name: "Guardar asignación" }).click();
  await expect(position).toContainText("Pendiente");
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const service = createClient(
    process.env.E2E_SUPABASE_URL!,
    process.env.E2E_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const identities = [];
  for (const kind of ["member", "leader"]) {
    const address = `e2e-${kind}-${suffix}@cronounidos.invalid`;
    const user = await service.auth.admin.createUser({
      email: address,
      password: process.env.E2E_TEST_PASSWORD!,
      email_confirm: true,
    });
    expect(user.error).toBeNull();
    const userId = user.data.user!.id;
    identities.push({ kind, address, id: userId });
    expect(
      [org, userId, person.id, team.data!.id].every((id) =>
        /^[0-9a-f-]{36}$/i.test(id),
      ),
    ).toBe(true);
    execFileSync(
      "psql",
      [
        process.env.E2E_DB_URL!,
        "-v",
        "ON_ERROR_STOP=1",
        "-q",
        "-c",
        `begin;update public.profiles set approved_at=now(),org_id='${org}',person_id=${kind === "member" ? `'${person.id}'` : "null"} where user_id='${userId}';insert into public.memberships(org_id,user_id,status) values('${org}','${userId}','approved');${kind === "leader" ? `insert into public.permission_grants(org_id,subject_user_id,team_id,permission) values('${org}','${userId}','${team.data!.id}','assign'),('${org}','${userId}','${team.data!.id}','read_people'),('${org}','${userId}','${team.data!.id}','confirm');` : ""}commit;`,
      ],
      { stdio: "pipe" },
    );
  }
  for (const identity of identities) {
    const context = await browser.newContext({
      baseURL: new URL(page.url()).origin,
      viewport: page.viewportSize()!,
    });
    try {
      const tab = await context.newPage();
      await tab.goto("/ingresar");
      await tab
        .getByRole("textbox", { name: "Correo electrónico" })
        .fill(identity.address);
      await tab
        .getByRole("textbox", { name: "Contraseña" })
        .fill(process.env.E2E_TEST_PASSWORD!);
      await tab.getByRole("button", { name: "Ingresar a mi cuenta" }).click();
      await expect(tab).toHaveURL(/\/inicio$/);
      await tab.goto(`/confirmaciones?meeting=${meeting.meetingId}`);
      await tab
        .getByRole("button", { name: "Confirmar todos", exact: true })
        .click();
      await expect(tab.getByRole("status")).toContainText(
        "Respuestas guardadas",
      );
      await tab.goto(`/cronograma/${meeting.meetingId}/puestos`);
      if (identity.kind === "member")
        await expect(
          tab.getByText(
            "Necesitás asignación y lectura de personas para gestionar puestos.",
          ),
        ).toBeVisible();
      else {
        await expect(
          tab.getByRole("heading", { name: "Solapamientos", exact: true }),
        ).toBeVisible();
        await expect(
          tab.locator("summary", { hasText: "Agregar puestos requeridos" }),
        ).toHaveCount(0);
      }
    } finally {
      await context.close();
    }
  }
  await page.reload();
  await position.locator("summary", { hasText: "Reemplazar persona" }).click();
  await position
    .locator('select[name="personId"]')
    .selectOption(replacement.id);
  await position.locator('input[name="ack"]').last().check();
  await position.getByRole("button", { name: "Guardar asignación" }).click();
  await expect(position).toContainText(
    `${replacement.first_name} Ficticio · Pendiente`,
  );
  await position
    .locator("summary", { hasText: "Historial de personas" })
    .click();
  await expect(position).toContainText("Confirmado · Reemplazado");
  await page.goto("/cobertura?month=2029-03");
  await expect(
    page.getByRole("heading", { name: "Matriz de cobertura", exact: true }),
  ).toBeVisible();
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `/tmp/crono-matrix-${info.project.name}.png`,
    fullPage: true,
  });
  await page.goto("/calendario?month=2029-03");
  await page
    .getByRole("link", { name: "Crear reunión el 2029-03-01", exact: true })
    .click();
  await expect(page.locator('input[name="date"]')).toHaveValue("2029-03-01");
});
