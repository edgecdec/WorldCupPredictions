import { NextRequest, NextResponse } from "next/server";
import { v4 as uuid } from "uuid";
import { getDb } from "@/lib/db";
import { hashPassword, verifyPassword, signToken, setTokenCookie, getAuthUser, clearTokenCookie } from "@/lib/auth";

const MIN_PASSWORD_LENGTH = 4;
const MAX_USERNAME_LENGTH = 32;
const MAX_PASSWORD_LENGTH = 128;

interface UserRow {
  id: string;
  username: string;
  password_hash: string;
  is_admin: number;
}

export async function POST(req: NextRequest) {
  const { action, username, password } = await req.json();
  const db = getDb();

  if (action === "register") {
    if (!username || !password || password.length < MIN_PASSWORD_LENGTH) {
      return NextResponse.json({ error: "Username and password (4+ chars) required" }, { status: 400 });
    }
    if (username.length > MAX_USERNAME_LENGTH) {
      return NextResponse.json({ error: "Username max 32 characters" }, { status: 400 });
    }
    if (password.length > MAX_PASSWORD_LENGTH) {
      return NextResponse.json({ error: "Password max 128 characters" }, { status: 400 });
    }

    const existing = db.prepare("SELECT id FROM users WHERE username = ?").get(username);
    if (existing) {
      return NextResponse.json({ error: "Username taken" }, { status: 409 });
    }

    const id = uuid();
    db.prepare("INSERT INTO users (id, username, password_hash, is_admin) VALUES (?, ?, ?, 0)")
      .run(id, username, hashPassword(password));

    const token = signToken({ userId: id, username, isAdmin: false });
    const res = NextResponse.json({ ok: true, user: { id, username, is_admin: false } });
    res.headers.set("Set-Cookie", setTokenCookie(token));
    return res;
  }

  if (action === "login") {
    const user = db.prepare("SELECT * FROM users WHERE username = ?").get(username) as UserRow | undefined;
    if (!user || !verifyPassword(password, user.password_hash)) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    const isAdmin = !!user.is_admin;
    const token = signToken({ userId: user.id, username: user.username, isAdmin });
    const res = NextResponse.json({ ok: true, user: { id: user.id, username: user.username, is_admin: isAdmin } });
    res.headers.set("Set-Cookie", setTokenCookie(token));
    return res;
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}

export async function GET(req: NextRequest) {
  const authUser = getAuthUser(req);
  if (!authUser) {
    return NextResponse.json({ ok: false, user: null });
  }
  return NextResponse.json({
    ok: true,
    user: { id: authUser.userId, username: authUser.username, is_admin: authUser.isAdmin },
  });
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.headers.set("Set-Cookie", clearTokenCookie());
  return res;
}
