export function deriveTestDatabaseUrl(
  databaseUrl: string
): string;

export function assertSafeTestDatabaseUrl(
  databaseUrl: string
): {
  parsed: URL;
  databaseName: string;
};
