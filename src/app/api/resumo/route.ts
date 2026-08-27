import { NextResponse } from "next/server";
import { resumo } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await resumo(), {
    headers: { "Cache-Control": "no-store" },
  });
}
