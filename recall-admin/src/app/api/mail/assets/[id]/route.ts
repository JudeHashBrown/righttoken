import { NextRequest, NextResponse } from "next/server";
import {
  ForbiddenError,
  requireRequestPermission,
  UnauthorizedError
} from "@/modules/auth/guards";
import {
  MailAssetServiceError,
  readMailAsset
} from "@/modules/mail/assets/asset-service";

function safeAsciiFileName(value: string): string {
  return (
    value
      .replaceAll(/[^A-Za-z0-9._-]/g, "_")
      .replaceAll('"', "_")
      .slice(0, 180) || "image"
  );
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const [{ member }, { id }] = await Promise.all([
      requireRequestPermission(request, "mail:send-reviewed"),
      context.params
    ]);
    const { asset, bytes } = await readMailAsset({
      actor: { id: member.id, role: member.role },
      assetId: id
    });
    const disposition = request.nextUrl.searchParams.has("download")
      ? "attachment"
      : "inline";
    const asciiName = safeAsciiFileName(asset.fileName);
    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "content-type": asset.contentType,
        "content-length": String(bytes.length),
        "x-content-type-options": "nosniff",
        "cache-control": "private, max-age=3600",
        "content-disposition": `${disposition}; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(
          asset.fileName
        )}`
      }
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json(
        { code: "UNAUTHORIZED" },
        { status: 401 }
      );
    }
    if (error instanceof ForbiddenError) {
      return NextResponse.json(
        { code: "FORBIDDEN" },
        { status: 403 }
      );
    }
    if (error instanceof MailAssetServiceError) {
      return NextResponse.json(
        { code: error.code },
        {
          status:
            error.code === "MAIL_ASSET_NOT_FOUND" ? 404 : 410
        }
      );
    }
    return NextResponse.json(
      { code: "MAIL_ASSET_READ_FAILED" },
      { status: 500 }
    );
  }
}
