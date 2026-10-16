import { expect, request as apiRequest, test, type Page } from "@playwright/test";
import path from "node:path";

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
  await replacement.locator('input[type="file"]').setInputFiles(path.resolve("public/icons/icon-512.png"));
  await replacement.getByRole("button", { name: "Reemplazar archivo" }).click();
  await expect.poll(() => page.locator("li").filter({ has: page.getByRole("heading", { name: fileName }) }).locator('input[name="oldPath"]').first().inputValue()).not.toBe(previousPath);
  await expect(page.getByRole("status")).toContainText("Catálogo actualizado");
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
