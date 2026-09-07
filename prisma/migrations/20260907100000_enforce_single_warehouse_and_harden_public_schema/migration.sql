-- D13: V1 has exactly one warehouse per branch. The unique branch_id already
-- enforces the cardinality; is_primary is therefore redundant.
ALTER TABLE "warehouses" DROP CONSTRAINT IF EXISTS "warehouses_primary_check";
ALTER TABLE "warehouses" DROP COLUMN "is_primary";

-- NestJS/Prisma is the only data-access boundary. Keep public Data API roles
-- from reaching business data directly and stop future postgres-owned objects
-- from inheriting broad table/sequence grants.
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL PRIVILEGES ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL PRIVILEGES ON SEQUENCES FROM anon, authenticated;

-- Defense in depth for every inventory table in the exposed public schema.
ALTER TABLE "inventory_balances" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inventory_movements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "stock_adjustments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "stock_adjustment_items" ENABLE ROW LEVEL SECURITY;

-- Match keyset pagination order used by the inventory query service.
CREATE INDEX "inventory_movements_occurred_at_id_idx"
  ON "inventory_movements"("occurred_at" DESC, "id" DESC);
CREATE INDEX "inventory_movements_warehouse_id_occurred_at_id_idx"
  ON "inventory_movements"("warehouse_id", "occurred_at" DESC, "id" DESC);

DROP INDEX "stock_adjustments_warehouse_id_posted_at_idx";
CREATE INDEX "stock_adjustments_warehouse_id_posted_at_id_idx"
  ON "stock_adjustments"("warehouse_id", "posted_at" DESC, "id" DESC);
