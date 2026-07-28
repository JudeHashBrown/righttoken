import { NextRequest, NextResponse } from "next/server";
import {
  ForbiddenError,
  UnauthorizedError
} from "@/modules/auth/authorization";

export type UserExportHandlerDependencies = {
  requireExportPermission(
    request: NextRequest
  ): Promise<{ memberId: string }>;
  exportCsv(memberId: string): Promise<string>;
};

export function createUserExportHandler(
  dependencies: UserExportHandlerDependencies
) {
  return async function userExportHandler(
    request: NextRequest
  ): Promise<NextResponse> {
    try {
      const context =
        await dependencies.requireExportPermission(request);
      const csv = await dependencies.exportCsv(context.memberId);
      const date = new Date().toISOString().slice(0, 10);
      return new NextResponse(csv, {
        status: 200,
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition":
            `attachment; filename="righttoken-users-${date}.csv"`,
          "cache-control": "no-store"
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
      return NextResponse.json(
        { code: "USER_EXPORT_FAILED" },
        { status: 500 }
      );
    }
  };
}
