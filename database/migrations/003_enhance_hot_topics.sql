BEGIN;

ALTER TABLE hot_topics ADD COLUMN IF NOT EXISTS keyword VARCHAR(255);
ALTER TABLE hot_topics ADD COLUMN IF NOT EXISTS status VARCHAR(16) NOT NULL DEFAULT 'active';
ALTER TABLE hot_topics ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE hot_topics SET keyword = topic_name WHERE keyword IS NULL OR btrim(keyword) = '';
ALTER TABLE hot_topics ALTER COLUMN keyword SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ck_hot_topics_status'
  ) THEN
    ALTER TABLE hot_topics ADD CONSTRAINT ck_hot_topics_status
      CHECK (status IN ('active', 'paused', 'archived'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_hot_topics_status_heat
  ON hot_topics (status, heat_value DESC);
CREATE INDEX IF NOT EXISTS idx_hot_topics_keyword
  ON hot_topics (keyword);

COMMENT ON COLUMN hot_topics.keyword IS '用于匹配景区历史内容和生成选题的核心关键词';
COMMENT ON COLUMN hot_topics.status IS '热点运营状态：active、paused、archived';
COMMENT ON COLUMN hot_topics.created_at IS '热点记录创建时间；collect_time 继续表示最近采集或编辑时间';

COMMIT;
