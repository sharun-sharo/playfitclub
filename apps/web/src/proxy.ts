import { jwtVerify } from "jose";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get("fitplay_session")?.value;
  if (!token) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  if (pathname.startsWith("/admin")) {
    try {
      const secret = process.env.AUTH_SECRET;
      if (!secret) throw new Error("missing secret");
      const { payload } = await jwtVerify(token, new TextEncoder().encode(secret));
      if (payload.role !== "ADMIN") return NextResponse.redirect(new URL("/dashboard", request.url));
    } catch {
      return NextResponse.redirect(new URL("/login", request.url));
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/admin/:path*"],
};
