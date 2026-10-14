import { AuthForm } from "@/components/auth-form";
import { supabaseConfig } from "@/lib/env";
import { SetupNotice } from "@/components/setup-notice";
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  return (
    <>
      {!supabaseConfig() && <SetupNotice />}
      {params.error && (
        <p className="notice error" role="alert">
          {params.error === "configuracion"
            ? "Falta conectar Supabase para verificar el enlace."
            : "El enlace no es válido o expiró. Solicitá uno nuevo."}
        </p>
      )}
      <AuthForm />
    </>
  );
}
