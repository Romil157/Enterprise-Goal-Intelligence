import { NextResponse } from "next/server";
import { AuthenticationError, AuthorizationError } from "@/src/lib/security/errors";
import { requireSession } from "@/src/lib/security/session";

export async function GET() {
  try {
    const principal = await requireSession();
    return NextResponse.json({ principal });
  } catch (error) {
    const status =
      error instanceof AuthenticationError || error instanceof AuthorizationError ? error.status : 500;

    return NextResponse.json(
      {
        error: status === 500 ? "INTERNAL_SERVER_ERROR" : error instanceof Error ? error.message : "Access denied"
      },
      { status }
    );
  }
}
