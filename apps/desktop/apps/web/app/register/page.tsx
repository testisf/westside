import { redirect } from "next/navigation";

// There's no separate sign-up: signing in with Roblox creates the account.
export default function RegisterRedirect() {
  redirect("/login");
}
