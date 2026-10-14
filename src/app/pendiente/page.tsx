import { redirect } from "next/navigation";
import { accessContext } from "@/lib/auth";
import { requestAccess, signOut } from "@/app/auth/actions";
import { Button } from "@/components/ui/button";
export default async function Pending({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const a = await accessContext();
  if (a.state === "approved") redirect("/inicio");
  if (a.state === "anonymous") redirect("/ingresar");
  const params = await searchParams;
  return (
    <section className="panel auth-form">
      <h1>Tu acceso está pendiente</h1>
      <p className="muted" style={{ marginTop: 16 }}>
        Verificar el correo es el primer paso. Un administrador debe aprobar tu
        membresía para acceder al equipo.
      </p>
      {params.error && (
        <p role="alert" className="form-message error">
          No se pudo solicitar acceso. Revisá el identificador de la
          organización.
        </p>
      )}
      {params.solicitado && (
        <p role="status" className="form-message">
          Solicitud registrada. Esperá la aprobación del administrador.
        </p>
      )}
      <form action={requestAccess}>
        <label className="field">
          Identificador de la organización
          <input
            name="slug"
            defaultValue="unidos-demo"
            required
            pattern="[a-z0-9-]{2,60}"
            maxLength={60}
          />
        </label>
        <Button>Solicitar acceso</Button>
      </form>
      <form action={signOut}>
        <Button variant="outline">Cerrar sesión</Button>
      </form>
    </section>
  );
}
