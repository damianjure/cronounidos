// Presentation hints only: never restrict configurable types or change their schema.
export function searchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es")
    .trim();
}
export function blockPresentation(name: string) {
  const text = searchText(name);
  if (/cancion|alabanza|adoracion|musica/.test(text))
    return {
      kind: "music",
      description: "Repertorio y responsables musicales",
    } as const;
  if (/mensaje|predicacion|ensenanza/.test(text))
    return {
      kind: "message",
      description: "Mensaje, notas y recursos de la enseñanza",
    } as const;
  if (/anuncio|comunicado/.test(text))
    return {
      kind: "announcement",
      description: "Comunicados y recursos del encuentro",
    } as const;
  if (/sonido|audio|tecnic/.test(text))
    return {
      kind: "audio",
      description: "Preparación y coordinación técnica",
    } as const;
  return {
    kind: "activity",
    description: "Actividad con duración, equipo y detalles propios",
  } as const;
}
