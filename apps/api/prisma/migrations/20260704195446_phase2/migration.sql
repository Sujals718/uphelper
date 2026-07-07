-- CreateEnum
CREATE TYPE "RevisionStatus" AS ENUM ('pending', 'done', 'snoozed');

-- CreateTable
CREATE TABLE "mistakes" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "problem_id" TEXT,
    "note" TEXT NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mistakes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "revision_items" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "problem_id" TEXT,
    "problem_name" TEXT NOT NULL,
    "self_hint" TEXT,
    "reminder_at" TIMESTAMP(3),
    "sm2_repetition" INTEGER NOT NULL DEFAULT 0,
    "sm2_ease_factor" DOUBLE PRECISION NOT NULL DEFAULT 2.5,
    "sm2_interval_days" INTEGER NOT NULL DEFAULT 1,
    "next_review_at" TIMESTAMP(3),
    "status" "RevisionStatus" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "revision_items_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "mistakes" ADD CONSTRAINT "mistakes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mistakes" ADD CONSTRAINT "mistakes_problem_id_fkey" FOREIGN KEY ("problem_id") REFERENCES "problems"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "revision_items" ADD CONSTRAINT "revision_items_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "revision_items" ADD CONSTRAINT "revision_items_problem_id_fkey" FOREIGN KEY ("problem_id") REFERENCES "problems"("id") ON DELETE SET NULL ON UPDATE CASCADE;
