-- A linked flow names the repo it serves, owner/name, so its card can prove
-- where it is used with a GitHub link. Backfilled from the owner/repo title
-- prefix every repo audit and README pass uses, plus the 4 flows a README
-- audit on 2026-09-30 found embedded under titles that do not name the repo.
ALTER TABLE flows ADD COLUMN IF NOT EXISTS repo text;
UPDATE flows SET repo = substring(title from '^([A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+)([[:space:]]|:|$)')
 WHERE repo IS NULL AND title ~ '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+([[:space:]]|:|$)';
UPDATE flows SET repo = v.repo, tags = CASE WHEN 'linked' = ANY(tags) THEN tags ELSE array_append(tags, 'linked') END
  FROM (VALUES
    ('a290832d-fe84-41d5-abf4-e116ed6fc170'::uuid, 'bunlongheng/forensic'),
    ('68d4e219-832e-4ad3-b801-6494b1089e3a'::uuid, 'bunlongheng/snake-eyes'),
    ('725b4551-4440-49b6-a90b-d9fcadef7cbb'::uuid, 'bunlongheng/stickies'),
    ('77f0c76c-4428-46d6-b12a-9b5bbc8cf138'::uuid, 'bunlongheng/stickies-web')
  ) AS v(id, repo)
 WHERE flows.id = v.id AND flows.repo IS NULL;
