import { signIn } from "@/auth";

interface SignInPageProps {
  searchParams?: Promise<{
    callbackUrl?: string;
    error?: string;
  }>;
}

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const params = await searchParams;
  const callbackUrl = params?.callbackUrl ?? "/dashboard";

  async function signInWithMicrosoft() {
    "use server";
    await signIn("microsoft-entra-id", { redirectTo: callbackUrl });
  }

  return (
    <main style={{ maxWidth: 520, margin: "12vh auto", fontFamily: "system-ui, sans-serif" }}>
      <h1>ATOMQUEST secure sign-in</h1>
      <p>Use your Microsoft Entra ID account to access the enterprise goal intelligence system.</p>
      {params?.error ? <p>Authentication was rejected by the configured security policy.</p> : null}
      <form action={signInWithMicrosoft}>
        <button type="submit">Continue with Microsoft</button>
      </form>
    </main>
  );
}
