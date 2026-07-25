import { NextResponse } from "next/server";
import { appUrl } from "@/lib/env";
import { destroySession } from "@/lib/session";

export async function POST() {
  await destroySession();
  return NextResponse.redirect(`${appUrl()}/login`, { status: 303 });
}
