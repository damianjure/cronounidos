import Link from "next/link";
export default function NotFound() {
  return (
    <section className="panel empty">
      <h1>No encontramos esta reunión</h1>
      <p className="muted">
        Puede que todavía no esté publicada o que el enlace no sea válido.
      </p>
      <Link className="button button-primary" href="/">
        Volver a la agenda
      </Link>
    </section>
  );
}
