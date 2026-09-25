import { redirect } from "next/navigation";

// Account settings currently live under Security.
export default function SettingsRedirect() {
  redirect("/dashboard/settings/security");
}
