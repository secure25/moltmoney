-- Add merchantCategory to Transaction: the category declared at order
-- creation (classified by the calling agent, enforced server-side by
-- MoltMoney). Persisted so blocked-category prohibitions can be re-checked
-- at capture time. Nullable: legacy transactions predate the column.
ALTER TABLE "Transaction" ADD COLUMN "merchantCategory" TEXT;
