-- ============================================
-- Script: Check Admins Table Structure
-- ============================================
-- Run this first to see what columns your admins table has

-- Check table structure
DESCRIBE `admins`;

-- OR

SHOW COLUMNS FROM `admins`;

-- OR get detailed info
SELECT 
    COLUMN_NAME,
    DATA_TYPE,
    IS_NULLABLE,
    COLUMN_KEY,
    COLUMN_DEFAULT
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'admins'
ORDER BY ORDINAL_POSITION;

-- Show sample data to see column names
SELECT * FROM `admins` LIMIT 1;

