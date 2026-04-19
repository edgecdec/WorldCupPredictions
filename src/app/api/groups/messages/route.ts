import { NextRequest, NextResponse } from "next/server";
import { v4 as uuid } from "uuid";
import { getDb, EVERYONE_GROUP_ID } from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import type { GroupMessage } from "@/types";

const MESSAGE_LIMIT = 50;
const MAX_MESSAGE_LENGTH = 500;

function isMember(db: ReturnType<typeof getDb>, groupId: string, userId: string): boolean {
  if (groupId === EVERYONE_GROUP_ID) return true;
  return !!db
    .prepare(
      `SELECT 1 FROM group_members gm
       JOIN predictions p ON p.id = gm.prediction_id
       WHERE gm.group_id = ? AND p.user_id = ?`
    )
    .get(groupId, userId);
}

export async function GET(req: NextRequest) {
  const authUser = getAuthUser(req);
  if (!authUser) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const groupId = req.nextUrl.searchParams.get("group_id");
  if (!groupId) {
    return NextResponse.json({ error: "group_id required" }, { status: 400 });
  }

  const db = getDb();
  if (!isMember(db, groupId, authUser.userId)) {
    return NextResponse.json({ error: "Not a member" }, { status: 403 });
  }

  const messages = db
    .prepare(
      `SELECT id, group_id, user_id, username, message, created_at
       FROM messages WHERE group_id = ?
       ORDER BY created_at DESC LIMIT ?`
    )
    .all(groupId, MESSAGE_LIMIT) as GroupMessage[];

  return NextResponse.json({ messages: messages.reverse() });
}

export async function POST(req: NextRequest) {
  const authUser = getAuthUser(req);
  if (!authUser) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { group_id, message } = await req.json();
  if (!group_id || !message?.trim()) {
    return NextResponse.json({ error: "group_id and message required" }, { status: 400 });
  }

  const db = getDb();
  if (!isMember(db, group_id, authUser.userId)) {
    return NextResponse.json({ error: "Not a member" }, { status: 403 });
  }

  const id = uuid();
  const text = message.trim().slice(0, MAX_MESSAGE_LENGTH);

  db.prepare(
    "INSERT INTO messages (id, group_id, user_id, username, message) VALUES (?, ?, ?, ?, ?)"
  ).run(id, group_id, authUser.userId, authUser.username, text);

  return NextResponse.json({ ok: true, id, username: authUser.username, message: text });
}
