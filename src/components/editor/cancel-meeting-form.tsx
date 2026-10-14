"use client";

import { Button } from "@/components/ui/button";
import { cancelMeeting } from "@/app/(interno)/cronograma/actions";

export function CancelMeetingForm({ id, version }: { id: string; version: number }) {
  return (
    <form action={cancelMeeting} onSubmit={(event) => {
      if (!window.confirm("¿Cancelar esta reunión? Dejará de verse en la agenda pública. Se conserva el historial y no se puede deshacer."))
        event.preventDefault();
    }}>
      <input type="hidden" name="meetingId" value={id} />
      <input type="hidden" name="version" value={version} />
      <Button variant="ghost">Cancelar reunión</Button>
    </form>
  );
}
