import { SignInButton } from "@/src/components/auth/sign-in-button";
import { Target, ShieldAlert } from "lucide-react";

interface SignInPageProps {
  searchParams?: Promise<{
    callbackUrl?: string;
    error?: string;
  }>;
}

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const params = await searchParams;
  const callbackUrl = params?.callbackUrl ?? "/dashboard";

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-8 rounded-2xl bg-white p-10 shadow-xl ring-1 ring-slate-900/5">
        <div className="text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-indigo-50">
            <Target className="h-8 w-8 text-indigo-600" />
          </div>
          <h2 className="mt-6 text-3xl font-bold tracking-tight text-slate-900">
            ATOMQUEST
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            Enterprise Goal Intelligence System
          </p>
        </div>

        {params?.error && (
          <div className="rounded-md bg-red-50 p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <ShieldAlert className="h-5 w-5 text-red-400" aria-hidden="true" />
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">Authentication Failed</h3>
                <div className="mt-2 text-sm text-red-700">
                  <p>
                    {params.error === "AccessDenied" 
                      ? "Your account is not authorized to access this tenant. Please contact your IT administrator."
                      : "An error occurred during sign-in. Please try again."}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="mt-8">
          <SignInButton callbackUrl={callbackUrl} />
        </div>
        
        <p className="mt-6 text-center text-xs text-slate-500">
          Protected by Microsoft Entra ID. Authorized enterprise personnel only.
        </p>
      </div>
    </main>
  );
}
