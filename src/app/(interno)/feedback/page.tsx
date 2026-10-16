import Link from "next/link";
import { requireAccess } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import {
  feedbackLabels,
  feedbackCategory,
  ownFeedbackRequests,
} from "@/lib/feedback/model";
import { submitFeedback } from "./actions";
export default async function Feedback({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const access = await requireAccess();
  if (access.state !== "approved") return null;
  const query = await searchParams;
  const result = await access.client.rpc("my_feedback_requests", {
    p_org: access.orgId,
  });
  if (result.error)
    throw new Error("No se pudieron consultar tus solicitudes de feedback.");
  const requests = ownFeedbackRequests.parse(result.data);
  const admin = await access.client.rpc("has_permission", {
    p_org: access.orgId,
    p_permission: "administer",
    p_team: null,
  });
  if (admin.error)
    throw new Error("No se pudieron verificar los permisos de feedback.");
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Mi feedback</h1>
          <p className="muted">
            Tus solicitudes aparecen a partir de diez minutos del cierre
            efectivo de una reunión.
          </p>
        </div>
        {admin.data && <Link href="/feedback/admin">Panel de feedback</Link>}
      </div>
      {query.ok && (
        <p role="status" className="notice">
          Feedback enviado. El texto queda reservado a administradores.
        </p>
      )}
      {query.error && (
        <p role="alert" className="notice error">
          {query.error === "datos"
            ? "Elegí una categoría y un comentario de hasta 500 caracteres."
            : "No se pudo enviar. Revisá tu conexión, permisos y si la solicitud ya fue respondida."}
        </p>
      )}
      <p className="notice">
        Solo administradores pueden consultar las respuestas. Después de enviar
        verás el estado, no el comentario guardado. Una respuesta enviada no se
        puede editar.
      </p>
      {requests.length === 0 && (
        <section className="panel empty">
          <h2>No tenés solicitudes de feedback</h2>
          <p className="muted">
            No hace falta mantener esta página abierta: los avisos se generan
            desde el servidor.
          </p>
        </section>
      )}
      {requests.map((request) => (
        <section
          key={request.id}
          className="panel feedback-card"
          aria-label={`Feedback de ${request.title}`}
        >
          <h2>{request.title}</h2>
          <p className="muted">
            Disponible desde{" "}
            {new Intl.DateTimeFormat("es-AR", {
              dateStyle: "short",
              timeStyle: "short",
              timeZone: "America/Argentina/Buenos_Aires",
            }).format(new Date(request.dueAt))}
          </p>
          {request.submittedAt ? (
            <p role="status">Respuesta enviada</p>
          ) : (
            <form action={submitFeedback} className="feedback-form">
              <input type="hidden" name="requestId" value={request.id} />
              <fieldset>
                <legend>¿Cómo salió la reunión?</legend>
                {feedbackCategory.options.map((category) => (
                  <label key={category} className="feedback-choice">
                    <input
                      type="radio"
                      name="category"
                      value={category}
                      required
                    />
                    {feedbackLabels[category]}
                  </label>
                ))}
              </fieldset>
              <label htmlFor={`comment-${request.id}`}>
                Comentario opcional (máximo 500 caracteres)
              </label>
              <textarea
                id={`comment-${request.id}`}
                name="comment"
                maxLength={500}
                rows={4}
                aria-describedby={`privacy-${request.id}`}
              />
              <p id={`privacy-${request.id}`} className="muted">
                No incluyas contraseñas ni datos sensibles de otras personas.
              </p>
              <Button type="submit">Enviar feedback</Button>
            </form>
          )}
        </section>
      ))}
    </>
  );
}
