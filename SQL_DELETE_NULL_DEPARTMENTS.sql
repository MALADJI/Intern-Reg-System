-- ============================================
-- Script: Delete Departments with NULL Values
-- ============================================
-- This will delete only departments that have NULL in any column
-- (typically NULL name or NULL id)

-- STEP 1: Preview departments with NULL values
-- Check for NULL in common columns
SELECT 
    id,
    name,
    CASE 
        WHEN name IS NULL THEN '⚠️ NULL name'
        ELSE 'OK'
    END AS name_status,
    CASE 
        WHEN id IS NULL THEN '⚠️ NULL id'
        ELSE 'OK'
    END AS id_status
FROM `department`
WHERE name IS NULL 
   OR id IS NULL
ORDER BY id;

-- STEP 2: Count departments with NULL
SELECT 
    COUNT(*) AS departments_with_null,
    SUM(CASE WHEN name IS NULL THEN 1 ELSE 0 END) AS null_names,
    SUM(CASE WHEN id IS NULL THEN 1 ELSE 0 END) AS null_ids
FROM `department`
WHERE name IS NULL OR id IS NULL;

-- STEP 3: Create backup of NULL departments
CREATE TABLE IF NOT EXISTS `department_null_backup` AS 
SELECT * FROM `department`
WHERE name IS NULL OR id IS NULL;

-- Verify backup
SELECT 
    COUNT(*) AS backed_up_count,
    GROUP_CONCAT(COALESCE(name, 'NULL'), ' (ID: ', COALESCE(id, 'NULL'), ')') AS backed_up_departments
FROM `department_null_backup`;

-- STEP 4: Show what will be deleted
SELECT 
    '⚠️ These departments will be DELETED' AS warning,
    id,
    name
FROM `department`
WHERE name IS NULL OR id IS NULL;

-- STEP 5: ⚠️ DELETE DEPARTMENTS WITH NULL VALUES
-- Uncomment ONLY after reviewing Steps 1-4

-- Delete departments with NULL name
-- DELETE FROM `department`
-- WHERE name IS NULL;

-- OR delete departments with NULL id (if id can be NULL)
-- DELETE FROM `department`
-- WHERE id IS NULL;

-- OR delete departments with ANY NULL value
-- DELETE FROM `department`
-- WHERE name IS NULL OR id IS NULL;

-- STEP 6: Verify deletion
SELECT 
    COUNT(*) AS remaining_null_departments
FROM `department`
WHERE name IS NULL OR id IS NULL;
-- Should return 0 after deletion

-- STEP 7: Show remaining departments (all should have values)
SELECT 
    id,
    name
FROM `department`
ORDER BY name;

-- ============================================
-- DONE! Departments with NULL values have been deleted.
-- ============================================

