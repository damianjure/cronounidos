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
        Revisá tu conexión y volvé a intentar. Si el problema continúa, avisale
        a la persona que administra Crono Unidos.
      </p>
      <Button onClick={reset}>Volver a intentar</Button>
    </section>
  );
}
