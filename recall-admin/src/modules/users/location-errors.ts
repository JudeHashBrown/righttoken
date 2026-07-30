export type UserLocationErrorCode =
  | "FORBIDDEN"
  | "USER_NOT_FOUND"
  | "COUNTRY_REQUIRED"
  | "COUNTRY_INVALID"
  | "REASON_REQUIRED"
  | "LOCATION_ALREADY_AUTOMATIC";

export class UserLocationError extends Error {
  constructor(readonly code: UserLocationErrorCode) {
    super(code);
    this.name = "UserLocationError";
  }
}
