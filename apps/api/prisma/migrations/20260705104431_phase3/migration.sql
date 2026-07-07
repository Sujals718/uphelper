-- CreateEnum
CREATE TYPE "VideoScope" AS ENUM ('single_problem', 'multi_problem_bundle', 'unknown');

-- CreateEnum
CREATE TYPE "LanguageSource" AS ENUM ('metadata', 'transcript', 'user_flag', 'uncertain');

-- CreateEnum
CREATE TYPE "ResultCompleteness" AS ENUM ('full', 'partial', 'none');

-- CreateTable
CREATE TABLE "videos" (
    "id" TEXT NOT NULL,
    "youtube_video_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "channel_name" TEXT NOT NULL,
    "published_at" TIMESTAMP(3),
    "view_count" INTEGER NOT NULL DEFAULT 0,
    "comment_count" INTEGER NOT NULL DEFAULT 0,
    "duration_minutes" DOUBLE PRECISION,
    "sentiment_score" DOUBLE PRECISION,
    "satisfaction_score" DOUBLE PRECISION,
    "final_score" DOUBLE PRECISION,
    "sampled_comment_count" INTEGER NOT NULL DEFAULT 0,
    "language" TEXT,
    "language_confidence" DOUBLE PRECISION,
    "language_source" "LanguageSource",
    "user_flagged_incorrect" BOOLEAN NOT NULL DEFAULT false,
    "video_scope" "VideoScope" NOT NULL DEFAULT 'unknown',
    "scored_as_of" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "videos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "video_search_cache" (
    "id" TEXT NOT NULL,
    "query_key" TEXT NOT NULL,
    "video_ids" TEXT[],
    "used_fallback_query" BOOLEAN NOT NULL DEFAULT false,
    "result_completeness" "ResultCompleteness" NOT NULL DEFAULT 'full',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "video_search_cache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "videos_youtube_video_id_key" ON "videos"("youtube_video_id");

-- CreateIndex
CREATE UNIQUE INDEX "video_search_cache_query_key_key" ON "video_search_cache"("query_key");
