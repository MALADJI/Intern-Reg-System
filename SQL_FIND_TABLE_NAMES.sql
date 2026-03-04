-- ============================================
-- Script: Find Correct Table Names
-- ============================================
-- Run this first to find the correct table names in your database

-- STEP 1: Show all tables in the database
SHOW TABLES;

-- STEP 2: Find tables that might be the admin table
SHOW TABLES LIKE '%admin%';
SHOW TABLES LIKE '%Admin%';
SHOW TABLES LIKE '%ADMIN%';

-- STEP 3: Check table structure (try different possible names)
-- Uncomment the one that matches your table name:

-- DESCRIBE admin;
-- DESCRIBE Admin;
-- DESCRIBE admins;
-- DESCRIBE Admins;
-- DESCRIBE ADMIN;

-- STEP 4: Check if table has department_id column
-- Replace 'admin' with your actual table name from Step 1
SELECT 
    TABLE_NAME,
    COLUMN_NAME,
    DATA_TYPE,
    IS_NULLABLE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME LIKE '%admin%'
  AND COLUMN_NAME LIKE '%department%'
ORDER BY TABLE_NAME, COLUMN_NAME;

-- STEP 5: Count records in admin table (try different names)
-- Replace 'admin' with your actual table name:
-- SELECT COUNT(*) FROM admin;
-- SELECT COUNT(*) FROM Admin;
-- SELECT COUNT(*) FROM admins;

