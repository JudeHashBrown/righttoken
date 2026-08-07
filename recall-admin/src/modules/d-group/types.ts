export type GuidanceCategory = "GROUP_GUIDANCE" | "TUTORIAL" | "PERSONALIZED_PROMOTION";

export type DGroupQueueUser = {
  id: string;
  registrationSequence: string;
  email: string;
  countryCode: string | null;
  displayName: string | null;
};

export type DGroupSelectedUser = DGroupQueueUser & {
  contact: {
    wechatId: string | null;
    telegramHandle: string | null;
  } | null;
  inquiryMail: Array<{
    id: string;
    subject: string;
    status: "DRAFT" | "SENT" | "BOUNCED" | "RECEIVED" | "FAILED" | "UNMATCHED";
    occurredAt: Date;
  }>;
  reasons: Array<{
    id: string;
    body: string;
    createdAt: Date;
    actorName: string;
  }>;
  guidanceRecords: Array<{
    id: string;
    category: GuidanceCategory;
    body: string;
    createdAt: Date;
    actorName: string;
  }>;
  maintenanceRecords: Array<{
    id: string;
    body: string;
    source: "MANUAL" | "MAIL";
    occurredAt: Date;
    effective: boolean;
  }>;
};

export type DGroupWorkspaceData = {
  users: DGroupQueueUser[];
  selectedUser: DGroupSelectedUser | null;
};
