-- CreateTable
CREATE TABLE "ExternalBankAccount" (
    "id" TEXT NOT NULL,
    "routingNumber" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "accountHolder" TEXT NOT NULL,
    "accountType" TEXT NOT NULL,
    "balance" DECIMAL(18,2) NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExternalBankAccount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExternalBankAccount_routingNumber_idx" ON "ExternalBankAccount"("routingNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalBankAccount_routingNumber_accountNumber_key" ON "ExternalBankAccount"("routingNumber", "accountNumber");
