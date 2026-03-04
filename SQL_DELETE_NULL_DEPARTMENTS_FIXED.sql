-- ============================================
-- Fixed Script: Delete Departments with NULL Name
-- ============================================
-- ✅ Works with MySQL Safe Update Mode
-- ✅ Uses correct table name: `departments`

-- STEP 1: Preview departments with NULL name
SELECT 
    id,
    name
FROM `departments`
WHERE name IS NULL;

-- STEP 2: Count
SELECT COUNT(*) AS null_departments_count
FROM `departments`
WHERE name IS NULL;

-- STEP 3: Backup
CREATE TABLE `department_null_backup` AS 
SELECT * FROM `departments`
WHERE name IS NULL;

-- STEP 4: Delete departments with NULL name
-- ✅ Method 1: Disable safe mode (RECOMMENDED - Simplest)
SET SQL_SAFE_UPDATES = 0;
DELETE FROM `departments` WHERE name IS NULL;
SET SQL_SAFE_UPDATES = 1;

-- ✅ Method 2: Using table alias
-- DELETE d FROM `departments` d
-- WHERE d.name IS NULL;

-- ✅ Method 3: Using LIMIT (if you need to keep safe mode on)
-- First check your table structure to find primary key, then:
-- DELETE FROM `departments` 
-- WHERE name IS NULL 
-- LIMIT 1000;  -- Adjust limit as needed

-- STEP 5: Verify (should return 0)
SELECT COUNT(*) AS remaining_null_departments
FROM `departments`
WHERE name IS NULL;

-- ============================================
-- DONE!
-- ============================================

