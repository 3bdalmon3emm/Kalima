-- Students hear when a teacher lowers a finished exam's essay mark.
-- Additive and idempotent.

ALTER TYPE "notification_key_enum" ADD VALUE IF NOT EXISTS 'EXAM_SCORE_CHANGED';
