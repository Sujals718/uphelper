-- CreateEnum
CREATE TYPE "PromptType" AS ENUM ('hint', 'debug');

-- CreateTable
CREATE TABLE "prompt_templates" (
    "id" TEXT NOT NULL,
    "type" "PromptType" NOT NULL,
    "version" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prompt_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "prompt_templates_type_version_key" ON "prompt_templates"("type", "version");
