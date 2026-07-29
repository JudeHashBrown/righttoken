type OperationalLocation = {
  countryCode: string | null;
  region: string | null;
};

type LocationDisplay = {
  primary: string;
  secondary: string;
};

const regionNames = new Intl.DisplayNames(["zh-CN"], {
  type: "region"
});

const locationSourceCopy: Record<string, string> = {
  EMAIL_EXACT_DOMAIN: "邮箱服务商",
  EMAIL_DOMAIN_SUFFIX: "邮箱国家或地区后缀",
  IP_GEOIP: "注册 IP 所在地",
  IP_RIR: "注册 IP 所在地",
  IP_EVENT: "主站注册信息",
  INVALID_REGISTRATION_DATA: "注册来源信息不足"
};

function countryName(countryCode: string): string {
  const normalized = countryCode.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(normalized)) {
    return countryCode;
  }
  return regionNames.of(normalized) ?? normalized;
}

export function operationalLocationDisplay(
  location: OperationalLocation
): LocationDisplay {
  const countryCode = location.countryCode?.trim();
  const region = location.region?.trim();
  if (countryCode) {
    return {
      primary: countryName(countryCode),
      secondary: region || "国家已确认"
    };
  }
  if (region) {
    return {
      primary: region,
      secondary: "国家信息待补全"
    };
  }
  return {
    primary: "未识别",
    secondary: "注册来源信息不足"
  };
}

export function operationalLocationLabel(
  location: OperationalLocation
): string {
  const display = operationalLocationDisplay(location);
  return display.secondary === "国家已确认"
    ? display.primary
    : `${display.primary} · ${display.secondary}`;
}

export function paymentStatusLabel(
  status: string,
  totalPaidMinor: number
): string {
  if (status === "PAID" || totalPaidMinor > 0) {
    return "已支付";
  }
  if (status === "NONE") {
    return "未产生付费记录";
  }
  return "支付状态待同步";
}

export function locationSourceLabel(source: string): string {
  return locationSourceCopy[source] ?? "注册来源信息";
}

export function userSourceLabel(source: string | null): string {
  void source;
  return "RightToken 主站";
}

export function ownerAssignmentLabel(
  mode: "AUTO" | "MANUAL"
): string {
  return mode === "MANUAL" ? "人工分配" : "系统分配";
}

export function ownerDisplayName(
  owner: { displayName: string } | null
): string {
  return owner?.displayName || "主管理员暂管";
}
