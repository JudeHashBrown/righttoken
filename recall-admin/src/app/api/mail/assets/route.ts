import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin } from "@/modules/auth/csrf";
import {
  ForbiddenError,
  requireRequestPermission,
  UnauthorizedError
} from "@/modules/auth/guards";
import {
  createMailAsset,
  MailAssetServiceError
} from "@/modules/mail/assets/asset-service";

function errorResponse(error: unknown): NextResponse {
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
    const status =
      error.code === "MAIL_ASSET_STORAGE_UNAVAILABLE"
        ? 503
        : error.code === "MAIL_IMAGE_UNSUPPORTED"
        ? 415
        : error.code === "MAIL_IMAGE_TOO_LARGE"
          ? 413
          : 400;
    return NextResponse.json({ code: error.code }, { status });
  }
  return NextResponse.json(
    { code: "MAIL_ASSET_UPLOAD_FAILED" },
    { status: 500 }
  );
}

export async function POST(
  request: NextRequest
): Promise<NextResponse> {
  try {
    assertSameOrigin(request);
    const { member } = await requireRequestPermission(
      request,
      "mail:send-reviewed"
    );
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { code: "MAIL_ASSET_INVALID_FILE" },
        { status: 400 }
      );
    }
    const asset = await createMailAsset({
      actorId: member.id,
      file
    });
    return NextResponse.json(
      {
        asset: {
          id: asset.id,
          fileName: asset.fileName,
          contentType: asset.contentType,
          byteSize: asset.byteSize,
          width: asset.width,
          height: asset.height,
          previewUrl: `/api/mail/assets/${asset.id}`
        }
      },
      { status: 201 }
    );
  } catch (error) {
    return errorResponse(error);
  }
}
