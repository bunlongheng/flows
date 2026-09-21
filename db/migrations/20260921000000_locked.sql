-- A locked diagram cannot be deleted. Diagrams get embedded in READMEs - the
-- Stickies architecture is in stickies/README.md, the Flows architecture is in
-- this repo's own - and a delete there breaks a page nobody was looking at.
-- Unlock is a deliberate second step, which is the whole point.

ALTER TABLE flows ADD COLUMN IF NOT EXISTS locked boolean NOT NULL DEFAULT false;
