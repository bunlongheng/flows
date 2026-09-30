-- Diagrams made during a repo audit or a README pass are titled
-- "owner/repo - ...". They list under the gallery's Linked tab from now on,
-- by the "linked" tag; existing ones get the tag here so they move too.
UPDATE flows
   SET tags = array_append(tags, 'linked')
 WHERE deleted_at IS NULL
   AND NOT ('linked' = ANY(tags))
   AND title ~ '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+([[:space:]]|:|$)';
