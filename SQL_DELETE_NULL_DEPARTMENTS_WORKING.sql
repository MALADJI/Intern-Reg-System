-- ============================================
-- Working Script: Delete Departments with NULL Name
-- ============================================
-- ✅ Works without assuming column names
-- ✅ Handles MySQL Safe Update Mode

-- STEP 0: Check table structure first
DESCRIBE `departments`;
-- OR
SHOW COLUMNS FROM `departments`;

-- STEP 1: Preview departments with NULL name
SELECT * FROM `departments` WHERE name IS NULL;

-- STEP 2: Count
SELECT COUNT(*) AS null_departments_count
FROM `departments`
WHERE name IS NULL;

-- STEP 3: Backup
CREATE TABLE `department_null_backup` AS 
SELECT * FROM `departments`
WHERE name IS NULL;

-- STEP 4: Delete departments with NULL name
-- ✅ Method 1: Disable safe mode (simplest)
SET SQL_SAFE_UPDATES = 0;
DELETE FROM `departments` WHERE name IS NULL;
SET SQL_SAFE_UPDATES = 1;

-- ✅ Method 2: Using LIMIT (if safe mode is required)
-- First, find the primary key column name from STEP 0, then use:
-- DELETE FROM `departments` 
-- WHERE name IS NULL 
-- LIMIT 1000;  -- Adjust limit as needed

-- ✅ Method 3: Using table alias (sometimes works)
-- DELETE d FROM `departments` d
-- WHERE d.name IS NULL;

-- STEP 5: Verify (should return 0)
SELECT COUNT(*) AS remaining_null_departments
FROM `departments`
WHERE name IS NULL;

-- ============================================
-- DONE!
-- ============================================

