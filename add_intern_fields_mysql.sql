-- MySQL/MariaDB SQL Script to Add ID Number, Start Date, and End Date to Interns Table
-- Run this script on your database to add the new fields for intern registration

USE your_database_name; -- Replace 'your_database_name' with your actual database name

-- Add ID Number column (South African ID numbers are 13 digits)
ALTER TABLE interns
ADD COLUMN id_number VARCHAR(13) NULL COMMENT 'South African ID number (13 digits)';

-- Add Start Date column for internship start date
ALTER TABLE interns
ADD COLUMN start_date DATE NULL COMMENT 'Internship start date';

-- Add End Date column for internship end date
ALTER TABLE interns
ADD COLUMN end_date DATE NULL COMMENT 'Internship end date';

-- Add index on ID number for faster lookups
CREATE INDEX idx_interns_id_number ON interns(id_number);

-- Add index on dates for filtering by internship period
CREATE INDEX idx_interns_dates ON interns(start_date, end_date);

-- Add check constraint to ensure end_date is after start_date (MySQL 8.0.16+)
-- For older MySQL versions, remove this constraint and handle validation in application code
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
SELECT 
    COLUMN_NAME, 
    DATA_TYPE, 
    IS_NULLABLE, 
    COLUMN_DEFAULT, 
    COLUMN_COMMENT
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'interns'
  AND COLUMN_NAME IN ('id_number', 'start_date', 'end_date')
ORDER BY ORDINAL_POSITION;

