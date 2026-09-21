import { redirect } from "next/navigation";

export default function Home() {
  // Phase 1: route everything to /login. Phase 2 will check refresh cookie and
  // redirect to /dashboard if already authenticated.
  redirect("/login");
}
