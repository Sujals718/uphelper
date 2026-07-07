"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { RevisionItemSummary } from "@uphelper/shared-types";
import {
  useCompleteReview,
  useCreateRevisionItem,
  useDeleteRevisionItem,
  useRevisionItems,
  useUndoReview,
  useUpdateRevisionItem,
  type RevisionSm2Snapshot,
} from "@/lib/queries/revision";
import { AccountDisabledError } from "@/lib/api-client";
import { SectionHeader } from "../_components/section-header";
import { Card } from "../_components/card";
import { EmptyState } from "../_components/empty-state";
import { GradePicker } from "../_components/grade-picker";

const UNDO_WINDOW_MS = 8000;

function isDue(item: RevisionItemSummary): boolean {
  return item.status === "pending" && !!item.nextReviewAt && new Date(item.nextReviewAt) <= new Date();
}

interface LastReview {
  itemId: string;
  problemName: string;
  previous: RevisionSm2Snapshot;
}

export default function RevisionPage() {
  const items = useRevisionItems();
  const createItem = useCreateRevisionItem();
  const updateItem = useUpdateRevisionItem();
  const completeReview = useCompleteReview();
  const undoReview = useUndoReview();
  const deleteItem = useDeleteRevisionItem();

  const [problemName, setProblemName] = useState("");
  const [selfHint, setSelfHint] = useState("");
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmDoneId, setConfirmDoneId] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editProblemName, setEditProblemName] = useState("");
  const [editSelfHint, setEditSelfHint] = useState("");

  const [lastReview, setLastReview] = useState<LastReview | null>(null);
  const undoTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
    };
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!problemName.trim()) return;
    await createItem.mutateAsync({ problemName: problemName.trim(), selfHint: selfHint.trim() || undefined });
    setProblemName("");
    setSelfHint("");
  }

  async function handleGrade(item: RevisionItemSummary, grade: number) {
    // Snapshot the pre-review state *before* mutating — this is exactly
    // what gets PATCHed back verbatim if the user hits Undo.
    if (!item.nextReviewAt) return; // seeded on create; should always exist by the time a review happens
    const snapshot: RevisionSm2Snapshot = {
      sm2Repetition: item.sm2Repetition,
      sm2EaseFactor: item.sm2EaseFactor,
      sm2IntervalDays: item.sm2IntervalDays,
      nextReviewAt: item.nextReviewAt,
      status: item.status,
    };

    await completeReview.mutateAsync({ id: item.id, grade });
    setReviewingId(null);

    if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
    setLastReview({ itemId: item.id, problemName: item.problemName, previous: snapshot });
    undoTimeoutRef.current = setTimeout(() => setLastReview(null), UNDO_WINDOW_MS);
  }

  async function handleUndo() {
    if (!lastReview) return;
    if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
    await undoReview.mutateAsync({ id: lastReview.itemId, previous: lastReview.previous });
    setLastReview(null);
  }

  function startEdit(item: RevisionItemSummary) {
    setEditingId(item.id);
    setEditProblemName(item.problemName);
    setEditSelfHint(item.selfHint ?? "");
  }

  async function saveEdit(id: string) {
    await updateItem.mutateAsync({
      id,
      dto: { problemName: editProblemName.trim(), selfHint: editSelfHint.trim() || undefined },
    });
    setEditingId(null);
  }

  async function confirmDelete(id: string) {
    await deleteItem.mutateAsync(id);
    setConfirmDeleteId(null);
    if (lastReview?.itemId === id) setLastReview(null);
  }

  async function confirmMarkDone(id: string) {
    await updateItem.mutateAsync({ id, dto: { status: "done" } });
    setConfirmDoneId(null);
  }

  return (
    <div className="relative">
      <SectionHeader title="Revision" subtitle="Spaced repetition, graded honestly by you." />

      <Card className="mb-8">
        <form onSubmit={handleCreate} className="flex flex-col gap-3">
          <input
            value={problemName}
            onChange={(e) => setProblemName(e.target.value)}
            placeholder="Problem name, e.g. Two Arrays"
            className="w-full rounded-lg border border-white/10 bg-ink-950 px-3 py-2 text-sm text-white outline-none ring-ember-500/50 focus:ring-2"
          />
          <input
            value={selfHint}
            onChange={(e) => setSelfHint(e.target.value)}
            placeholder="A hint to your future self (optional)"
            className="w-full rounded-lg border border-white/10 bg-ink-950 px-3 py-2 text-sm text-white outline-none ring-ember-500/50 focus:ring-2"
          />
          <button
            type="submit"
            disabled={createItem.isPending || !problemName.trim()}
            className="self-start rounded-lg bg-ember-500 px-5 py-2 text-sm font-medium text-ink-950 transition-colors hover:bg-ember-400 disabled:opacity-40"
          >
            {createItem.isPending ? "Adding…" : "Add to revision"}
          </button>
        </form>
      </Card>

      {items.isLoading ? (
        <div className="grid gap-3">
          {[0, 1].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-ink-900/50" />
          ))}
        </div>
      ) : items.error instanceof AccountDisabledError ? (
        <EmptyState title="Account has been disabled." description="Contact support if you think this is a mistake." />
      ) : !items.data?.length ? (
        <EmptyState title="Nothing queued for revision" description="Add a problem above to start the cycle." />
      ) : (
        <div className="grid gap-3">
          <AnimatePresence initial={false}>
            {items.data.map((item) => {
              const due = isDue(item);
              const isEditing = editingId === item.id;

              return (
                <motion.div
                  key={item.id}
                  layout
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  <Card>
                    {isEditing ? (
                      <div className="flex flex-col gap-3">
                        <input
                          value={editProblemName}
                          onChange={(e) => setEditProblemName(e.target.value)}
                          placeholder="Problem name"
                          className="w-full rounded-lg border border-white/10 bg-ink-950 px-3 py-2 text-sm text-white outline-none ring-ember-500/50 focus:ring-2"
                        />
                        <input
                          value={editSelfHint}
                          onChange={(e) => setEditSelfHint(e.target.value)}
                          placeholder="Self hint (optional)"
                          className="w-full rounded-lg border border-white/10 bg-ink-950 px-3 py-2 text-sm text-white outline-none ring-ember-500/50 focus:ring-2"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => saveEdit(item.id)}
                            disabled={!editProblemName.trim()}
                            className="rounded-lg bg-ember-500 px-4 py-1.5 text-xs font-medium text-ink-950 hover:bg-ember-400 disabled:opacity-40"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="rounded-lg border border-white/10 px-4 py-1.5 text-xs text-white/60 hover:text-white"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <p className="font-medium text-white">{item.problemName}</p>
                              <span
                                className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide ${
                                  item.status === "done"
                                    ? "bg-white/5 text-white/40"
                                    : due
                                      ? "bg-ember-500/20 text-ember-300"
                                      : "bg-white/5 text-white/40"
                                }`}
                              >
                                {item.status === "done" ? "done" : due ? "due" : "scheduled"}
                              </span>
                            </div>
                            {item.selfHint && <p className="mt-1 text-sm text-white/50">{item.selfHint}</p>}
                            <p className="mt-2 text-[11px] text-white/30">
                              {item.nextReviewAt
                                ? `Next review ${new Date(item.nextReviewAt).toLocaleDateString()}`
                                : "No review scheduled"}
                              {" · "}
                              ease {item.sm2EaseFactor.toFixed(2)} · streak {item.sm2Repetition}
                            </p>
                          </div>

                          <div className="flex shrink-0 flex-wrap justify-end gap-2">
                            {item.status !== "done" && (
                              <>
                                <button
                                  onClick={() => setReviewingId(reviewingId === item.id ? null : item.id)}
                                  className="rounded-lg bg-ember-500/15 px-3 py-1.5 text-xs font-medium text-ember-300 hover:bg-ember-500/25"
                                >
                                  Review
                                </button>
                                {confirmDoneId === item.id ? (
                                  <button
                                    onClick={() => confirmMarkDone(item.id)}
                                    className="rounded-lg bg-emerald-500/20 px-3 py-1.5 text-xs text-emerald-300 hover:bg-emerald-500/30"
                                  >
                                    Confirm?
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => setConfirmDoneId(item.id)}
                                    className="rounded-lg px-3 py-1.5 text-xs text-white/50 hover:bg-white/5 hover:text-white"
                                  >
                                    Mark done
                                  </button>
                                )}
                              </>
                            )}
                            <button
                              onClick={() => startEdit(item)}
                              className="rounded-lg px-3 py-1.5 text-xs text-white/50 hover:bg-white/5 hover:text-white"
                            >
                              Edit
                            </button>
                            {confirmDeleteId === item.id ? (
                              <button
                                onClick={() => confirmDelete(item.id)}
                                className="rounded-lg bg-red-500/20 px-3 py-1.5 text-xs text-red-300 hover:bg-red-500/30"
                              >
                                Confirm?
                              </button>
                            ) : (
                              <button
                                onClick={() => setConfirmDeleteId(item.id)}
                                className="rounded-lg px-3 py-1.5 text-xs text-white/50 hover:bg-red-500/10 hover:text-red-300"
                              >
                                Delete
                              </button>
                            )}
                          </div>
                        </div>

                        <AnimatePresence>
                          {reviewingId === item.id && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: "auto" }}
                              exit={{ opacity: 0, height: 0 }}
                              className="overflow-hidden"
                            >
                              <div className="mt-4 border-t border-white/10 pt-4">
                                <p className="mb-2 text-xs text-white/40">
                                  How well did you recall the solution before checking?
                                </p>
                                <GradePicker
                                  onConfirm={(grade) => handleGrade(item, grade)}
                                  disabled={completeReview.isPending}
                                />
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </>
                    )}
                  </Card>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {/* Undo toast for the most recent review — disappears on its own after
          UNDO_WINDOW_MS, or immediately if that same item gets deleted. */}
      <AnimatePresence>
        {lastReview && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-6 left-1/2 z-20 flex -translate-x-1/2 items-center gap-3 rounded-full border border-white/10 bg-ink-900 px-5 py-3 shadow-lg shadow-black/40"
          >
            <span className="text-sm text-white/80">Reviewed &ldquo;{lastReview.problemName}&rdquo;</span>
            <button
              onClick={handleUndo}
              disabled={undoReview.isPending}
              className="rounded-full bg-ember-500 px-3 py-1 text-xs font-medium text-ink-950 hover:bg-ember-400 disabled:opacity-40"
            >
              {undoReview.isPending ? "Undoing…" : "Undo"}
            </button>
            <button
              onClick={() => setLastReview(null)}
              className="text-xs text-white/40 hover:text-white/70"
              aria-label="Dismiss"
            >
              ✕
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}