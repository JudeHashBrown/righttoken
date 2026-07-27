import { redirect } from "next/navigation";

export default function TwoFactorSetupPage(): never {
  redirect("/dashboard");
}
