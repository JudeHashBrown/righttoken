CREATE UNIQUE INDEX "AutomationRuleVersion_one_active_per_kind"
ON "AutomationRuleVersion" ("kind")
WHERE "active" = true;
