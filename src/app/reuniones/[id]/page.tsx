import { notFound } from "next/navigation";
import { publicClient } from "@/lib/supabase/public";
import { PublicAgenda, type PublicRow } from "@/components/public-agenda";
export const dynamic = "force-dynamic";
export default async function Meeting({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const client = publicClient();
  if (!client) notFound();
  const { data, error } = await client.rpc("public_agenda", { p_meeting: id });
  if (error) throw new Error("No se pudo consultar la agenda.");
  if (!data?.length) notFound();
  return (
    <section className="panel">
      <h1>Agenda de la reunión</h1>
      <PublicAgenda rows={data as PublicRow[]} individual />
    </section>
  );
}
