import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { parse } from "cookie";
import type { AuthUser } from "@/types";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";
const TOKEN_NAME = "token";
const SALT_ROUNDS = 10;
const TOKEN_EXPIRY = "7d";
const MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

export function hashPassword(password: string): string {
  return bcrypt.hashSync(password, SALT_ROUNDS);
}

export function verifyPassword(password: string, hash: string): boolean {
  return bcrypt.compareSync(password, hash);
}

export function signToken(user: AuthUser): string {
  return jwt.sign(user, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
}

export function verifyToken(token: string): AuthUser | null {
  try {
    return jwt.verify(token, JWT_SECRET) as AuthUser;
  } catch {
    return null;
  }
}

export function getAuthUser(request: Request): AuthUser | null {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return null;
  const cookies = parse(cookieHeader);
  const token = cookies[TOKEN_NAME];
  if (!token) return null;
  return verifyToken(token);
}

export function setTokenCookie(token: string): string {
  return `${TOKEN_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE_SECONDS}`;
}

export function clearTokenCookie(): string {
  return `${TOKEN_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}
