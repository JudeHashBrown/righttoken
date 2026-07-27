import { domainToASCII } from "node:url";

export type LocationRuleMatchType =
  | "EXACT_DOMAIN"
  | "DOMAIN_SUFFIX";

export type LocationRule = {
  id: string;
  enabled: boolean;
  priority: number;
  matchType: LocationRuleMatchType;
  pattern: string;
  countryCode: string;
};

export type LocationMatch = {
  ruleId: string;
  countryCode: string;
  source: "EMAIL_EXACT_DOMAIN" | "EMAIL_DOMAIN_SUFFIX";
};

export const PROHIBITED_COUNTRY_SUFFIXES = new Set([
  ".ai",
  ".cc",
  ".co",
  ".com",
  ".edu",
  ".fm",
  ".gov",
  ".io",
  ".me",
  ".mil",
  ".su",
  ".tv"
]);

function normalizeDomain(domain: string): string | null {
  const ascii = domainToASCII(domain.trim().toLowerCase());
  if (
    !ascii ||
    ascii.length > 253 ||
    ascii.startsWith(".") ||
    ascii.endsWith(".") ||
    ascii.includes("..")
  ) {
    return null;
  }
  const labels = ascii.split(".");
  if (
    labels.length < 2 ||
    labels.some(
      (label) =>
        !label ||
        label.length > 63 ||
        label.startsWith("-") ||
        label.endsWith("-") ||
        !/^[a-z0-9-]+$/.test(label)
    )
  ) {
    return null;
  }
  return ascii;
}

export function normalizeEmailDomain(email: string): string | null {
  const normalized = email.trim();
  const separator = normalized.lastIndexOf("@");
  if (
    separator <= 0 ||
    separator === normalized.length - 1 ||
    normalized.slice(0, separator).includes("@")
  ) {
    return null;
  }
  return normalizeDomain(normalized.slice(separator + 1));
}

export function normalizeLocationRulePattern(
  pattern: string,
  matchType: LocationRuleMatchType
): string | null {
  if (matchType === "EXACT_DOMAIN") {
    return normalizeDomain(pattern);
  }
  const withoutDot = pattern.trim().replace(/^\./, "");
  const domain = normalizeDomain(`example.${withoutDot}`);
  if (!domain) return null;
  const suffix = `.${domain.slice("example.".length)}`;
  return PROHIBITED_COUNTRY_SUFFIXES.has(suffix) ? null : suffix;
}

export function matchEmailLocation(
  domain: string,
  rules: LocationRule[]
): LocationMatch | null {
  const normalizedDomain = normalizeDomain(domain);
  if (!normalizedDomain) return null;

  const candidates = rules
    .filter((rule) => rule.enabled)
    .map((rule) => ({
      ...rule,
      normalizedPattern: normalizeLocationRulePattern(
        rule.pattern,
        rule.matchType
      )
    }))
    .filter(
      (
        rule
      ): rule is LocationRule & { normalizedPattern: string } =>
        Boolean(rule.normalizedPattern)
    )
    .sort((left, right) => {
      if (left.matchType !== right.matchType) {
        return left.matchType === "EXACT_DOMAIN" ? -1 : 1;
      }
      return left.priority - right.priority;
    });

  for (const rule of candidates) {
    const matched =
      rule.matchType === "EXACT_DOMAIN"
        ? normalizedDomain === rule.normalizedPattern
        : normalizedDomain.endsWith(rule.normalizedPattern);
    if (!matched) continue;
    return {
      ruleId: rule.id,
      countryCode: rule.countryCode.toUpperCase(),
      source:
        rule.matchType === "EXACT_DOMAIN"
          ? "EMAIL_EXACT_DOMAIN"
          : "EMAIL_DOMAIN_SUFFIX"
    };
  }
  return null;
}

