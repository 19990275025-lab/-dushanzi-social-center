DROP INDEX IF EXISTS uq_social_fans_source_record;
--> statement-breakpoint
CREATE UNIQUE INDEX uq_social_fans_source_record
  ON social_fans(platform, source_record_id);
--> statement-breakpoint
DROP INDEX IF EXISTS uq_fan_growth_source_record;
--> statement-breakpoint
CREATE UNIQUE INDEX uq_fan_growth_source_record
  ON fan_growth_records(platform, source_record_id);
--> statement-breakpoint
DROP INDEX IF EXISTS uq_content_audience_source_record;
--> statement-breakpoint
CREATE UNIQUE INDEX uq_content_audience_source_record
  ON content_audience_analysis(platform, source_record_id);
--> statement-breakpoint
DROP INDEX IF EXISTS uq_competitor_posts_source_record;
--> statement-breakpoint
CREATE UNIQUE INDEX uq_competitor_posts_source_record
  ON competitor_posts(platform, source_record_id);
