import { ThemeSelect } from "@/components/theme-select";
import { supabaseConfig } from "@/lib/env";
export default function Settings() {
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Configuración</h1>
          <p className="muted">Tu espacio de trabajo, a tu manera.</p>
        </div>
      </div>
      <section className="panel">
        <h2>Preferencias de este dispositivo</h2>
        <div className="settings-row">
          <div>
            <h3>Apariencia</h3>
            <p className="muted">
              La elección queda guardada en este navegador.
            </p>
          </div>
          <ThemeSelect />
        </div>
        <div className="settings-row">
          <div>
            <h3>Zona horaria predeterminada</h3>
            <p className="muted">America/Argentina/Buenos_Aires</p>
          </div>
          <span className="pill">Buenos Aires</span>
        </div>
        <div className="settings-row">
          <div>
            <h3>Instalar la aplicación</h3>
            <p className="muted">
              Usá “Instalar” en Chrome o “Agregar a inicio” en Safari. Requiere
              HTTPS o localhost.
            </p>
          </div>
        </div>
      </section>
      <section className="panel" style={{ marginTop: 24 }}>
        <h2>Conexión y puesta en marcha</h2>
        <p className="muted" style={{ marginTop: 12 }}>
          {supabaseConfig()
            ? "Variables públicas disponibles. Las migraciones, Auth, SMTP y el primer administrador deben validarse según la guía de setup."
            : "Pendiente: crear un proyecto Supabase independiente y configurar las variables públicas del entorno."}
        </p>
        <p className="footer-note">
          Consultá docs/SETUP.md y docs/SPRINTS-0-1.md del repositorio. No se
          modifican otros proyectos.
        </p>
      </section>
    </>
  );
}
