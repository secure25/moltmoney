-- DropForeignKey
ALTER TABLE "PaymentRequest" DROP CONSTRAINT "PaymentRequest_toAccountId_fkey";

-- AlterTable
ALTER TABLE "PaymentRequest" ALTER COLUMN "toAccountId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "PaymentRequest" ADD CONSTRAINT "PaymentRequest_toAccountId_fkey" FOREIGN KEY ("toAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
