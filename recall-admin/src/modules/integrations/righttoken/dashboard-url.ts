type DashboardUrlEnvironment = {
  DEPLOYMENT_ENV: "local" | "production";
  RIGHTTOKEN_DASHBOARD_URL?: string;
};

export function resolveRightTokenDashboardUrl(
  env: DashboardUrlEnvironment
): string {
  if (env.RIGHTTOKEN_DASHBOARD_URL) {
    return env.RIGHTTOKEN_DASHBOARD_URL;
  }

  return env.DEPLOYMENT_ENV === "local"
    ? "http://127.0.0.1:3002/dashboard"
    : "https://righttoken.ai/dashboard";
}
