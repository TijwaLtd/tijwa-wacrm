"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { X } from "lucide-react";

interface Filters {
  user: string;
  event_type: string;
  date_from: string;
  date_to: string;
}

interface Profile {
  id: string;
  full_name: string | null;
  email: string;
}

const EVENT_TYPE_OPTIONS = [
  { value: "", label: "All actions" },
  { value: "CONTACT_VIEWED", label: "Contact viewed" },
  { value: "CONTACT_PHONE_REVEALED", label: "Phone revealed" },
  { value: "CONTACT_PHONE_COPIED", label: "Phone copied" },
  { value: "CONTACT_CALL_CLICKED", label: "Call clicked" },
  { value: "CONTACT_WHATSAPP_CLICKED", label: "WhatsApp clicked" },
  { value: "CONVERSATION_VIEWED", label: "Conversation viewed" },
  { value: "CONTACT_CREATED", label: "Contact created" },
  { value: "CONTACT_UPDATED", label: "Contact updated" },
  { value: "CONTACT_DELETED", label: "Contact deleted" },
];

export function AuditFilters({
  filters,
  onChange,
}: {
  filters: Filters;
  onChange: (filters: Filters) => void;
}) {
  const [teamMembers, setTeamMembers] = useState<Profile[]>([]);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("profiles")
      .select("user_id, full_name, email")
      .order("full_name")
      .then(({ data }) => {
        if (data) setTeamMembers(data as unknown as Profile[]);
      });
  }, []);

  const hasActiveFilters =
    filters.user || filters.event_type || filters.date_from || filters.date_to;

  const clearFilters = useCallback(() => {
    onChange({ user: "", event_type: "", date_from: "", date_to: "" });
  }, [onChange]);

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Employee filter */}
      <select
        value={filters.user}
        onChange={(e) => onChange({ ...filters, user: e.target.value })}
        className="h-8 rounded-lg border border-input bg-transparent px-2.5 pr-7 text-sm text-foreground outline-none focus:border-ring focus:ring-3 focus:ring-ring/50"
      >
        <option value="">All employees</option>
        {teamMembers.map((member) => (
          <option key={member.id} value={member.id}>
            {member.full_name ?? member.email}
          </option>
        ))}
      </select>

      {/* Action filter */}
      <select
        value={filters.event_type}
        onChange={(e) => onChange({ ...filters, event_type: e.target.value })}
        className="h-8 rounded-lg border border-input bg-transparent px-2.5 pr-7 text-sm text-foreground outline-none focus:border-ring focus:ring-3 focus:ring-ring/50"
      >
        {EVENT_TYPE_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>

      {/* Date from */}
      <Input
        type="date"
        value={filters.date_from}
        onChange={(e) => onChange({ ...filters, date_from: e.target.value })}
        className="w-[150px]"
        placeholder="From"
      />

      {/* Date to */}
      <Input
        type="date"
        value={filters.date_to}
        onChange={(e) => onChange({ ...filters, date_to: e.target.value })}
        className="w-[150px]"
        placeholder="To"
      />

      {/* Clear filters */}
      {hasActiveFilters && (
        <button
          onClick={clearFilters}
          className="flex items-center gap-1 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted"
        >
          <X className="h-3 w-3" />
          Clear
        </button>
      )}
    </div>
  );
}
