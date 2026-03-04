-- Rollback Script: Remove ID Number, Start Date, and End Date columns from Interns Table
-- Use this script if you need to undo the changes made by add_intern_fields.sql

USE your_database_name; -- Replace 'your_database_name' with your actual database name

-- Drop indexes first (if they exist)
DROP INDEX IF EXISTS idx_interns_dates ON interns;
DROP INDEX IF EXISTS idx_interns_id_number ON interns;

-- Drop unique constraint if it was added
-- ALTER TABLE interns DROP CONSTRAINT IF EXISTS uk_interns_id_number;

-- Drop check constraint
ALTER TABLE interns DROP CONSTRAINT IF EXISTS chk_intern_dates;

-- Remove the columns
ALTER TABLE interns DROP COLUMN IF EXISTS id_number;
ALTER TABLE interns DROP COLUMN IF EXISTS start_date;
ALTER TABLE interns DROP COLUMN IF EXISTS end_date;

-- Verify the columns have been removed
SELECT 
    COLUMN_NAME, 
    DATA_TYPE, 
    IS_NULLABLE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'interns'
  AND COLUMN_NAME IN ('id_number', 'start_date', 'end_date');

