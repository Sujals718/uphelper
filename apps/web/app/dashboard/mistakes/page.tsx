"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { MistakeSummary } from "@uphelper/shared-types";
import { useCreateMistake, useDeleteMistake, useMistakes, useUpdateMistake } from "@/lib/queries/mistakes";
import { AccountDisabledError } from "@/lib/api-client";
import { SectionHeader } from "../_components/section-header";
import { Card } from "../_components/card";
import { EmptyState } from "../_components/empty-state";

function parseTags(input: string): string[] {
  return input
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

export default function MistakesPage() {
  const mistakes = useMistakes();
  const createMistake = useCreateMistake();
  const updateMistake = useUpdateMistake();
  const deleteMistake = useDeleteMistake();

  const [note, setNote] = useState("");
  const [tags, setTags] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editNote, setEditNote] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!note.trim()) return;
    await createMistake.mutateAsync({ note: note.trim(), tags: parseTags(tags) });
    setNote("");
    setTags("");
  }

  function startEdit(m: MistakeSummary) {
    setEditingId(m.id);
    setEditNote(m.note);
  }

  async function saveEdit(id: string) {
    await updateMistake.mutateAsync({ id, dto: { note: editNote } });
    setEditingId(null);
  }

  async function confirmDelete(id: string) {
    await deleteMistake.mutateAsync(id);
    setConfirmDeleteId(null);
  }

  return (
    <div>
      <SectionHeader title="Mistakes" subtitle="What actually went wrong — not just that it failed." />

      <Card className="mb-8">
        <form onSubmit={handleCreate} className="flex flex-col gap-3">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. forgot to reset the visited array between test cases"
            rows={2}
            className="w-full resize-none rounded-lg border border-white/10 bg-ink-950 px-3 py-2 text-sm text-white outline-none ring-ember-500/50 focus:ring-2"
          />
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="tags, comma, separated (optional)"
              className="flex-1 rounded-lg border border-white/10 bg-ink-950 px-3 py-2 text-sm text-white outline-none ring-ember-500/50 focus:ring-2"
            />
            <button
              type="submit"
              disabled={createMistake.isPending || !note.trim()}
              className="rounded-lg bg-ember-500 px-5 py-2 text-sm font-medium text-ink-950 transition-colors hover:bg-ember-400 disabled:opacity-40"
            >
              {createMistake.isPending ? "Saving…" : "Log mistake"}
            </button>
          </div>
        </form>
      </Card>

      {mistakes.isLoading ? (
        <div className="grid gap-3">
          {[0, 1].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-2xl bg-ink-900/50" />
          ))}
        </div>
      ) : mistakes.error instanceof AccountDisabledError ? (
        <EmptyState title="Account has been disabled." description="Contact support if you think this is a mistake." />
      ) : !mistakes.data?.length ? (
        <EmptyState title="No mistakes logged yet" description="The first honest note is the most useful one." />
      ) : (
        <div className="grid gap-3">
          <AnimatePresence initial={false}>
            {mistakes.data.map((m) => (
              <motion.div
                key={m.id}
                layout
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                transition={{ duration: 0.3 }}
              >
                <Card>
                  {editingId === m.id ? (
                    <div className="flex flex-col gap-3">
                      <textarea
                        value={editNote}
                        onChange={(e) => setEditNote(e.target.value)}
                        rows={2}
                        className="w-full resize-none rounded-lg border border-white/10 bg-ink-950 px-3 py-2 text-sm text-white outline-none ring-ember-500/50 focus:ring-2"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => saveEdit(m.id)}
                          className="rounded-lg bg-ember-500 px-4 py-1.5 text-xs font-medium text-ink-950 hover:bg-ember-400"
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
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm text-white/90">{m.note}</p>
                        {m.tags.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {m.tags.map((tag) => (
                              <span
                                key={tag}
                                className="rounded-full bg-white/5 px-2 py-0.5 text-[11px] text-white/50"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                        <p className="mt-2 text-[11px] text-white/30">{new Date(m.createdAt).toLocaleDateString()}</p>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <button
                          onClick={() => startEdit(m)}
                          className="rounded-lg px-3 py-1.5 text-xs text-white/50 hover:bg-white/5 hover:text-white"
                        >
                          Edit
                        </button>
                        {confirmDeleteId === m.id ? (
                          <button
                            onClick={() => confirmDelete(m.id)}
                            className="rounded-lg bg-red-500/20 px-3 py-1.5 text-xs text-red-300 hover:bg-red-500/30"
                          >
                            Confirm?
                          </button>
                        ) : (
                          <button
                            onClick={() => setConfirmDeleteId(m.id)}
                            className="rounded-lg px-3 py-1.5 text-xs text-white/50 hover:bg-red-500/10 hover:text-red-300"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}