export function isValidGeoIpHttpUrl(value: string): boolean {
  if (!value.includes("{ip}")) return false;

  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
