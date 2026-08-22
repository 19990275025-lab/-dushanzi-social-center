CREATE TABLE IF NOT EXISTS data_maintenance_runs (
  operation TEXT PRIMARY KEY,
  result_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
