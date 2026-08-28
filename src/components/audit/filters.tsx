"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { AuditEventType } from "@/lib/audit/events";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
      .select("id, full_name, email")
      .order("full_name")
      .then(({ data }) => {
        if (data) setTeamMembers(data as Profile[]);
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
      <Select
        value={filters.user || "__all__"}
        onValueChange={(val) =>
          onChange({ ...filters, user: val === "__all__" || !val ? "" : val })
        }
      >
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="All employees" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">All employees</SelectItem>
          {teamMembers.map((member) => (
            <SelectItem key={member.id} value={member.id}>
              {member.full_name ?? member.email}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Action filter */}
      <Select
        value={filters.event_type || "__all__"}
        onValueChange={(val) =>
          onChange({ ...filters, event_type: val === "__all__" || !val ? "" : val })
        }
      >
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="All actions" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">All actions</SelectItem>
          {EVENT_TYPE_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

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
