import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";
import { authorizeRoute, isProtectedApiRoute } from "@/src/lib/security/route-policy";
import type { NextRequest } from "next/server";

export default withAuth(
  function middleware(request) {
    const pathname = request.nextUrl.pathname;
    const decision = authorizeRoute(pathname, request.nextauth.token as any);

    if (decision.allowed) {
      return NextResponse.next();
    }

    if (isProtectedApiRoute(pathname)) {
      return NextResponse.json(
        {
          error: decision.reason,
          status: decision.status
        },
        { status: decision.status }
      );
    }

    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = decision.status === 401 ? "/sign-in" : decision.redirectTo ?? "/unauthorized";
    redirectUrl.search =
      decision.status === 401
        ? `?callbackUrl=${encodeURIComponent(`${request.nextUrl.pathname}${request.nextUrl.search}`)}`
        : "";

    return NextResponse.redirect(redirectUrl);
  },
  {
    callbacks: {
      authorized: () => true // Let the authorizeRoute function handle the logic
    }
  }
);

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/employee/:path*",
    "/manager/:path*",
    "/admin/:path*",
    "/api/protected/:path*"
  ]
};
