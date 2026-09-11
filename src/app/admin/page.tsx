import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_SESSION_COOKIE, verifyAdminSessionToken } from "@/lib/admin-session";
import { LoginForm } from "./LoginForm";

export default async function AdminLoginPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  if (verifyAdminSessionToken(token)) {
    redirect("/admin/dashboard");
  }

  return (
    <div className="mx-auto max-w-sm px-4 py-16 sm:px-6">
      <h1 className="text-2xl font-bold text-gray-900">Painel administrativo</h1>
      <p className="mt-2 text-gray-600">Acesso restrito ao organizador.</p>
      <div className="mt-8">
        <LoginForm />
      </div>
    </div>
  );
}
