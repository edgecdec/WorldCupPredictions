import { NextRequest, NextResponse } from "next/server";
import { v4 as uuid } from "uuid";
import crypto from "crypto";
import { getDb, EVERYONE_GROUP_ID } from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { DEFAULT_SCORING } from "@/types";
import type { ScoringSettings } from "@/types";

const INVITE_CODE_BYTES = 4;
const MAX_GROUP_NAME_LENGTH = 50;
const MAX_SCORING_VALUE = 1000;

function generateInviteCode(): string {
  return crypto.randomBytes(INVITE_CODE_BYTES).toString("hex");
}

function validateScoringSettings(s: ScoringSettings): string | null {
  const { groupStage, knockout } = s;
  if (!groupStage || !knockout) return "Missing groupStage or knockout settings";

  const groupFields: (keyof typeof groupStage)[] = [
    "advanceCorrect",
    "exactPosition",
    "upsetBonusPerPlace",
    "advancementCorrectBonus",
    "perfectOrderBonus",
  ];
  for (const f of groupFields) {
    if (typeof groupStage[f] !== "number" || groupStage[f] > MAX_SCORING_VALUE) {
      return `groupStage.${f} must be a number <= ${MAX_SCORING_VALUE}`;
    }
  }

  if (!Array.isArray(knockout.pointsPerRound) || knockout.pointsPerRound.length !== 6) {
    return "knockout.pointsPerRound must be an array of 6 numbers";
  }
  if (!Array.isArray(knockout.upsetMultiplierPerRound) || knockout.upsetMultiplierPerRound.length !== 6) {
    return "knockout.upsetMultiplierPerRound must be an array of 6 numbers";
  }
  if (knockout.pointsPerRound.some((v: number) => v > MAX_SCORING_VALUE)) {
    return `knockout.pointsPerRound values must not exceed ${MAX_SCORING_VALUE}`;
  }
  if (typeof knockout.upsetModulus !== "number" || knockout.upsetModulus < 1) {
    return "knockout.upsetModulus must be a positive number";
  }
  if (typeof knockout.championBonus !== "number" || knockout.championBonus > MAX_SCORING_VALUE) {
    return `knockout.championBonus must be a number <= ${MAX_SCORING_VALUE}`;
  }

  return null;
}

interface GroupRow {
  id: string;
  name: string;
  invite_code: string;
  created_by: string;
  created_at: string;
  scoring_settings: string;
  max_brackets: number | null;
  submissions_locked: number;
  member_count: number;
  creator_name?: string;
}

export async function GET(req: NextRequest) {
  const authUser = getAuthUser(req);
  if (!authUser) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const db = getDb();

  // Look up by invite code
  const inviteCode = req.nextUrl.searchParams.get("invite_code");
  if (inviteCode) {
    const group = db
      .prepare(
        `SELECT g.*, u.username as creator_name
         FROM groups g JOIN users u ON g.created_by = u.id
         WHERE g.invite_code = ?`
      )
      .get(inviteCode) as GroupRow | undefined;
    if (!group) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }
    const memberCount = (
      db.prepare("SELECT COUNT(*) as count FROM group_members WHERE group_id = ?").get(group.id) as { count: number }
    ).count;
    const isMember = !!db
      .prepare(
        `SELECT 1 FROM group_members gm
         JOIN predictions p ON p.id = gm.prediction_id
         WHERE gm.group_id = ? AND p.user_id = ?`
      )
      .get(group.id, authUser.userId);
    return NextResponse.json({
      group: {
        ...group,
        scoring_settings: JSON.parse(group.scoring_settings),
        member_count: memberCount,
        is_member: isMember,
      },
    });
  }

  // Fetch members for a group
  const membersGroupId = req.nextUrl.searchParams.get("members");
  if (membersGroupId) {
    const members = db
      .prepare(
        `SELECT gm.prediction_id, u.username, p.bracket_name
         FROM group_members gm
         JOIN predictions p ON p.id = gm.prediction_id
         JOIN users u ON u.id = p.user_id
         WHERE gm.group_id = ?
         ORDER BY u.username`
      )
      .all(membersGroupId) as { prediction_id: string; username: string; bracket_name: string }[];
    return NextResponse.json({ members });
  }

  // List groups the user belongs to (via their predictions), created, or Everyone
  const groups = db
    .prepare(
      `SELECT DISTINCT g.*, COALESCE(u.username, 'System') as creator_name,
        (SELECT COUNT(*) FROM group_members gm2 WHERE gm2.group_id = g.id) as member_count
       FROM groups g
       JOIN group_members gm ON g.id = gm.group_id
       JOIN predictions p ON p.id = gm.prediction_id
       LEFT JOIN users u ON g.created_by = u.id
       WHERE p.user_id = ?
       UNION
       SELECT g.*, COALESCE(u.username, 'System') as creator_name,
        (SELECT COUNT(*) FROM group_members gm2 WHERE gm2.group_id = g.id) as member_count
       FROM groups g
       LEFT JOIN users u ON g.created_by = u.id
       WHERE g.created_by = ?
       UNION
       SELECT g.*, COALESCE(u.username, 'System') as creator_name,
        (SELECT COUNT(*) FROM group_members gm2 WHERE gm2.group_id = g.id) as member_count
       FROM groups g
       LEFT JOIN users u ON g.created_by = u.id
       WHERE g.id = ?
       ORDER BY created_at DESC`
    )
    .all(authUser.userId, authUser.userId, EVERYONE_GROUP_ID) as GroupRow[];

  return NextResponse.json({
    groups: groups.map((g) => ({
      ...g,
      scoring_settings: JSON.parse(g.scoring_settings),
    })),
  });
}

export async function POST(req: NextRequest) {
  const authUser = getAuthUser(req);
  if (!authUser) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { action, ...data } = await req.json();
  const db = getDb();

  if (action === "create") {
    const name = data.name?.trim();
    if (!name) {
      return NextResponse.json({ error: "Group name required" }, { status: 400 });
    }
    if (name.length > MAX_GROUP_NAME_LENGTH) {
      return NextResponse.json(
        { error: `Group name must be ${MAX_GROUP_NAME_LENGTH} characters or less` },
        { status: 400 }
      );
    }

    const settings: ScoringSettings = data.scoring_settings || DEFAULT_SCORING;
    const err = validateScoringSettings(settings);
    if (err) {
      return NextResponse.json({ error: err }, { status: 400 });
    }

    const maxBrackets = data.max_brackets != null ? Number(data.max_brackets) : null;
    const id = uuid();
    const inviteCode = generateInviteCode();

    db.prepare(
      `INSERT INTO groups (id, name, invite_code, created_by, scoring_settings, max_brackets)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(id, name, inviteCode, authUser.userId, JSON.stringify(settings), maxBrackets);

    // Auto-join creator's prediction to the new group
    const creatorPrediction = db
      .prepare("SELECT id FROM predictions WHERE user_id = ? LIMIT 1")
      .get(authUser.userId) as { id: string } | undefined;
    if (creatorPrediction) {
      db.prepare("INSERT OR IGNORE INTO group_members (group_id, prediction_id) VALUES (?, ?)").run(
        id,
        creatorPrediction.id
      );
    }

    return NextResponse.json({ ok: true, id, invite_code: inviteCode });
  }

  if (action === "join") {
    const { invite_code, prediction_id } = data;
    if (!invite_code) {
      return NextResponse.json({ error: "Invite code required" }, { status: 400 });
    }
    if (!prediction_id) {
      return NextResponse.json({ error: "Prediction ID required" }, { status: 400 });
    }

    const group = db.prepare("SELECT * FROM groups WHERE invite_code = ?").get(invite_code) as GroupRow | undefined;
    if (!group) {
      return NextResponse.json({ error: "Invalid invite code" }, { status: 404 });
    }

    // Verify user owns the prediction
    const prediction = db
      .prepare("SELECT id FROM predictions WHERE id = ? AND user_id = ?")
      .get(prediction_id, authUser.userId) as { id: string } | undefined;
    if (!prediction) {
      return NextResponse.json({ error: "Prediction not found" }, { status: 404 });
    }

    // Check max_brackets limit
    if (group.max_brackets != null) {
      const count = (
        db
          .prepare(
            `SELECT COUNT(*) as c FROM group_members gm
             JOIN predictions p ON p.id = gm.prediction_id
             WHERE gm.group_id = ? AND p.user_id = ?`
          )
          .get(group.id, authUser.userId) as { c: number }
      ).c;
      if (count >= group.max_brackets) {
        return NextResponse.json(
          { error: `This group allows a maximum of ${group.max_brackets} bracket(s) per member` },
          { status: 400 }
        );
      }
    }

    // Check if already a member with this prediction
    const existing = db
      .prepare("SELECT 1 FROM group_members WHERE group_id = ? AND prediction_id = ?")
      .get(group.id, prediction_id);
    if (existing) {
      return NextResponse.json({ error: "This bracket is already in the group" }, { status: 400 });
    }

    db.prepare("INSERT INTO group_members (group_id, prediction_id) VALUES (?, ?)").run(group.id, prediction_id);
    return NextResponse.json({ ok: true, group_id: group.id });
  }

  if (action === "leave") {
    const { group_id } = data;
    if (!group_id) {
      return NextResponse.json({ error: "Group ID required" }, { status: 400 });
    }
    if (group_id === EVERYONE_GROUP_ID) {
      return NextResponse.json({ error: "Cannot leave the Everyone group" }, { status: 400 });
    }

    // Remove all of this user's predictions from the group
    db.prepare(
      `DELETE FROM group_members
       WHERE group_id = ? AND prediction_id IN (
         SELECT id FROM predictions WHERE user_id = ?
       )`
    ).run(group_id, authUser.userId);

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}

export async function DELETE(req: NextRequest) {
  const authUser = getAuthUser(req);
  if (!authUser) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { action, group_id, prediction_id } = await req.json();
  if (action !== "remove_member") {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }
  if (!group_id || !prediction_id) {
    return NextResponse.json({ error: "group_id and prediction_id required" }, { status: 400 });
  }
  if (group_id === EVERYONE_GROUP_ID) {
    return NextResponse.json({ error: "Cannot remove members from the Everyone group" }, { status: 400 });
  }

  const db = getDb();
  const group = db.prepare("SELECT * FROM groups WHERE id = ?").get(group_id) as GroupRow | undefined;
  if (!group) {
    return NextResponse.json({ error: "Group not found" }, { status: 404 });
  }
  if (group.created_by !== authUser.userId) {
    return NextResponse.json({ error: "Only the group creator can remove members" }, { status: 403 });
  }

  db.prepare("DELETE FROM group_members WHERE group_id = ? AND prediction_id = ?").run(group_id, prediction_id);
  return NextResponse.json({ ok: true });
}

export async function PUT(req: NextRequest) {
  const authUser = getAuthUser(req);
  if (!authUser) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { group_id, scoring_settings } = await req.json();
  if (!group_id || !scoring_settings) {
    return NextResponse.json({ error: "group_id and scoring_settings required" }, { status: 400 });
  }

  const db = getDb();
  const group = db.prepare("SELECT * FROM groups WHERE id = ?").get(group_id) as GroupRow | undefined;
  if (!group) {
    return NextResponse.json({ error: "Group not found" }, { status: 404 });
  }

  // Only creator can edit (or admin for Everyone group)
  const isCreator = group.created_by === authUser.userId;
  const isAdminForEveryone = group_id === EVERYONE_GROUP_ID && authUser.isAdmin;
  if (!isCreator && !isAdminForEveryone) {
    return NextResponse.json({ error: "Only the group creator can edit settings" }, { status: 403 });
  }

  // Check tournament lock time
  const tournament = db
    .prepare("SELECT lock_time_groups FROM tournaments ORDER BY year DESC LIMIT 1")
    .get() as { lock_time_groups: string } | undefined;
  if (tournament && new Date(tournament.lock_time_groups) <= new Date()) {
    return NextResponse.json({ error: "Cannot edit scoring after groups lock" }, { status: 400 });
  }

  const err = validateScoringSettings(scoring_settings);
  if (err) {
    return NextResponse.json({ error: err }, { status: 400 });
  }

  db.prepare("UPDATE groups SET scoring_settings = ? WHERE id = ?").run(
    JSON.stringify(scoring_settings),
    group_id
  );

  return NextResponse.json({ ok: true });
}
