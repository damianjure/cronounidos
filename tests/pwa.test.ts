import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { it, expect, vi } from "vitest";
type WorkerEvent = {
  request?: { method: string; url: string; mode: string };
  data?: string;
  waitUntil?: (p: Promise<unknown>) => void;
  respondWith?: (p: Promise<unknown>) => void;
};
function worker() {
  const handlers = new Map<string, (e: WorkerEvent) => void>();
  const cache = { addAll: vi.fn(async () => {}) };
  const caches = {
    open: vi.fn(async () => cache),
    keys: vi.fn(async () => ["chrono-public-shell-v1", "old-user-cache"]),
    delete: vi.fn(async (key: string) => key.length > 0),
    match: vi.fn(async () => new Response("Offline público")),
  };
  const fetch = vi.fn(async () => new Response("Respuesta de red"));
  const self = {
    location: { origin: "https://chrono.example.invalid" },
    addEventListener: (n: string, fn: (e: WorkerEvent) => void) =>
      handlers.set(n, fn),
    skipWaiting: vi.fn(),
    clients: { claim: vi.fn(async () => {}) },
  };
  runInNewContext(readFileSync("public/sw.js", "utf8"), {
    self,
    caches,
    fetch,
    URL,
    Response,
  });
  return { handlers, cache, caches, fetch, self };
}
it("instalación guarda SOLO fallback e íconos públicos", async () => {
  const w = worker();
  let pending: Promise<unknown> | undefined;
  w.handlers.get("install")!({
    waitUntil: (p) => {
      pending = p;
    },
  });
  await pending;
  expect(w.cache.addAll).toHaveBeenCalledWith([
    "/offline.html",
    "/icons/icon-192.png",
    "/icons/icon-512.png",
  ]);
});
it("activación elimina versiones viejas y toma control", async () => {
  const w = worker();
  let pending: Promise<unknown> | undefined;
  w.handlers.get("activate")!({
    waitUntil: (p) => {
      pending = p;
    },
  });
  await pending;
  expect(w.caches.delete).toHaveBeenCalledWith("old-user-cache");
  expect(w.caches.delete).not.toHaveBeenCalledWith("chrono-public-shell-v1");
  expect(w.self.clients.claim).toHaveBeenCalledOnce();
});
it("fetch API y POST no se cachean ni interceptan", () => {
  const w = worker();
  const respond = vi.fn();
  for (const [method, url] of [
    ["GET", "https://chrono.example.invalid/api/private"],
    ["POST", "https://chrono.example.invalid/inicio"],
  ])
    w.handlers.get("fetch")!({
      request: { method, url, mode: "cors" },
      respondWith: respond,
    });
  expect(respond).not.toHaveBeenCalled();
  expect(w.caches.open).not.toHaveBeenCalled();
});
it("navegación usa red; si falla usa fallback público, nunca documento autenticado", async () => {
  const w = worker();
  w.fetch.mockRejectedValue(new Error("offline"));
  let pending: Promise<unknown> | undefined;
  w.handlers.get("fetch")!({
    request: {
      method: "GET",
      url: "https://chrono.example.invalid/inicio",
      mode: "navigate",
    },
    respondWith: (p) => {
      pending = p;
    },
  });
  const response = (await pending) as Response;
  expect(await response.text()).toBe("Offline público");
  expect(w.caches.match).toHaveBeenCalledWith("/offline.html");
  expect(w.caches.open).not.toHaveBeenCalled();
});
it("logout elimina todas las cachés, incluyendo cualquier caché antigua de usuario", async () => {
  const w = worker();
  let pending: Promise<unknown> | undefined;
  w.handlers.get("message")!({
    data: "LOGOUT",
    waitUntil: (p) => {
      pending = p;
    },
  });
  await pending;
  expect(w.caches.delete.mock.calls.map((c) => c[0]).sort()).toEqual([
    "chrono-public-shell-v1",
    "old-user-cache",
  ]);
});
