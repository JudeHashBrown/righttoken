import { isDevelopmentAuthMode } from "@/modules/auth/development-mode";

export class InvalidOriginError extends Error {
  constructor() {
    super("request origin does not match the application origin");
    this.name = "InvalidOriginError";
  }
}

export function assertSameOrigin(
  request: Request,
  appUrl = process.env.APP_URL
): void {
  if (isDevelopmentAuthMode()) {
    return;
  }

  const origin = request.headers.get("origin");
  if (!origin || !appUrl) {
    throw new InvalidOriginError();
  }

  try {
    if (new URL(origin).origin !== new URL(appUrl).origin) {
      throw new InvalidOriginError();
    }
  } catch (error) {
    if (error instanceof InvalidOriginError) {
      throw error;
    }
    throw new InvalidOriginError();
  }
}
