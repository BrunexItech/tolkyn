"use client";

import { BookUser } from "lucide-react";
import { SectionHeading } from "@/components/om/primitives/SectionHeading";
import { PhoneBookManager } from "@/components/phonebook/PhoneBookManager";

export default function PhoneBookPage() {
  return (
    <div className="om-anim-rise space-y-3">
      <SectionHeading
        title="Phone Book"
        subtitle="Saved numbers grouped by category — used to send Bulk SMS"
        icon={<BookUser />}
      />
      <PhoneBookManager />
    </div>
  );
}
