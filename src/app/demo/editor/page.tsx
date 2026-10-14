import { MeetingEditor } from "@/components/editor/meeting-editor";
import { demoEditor } from "@/lib/editor/demo";
export const dynamic = "force-dynamic";
export default function Demo() {
  const { snapshot, catalog } = demoEditor();
  return <MeetingEditor initial={snapshot} catalog={catalog} demo />;
}
