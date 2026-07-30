import type { SegmentCode } from "@/generated/prisma/client";

export type AssignmentCondition = {
  countryCodes?: string[];
  regionIncludes?: string[];
  ipCidrs?: string[];
  languages?: string[];
  timezones?: string[];
  sources?: string[];
  segments?: SegmentCode[];
  minTotalPaidMinor?: number;
  maxTotalPaidMinor?: number;
};

export type AssignmentRuleInput = {
  id?: string;
  name: string;
  enabled: boolean;
  memberTerritoryManaged?: boolean;
  priority: number;
  conditions: AssignmentCondition;
  assigneeId: string | null;
  fallbackAssigneeId: string | null;
  poolKey: string | null;
  workloadLimit: number | null;
  effectiveFrom: Date | null;
  effectiveTo: Date | null;
};

export type AssignmentUserContext = {
  userId: string;
  countryCode: string | null;
  region: string | null;
  registrationIp: string | null;
  language: string | null;
  timezone: string | null;
  source: string | null;
  segment: SegmentCode;
  totalPaidMinor: number;
};

export type OperatorWorkload = {
  active: boolean;
  withinWorkHours: boolean;
  openTaskCount: number;
};

export type AssignmentWorkload = Record<string, OperatorWorkload>;

export type RuleAssignmentDecision = {
  assigneeId: string | null;
  poolKey: string;
  matchedRuleId: string | null;
  matchedRuleName: string | null;
  matchedRulePriority: number | null;
  usedFallback: boolean;
  matchedConditions: string[];
  assignmentReason: string;
};

export type AssignmentDecision = RuleAssignmentDecision & {
  assignmentMode: "AUTO" | "MANUAL";
  skippedManual: boolean;
};
