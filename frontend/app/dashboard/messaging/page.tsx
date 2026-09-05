import { redirect } from "next/navigation";

// The old combined "Messaging" route is now split into Bulk SMS and WhatsApp.
export default function MessagingRedirect() {
  redirect("/dashboard/sms");
}
