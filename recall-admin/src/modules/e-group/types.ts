export type EGroupQueueUser = {
  id: string;
  registrationSequence: string;
  email: string;
  countryCode: string | null;
  displayName: string | null;
};

export type EGroupRechargeItem = {
  id: string;
  occurredAt: Date;
  amountMinor: number;
  currency: string;
  giftDetail: string;
};

export type EGroupMaintenanceItem = {
  id: string;
  body: string;
  source: "MANUAL" | "MAIL";
  occurredAt: Date;
  effective: boolean;
};

export type EGroupSelectedUser = EGroupQueueUser & {
  totalPaidMinor: number;
  balanceCurrency: string;
  contact: {
    wechatId: string | null;
    telegramHandle: string | null;
  } | null;
  rechargeHistory: EGroupRechargeItem[];
  outreach: {
    mail: Array<{
      id: string;
      subject: string;
      status: "DRAFT" | "SENT" | "BOUNCED" | "RECEIVED" | "FAILED" | "UNMATCHED";
      occurredAt: Date;
    }>;
    wechat: Array<{
      id: string;
      reason: string | null;
      body: string;
      occurredAt: Date;
      actorName: string;
      asset: {
        id: string;
        fileName: string;
        width: number;
        height: number;
      } | null;
    }>;
  };
  latestCarePlan: {
    id: string;
    body: string;
    createdAt: Date;
    authorName: string;
  } | null;
  maintenanceRecords: EGroupMaintenanceItem[];
};

export type EGroupWorkspaceData = {
  users: EGroupQueueUser[];
  selectedUser: EGroupSelectedUser | null;
};
