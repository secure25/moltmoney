/*
  Warnings:

  - A unique constraint covering the columns `[accountNumber]` on the table `Account` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "accountNumber" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Account_accountNumber_key" ON "Account"("accountNumber");

-- CreateIndex
CREATE INDEX "Account_accountNumber_idx" ON "Account"("accountNumber");
