import { redirect } from "next/navigation";

export default function SettingsRedirect() {
  // Settings page arrives in Phase 2; for now we redirect to the dashboard.
  redirect("/dashboard");
}
