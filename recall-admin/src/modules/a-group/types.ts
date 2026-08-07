export type AGroupProgress = {
  mailComplete: boolean;
  contactComplete: boolean;
  couponComplete: boolean;
  maintenanceComplete: boolean;
};

export type AGroupQueueUser = {
  id: string;
  registrationSequence: string;
  email: string;
  countryCode: string | null;
  registeredAt: Date;
};

export type AGroupMaintenanceItem = {
  id: string;
  body: string;
  source: "MANUAL" | "MAIL";
  occurredAt: Date;
  effective: boolean;
};

export type AGroupSelectedUser = AGroupQueueUser & {
  episodeStartedAt: Date;
  progress: AGroupProgress;
  mailStats: {
    sent: number;
    received: number;
    bounced: number;
  };
  contact: {
    wechatId: string | null;
    telegramHandle: string | null;
    phoneCountryCode: string | null;
    phoneNumber: string | null;
  } | null;
  coupon: {
    status: "PENDING" | "SUCCEEDED" | "FAILED";
    grantedAt: Date | null;
    failureCode: string | null;
  } | null;
  maintenanceRecords: AGroupMaintenanceItem[];
};

export type AGroupWorkspaceData = {
  users: AGroupQueueUser[];
  selectedUser: AGroupSelectedUser | null;
};
