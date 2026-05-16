import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import authConfig from "./auth.config";
import { authorizeRoute, isProtectedApiRoute } from "@/src/lib/security/route-policy";

const { auth } = NextAuth(authConfig);

export default auth((request) => {
  const pathname = request.nextUrl.pathname;
  const decision = authorizeRoute(pathname, request.auth?.user);

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
});

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/employee/:path*",
    "/manager/:path*",
    "/admin/:path*",
    "/api/protected/:path*"
  ]
};
