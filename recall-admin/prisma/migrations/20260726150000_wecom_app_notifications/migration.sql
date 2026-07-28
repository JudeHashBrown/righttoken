ALTER TABLE "Member"
ADD COLUMN "wecomUserId" TEXT;

CREATE UNIQUE INDEX "Member_wecomUserId_key"
ON "Member"("wecomUserId");

CREATE TYPE "NotificationChannel_new" AS ENUM (
    'IN_APP',
    'WECOM_APP',
    'WECOM_ROBOT',
    'EMAIL'
);

ALTER TABLE "NotificationIntent"
ALTER COLUMN "channel" TYPE "NotificationChannel_new"
USING (
    CASE "channel"::TEXT
        WHEN 'WECOM' THEN 'WECOM_ROBOT'
        ELSE "channel"::TEXT
    END
)::"NotificationChannel_new";

DROP TYPE "NotificationChannel";

ALTER TYPE "NotificationChannel_new"
RENAME TO "NotificationChannel";
