"use client";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Error de aplicación", error.digest ?? "sin digest");
  }, [error]);
  return (
    <section className="panel empty">
      <h1>No pudimos cargar esta página</h1>
      <p className="muted">
        Intentá nuevamente. Si el problema continúa, verificá la conexión y las
        migraciones de Supabase.
      </p>
      <Button onClick={reset}>Volver a intentar</Button>
    </section>
  );
}
