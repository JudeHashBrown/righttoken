-- CreateEnum
CREATE TYPE "LocationAttributionSource" AS ENUM (
  'EMAIL_EXACT_DOMAIN',
  'EMAIL_DOMAIN_SUFFIX',
  'IP_GEOIP',
  'IP_RIR',
  'IP_EVENT',
  'INVALID_REGISTRATION_DATA'
);

-- CreateEnum
CREATE TYPE "LocationRuleMatchType" AS ENUM (
  'EXACT_DOMAIN',
  'DOMAIN_SUFFIX'
);

-- CreateTable
CREATE TABLE "LocationAttributionRule" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "priority" INTEGER NOT NULL,
  "matchType" "LocationRuleMatchType" NOT NULL,
  "pattern" TEXT NOT NULL,
  "countryCode" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "LocationAttributionRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LocationRecalculationRun" (
  "id" TEXT NOT NULL,
  "requestedById" TEXT NOT NULL,
  "status" "RecalculationStatus" NOT NULL DEFAULT 'PENDING',
  "totalUsers" INTEGER NOT NULL DEFAULT 0,
  "processedUsers" INTEGER NOT NULL DEFAULT 0,
  "succeededUsers" INTEGER NOT NULL DEFAULT 0,
  "failedUsers" INTEGER NOT NULL DEFAULT 0,
  "countryChanges" INTEGER NOT NULL DEFAULT 0,
  "reassignedTasks" INTEGER NOT NULL DEFAULT 0,
  "lastProcessedUserId" TEXT,
  "upperBoundUserId" TEXT,
  "ruleSnapshot" JSONB NOT NULL,
  "errorSummary" JSONB,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "LocationRecalculationRun_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "UserProfile"
  ADD COLUMN "ipCountryCode" TEXT,
  ADD COLUMN "ipRegion" TEXT,
  ADD COLUMN "locationSource" "LocationAttributionSource",
  ADD COLUMN "locationRuleId" TEXT,
  ADD COLUMN "locationEvaluatedAt" TIMESTAMP(3);

-- Preserve the existing location as the initial IP evidence for old users.
UPDATE "UserProfile"
SET
  "ipCountryCode" = "countryCode",
  "ipRegion" = "region",
  "locationSource" = CASE
    WHEN "countryCode" IS NOT NULL THEN 'IP_EVENT'::"LocationAttributionSource"
    ELSE 'INVALID_REGISTRATION_DATA'::"LocationAttributionSource"
  END,
  "locationEvaluatedAt" = CURRENT_TIMESTAMP;

-- CreateIndex
CREATE UNIQUE INDEX "LocationAttributionRule_priority_key"
  ON "LocationAttributionRule"("priority");

-- CreateIndex
CREATE UNIQUE INDEX "LocationAttributionRule_matchType_pattern_key"
  ON "LocationAttributionRule"("matchType", "pattern");

-- CreateIndex
CREATE INDEX "LocationAttributionRule_enabled_matchType_priority_idx"
  ON "LocationAttributionRule"("enabled", "matchType", "priority");

-- CreateIndex
CREATE INDEX "UserProfile_ipCountryCode_ipRegion_idx"
  ON "UserProfile"("ipCountryCode", "ipRegion");

-- CreateIndex
CREATE INDEX "UserProfile_locationRuleId_idx"
  ON "UserProfile"("locationRuleId");

-- CreateIndex
CREATE INDEX "LocationRecalculationRun_status_createdAt_idx"
  ON "LocationRecalculationRun"("status", "createdAt");

-- CreateIndex
CREATE INDEX "LocationRecalculationRun_requestedById_createdAt_idx"
  ON "LocationRecalculationRun"("requestedById", "createdAt");

-- Seed the initial high-confidence email attribution rules.
INSERT INTO "LocationAttributionRule"
  ("id", "name", "enabled", "priority", "matchType", "pattern", "countryCode", "createdAt", "updatedAt")
VALUES
  ('location-default-001', 'QQ 邮箱', true, 1, 'EXACT_DOMAIN', 'qq.com', 'CN', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('location-default-002', 'QQ 会员邮箱', true, 2, 'EXACT_DOMAIN', 'vip.qq.com', 'CN', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('location-default-003', 'Foxmail', true, 3, 'EXACT_DOMAIN', 'foxmail.com', 'CN', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('location-default-004', '网易 163 邮箱', true, 4, 'EXACT_DOMAIN', '163.com', 'CN', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('location-default-005', '网易 126 邮箱', true, 5, 'EXACT_DOMAIN', '126.com', 'CN', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('location-default-006', '网易 Yeah 邮箱', true, 6, 'EXACT_DOMAIN', 'yeah.net', 'CN', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('location-default-007', '新浪邮箱', true, 7, 'EXACT_DOMAIN', 'sina.com', 'CN', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('location-default-008', '新浪中国邮箱', true, 8, 'EXACT_DOMAIN', 'sina.cn', 'CN', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('location-default-009', '搜狐邮箱', true, 9, 'EXACT_DOMAIN', 'sohu.com', 'CN', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('location-default-010', 'Mail.ru', true, 10, 'EXACT_DOMAIN', 'mail.ru', 'RU', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('location-default-011', 'Inbox.ru', true, 11, 'EXACT_DOMAIN', 'inbox.ru', 'RU', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('location-default-012', 'List.ru', true, 12, 'EXACT_DOMAIN', 'list.ru', 'RU', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('location-default-013', 'BK.ru', true, 13, 'EXACT_DOMAIN', 'bk.ru', 'RU', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('location-default-014', 'Internet.ru', true, 14, 'EXACT_DOMAIN', 'internet.ru', 'RU', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('location-default-015', 'Yandex Russia', true, 15, 'EXACT_DOMAIN', 'yandex.ru', 'RU', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('location-default-016', 'Ya.ru', true, 16, 'EXACT_DOMAIN', 'ya.ru', 'RU', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('location-default-017', 'Rambler', true, 17, 'EXACT_DOMAIN', 'rambler.ru', 'RU', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('location-default-018', 'Yandex Belarus', true, 18, 'EXACT_DOMAIN', 'yandex.by', 'BY', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('location-default-019', 'Mail.by', true, 19, 'EXACT_DOMAIN', 'mail.by', 'BY', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('location-default-020', 'Mail.kz', true, 20, 'EXACT_DOMAIN', 'mail.kz', 'KZ', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('location-default-021', 'Yandex Kazakhstan', true, 21, 'EXACT_DOMAIN', 'yandex.kz', 'KZ', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('location-default-022', 'uMail Uzbekistan', true, 22, 'EXACT_DOMAIN', 'umail.uz', 'UZ', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('location-default-023', 'Kmail Kyrgyzstan', true, 23, 'EXACT_DOMAIN', 'kmail.kg', 'KG', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('location-default-024', 'CN 国家域名', true, 24, 'DOMAIN_SUFFIX', '.cn', 'CN', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('location-default-025', '中国域名', true, 25, 'DOMAIN_SUFFIX', '.xn--fiqs8s', 'CN', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('location-default-026', '中國域名', true, 26, 'DOMAIN_SUFFIX', '.xn--fiqz9s', 'CN', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('location-default-027', 'RU 国家域名', true, 27, 'DOMAIN_SUFFIX', '.ru', 'RU', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('location-default-028', '俄罗斯国际化域名', true, 28, 'DOMAIN_SUFFIX', '.xn--p1ai', 'RU', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('location-default-029', 'BY 国家域名', true, 29, 'DOMAIN_SUFFIX', '.by', 'BY', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('location-default-030', '白俄罗斯国际化域名', true, 30, 'DOMAIN_SUFFIX', '.xn--90ais', 'BY', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('location-default-031', 'KZ 国家域名', true, 31, 'DOMAIN_SUFFIX', '.kz', 'KZ', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('location-default-032', 'KG 国家域名', true, 32, 'DOMAIN_SUFFIX', '.kg', 'KG', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('location-default-033', 'UZ 国家域名', true, 33, 'DOMAIN_SUFFIX', '.uz', 'UZ', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('location-default-034', 'TJ 国家域名', true, 34, 'DOMAIN_SUFFIX', '.tj', 'TJ', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('location-default-035', 'TM 国家域名', true, 35, 'DOMAIN_SUFFIX', '.tm', 'TM', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('location-default-036', 'AM 国家域名', true, 36, 'DOMAIN_SUFFIX', '.am', 'AM', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('location-default-037', 'AZ 国家域名', true, 37, 'DOMAIN_SUFFIX', '.az', 'AZ', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('location-default-038', 'GE 国家域名', true, 38, 'DOMAIN_SUFFIX', '.ge', 'GE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('location-default-039', 'US 国家域名', true, 39, 'DOMAIN_SUFFIX', '.us', 'US', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('location-default-040', 'GB 国家域名', true, 40, 'DOMAIN_SUFFIX', '.uk', 'GB', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('location-default-041', 'IE 国家域名', true, 41, 'DOMAIN_SUFFIX', '.ie', 'IE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('location-default-042', 'DE 国家域名', true, 42, 'DOMAIN_SUFFIX', '.de', 'DE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('location-default-043', 'AT 国家域名', true, 43, 'DOMAIN_SUFFIX', '.at', 'AT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('location-default-044', 'CH 国家域名', true, 44, 'DOMAIN_SUFFIX', '.ch', 'CH', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('location-default-045', 'LI 国家域名', true, 45, 'DOMAIN_SUFFIX', '.li', 'LI', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('location-default-046', 'FR 国家域名', true, 46, 'DOMAIN_SUFFIX', '.fr', 'FR', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('location-default-047', 'BE 国家域名', true, 47, 'DOMAIN_SUFFIX', '.be', 'BE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('location-default-048', 'NL 国家域名', true, 48, 'DOMAIN_SUFFIX', '.nl', 'NL', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('location-default-049', 'LU 国家域名', true, 49, 'DOMAIN_SUFFIX', '.lu', 'LU', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('location-default-050', 'IT 国家域名', true, 50, 'DOMAIN_SUFFIX', '.it', 'IT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('location-default-051', 'ES 国家域名', true, 51, 'DOMAIN_SUFFIX', '.es', 'ES', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('location-default-052', 'PT 国家域名', true, 52, 'DOMAIN_SUFFIX', '.pt', 'PT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('location-default-053', 'GR 国家域名', true, 53, 'DOMAIN_SUFFIX', '.gr', 'GR', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('location-default-054', 'MT 国家域名', true, 54, 'DOMAIN_SUFFIX', '.mt', 'MT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('location-default-055', 'CY 国家域名', true, 55, 'DOMAIN_SUFFIX', '.cy', 'CY', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('location-default-056', 'SE 国家域名', true, 56, 'DOMAIN_SUFFIX', '.se', 'SE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('location-default-057', 'NO 国家域名', true, 57, 'DOMAIN_SUFFIX', '.no', 'NO', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('location-default-058', 'DK 国家域名', true, 58, 'DOMAIN_SUFFIX', '.dk', 'DK', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('location-default-059', 'FI 国家域名', true, 59, 'DOMAIN_SUFFIX', '.fi', 'FI', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('location-default-060', 'IS 国家域名', true, 60, 'DOMAIN_SUFFIX', '.is', 'IS', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('location-default-061', 'PL 国家域名', true, 61, 'DOMAIN_SUFFIX', '.pl', 'PL', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('location-default-062', 'CZ 国家域名', true, 62, 'DOMAIN_SUFFIX', '.cz', 'CZ', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('location-default-063', 'SK 国家域名', true, 63, 'DOMAIN_SUFFIX', '.sk', 'SK', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('location-default-064', 'HU 国家域名', true, 64, 'DOMAIN_SUFFIX', '.hu', 'HU', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('location-default-065', 'RO 国家域名', true, 65, 'DOMAIN_SUFFIX', '.ro', 'RO', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('location-default-066', 'BG 国家域名', true, 66, 'DOMAIN_SUFFIX', '.bg', 'BG', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('location-default-067', 'SI 国家域名', true, 67, 'DOMAIN_SUFFIX', '.si', 'SI', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('location-default-068', 'HR 国家域名', true, 68, 'DOMAIN_SUFFIX', '.hr', 'HR', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('location-default-069', 'RS 国家域名', true, 69, 'DOMAIN_SUFFIX', '.rs', 'RS', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('location-default-070', 'BA 国家域名', true, 70, 'DOMAIN_SUFFIX', '.ba', 'BA', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('location-default-071', 'MK 国家域名', true, 71, 'DOMAIN_SUFFIX', '.mk', 'MK', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('location-default-072', 'AL 国家域名', true, 72, 'DOMAIN_SUFFIX', '.al', 'AL', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('location-default-073', 'EE 国家域名', true, 73, 'DOMAIN_SUFFIX', '.ee', 'EE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('location-default-074', 'LV 国家域名', true, 74, 'DOMAIN_SUFFIX', '.lv', 'LV', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('location-default-075', 'LT 国家域名', true, 75, 'DOMAIN_SUFFIX', '.lt', 'LT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('location-default-076', 'UA 国家域名', true, 76, 'DOMAIN_SUFFIX', '.ua', 'UA', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('location-default-077', 'MD 国家域名', true, 77, 'DOMAIN_SUFFIX', '.md', 'MD', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('location-default-078', '欧洲区域域名', true, 78, 'DOMAIN_SUFFIX', '.eu', 'EU', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- AddForeignKey
ALTER TABLE "UserProfile"
  ADD CONSTRAINT "UserProfile_locationRuleId_fkey"
  FOREIGN KEY ("locationRuleId")
  REFERENCES "LocationAttributionRule"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocationRecalculationRun"
  ADD CONSTRAINT "LocationRecalculationRun_requestedById_fkey"
  FOREIGN KEY ("requestedById")
  REFERENCES "Member"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;
