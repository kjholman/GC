-- The assistant is now called GAIA: update text already stored (activity, logs, errors).
UPDATE "Activity" SET "message" = replace(replace(replace(replace("message", 'the Sharminator''s', 'GAIA''s'), 'The Sharminator''s', 'GAIA''s'), 'the Sharminator', 'GAIA'), 'The Sharminator', 'GAIA') WHERE "message" LIKE '%Sharminator%';
UPDATE "Activity" SET "message" = replace("message", 'Sharminator', 'GAIA') WHERE "message" LIKE '%Sharminator%';
UPDATE "Analysis" SET "steps" = replace(replace(replace(replace(replace("steps"::text, 'the Sharminator''s', 'GAIA''s'), 'The Sharminator''s', 'GAIA''s'), 'the Sharminator', 'GAIA'), 'The Sharminator', 'GAIA'), 'Sharminator', 'GAIA')::jsonb WHERE "steps"::text LIKE '%Sharminator%';
UPDATE "Analysis" SET "error" = replace(replace(replace("error", 'the Sharminator', 'GAIA'), 'The Sharminator', 'GAIA'), 'Sharminator', 'GAIA') WHERE "error" LIKE '%Sharminator%';
UPDATE "Analysis" SET "progress" = replace(replace(replace("progress", 'the Sharminator', 'GAIA'), 'The Sharminator', 'GAIA'), 'Sharminator', 'GAIA') WHERE "progress" LIKE '%Sharminator%';
