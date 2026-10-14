import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Chrono Unidos · Unidos para Servir",
    short_name: "Chrono Unidos",
    description: "Coordinación de reuniones y equipos",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f1f5f7",
    theme_color: "#173c55",
    lang: "es-AR",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
