import { redirect } from "next/navigation";
import { getServerEnv } from "@/lib/env/runtime";

export const dynamic = "force-dynamic";

type LoginPageProps = {
  searchParams: Promise<{ next?: string }>;
};

export default async function LoginPage({
  searchParams
}: LoginPageProps): Promise<never> {
  const env = getServerEnv();
  if (
    env.AUTH_MODE === "righttoken" &&
    env.RIGHTTOKEN_ADMIN_URL
  ) {
    const target = new URL(env.RIGHTTOKEN_ADMIN_URL);
    const { next } = await searchParams;
    if (next?.startsWith("/") && !next.startsWith("//")) {
      target.searchParams.set("next", next);
    }
    redirect(target.toString());
  }
  redirect("/dashboard");
}
