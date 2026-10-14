import { emptyBlock, type Catalog, type EditorSnapshot } from "./model";
const id = (n: number) =>
  `90000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export function demoEditor(): { snapshot: EditorSnapshot; catalog: Catalog } {
  const blocks = [
    "Prueba de sonido",
    "Alabanza y Adoración",
    "Mensaje",
    "Cierre",
  ].map((name, i) => ({
    ...emptyBlock(name),
    clientKey: id(100 + i),
    durationSeconds: [600, 1200, 1800, 300][i],
  }));
  return {
    snapshot: {
      meetingId: id(1),
      version: 1,
      revisionId: null,
      publishedRevisionId: null,
      metadata: {
        title: "Reunión ficticia de demostración",
        date: "2026-10-18",
        startLocalTime: "10:00",
        timezone: "America/Argentina/Buenos_Aires",
        meetingTypeId: null,
        seriesId: null,
      },
      blocks,
    },
    catalog: {
      teams: [{ id: id(2), name: "Equipo ficticio" }],
      people: [{ id: id(3), name: "Alex Ejemplo" }],
      roles: [{ id: id(4), name: "Rol de prueba", teamId: id(2) }],
      blockTypes: [],
      songs: [{ id: id(5), name: "Canción de prueba" }],
      announcements: [{ id: id(6), name: "Anuncio ficticio" }],
      messages: [{ id: id(7), name: "Mensaje de prueba" }],
      resources: [
        {
          id: id(8),
          name: "Enlace de ejemplo",
          url: "https://example.invalid",
        },
      ],
      meetingTypes: [],
      series: [],
    },
  };
}
