export type UserOwnerErrorCode =
  | "FORBIDDEN"
  | "USER_NOT_FOUND"
  | "TARGET_OWNER_INACTIVE"
  | "TARGET_OWNER_INVALID"
  | "REASON_REQUIRED"
  | "OWNER_ALREADY_AUTOMATIC";

export class UserOwnerError extends Error {
  constructor(readonly code: UserOwnerErrorCode) {
    super(code);
    this.name = "UserOwnerError";
  }
}
