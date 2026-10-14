"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
export default function Logout() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    async function clear() {
      if ("caches" in window) {
        await Promise.all((await caches.keys()).map((k) => caches.delete(k)));
      }
      navigator.serviceWorker?.controller?.postMessage("LOGOUT");
      setReady(true);
    }
    clear().catch(() => setReady(true));
  }, []);
  return (
    <section className="panel empty">
      <h1>Sesión cerrada</h1>
      <p className="muted">
        {ready
          ? "Ya podés volver a la agenda pública."
          : "Limpiando cachés del dispositivo…"}
      </p>
      <Link href="/" className="button button-primary">
        Volver a la agenda
      </Link>
    </section>
  );
}
