UPDATE discovery_leads
SET revon_push_status = CASE revon_push_status
  WHEN 'idle' THEN 'not_attempted'
  WHEN 'dry-run' THEN 'dry_run'
  WHEN 'imported' THEN 'succeeded'
  ELSE revon_push_status
END
WHERE revon_push_status IN ('idle', 'dry-run', 'imported');
