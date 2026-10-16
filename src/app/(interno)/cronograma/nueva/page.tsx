import { editorContext, loadCatalog } from "@/lib/editor/server";
import { NewMeetingForm } from "@/components/editor/new-meeting-form";
export default async function NewMeeting({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const { date } = await searchParams;
  const defaultDate =
    date &&
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    !Number.isNaN(Date.parse(`${date}T12:00:00Z`)) &&
    new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) === date
      ? date
      : undefined;
  const a = await editorContext();
  const [catalog, result] = await Promise.all([
    loadCatalog(),
    a.client.from("meeting_templates").select("id,name").eq("org_id", a.orgId),
  ]);
  if (result.error) throw new Error("No se pudieron consultar las plantillas.");
  return (
    <NewMeetingForm
      defaultDate={defaultDate}
      types={catalog.meetingTypes}
      series={catalog.series}
      templates={result.data ?? []}
    />
  );
}
