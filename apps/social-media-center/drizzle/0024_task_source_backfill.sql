UPDATE `content_tasks`
SET `source_type` = 'ai_content_plan',
    `source_id` = (SELECT `plan_id` FROM `content_plans` WHERE `content_plans`.`task_id` = `content_tasks`.`id` LIMIT 1)
WHERE EXISTS (SELECT 1 FROM `content_plans` WHERE `content_plans`.`task_id` = `content_tasks`.`id`);
