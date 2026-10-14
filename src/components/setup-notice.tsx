import Link from "next/link";
export function SetupNotice() {
  return (
    <div className="notice" role="status">
      <strong>Falta conectar Supabase</strong>
      <p>
        La aplicación base está lista. Para usar cuentas y reuniones, configurá
        el proyecto independiente de Chrono Unidos. No se muestran datos de
        demostración como si fueran reales.
      </p>
      <Link href="/configuracion" className="button button-ghost">
        Ver configuración pendiente
      </Link>
    </div>
  );
}
