import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // -------------------------------------------------- super-admin portal
  // Entirely separate session/cookie from the tenant app below.
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    const adminToken = request.cookies.get("admin_access_token")?.value;
    const isAdminLogin = pathname === "/admin/login";
    if (!adminToken && !isAdminLogin) {
      return NextResponse.redirect(new URL("/admin/login", request.url));
    }
    if (adminToken && isAdminLogin) {
      return NextResponse.redirect(new URL("/admin", request.url));
    }
    return NextResponse.next();
  }

  // ------------------------------------------------------------- tenant
  const token = request.cookies.get("access_token")?.value;

  // Auth pages — for signed-out visitors only. Everything else that isn't a
  // /dashboard route (including "/", "/terms", "/privacy") is freely public.
  const authRoutes = ["/login", "/signup", "/forgot-password"];
  const isAuthRoute = authRoutes.some((route) => pathname === route);

  // Protected routes
  const isProtectedRoute = pathname.startsWith("/dashboard");

  // If accessing protected route without token → redirect to login
  if (isProtectedRoute && !token) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // If accessing an auth page while already signed in → go to the dashboard
  if (isAuthRoute && token) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
