-- Prevent duplicate notification intents when concurrent task handlers run.
CREATE UNIQUE INDEX "NotificationIntent_taskId_channel_recipient_key"
ON "NotificationIntent"("taskId", "channel", "recipient");
