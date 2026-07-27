export type GeoIpLocation = {
  countryCode: string | null;
  region: string | null;
  source?: "IP_GEOIP" | "IP_RIR" | "IP_EVENT";
};

export interface GeoIpResolver {
  resolve(ip: string): Promise<GeoIpLocation | null>;
}
