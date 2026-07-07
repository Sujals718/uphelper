-- CreateTable
CREATE TABLE "platform_accounts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "last_synced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "problems" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "difficulty" INTEGER,
    "tags" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "problems_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contests" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "start_time" TIMESTAMP(3),
    "total_problems" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contest_participation" (
    "id" TEXT NOT NULL,
    "platform_account_id" TEXT NOT NULL,
    "contest_id" TEXT NOT NULL,
    "problems_solved" INTEGER NOT NULL,
    "total_problems" INTEGER NOT NULL,
    "unsolved_problem_id" TEXT,
    "synced_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contest_participation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "platform_accounts_user_id_platform_key" ON "platform_accounts"("user_id", "platform");

-- CreateIndex
CREATE UNIQUE INDEX "problems_platform_external_id_key" ON "problems"("platform", "external_id");

-- CreateIndex
CREATE UNIQUE INDEX "contests_platform_external_id_key" ON "contests"("platform", "external_id");

-- CreateIndex
CREATE UNIQUE INDEX "contest_participation_platform_account_id_contest_id_key" ON "contest_participation"("platform_account_id", "contest_id");

-- AddForeignKey
ALTER TABLE "platform_accounts" ADD CONSTRAINT "platform_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contest_participation" ADD CONSTRAINT "contest_participation_platform_account_id_fkey" FOREIGN KEY ("platform_account_id") REFERENCES "platform_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contest_participation" ADD CONSTRAINT "contest_participation_contest_id_fkey" FOREIGN KEY ("contest_id") REFERENCES "contests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contest_participation" ADD CONSTRAINT "contest_participation_unsolved_problem_id_fkey" FOREIGN KEY ("unsolved_problem_id") REFERENCES "problems"("id") ON DELETE SET NULL ON UPDATE CASCADE;
