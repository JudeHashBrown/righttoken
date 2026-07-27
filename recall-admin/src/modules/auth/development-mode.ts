export function isDevelopmentAuthMode(): boolean {
  return (
    process.env.AUTH_MODE === "development" &&
    process.env.DEPLOYMENT_ENV === "local"
  );
}
