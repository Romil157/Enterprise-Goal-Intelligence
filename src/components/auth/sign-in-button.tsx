"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";
import { Button } from "@/src/components/ui/button";
import { Loader2 } from "lucide-react";

export function SignInButton({ callbackUrl }: { callbackUrl: string }) {
  const [isLoading, setIsLoading] = useState(false);

  const handleSignIn = async () => {
    setIsLoading(true);
    // Use the client-side signIn method which reliably triggers OAuth redirects in the browser.
    await signIn("microsoft-entra-id", { callbackUrl });
    // Note: We don't set isLoading to false here because the page will redirect.
  };

  return (
    <Button 
      onClick={handleSignIn} 
      disabled={isLoading}
      className="w-full flex items-center justify-center gap-2 py-6 text-base font-medium"
      size="lg"
    >
      {isLoading ? (
        <Loader2 className="h-5 w-5 animate-spin" />
      ) : (
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 21 21">
          <path fill="#f25022" d="M0 0h10v10H0z"/>
          <path fill="#7fba00" d="M11 0h10v10H11z"/>
          <path fill="#00a4ef" d="M0 11h10v10H0z"/>
          <path fill="#ffb900" d="M11 11h10v10H11z"/>
        </svg>
      )}
      <span>{isLoading ? "Connecting to Microsoft..." : "Continue with Microsoft"}</span>
    </Button>
  );
}
