export type UserAssignmentErrorCode =
  | "FORBIDDEN"
  | "USER_NOT_FOUND"
  | "TARGET_OWNER_INACTIVE"
  | "TARGET_OWNER_INVALID"
  | "ASSIGNMENT_REQUIRED"
  | "COUNTRY_INVALID"
  | "REGION_WITHOUT_COUNTRY"
  | "REASON_REQUIRED";

export class UserAssignmentError extends Error {
  constructor(readonly code: UserAssignmentErrorCode) {
    super(code);
    this.name = "UserAssignmentError";
  }
}
