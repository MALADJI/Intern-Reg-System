-- ============================================
-- Simple Script: Delete Departments with NULL Name
-- ============================================
-- Deletes only departments where name is NULL
-- ✅ Fixed for MySQL Safe Update Mode

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
-- ✅ Using id (key column) to satisfy safe update mode
DELETE FROM `departments`
WHERE id IN (
    SELECT id FROM `departments` WHERE name IS NULL
);

-- Alternative if above doesn't work: Use this instead
-- DELETE d FROM `departments` d
-- WHERE d.name IS NULL AND d.id IS NOT NULL;

-- STEP 5: Verify (should return 0)
SELECT COUNT(*) AS remaining_null_departments
FROM `departments`
WHERE name IS NULL;

-- ============================================
-- DONE!
-- ============================================

