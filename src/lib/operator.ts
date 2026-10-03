import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, verifySessionValue } from "./session";

/** Second check behind the middleware, for every operator server action. */
export async function requireOperator(): Promise<void> {
  const store = await cookies();
  if (!(await verifySessionValue(store.get(SESSION_COOKIE)?.value))) {
    redirect("/admin/login");
  }
}
