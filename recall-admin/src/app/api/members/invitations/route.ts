import { NextRequest, NextResponse } from "next/server";

function retiredInvitationResponse(): NextResponse {
  return NextResponse.json(
    {
      code: "RIGHTTOKEN_MEMBER_ACCESS_REQUIRED",
      message:
        "Members must be authorized from synchronized RightToken users."
    },
    { status: 410 }
  );
}

export async function POST(
  _request: NextRequest
): Promise<NextResponse> {
  return retiredInvitationResponse();
}

export async function PUT(
  _request: NextRequest
): Promise<NextResponse> {
  return retiredInvitationResponse();
}
