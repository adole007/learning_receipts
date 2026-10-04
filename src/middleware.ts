import { NextResponse, type NextRequest } from "next/server";
import { customAlphabet } from "nanoid";

export const LEARNER_COOKIE = "rfl_lid";
const newId = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 21);

/**
 * MVP identity: an anonymous, httpOnly learner id cookie. Swap for real auth
 * (e.g. Neon Auth / Auth.js) before launch — see README.
 */
export function middleware(req: NextRequest) {
  if (req.cookies.get(LEARNER_COOKIE)) return NextResponse.next();
  const id = newId();
  req.cookies.set(LEARNER_COOKIE, id);
  const res = NextResponse.next({ request: { headers: req.headers } });
  res.cookies.set(LEARNER_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365 * 2,
  });
  return res;
}

export const config = { matcher: ["/((?!_next/|favicon.ico).*)"] };
