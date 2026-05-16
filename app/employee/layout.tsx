import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { requireRole } from "@/src/lib/security/session";

export default async function EmployeeLayout({ children }: { children: ReactNode }) {
  try {
    await requireRole("EMPLOYEE");
  } catch (error) {
    redirect((error as { status?: number }).status === 401 ? "/sign-in" : "/unauthorized");
  }

  return children;
}
