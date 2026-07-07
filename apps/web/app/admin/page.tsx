"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type {
  AdminPromptTemplateType,
  AdminPromptTemplateVersion,
  AdminUserListItem,
  PlatformHealthResponse,
  VideoPipelineMetrics,
} from "@uphelper/shared-types";
import {
  useAdminUsers,
  useAdminPlatformHealth,
  useAdminVideoPipelineMetrics,
  useAdminPromptTemplates,
  useSetUserDisabled,
  useUpdatePromptTemplate,
} from "@/lib/queries/admin";
import { ApiError } from "@/lib/api-client";
import { SectionHeader } from "../dashboard/_components/section-header";
import { Card } from "../dashboard/_components/card";
import { EmptyState } from "../dashboard/_components/empty-state";

const inputClass =
  "w-full rounded-lg border border-white/10 bg-ink-950 px-3 py-2 text-sm text-white outline-none ring-ember-500/50 focus:ring-2";

/** "2 minutes ago" style relative time — small and dependency-free, no
 * need to pull in a date library for one label on an admin-only page. */
function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function UserRow({ user }: { user: AdminUserListItem }) {
  const setDisabled = useSetUserDisabled();

  return (
    <div className="border-b border-white/5 py-4 last:border-b-0">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-white/90">{user.name}</p>
          <p className="text-xs text-white/40">{user.email}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="rounded-full bg-white/5 px-2 py-0.5 text-[11px] uppercase tracking-wide text-white/50">
            {user.role}
          </span>
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] ${
              user.isDisabled ? "bg-red-500/10 text-red-300" : "bg-emerald-500/10 text-emerald-300"
            }`}
          >
            {user.isDisabled ? "Disabled" : "Enabled"}
          </span>
          {user.isDisabled ? (
            <button
              onClick={() => setDisabled.mutate({ id: user.id, isDisabled: false })}
              disabled={setDisabled.isPending}
              className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white/60 transition-colors hover:border-white/20 hover:text-white disabled:opacity-40"
            >
              {setDisabled.isPending ? "…" : "Enable"}
            </button>
          ) : (
            <button
              onClick={() => setDisabled.mutate({ id: user.id, isDisabled: true })}
              disabled={setDisabled.isPending}
              className="rounded-lg px-3 py-1.5 text-xs text-white/50 transition-colors hover:bg-red-500/10 hover:text-red-300 disabled:opacity-40"
            >
              {setDisabled.isPending ? "…" : "Disable"}
            </button>
          )}
        </div>
      </div>
      {setDisabled.isError && (
        <p className="mt-2 text-xs text-red-400">
          {setDisabled.error instanceof ApiError ? setDisabled.error.message : "Something went wrong — try again."}
        </p>
      )}
    </div>
  );
}

function UserManagementSection() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Small inline debounce so every keystroke doesn't fire a fresh
  // GET /admin/users — 300ms is enough to wait out normal typing.
  useEffect(() => {
    const handle = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(handle);
  }, [search]);

  const users = useAdminUsers(debouncedSearch);

  return (
    <Card>
      <div className="mb-4 flex items-center justify-between gap-4">
        <p className="font-display text-lg text-white">Users</p>
        {typeof users.data?.total === "number" && <p className="text-xs text-white/40">{users.data.total} total</p>}
      </div>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by name or email"
        className={`${inputClass} mb-4`}
      />

      {users.isLoading ? (
        <div className="grid gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-xl bg-white/5" />
          ))}
        </div>
      ) : !users.data?.users.length ? (
        <EmptyState
          title="No users found"
          description={debouncedSearch ? "Try a different name or email." : "No users yet."}
        />
      ) : (
        <div>
          {users.data.users.map((u) => (
            <UserRow key={u.id} user={u} />
          ))}
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------
// Section 2 — Platform Health
// ---------------------------------------------------------------------
//
// The four services in `PlatformHealthResponse` genuinely don't share one
// shape (see queries/admin.ts's comment for the full field-by-field
// breakdown), so rather than force them through one fictional common
// interface (the bug that made every card read "Never"/"None" before),
// each card is built from its own `HealthCardData` view-model computed
// here from the real fields, then rendered through one shared, dumb
// `HealthCard` presentational component.
type HealthTone = "healthy" | "rate_limited" | "degraded" | "down" | "unknown";

interface HealthCardData {
  name: string;
  tone: HealthTone;
  badgeLabel: string;
  /** Small secondary note next to the badge — used for the transcript
   * canary's human-readable `detail`, which is worth surfacing even when
   * it's not an error (e.g. explaining a `rate_limited` state). */
  note?: string;
  /** Label for the second row — "Last successful sync" for Codeforces
   * (it genuinely has sync history), "Last checked" for the other three
   * (they're live pings/checks with no separate "last success" concept
   * distinct from "when checked"). */
  lastLabel: string;
  lastValue: string;
  lastError: string | null;
}

const TONE_BADGE_CLASSES: Record<HealthTone, string> = {
  healthy: "bg-emerald-500/10 text-emerald-300",
  rate_limited: "bg-amber-500/10 text-amber-300",
  degraded: "bg-red-500/10 text-red-300",
  down: "bg-red-500/10 text-red-300",
  unknown: "bg-white/5 text-white/40",
};

function buildHealthCards(data: PlatformHealthResponse): HealthCardData[] {
  const { database, redis, codeforces, transcriptCanary } = data;

  const dependencyCard = (name: string, dep: typeof database): HealthCardData => ({
    name,
    tone: dep.status === "healthy" ? "healthy" : dep.status,
    badgeLabel: dep.status === "healthy" ? "Healthy" : dep.status === "down" ? "Down" : "Degraded",
    lastLabel: "Last checked",
    lastValue: formatRelativeTime(dep.checkedAt),
    // DependencyHealth only sets `detail` when status isn't healthy, so
    // its presence already means "this is the error," not just any note.
    lastError: dep.status !== "healthy" ? (dep.detail ?? "Unknown error") : null,
  });

  const codeforcesCard: HealthCardData = {
    name: "Codeforces",
    tone: codeforces.reachable ? "healthy" : "degraded",
    badgeLabel: codeforces.reachable ? "Healthy" : "Degraded",
    lastLabel: "Last successful sync",
    lastValue: codeforces.lastSuccessfulSyncAt ? formatRelativeTime(codeforces.lastSuccessfulSyncAt) : "Never",
    // This is "last known error, ever" per the backend's own contract —
    // it can still be shown even while `reachable` is currently true, and
    // that's intentional, not a stale-data bug.
    lastError: codeforces.lastError
      ? `${codeforces.lastError.message} (${formatRelativeTime(codeforces.lastError.occurredAt)})`
      : null,
  };

  const canaryTone: HealthTone =
    transcriptCanary.health === "unhealthy" ? "degraded" : transcriptCanary.health;
  const canaryCard: HealthCardData = {
    name: "Transcript canary",
    tone: canaryTone,
    badgeLabel:
      transcriptCanary.health === "healthy"
        ? "Healthy"
        : transcriptCanary.health === "rate_limited"
          ? "Rate limited"
          : transcriptCanary.health === "unhealthy"
            ? "Degraded"
            : "Unknown",
    // The canary's `detail` is always present and explains whichever
    // state it's in (including the healthy and rate_limited cases), so
    // it's shown as a note next to the badge regardless of health.
    note: transcriptCanary.detail,
    lastLabel: "Last checked",
    lastValue: transcriptCanary.lastCheckedAt ? formatRelativeTime(transcriptCanary.lastCheckedAt) : "Never",
    // There's no separate error field here — `detail` doubles as the
    // error message, but only surfaced in the "Last error" row when the
    // canary is actually `unhealthy`; for `rate_limited`/`healthy` the
    // same text already reads fine as a neutral note next to the badge.
    lastError: transcriptCanary.health === "unhealthy" ? transcriptCanary.detail : null,
  };

  return [dependencyCard("Database", database), dependencyCard("Redis", redis), codeforcesCard, canaryCard];
}

function HealthCard({ card }: { card: HealthCardData }) {
  return (
    <div className="rounded-xl border border-white/10 bg-ink-950/40 p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-white/90">{card.name}</p>
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-2 py-0.5 text-[11px] ${TONE_BADGE_CLASSES[card.tone]}`}>
            {card.badgeLabel}
          </span>
          {card.note && <span className="text-[11px] text-white/40">({card.note})</span>}
        </div>
      </div>
      <dl className="space-y-1 text-xs">
        <div className="flex items-center justify-between gap-3">
          <dt className="text-white/40">{card.lastLabel}</dt>
          <dd className="text-white/70">{card.lastValue}</dd>
        </div>
        <div className="flex items-start justify-between gap-3">
          <dt className="shrink-0 text-white/40">Last error</dt>
          <dd className={`text-right ${card.lastError ? "text-red-300" : "text-white/70"}`}>
            {card.lastError ?? "None"}
          </dd>
        </div>
      </dl>
    </div>
  );
}

function PlatformHealthSection() {
  const health = useAdminPlatformHealth();

  return (
    <Card>
      <div className="mb-4 flex items-center justify-between gap-4">
        <p className="font-display text-lg text-white">Platform health</p>
        {health.isFetching && !health.isLoading && <span className="text-[11px] text-white/30">Refreshing…</span>}
      </div>

      {health.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl bg-white/5" />
          ))}
        </div>
      ) : health.isError || !health.data ? (
        <EmptyState
          title="Couldn't load platform health"
          description={
            health.error instanceof ApiError ? health.error.message : "Something went wrong — try again."
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {buildHealthCards(health.data).map((card) => (
            <HealthCard key={card.name} card={card} />
          ))}
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------
// Section 3 — Video Pipeline
// ---------------------------------------------------------------------
//
// Two of these five numbers are naturally "a fraction of something" —
// today's quota (used vs. a real ceiling) and the cache hit rate (hits
// vs. hits+misses) — so those get progress bars. The other three (queue
// size, pending jobs, failed jobs) don't have a meaningful ceiling to
// bar against (there's no "max queue size"), so they're plain metric
// cards — a table would just be a worse-formatted version of the same
// three numbers, per the ask to prefer bars/cards over tables here.

function ProgressBar({ percent, tone = "normal" }: { percent: number; tone?: "normal" | "warning" | "danger" }) {
  const clamped = Math.max(0, Math.min(100, percent));
  const barClass = tone === "danger" ? "bg-red-400" : tone === "warning" ? "bg-amber-400" : "bg-ember-500";
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
      <div className={`h-full rounded-full ${barClass} transition-[width]`} style={{ width: `${clamped}%` }} />
    </div>
  );
}

function MetricCard({
  label,
  value,
  tone = "normal",
  sublabel,
}: {
  label: string;
  value: React.ReactNode;
  tone?: "normal" | "danger";
  sublabel?: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-ink-950/40 p-4">
      <p className="text-xs text-white/40">{label}</p>
      <p className={`mt-1 font-display text-2xl ${tone === "danger" ? "text-red-300" : "text-white"}`}>{value}</p>
      {sublabel && <p className="mt-1 text-[11px] text-white/30">{sublabel}</p>}
    </div>
  );
}

function QuotaCard({ youtube }: { youtube: VideoPipelineMetrics["youtube"] }) {
  const percent = youtube.quotaLimit > 0 ? (youtube.quotaUsedToday / youtube.quotaLimit) * 100 : 0;
  const tone = youtube.quotaThrottled ? "danger" : percent >= 80 ? "warning" : "normal";

  return (
    <div className="rounded-xl border border-white/10 bg-ink-950/40 p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-white/90">Today&apos;s YouTube quota</p>
        {youtube.quotaThrottled && (
          <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-[11px] text-red-300">Throttled</span>
        )}
      </div>
      <ProgressBar percent={percent} tone={tone} />
      <p className="mt-2 text-xs text-white/50">
        {youtube.quotaUsedToday.toLocaleString()} / {youtube.quotaLimit.toLocaleString()} units (
        {percent.toFixed(1)}%)
      </p>
      {youtube.quotaThrottled && (
        <p className="mt-1 text-[11px] text-white/30">
          Past the 80% line — non-essential calls (re-scoring already-cached videos) are being skipped. New
          searches still go through.
        </p>
      )}
    </div>
  );
}

function CacheHitRateCard({ cache }: { cache: VideoPipelineMetrics["cache"] }) {
  return (
    <div className="rounded-xl border border-white/10 bg-ink-950/40 p-4">
      <p className="mb-2 text-sm font-medium text-white/90">Cache hit rate</p>
      {cache.hitRate === null ? (
        <>
          <ProgressBar percent={0} />
          <p className="mt-2 text-xs text-white/40">No searches recorded yet today.</p>
        </>
      ) : (
        <>
          <ProgressBar percent={cache.hitRate} />
          <p className="mt-2 text-xs text-white/50">
            {cache.hitRate.toFixed(1)}% ({cache.hits.toLocaleString()} hits / {cache.misses.toLocaleString()} misses)
          </p>
        </>
      )}
    </div>
  );
}

function VideoPipelineSection() {
  const metrics = useAdminVideoPipelineMetrics();

  return (
    <Card>
      <div className="mb-4 flex items-center justify-between gap-4">
        <p className="font-display text-lg text-white">Video pipeline</p>
        {metrics.isFetching && !metrics.isLoading && (
          <span className="text-[11px] text-white/30">Refreshing…</span>
        )}
      </div>

      {metrics.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-white/5" />
          ))}
        </div>
      ) : metrics.isError || !metrics.data ? (
        <EmptyState
          title="Couldn't load video pipeline metrics"
          description={
            metrics.error instanceof ApiError ? metrics.error.message : "Something went wrong — try again."
          }
        />
      ) : (
        <div className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <QuotaCard youtube={metrics.data.youtube} />
            <CacheHitRateCard cache={metrics.data.cache} />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <MetricCard label="Queue size" value={metrics.data.queue.size} sublabel="waiting + active + delayed" />
            <MetricCard label="Pending jobs" value={metrics.data.queue.pendingJobs} sublabel="waiting to start" />
            <MetricCard
              label="Failed jobs"
              value={metrics.data.queue.failedJobs}
              tone={metrics.data.queue.failedJobs > 0 ? "danger" : "normal"}
              sublabel="today"
            />
          </div>
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------
// Section 4 — Prompt Templates
// ---------------------------------------------------------------------
//
// "Simple editor" per the ask, deliberately not the fuller version-
// history/rollback UI  eventually wants
// — just: see the current active body, edit it, save, get confirmation.
// Every save creates a new version server-side (never an in-place
// overwrite — see AdminService.updateActivePromptTemplate's own
// comment), so "save" here really means "publish a new active version,"
// which is exactly what the button does; there's no separate concept of
// saving a draft without activating it.

const PROMPT_TEMPLATE_LABELS: Record<AdminPromptTemplateType, string> = {
  hint: "Hint prompt",
  debug: "Debug prompt",
};

function PromptTemplateEditor({
  type,
  versions,
  onSaved,
}: {
  type: AdminPromptTemplateType;
  versions: AdminPromptTemplateVersion[];
  onSaved: (saved: { type: AdminPromptTemplateType; version: number }) => void;
}) {
  const update = useUpdatePromptTemplate();
  // Versions arrive newest-version-first per the backend's own ordering,
  // and the newest one is always the active one (PATCH deactivates every
  // prior row in the same transaction it creates the new one) — but
  // `find` here rather than trusting index 0 blindly, in case that ever
  // stops being true.
  const active = versions.find((v) => v.isActive) ?? versions[0];

  const [body, setBody] = useState(active?.body ?? "");

  // If the active version changes underneath us (a fresh save just
  // landed, or another admin tab edited it), sync the textarea to match
  // — but only when we're not actively mid-edit relative to what's
  // already loaded, so this doesn't clobber unsaved typing on every
  // background refetch.
  useEffect(() => {
    setBody(active?.body ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.id]);

  const isDirty = body !== (active?.body ?? "");

  async function handleSave() {
    const trimmed = body.trim();
    if (!trimmed) return;
    const saved = await update.mutateAsync({ type, body: trimmed });
    setBody(saved.body);
    onSaved({ type, version: saved.version });
  }

  return (
    <div className="rounded-xl border border-white/10 bg-ink-950/40 p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-white/90">{PROMPT_TEMPLATE_LABELS[type]}</p>
        {active && <span className="text-[11px] text-white/30">active: v{active.version}</span>}
      </div>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={12}
        spellCheck={false}
        className="w-full rounded-lg border border-white/10 bg-ink-950 px-3 py-2 font-mono text-xs leading-relaxed text-white outline-none ring-ember-500/50 focus:ring-2"
      />
      <div className="mt-3 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setBody(active?.body ?? "")}
          disabled={!isDirty || update.isPending}
          className="text-xs text-white/40 transition-colors hover:text-white/70 disabled:opacity-30"
        >
          Reset
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={!isDirty || !body.trim() || update.isPending}
          className="rounded-lg bg-ember-500 px-4 py-1.5 text-xs font-medium text-ink-950 transition-colors hover:bg-ember-400 disabled:opacity-40"
        >
          {update.isPending ? "Saving…" : "Save"}
        </button>
      </div>
      {update.isError && (
        <p className="mt-2 text-xs text-red-400">
          {update.error instanceof ApiError ? update.error.message : "Something went wrong — try again."}
        </p>
      )}
    </div>
  );
}

const SAVE_TOAST_DURATION_MS = 3000;

function PromptTemplatesSection() {
  const templates = useAdminPromptTemplates();
  const [savedToast, setSavedToast] = useState<{ type: AdminPromptTemplateType; version: number } | null>(null);

  useEffect(() => {
    if (!savedToast) return;
    const timer = setTimeout(() => setSavedToast(null), SAVE_TOAST_DURATION_MS);
    return () => clearTimeout(timer);
  }, [savedToast]);

  return (
    <Card>
      <p className="mb-4 font-display text-lg text-white">Prompt templates</p>

      {templates.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {[0, 1].map((i) => (
            <div key={i} className="h-64 animate-pulse rounded-xl bg-white/5" />
          ))}
        </div>
      ) : templates.isError || !templates.data ? (
        <EmptyState
          title="Couldn't load prompt templates"
          description={
            templates.error instanceof ApiError ? templates.error.message : "Something went wrong — try again."
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <PromptTemplateEditor type="hint" versions={templates.data.hint} onSaved={setSavedToast} />
          <PromptTemplateEditor type="debug" versions={templates.data.debug} onSaved={setSavedToast} />
        </div>
      )}

      {/* Success notification — same floating-pill pattern as the
          Revision page's "Reviewed — Undo" toast, for visual consistency
          across the app rather than inventing a second toast style. */}
      <AnimatePresence>
        {savedToast && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-6 left-1/2 z-20 flex -translate-x-1/2 items-center gap-3 rounded-full border border-white/10 bg-ink-900 px-5 py-3 shadow-lg shadow-black/40"
          >
            <span className="text-sm text-white/80">
              Saved {PROMPT_TEMPLATE_LABELS[savedToast.type].toLowerCase()} — now v{savedToast.version}
            </span>
            <button
              onClick={() => setSavedToast(null)}
              className="text-xs text-white/40 hover:text-white/70"
              aria-label="Dismiss"
            >
              ✕
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}

export default function AdminPage() {
  return (
    <div>
      <SectionHeader title="Admin" subtitle="User management, platform health, and prompt templates." />
      <div className="grid gap-6">
        <UserManagementSection />
        <PlatformHealthSection />
        <VideoPipelineSection />
        <PromptTemplatesSection />
        {/* Section 6, item 4 (manual controls) is the one remaining stub */}
      </div>
    </div>
  );
}

