"use client";
import { ThemeProvider } from "next-themes";
import { useEffect } from "react";
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
