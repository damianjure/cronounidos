"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CustomFields } from "@/components/editor/custom-fields";
import type { EditorBlock, FieldDefinition } from "@/lib/editor/model";
import { saveTeamFields } from "@/app/(interno)/cronograma/[id]/equipos/[teamId]/actions";

export function TeamCustomFields({ meetingId, teamId, blockId, version, schema, initialValues }: {
  meetingId: string;
  teamId: string;
  blockId: string;
  version: number;
  schema: FieldDefinition[];
  initialValues: EditorBlock["customFields"];
}) {
  const [values, setValues] = useState(initialValues);
  if (!schema.length) return null;
  return <form action={saveTeamFields} className="editor-fields">
    <input type="hidden" name="meetingId" value={meetingId} />
    <input type="hidden" name="teamId" value={teamId} />
    <input type="hidden" name="blockId" value={blockId} />
    <input type="hidden" name="version" value={version} />
    <input type="hidden" name="values" value={JSON.stringify(values)} />
    <CustomFields schema={schema} values={values} onSchema={() => {}} onValues={setValues} disabled={false} allowSchemaEditing={false} />
    <Button variant="outline">Guardar campos</Button>
  </form>;
}
