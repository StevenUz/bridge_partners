-- Migration 55: Prevent duplicate active IMP cycles per partnership combo
-- Keep only one active row for each (ns_pair, ew_pair), then enforce uniqueness.

WITH ranked_active AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY ns_pair, ew_pair
      ORDER BY updated_at DESC, created_at DESC, id DESC
    ) AS rn
  FROM public.imp_cycles
  WHERE is_active = true
)
UPDATE public.imp_cycles ic
SET is_active = false,
    completed_at = COALESCE(ic.completed_at, NOW())
FROM ranked_active ra
WHERE ic.id = ra.id
  AND ra.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS ux_imp_cycles_active_partnership
  ON public.imp_cycles (ns_pair, ew_pair)
  WHERE is_active = true;
