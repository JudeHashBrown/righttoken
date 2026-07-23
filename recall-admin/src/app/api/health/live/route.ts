import { NextResponse } from "next/server";

export function GET(): NextResponse {
  return NextResponse.json(
    {
      status: "ok",
      checkedAt: new Date().toISOString()
    },
    {
      headers: {
        "Cache-Control": "no-store"
      }
    }
  );
}
