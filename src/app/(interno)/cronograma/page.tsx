import Link from "next/link";
import { requireAccess } from "@/lib/auth";
import { Button } from "@/components/ui/button";
export default async function Schedule() {
  const a = await requireAccess();
  if (a.state !== "approved") return null;
  const [rows, permission] = await Promise.all([
    a.client
      .from("meetings")
      .select("id,title,date,status,draft_revision_id,published_revision_id")
      .eq("org_id", a.orgId)
      .order("date")
      .limit(100),
    a.client.rpc("can_edit_meetings", { p_org: a.orgId }),
  ]);
  if (rows.error || permission.error)
    throw new Error("No se pudo consultar el cronograma.");
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Cronograma</h1>
          <p className="muted">
            Prepará cada encuentro sin cambiar lo que ya está publicado.
          </p>
        </div>
        {permission.data && (
          <Button asChild>
            <Link href="/cronograma/nueva">Nueva reunión</Link>
          </Button>
        )}
      </div>
      <section className="panel">
        <ul className="member-list">
          {rows.data?.map((m) => (
            <li key={m.id}>
              <h2>{m.title}</h2>
              <p className="muted">
                {m.date} · {m.status === "published" ? "Publicada" : "Borrador"}
                {m.draft_revision_id && m.published_revision_id
                  ? " · Con cambios sin publicar"
                  : ""}
              </p>
              <Button asChild variant="outline">
                <Link
                  href={
                    permission.data
                      ? `/cronograma/${m.id}`
                      : `/reuniones/${m.id}`
                  }
                >
                  {permission.data ? "Abrir editor" : "Ver agenda pública"}
                </Link>
              </Button>
            </li>
          ))}
        </ul>
        {!rows.data?.length && (
          <div className="empty">
            <h2>Todavía no hay reuniones</h2>
            <p className="muted">
              Creá un borrador para empezar a organizar el cronograma.
            </p>
          </div>
        )}
      </section>
    </>
  );
}
