-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('AGENT', 'OWNER', 'GUEST');

-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'FROZEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "TxType" AS ENUM ('INTERNAL', 'INBOUND', 'OUTBOUND', 'PAYOUT');

-- CreateEnum
CREATE TYPE "TxStatus" AS ENUM ('PENDING', 'APPROVED', 'COMPLETED', 'DECLINED', 'FAILED');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('PENDING', 'PAID', 'EXPIRED', 'DECLINED');

-- CreateEnum
CREATE TYPE "CardStatus" AS ENUM ('ACTIVE', 'FROZEN', 'CANCELLED');

-- CreateTable
CREATE TABLE "Owner" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Owner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Agent" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "apiKey" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Agent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "type" "AccountType" NOT NULL,
    "balance" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" "AccountStatus" NOT NULL,
    "spendingRules" JSONB,
    "agentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "type" "TxType" NOT NULL,
    "status" "TxStatus" NOT NULL,
    "description" TEXT,
    "merchantName" TEXT,
    "fromAccountId" TEXT NOT NULL,
    "toAccountId" TEXT,
    "approvalRequired" BOOLEAN NOT NULL DEFAULT false,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentRequest" (
    "id" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "description" TEXT NOT NULL,
    "status" "RequestStatus" NOT NULL,
    "paymentLink" TEXT,
    "fromAccountId" TEXT NOT NULL,
    "toAccountId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VirtualCard" (
    "id" TEXT NOT NULL,
    "cardNumber" TEXT NOT NULL,
    "expiryMonth" INTEGER NOT NULL,
    "expiryYear" INTEGER NOT NULL,
    "cvv" TEXT NOT NULL,
    "status" "CardStatus" NOT NULL,
    "spendLimit" DECIMAL(18,2),
    "accountId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VirtualCard_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Owner_email_key" ON "Owner"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Agent_apiKey_key" ON "Agent"("apiKey");

-- CreateIndex
CREATE INDEX "Agent_ownerId_idx" ON "Agent"("ownerId");

-- CreateIndex
CREATE INDEX "Agent_apiKey_idx" ON "Agent"("apiKey");

-- CreateIndex
CREATE UNIQUE INDEX "Account_agentId_key" ON "Account"("agentId");

-- CreateIndex
CREATE INDEX "Account_agentId_idx" ON "Account"("agentId");

-- CreateIndex
CREATE INDEX "Account_status_idx" ON "Account"("status");

-- CreateIndex
CREATE INDEX "Transaction_fromAccountId_idx" ON "Transaction"("fromAccountId");

-- CreateIndex
CREATE INDEX "Transaction_toAccountId_idx" ON "Transaction"("toAccountId");

-- CreateIndex
CREATE INDEX "Transaction_status_idx" ON "Transaction"("status");

-- CreateIndex
CREATE INDEX "Transaction_createdAt_idx" ON "Transaction"("createdAt");

-- CreateIndex
CREATE INDEX "Transaction_type_idx" ON "Transaction"("type");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentRequest_paymentLink_key" ON "PaymentRequest"("paymentLink");

-- CreateIndex
CREATE INDEX "PaymentRequest_fromAccountId_idx" ON "PaymentRequest"("fromAccountId");

-- CreateIndex
CREATE INDEX "PaymentRequest_toAccountId_idx" ON "PaymentRequest"("toAccountId");

-- CreateIndex
CREATE INDEX "PaymentRequest_status_idx" ON "PaymentRequest"("status");

-- CreateIndex
CREATE INDEX "PaymentRequest_expiresAt_idx" ON "PaymentRequest"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "VirtualCard_cardNumber_key" ON "VirtualCard"("cardNumber");

-- CreateIndex
CREATE INDEX "VirtualCard_accountId_idx" ON "VirtualCard"("accountId");

-- CreateIndex
CREATE INDEX "VirtualCard_status_idx" ON "VirtualCard"("status");

-- AddForeignKey
ALTER TABLE "Agent" ADD CONSTRAINT "Agent_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_fromAccountId_fkey" FOREIGN KEY ("fromAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_toAccountId_fkey" FOREIGN KEY ("toAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentRequest" ADD CONSTRAINT "PaymentRequest_fromAccountId_fkey" FOREIGN KEY ("fromAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentRequest" ADD CONSTRAINT "PaymentRequest_toAccountId_fkey" FOREIGN KEY ("toAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VirtualCard" ADD CONSTRAINT "VirtualCard_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
