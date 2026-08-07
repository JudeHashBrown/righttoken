export type BGroupProgress = {
  mailComplete: boolean;
  contactComplete: boolean;
  couponComplete: boolean;
  maintenanceComplete: boolean;
};

export type BGroupQueueUser = {
  id: string;
  registrationSequence: string;
  email: string;
  countryCode: string | null;
  checkoutStartedAt: Date | null;
};

export type BGroupMaintenanceItem = {
  id: string;
  body: string;
  source: "MANUAL" | "MAIL";
  occurredAt: Date;
  effective: boolean;
};

export type BGroupSelectedUser = BGroupQueueUser & {
  episodeStartedAt: Date;
  progress: BGroupProgress;
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
  maintenanceRecords: BGroupMaintenanceItem[];
};

export type BGroupWorkspaceData = {
  users: BGroupQueueUser[];
  selectedUser: BGroupSelectedUser | null;
};
