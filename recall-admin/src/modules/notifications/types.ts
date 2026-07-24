export type NotificationChannel = "IN_APP" | "WECOM" | "EMAIL";

export type RedactedNotification = {
  title: string;
  summary: string;
  taskUrl: string;
};

export interface NotificationAdapter {
  channel: NotificationChannel;
  send(input: {
    recipient: string;
    title: string;
    summary: string;
    taskUrl: string;
  }): Promise<{ providerMessageId?: string }>;
}
