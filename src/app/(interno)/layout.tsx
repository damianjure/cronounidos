export const dynamic = "force-dynamic";
import { requireAccess } from "@/lib/auth";
import { SetupNotice } from "@/components/setup-notice";
export default async function InternalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const access = await requireAccess();
  if (access.state === "unconfigured")
    return (
      <>
        <h1>Espacio del equipo</h1>
        <p className="muted" style={{ margin: "16px 0 24px" }}>
          El acceso interno estará disponible al conectar Supabase.
        </p>
        <SetupNotice />
      </>
    );
  return children;
}
