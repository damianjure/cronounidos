import Link from "next/link";
import { notFound } from "next/navigation";
import { loadSnapshot, loadCatalog } from "@/lib/editor/server";
import { MeetingEditor } from "@/components/editor/meeting-editor";
export default async function Editor({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [snapshot, catalog] = await Promise.all([
    loadSnapshot(id),
    loadCatalog(),
  ]);
  return (
    <>
      <p>
        <Link href={`/cronograma/${id}/puestos`}>
          Gestionar puestos y reemplazos
        </Link>
        {" · "}<Link href={`/en-vivo/${id}`}>Modo en vivo</Link>
      </p>
      <MeetingEditor initial={snapshot} catalog={catalog} />
    </>
  );
}
