"use client";

import { motion } from "framer-motion";
import { startGoogleLogin } from "@/lib/api";

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (delay: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] },
  }),
};

export default function LandingPage() {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6">
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/3 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-ember-500/20 blur-[140px]"
      />

      <motion.p
        initial="hidden"
        animate="visible"
        custom={0}
        variants={fadeUp}
        className="relative z-10 mb-6 text-sm uppercase tracking-[0.2em] text-ember-400"
      >
        Uphelper
      </motion.p>

      <motion.h1
        initial="hidden"
        animate="visible"
        custom={0.1}
        variants={fadeUp}
        className="relative z-10 max-w-3xl text-center font-display text-4xl font-medium leading-tight text-white sm:text-6xl"
      >
        Build intuition that compounds.
      </motion.h1>

      <motion.p
        initial="hidden"
        animate="visible"
        custom={0.25}
        variants={fadeUp}
        className="relative z-10 mt-8 max-w-xl text-center text-lg text-white/60"
      >
        Track your Codeforces history. Find the best explanations. Review problems before you forget them.
      </motion.p>

      <motion.div
        initial="hidden"
        animate="visible"
        custom={0.45}
        variants={fadeUp}
        className="relative z-10 mt-12"
      >
        <button
          onClick={startGoogleLogin}
          className="group inline-flex items-center gap-2 rounded-full bg-ember-500 px-8 py-3.5 font-medium text-ink-950 transition-colors hover:bg-ember-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ember-400"
        >
          Get Started
          <span aria-hidden className="transition-transform group-hover:translate-x-0.5">
            →
          </span>
        </button>
        <p className="mt-3 text-center text-xs text-white/40">Sign in with Google</p>
      </motion.div>
    </main>
  );
}
