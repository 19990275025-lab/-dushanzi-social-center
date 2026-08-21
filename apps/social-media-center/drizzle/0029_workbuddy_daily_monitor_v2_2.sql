ALTER TABLE social_post_snapshots ADD COLUMN snapshot_date TEXT;
--> statement-breakpoint
ALTER TABLE social_post_snapshots ADD COLUMN collection_batch TEXT;
--> statement-breakpoint
UPDATE social_post_snapshots SET snapshot_date = substr(snapshot_time, 1, 10) WHERE snapshot_date IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS uq_social_post_snapshots_post_date_batch
  ON social_post_snapshots(post_id, snapshot_date, collection_batch)
  WHERE collection_batch IS NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS social_post_evaluations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL REFERENCES social_posts(id) ON UPDATE CASCADE ON DELETE CASCADE,
  evaluation_date TEXT NOT NULL,
  snapshot_id INTEGER NOT NULL REFERENCES social_post_snapshots(id) ON UPDATE CASCADE ON DELETE CASCADE,
  total_score REAL,
  grade TEXT,
  propagation_score REAL,
  interaction_score REAL,
  attraction_score REAL,
  efficiency_score REAL,
  confidence TEXT NOT NULL,
  douyin_paid_status TEXT NOT NULL DEFAULT 'none',
  data_completeness REAL,
  raw_evaluation TEXT NOT NULL,
  collection_log_id INTEGER REFERENCES collection_logs(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS uq_social_post_evaluations_snapshot
  ON social_post_evaluations(post_id, evaluation_date, snapshot_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_social_post_evaluations_post_date
  ON social_post_evaluations(post_id, evaluation_date DESC);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS uq_social_post_metric_series_time
  ON social_post_metric_series(post_id, metric_type, series_name, point_time)
  WHERE point_time IS NOT NULL;
