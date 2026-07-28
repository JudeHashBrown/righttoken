import { z } from "zod";
import {
  conditionOperators,
  segmentFieldKeys,
  validateClauseForField,
  type SegmentClauseInput
} from "@/modules/segmentation/field-registry";

export const segmentCodes = ["A", "B", "C", "D", "E", "F", "G"] as const;
export const taskPriorities = ["URGENT", "IMPORTANT", "NORMAL"] as const;

const clauseSchema = z
  .object({
    field: z.enum(segmentFieldKeys),
    operator: z.enum(conditionOperators),
    value: z.union([
      z.boolean(),
      z.number(),
      z.string(),
      z.array(z.string()).max(100),
      z.tuple([z.number(), z.number()])
    ]).optional(),
    unit: z.enum(["minutes", "hours", "days"]).optional()
  })
  .strict()
  .transform((value, context) => {
    try {
      return validateClauseForField(value as SegmentClauseInput);
    } catch (error) {
      context.addIssue({
        code: "custom",
        message:
          error instanceof Error ? error.message : "invalid segment condition"
      });
      return z.NEVER;
    }
  });

const branchSchema = z
  .object({
    clauses: z.array(clauseSchema).min(1).max(20)
  })
  .strict();

const taskPolicySchema = z
  .object({
    enabled: z.boolean(),
    delayMinutes: z.number().int().min(0).max(525_600),
    priority: z.enum(taskPriorities),
    dueMinutesAfterCreation: z.number().int().min(1).max(525_600),
    templateKey: z.string().trim().min(1).max(120).nullable()
  })
  .strict();

const groupSchema = z
  .object({
    code: z.enum(segmentCodes),
    annotation: z.string().trim().min(1).max(500),
    enabled: z.boolean(),
    order: z.number().int().min(0).max(6),
    branches: z.array(branchSchema).max(10),
    taskPolicy: taskPolicySchema
  })
  .strict();

export const segmentRuleSetSchema = z
  .object({
    schemaVersion: z.literal(2),
    groups: z.array(groupSchema).length(7),
    changeSummary: z.string().trim().max(500).default("")
  })
  .strict()
  .superRefine((ruleSet, context) => {
    const codes = ruleSet.groups.map((group) => group.code);
    if (new Set(codes).size !== segmentCodes.length) {
      context.addIssue({
        code: "custom",
        path: ["groups"],
        message: "each segment code must appear exactly once"
      });
    }
    if (
      segmentCodes.some((code) => !codes.includes(code)) ||
      codes[0] !== "F" ||
      codes.at(-1) !== "G"
    ) {
      context.addIssue({
        code: "custom",
        path: ["groups"],
        message: "F must be first and G must be the final fallback"
      });
    }

    ruleSet.groups.forEach((group, index) => {
      if (group.order !== index) {
        context.addIssue({
          code: "custom",
          path: ["groups", index, "order"],
          message: "group order must match its list position"
        });
      }
      if (
        group.code !== "G" &&
        group.enabled &&
        group.branches.length === 0
      ) {
        context.addIssue({
          code: "custom",
          path: ["groups", index, "branches"],
          message: "enabled groups require at least one condition branch"
        });
      }
      if (
        group.code === "F" &&
        (!group.enabled ||
          !group.taskPolicy.enabled ||
          group.taskPolicy.delayMinutes !== 0 ||
          group.taskPolicy.priority !== "URGENT")
      ) {
        context.addIssue({
          code: "custom",
          path: ["groups", index, "taskPolicy"],
          message: "F must remain enabled, immediate and urgent"
        });
      }
      if (
        group.code === "G" &&
        (group.branches.length !== 0 || group.taskPolicy.enabled)
      ) {
        context.addIssue({
          code: "custom",
          path: ["groups", index],
          message: "G must remain an unconditional fallback without tasks"
        });
      }
    });
  });

export type SegmentRuleSet = z.infer<typeof segmentRuleSetSchema>;
export type SegmentGroupRule = SegmentRuleSet["groups"][number];
export type SegmentBranch = SegmentGroupRule["branches"][number];
export type SegmentClause = SegmentBranch["clauses"][number];
export type SegmentTaskPolicy = SegmentGroupRule["taskPolicy"];
