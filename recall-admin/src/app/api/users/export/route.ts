import { requireRequestPermission } from "@/modules/auth/guards";
import { createUserExportHandler } from "@/modules/users/export-handler";
import { exportUsersCsv } from "@/modules/users/export-users";

export const GET = createUserExportHandler({
  async requireExportPermission(request) {
    const { member } = await requireRequestPermission(
      request,
      "users:export"
    );
    return { memberId: member.id };
  },
  exportCsv: exportUsersCsv
});
