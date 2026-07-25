import { NextResponse } from "next/server";
import { getApiUser } from "@/lib/auth";
import {
  NoGoogleConnectionError,
  getGoogleProperties,
} from "@/lib/integrations/google/properties";

/** Every GSC property the connected Google account can read, plus bind status. */
export async function GET() {
  const user = await getApiUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    return NextResponse.json(await getGoogleProperties(user.id));
  } catch (error) {
    if (error instanceof NoGoogleConnectionError) {
      return NextResponse.json({ error: "no_google_connection" }, { status: 404 });
    }
    console.error("[google/properties]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "failed" },
      { status: 502 },
    );
  }
}
