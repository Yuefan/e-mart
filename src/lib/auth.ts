import { redirect } from "next/navigation";
import { prisma } from "./prisma";
import { getSessionUserId } from "./session";

export type SessionUser = {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
};

export async function getCurrentUser(): Promise<SessionUser | null> {
  const userId = await getSessionUserId();
  if (!userId) return null;
  return prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, image: true },
  });
}

/** For server components / pages: bounce to login when signed out. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** For route handlers: returns null so the caller can answer 401 as JSON. */
export const getApiUser = getCurrentUser;
