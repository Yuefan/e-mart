"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { brandVoiceSchema, parseList } from "@/lib/brand-voice";
import { prisma } from "@/lib/prisma";

export type SettingsFormState = { ok: boolean; message: string } | null;

async function assertOwnership(siteId: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const site = await prisma.site.findFirst({
    where: { id: siteId, userId: user.id },
    select: { id: true },
  });
  if (!site) throw new Error("Site not found");
}

export async function saveBrandVoice(
  _previous: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const siteId = String(formData.get("siteId") ?? "");
  await assertOwnership(siteId);

  const minWords = Number(formData.get("minWords"));
  const maxWords = Number(formData.get("maxWords"));

  const parsed = brandVoiceSchema.safeParse({
    tone: String(formData.get("tone") ?? "").trim(),
    audience: String(formData.get("audience") ?? "").trim(),
    language: String(formData.get("language") ?? "en-US").trim() || "en-US",
    coreTopics: parseList(String(formData.get("coreTopics") ?? "")),
    keywords: parseList(String(formData.get("keywords") ?? "")),
    forbidden: parseList(String(formData.get("forbidden") ?? "")),
    wordCountRange: [
      Number.isFinite(minWords) && minWords > 0 ? minWords : 1200,
      Number.isFinite(maxWords) && maxWords > 0 ? maxWords : 1800,
    ],
    referenceUrls: parseList(String(formData.get("referenceUrls") ?? "")),
    imageStyle: String(formData.get("imageStyle") ?? "").trim(),
  });

  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const [min, max] = parsed.data.wordCountRange;
  if (min > max) {
    return { ok: false, message: "Minimum word count cannot exceed the maximum." };
  }

  await prisma.site.update({
    where: { id: siteId },
    data: { brandVoice: parsed.data },
  });

  revalidatePath(`/sites/${siteId}/settings`);
  return { ok: true, message: "Saved." };
}

export async function renameSite(
  _previous: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const siteId = String(formData.get("siteId") ?? "");
  await assertOwnership(siteId);

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { ok: false, message: "Name cannot be empty." };

  await prisma.site.update({ where: { id: siteId }, data: { name } });
  revalidatePath("/", "layout"); // the sidebar shows this name
  return { ok: true, message: "Renamed." };
}

/** Removes the site and everything hanging off it (GSC rows, audits, drafts). */
export async function deleteSite(formData: FormData): Promise<void> {
  const siteId = String(formData.get("siteId") ?? "");
  await assertOwnership(siteId);

  // Guard against a mis-click: the typed name must match exactly.
  const site = await prisma.site.findUnique({ where: { id: siteId }, select: { name: true } });
  const confirmation = String(formData.get("confirmName") ?? "").trim();
  if (!site || confirmation !== site.name) {
    throw new Error("Type the site name exactly to confirm deletion.");
  }

  await prisma.site.delete({ where: { id: siteId } });
  revalidatePath("/", "layout");
  redirect("/connections");
}
