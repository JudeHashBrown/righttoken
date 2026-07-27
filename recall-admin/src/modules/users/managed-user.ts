import type { RightTokenUserFacts } from "@/modules/users/righttoken-facts";

export type { RightTokenUserFacts } from "@/modules/users/righttoken-facts";

type OperationalUserState = {
  id: string;
  externalUserId: string;
  currentSegment: string;
  [key: string]: unknown;
};

export type ManagedUser<
  TState extends OperationalUserState = OperationalUserState
> = TState &
  RightTokenUserFacts & {
    paymentStatus: "PAID" | "NONE";
    registrationIp: string | null;
  };

export function mergeManagedUser<TState extends OperationalUserState>(
  state: TState,
  facts: RightTokenUserFacts
): ManagedUser<TState>;
export function mergeManagedUser(
  state: null,
  facts: RightTokenUserFacts
): ManagedUser<OperationalUserState>;
export function mergeManagedUser<TState extends OperationalUserState>(
  state: TState | null,
  facts: RightTokenUserFacts
): ManagedUser<TState> | ManagedUser<OperationalUserState> {
  const operational =
    state ??
    ({
      id: `righttoken:${facts.externalUserId}`,
      externalUserId: facts.externalUserId,
      currentSegment: "A"
    } satisfies OperationalUserState);

  return {
    ...operational,
    ...facts,
    paymentStatus: facts.firstPaidAt ? "PAID" : "NONE",
    registrationIp: facts.registrationIp
  } as ManagedUser<TState> | ManagedUser<OperationalUserState>;
}
