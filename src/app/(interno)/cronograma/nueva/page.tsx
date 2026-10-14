import { editorContext, loadCatalog } from "@/lib/editor/server";
import { NewMeetingForm } from "@/components/editor/new-meeting-form";
export default async function NewMeeting() {
  const a = await editorContext();
  const [catalog, result] = await Promise.all([
    loadCatalog(),
    a.client.from("meeting_templates").select("id,name").eq("org_id", a.orgId),
  ]);
  if (result.error) throw new Error("No se pudieron consultar las plantillas.");
  return (
    <NewMeetingForm
      types={catalog.meetingTypes}
      series={catalog.series}
      templates={result.data ?? []}
    />
  );
}
