-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "providerMetadata" JSONB,
ADD COLUMN     "providerName" TEXT,
ADD COLUMN     "providerRefId" TEXT;

-- CreateTable
CREATE TABLE "ProviderWebhookEvent" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "transmissionId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProviderWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProviderWebhookEvent_transmissionId_key" ON "ProviderWebhookEvent"("transmissionId");

-- CreateIndex
CREATE INDEX "ProviderWebhookEvent_provider_idx" ON "ProviderWebhookEvent"("provider");

-- CreateIndex
CREATE INDEX "ProviderWebhookEvent_transmissionId_idx" ON "ProviderWebhookEvent"("transmissionId");

-- CreateIndex
CREATE INDEX "ProviderWebhookEvent_processedAt_idx" ON "ProviderWebhookEvent"("processedAt");

-- CreateIndex
CREATE INDEX "Transaction_providerRefId_idx" ON "Transaction"("providerRefId");
