-- SQL Script to Add ID Number, Start Date, and End Date to Interns Table
-- This script adds three new columns to the interns table for storing intern identification and internship period information

-- Add ID Number column (South African ID numbers are 13 digits)
ALTER TABLE interns
ADD COLUMN id_number VARCHAR(13) NULL COMMENT 'South African ID number (13 digits)';

-- Add Start Date column for internship start date
ALTER TABLE interns
ADD COLUMN start_date DATE NULL COMMENT 'Internship start date';

-- Add End Date column for internship end date
ALTER TABLE interns
ADD COLUMN end_date DATE NULL COMMENT 'Internship end date';

-- Optional: Add index on ID number for faster lookups (if ID numbers will be used for searching)
CREATE INDEX idx_interns_id_number ON interns(id_number);

-- Optional: Add index on dates for filtering by internship period
CREATE INDEX idx_interns_dates ON interns(start_date, end_date);

-- Optional: Add check constraint to ensure end_date is after start_date (if both are provided)
ALTER TABLE interns
ADD CONSTRAINT chk_intern_dates CHECK (
    (start_date IS NULL AND end_date IS NULL) OR
    (start_date IS NOT NULL AND end_date IS NOT NULL AND end_date >= start_date) OR
    (start_date IS NOT NULL AND end_date IS NULL)
);

-- Optional: Add unique constraint on ID number if each intern should have a unique ID
-- Uncomment the following line if ID numbers should be unique:
-- ALTER TABLE interns ADD CONSTRAINT uk_interns_id_number UNIQUE (id_number);

-- Verify the changes
-- SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT, COLUMN_COMMENT
-- FROM INFORMATION_SCHEMA.COLUMNS
-- WHERE TABLE_SCHEMA = DATABASE()
--   AND TABLE_NAME = 'interns'
--   AND COLUMN_NAME IN ('id_number', 'start_date', 'end_date');

