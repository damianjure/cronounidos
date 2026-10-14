import type { Metadata, Viewport } from "next";
import { Providers } from "@/components/providers";
import { Shell } from "@/components/shell";
import "./globals.css";
export const metadata: Metadata = {
  title: { default: "Chrono Unidos", template: "%s · Chrono Unidos" },
  description:
    "Planificación y coordinación de reuniones de Unidos para Servir.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Chrono Unidos",
    statusBarStyle: "default",
  },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme:light)", color: "#173c55" },
    { media: "(prefers-color-scheme:dark)", color: "#101e29" },
  ],
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-AR" suppressHydrationWarning>
      <body>
        <Providers>
          <Shell>{children}</Shell>
        </Providers>
      </body>
    </html>
  );
}
