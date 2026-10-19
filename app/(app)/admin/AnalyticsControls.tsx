"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId } from "react";

import { Field, Select, cn } from "@/components/ui";

type Timeframe = "7d" | "30d" | "all";

const TIMEFRAMES: { value: Timeframe; label: string }[] = [
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "all", label: "All" },
];

function viewHref(profileId: string, timeframe: Timeframe): string {
  const params = new URLSearchParams();
  if (profileId !== "all") params.set("profile", profileId);
  if (timeframe !== "30d") params.set("timeframe", timeframe);
  const query = params.toString();
  return query ? `/admin/analytics?${query}` : "/admin/analytics";
}

export function AnalyticsControls({
  profiles,
  profileId,
  timeframe,
}: {
  profiles: { id: string; name: string }[];
  profileId: string;
  timeframe: Timeframe;
}) {
  const router = useRouter();
  const timeframeId = useId();

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end">
      <div className="w-full min-w-0 sm:w-72">
        <Field label="Profile">
          <Select
            value={profileId}
            className="min-h-11"
            onChange={(event) => {
              router.push(viewHref(event.target.value, timeframe), { scroll: false });
            }}
          >
            <option value="all">All profiles</option>
            {profiles.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="space-y-1.5">
        <p id={timeframeId} className="text-sm font-medium">
          Timeframe
        </p>
        <div role="group" aria-labelledby={timeframeId} className="flex flex-wrap gap-2">
          {TIMEFRAMES.map((option) => {
            const selected = option.value === timeframe;
            return (
              <Link
                key={option.value}
                href={viewHref(profileId, option.value)}
                scroll={false}
                aria-current={selected ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-11 items-center justify-center rounded-xl border px-3 text-sm font-medium transition-colors",
                  selected
                    ? "border-transparent bg-accent text-accent-fg"
                    : "border-line bg-surface text-ink hover:border-line-strong hover:bg-surface-2",
                )}
              >
                {option.label}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
