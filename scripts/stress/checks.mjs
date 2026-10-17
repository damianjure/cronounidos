import assert from "node:assert/strict";

export function checkBurst(
  count,
  successes,
  errors,
  expected = { successes: count },
) {
  assert(
    Number.isSafeInteger(count) && count > 0,
    "Cantidad de operaciones inválida",
  );
  assert.equal(successes + errors.length, count, "Resultados incompletos");
  assert.equal(successes, expected.successes, "Cantidad de éxitos inesperada");
  for (const error of errors) {
    assert(expected.error instanceof RegExp, `Error inesperado: ${error}`);
    assert.match(
      error,
      expected.error,
      "Error distinto del conflicto previsto",
    );
  }
}
export function checkFeedbackCounts(expected, requests, users, notifications) {
  for (const n of [expected, requests, users, notifications])
    assert(Number.isSafeInteger(n) && n >= 0, "Conteo de feedback inválido");
  assert(
    expected > 0,
    "Fixture sin destinatarios: no prueba despacho de feedback",
  );
  assert.equal(requests, expected, "Solicitudes faltantes o duplicadas");
  assert.equal(users, expected, "Destinatarios faltantes o duplicados");
  assert.equal(
    notifications,
    expected,
    "Notificaciones faltantes o duplicadas",
  );
}
