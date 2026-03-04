-- ============================================
-- Script: Find Admin Table and Fix Case Sensitivity
-- ============================================
-- MySQL might be case-sensitive or the table might have a different name

-- STEP 1: Show ALL tables in the database
SHOW TABLES;

-- STEP 2: Search for any table with "admin" in the name (case-insensitive)
SELECT TABLE_NAME 
FROM INFORMATION_SCHEMA.TABLES 
WHERE TABLE_SCHEMA = DATABASE()
  AND LOWER(TABLE_NAME) LIKE '%admin%'
ORDER BY TABLE_NAME;

-- STEP 3: Check if table exists with different cases
-- Try these one by one (uncomment the one that works):

-- SELECT COUNT(*) FROM `admin`;  -- lowercase with backticks
-- SELECT COUNT(*) FROM `Admin`;  -- capital A with backticks
-- SELECT COUNT(*) FROM `ADMIN`;  -- all caps with backticks
-- SELECT COUNT(*) FROM `admins`;  -- plural lowercase
-- SELECT COUNT(*) FROM `Admins`;  -- plural capital A

-- STEP 4: Check table structure (replace with actual table name)
-- DESCRIBE `admin`;
-- DESCRIBE `Admin`;
-- DESCRIBE `admins`;

-- STEP 5: Find all columns related to admin and department
SELECT 
    TABLE_NAME,
    COLUMN_NAME,
    DATA_TYPE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND (
    LOWER(TABLE_NAME) LIKE '%admin%' 
    OR LOWER(COLUMN_NAME) LIKE '%department%'
  )
ORDER BY TABLE_NAME, COLUMN_NAME;

