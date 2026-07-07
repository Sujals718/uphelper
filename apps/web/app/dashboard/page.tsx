"use client";

import Link from "next/link";
import { useRequireAuth } from "@/lib/use-require-auth";
import { useContests } from "@/lib/queries/platforms";
import { useMistakes } from "@/lib/queries/mistakes";
import { useRevisionItems } from "@/lib/queries/revision";
import { StatCard } from "./_components/stat-card";
import { Card } from "./_components/card";
import { SectionHeader } from "./_components/section-header";

export default function DashboardPage() {
  const { user } = useRequireAuth();
  const contests = useContests();
  const mistakes = useMistakes();
  const revision = useRevisionItems();

  const unsolvedCount = contests.data?.filter((c) => c.unsolvedProblem).length ?? 0;
  const dueCount =
    revision.data?.filter(
      (r) => r.status === "pending" && r.nextReviewAt && new Date(r.nextReviewAt) <= new Date(),
    ).length ?? 0;

  return (
    <div>
      <SectionHeader
        title={`Welcome back, ${user?.name?.split(" ")[0] ?? ""}`}
        subtitle="Here's where you stand right now."
      />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Contests synced" value={contests.data?.length ?? "—"} delay={0} />
        <StatCard label="Unsolved problems" value={unsolvedCount} delay={0.05} />
        <StatCard label="Mistakes logged" value={mistakes.data?.length ?? "—"} delay={0.1} />
        <StatCard label="Revisions due" value={dueCount} delay={0.15} />
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <p className="font-display text-lg text-white">Sync your Codeforces history</p>
          <p className="mt-2 text-sm text-white/50">
            Link your handle to see every contest you&apos;ve attended and where you got stuck.
          </p>
          <Link href="/dashboard/contests" className="mt-4 inline-block text-sm text-ember-400 hover:text-ember-300">
            Go to contests →
          </Link>
        </Card>
        <Card>
          <p className="font-display text-lg text-white">Log a mistake</p>
          <p className="mt-2 text-sm text-white/50">
            Capture what actually went wrong, not just that a submission failed.
          </p>
          <Link href="/dashboard/mistakes" className="mt-4 inline-block text-sm text-ember-400 hover:text-ember-300">
            Go to mistakes →
          </Link>
        </Card>
        <Card>
          <p className="font-display text-lg text-white">Review what&apos;s due</p>
          <p className="mt-2 text-sm text-white/50">Spaced repetition on your own terms — grade yourself honestly.</p>
          <Link href="/dashboard/revision" className="mt-4 inline-block text-sm text-ember-400 hover:text-ember-300">
            Go to revision →
          </Link>
        </Card>
        <Card>
          <p className="font-display text-lg text-white">Find a video or a hint</p>
          <p className="mt-2 text-sm text-white/50">
            Search sentiment-ranked tutorials, or generate a copy-paste hint/debug prompt.
          </p>
          <Link href="/dashboard/tools" className="mt-4 inline-block text-sm text-ember-400 hover:text-ember-300">
            Go to tools →
          </Link>
        </Card>
        <Card>
          <p className="font-display text-lg text-white">See your weak tags</p>
          <p className="mt-2 text-sm text-white/50">
            Mistakes and unsolved problems, aggregated by tag, so patterns actually surface.
          </p>
          <Link href="/dashboard/analytics" className="mt-4 inline-block text-sm text-ember-400 hover:text-ember-300">
            Go to analytics →
          </Link>
        </Card>
      </div>
    </div>
  );
}