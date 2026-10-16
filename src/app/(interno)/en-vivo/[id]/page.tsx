import { notFound } from "next/navigation";
import Link from "next/link";
import { z } from "zod";
import { readLive } from "./actions";
import { LiveConsole } from "@/components/live/live-console";
export default async function LivePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const result = await readLive(id);
  if (!result.ok)
    return (
      <>
        <h1>Modo en vivo</h1>
        <p className="notice" role="alert">
          {result.message} Solo reuniones publicadas y usuarios autorizados.
        </p>
        <Link href="/cronograma">Volver al cronograma</Link>
      </>
    );
  return <LiveConsole initial={result.snapshot} />;
}
