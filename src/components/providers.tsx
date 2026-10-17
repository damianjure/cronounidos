"use client";
import { ThemeProvider } from "next-themes";
import { useEffect } from "react";
import { z } from "zod";
// Sin compilación JIT: zod prueba `new Function` y la CSP (sin 'unsafe-eval')
// registraría esa prueba como violación aunque zod use su camino normal.
z.config({ jitless: true });
export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if ("serviceWorker" in navigator)
      navigator.serviceWorker
        .register("/sw.js")
        .catch((error) => console.error("No se pudo registrar la PWA", error));
  }, []);
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      {children}
    </ThemeProvider>
  );
}
