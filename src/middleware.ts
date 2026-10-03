import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionValue } from "@/lib/session";

/** Everything under /admin needs a signed operator session, except login. */
export async function middleware(request: NextRequest) {
  if (request.nextUrl.pathname === "/admin/login") return NextResponse.next();
  if (await verifySessionValue(request.cookies.get(SESSION_COOKIE)?.value)) {
    return NextResponse.next();
  }
  const login = request.nextUrl.clone();
  login.pathname = "/admin/login";
  login.search = "";
  return NextResponse.redirect(login);
}

export const config = { matcher: ["/admin", "/admin/:path*"] };
