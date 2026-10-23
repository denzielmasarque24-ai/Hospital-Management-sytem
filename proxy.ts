import { type NextRequest, NextResponse } from "next/server";

import { createMiddlewareClient } from "@/lib/supabase/middleware";
import { getRoleHomeForValue } from "@/lib/supabase/role-home.mjs";

// Authentication pages are available regardless of session state.
const PUBLIC_ROUTES = ["/login", "/register"];
const PROTECTED_PREFIXES = ["/admin"];
const ADMIN_ROLES = new Set(["ADMIN", "SUPER_ADMIN", "INVENTORY_MANAGER", "SALES_STAFF"]);
const ADMIN_ONLY_PREFIXES = ["/admin/staff", "/admin/doctors", "/admin/settings", "/admin/careers", "/admin/services"];
const INVENTORY_PREFIXES = ["/admin/products", "/admin/inventory", "/admin/suppliers"];
const SALES_PREFIXES = ["/admin/orders", "/admin/customers"];

// Routes that should never be touched by this middleware (assets, API, Next internals)
const IGNORED_PREFIXES = ["/_next", "/api", "/favicon.ico"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip static assets and internal Next.js routes
  if (IGNORED_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return NextResponse.next();
  }

  const isPublicRoute = PUBLIC_ROUTES.includes(pathname);
  const isProtectedRoute = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  if (!isProtectedRoute && !isPublicRoute) {
    return NextResponse.next();
  }

  const response = NextResponse.next({ request });
  const supabase = createMiddlewareClient(request, response);
  // getUser() validates the JWT with Supabase â€” cannot be spoofed by editing cookies
  // A normal signed-out visit has no session. Check first so public login
  // pages do not validate a user when there is no session to validate.
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  let authUnavailable = false;
  if (sessionError && sessionError.name !== "AuthSessionMissingError") {
    console.error("[AuthProxy] Could not restore the auth session", {
      operation: "auth.getSession",
      name: sessionError.name,
      code: sessionError.code,
      message: sessionError.message,
      status: sessionError.status,
    });
    authUnavailable = sessionError.name === "AuthRetryableFetchError" || /network|fetch|timeout/i.test(sessionError.message);
  }
  let user = null;
  if (session && !sessionError) {
    // Validate the cookie JWT with Supabase before using it for access checks.
    const { data, error } = await supabase.auth.getUser();
    if (error && error.name !== "AuthSessionMissingError") {
      console.error("[AuthProxy] Could not validate the session user", {
        operation: "auth.getUser",
        name: error.name,
        code: error.code,
        message: error.message,
        status: error.status,
      });
      authUnavailable = error.name === "AuthRetryableFetchError" || /network|fetch|timeout/i.test(error.message);
    }
    user = data.user;
  }

  if (!user && isProtectedRoute) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    // Preserve the intended destination so we can redirect back after login
    loginUrl.searchParams.set("next", pathname);
    if (authUnavailable) loginUrl.searchParams.set("message", "We couldn't verify your session because the authentication service is temporarily unavailable. Please retry.");
    return NextResponse.redirect(loginUrl);
  }

  if (user && isProtectedRoute) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    const role = String(profile?.role ?? "").trim().toUpperCase();
    const canAdmin = ADMIN_ROLES.has(role);
    const isAdminOnly = ADMIN_ONLY_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
    const isDashboard = pathname === "/admin";
    const isInventory = INVENTORY_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
    const isSales = SALES_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
    const allowed = canAdmin && (!isDashboard || role === "ADMIN" || role === "SUPER_ADMIN") &&
      (!isAdminOnly || role === "ADMIN" || role === "SUPER_ADMIN") &&
      (!isInventory || role !== "SALES_STAFF") && (!isSales || role !== "INVENTORY_MANAGER");

    if (!allowed) {
      const destination = request.nextUrl.clone();
      destination.pathname = "/";
      destination.search = "";
      return NextResponse.redirect(destination);
    }
  }

  // Route authenticated users by the role stored in their public profile.
  if (user?.email_confirmed_at && isPublicRoute) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    const role = String(profile?.role ?? "").trim().toUpperCase();
    const roleHome = getRoleHomeForValue(role);
    if (!roleHome) return response;

    const homeUrl = request.nextUrl.clone();
    homeUrl.pathname = roleHome === "/" ? "/patient/profile" : roleHome;
    homeUrl.search = "";
    return NextResponse.redirect(homeUrl);
  }

  return response;
}

export const config = {
  // Run on every route except static files
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js)$).*)"],
};
