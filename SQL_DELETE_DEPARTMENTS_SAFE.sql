-- ============================================
-- Safe Script: Delete Departments (With Safety Checks)
-- ============================================
-- This version includes safety checks before deletion

-- STEP 1: Preview all departments
SELECT 
    id,
    name
FROM `department`
ORDER BY name;

-- STEP 2: Check which departments have admins assigned
SELECT 
    d.id,
    d.name,
    COUNT(a.email) AS admin_count,
    CASE 
        WHEN COUNT(a.email) > 0 THEN '⚠️ HAS ADMINS - Will break foreign keys!'
        ELSE '✅ Safe to delete'
    END AS status
FROM `department` d
LEFT JOIN `admins` a ON d.id = a.department_id
GROUP BY d.id, d.name
ORDER BY admin_count DESC;

-- STEP 3: Show departments that are SAFE to delete (no admins assigned)
SELECT 
    d.id,
    d.name,
    'Safe to delete' AS status
FROM `department` d
LEFT JOIN `admins` a ON d.id = a.department_id
WHERE a.department_id IS NULL
GROUP BY d.id, d.name;

-- STEP 4: Create backup
CREATE TABLE IF NOT EXISTS `department_backup` AS 
SELECT * FROM `department`;

SELECT 'Backup created' AS status, COUNT(*) AS count FROM `department_backup`;

-- STEP 5: Option A - Delete ONLY departments with NO admins (SAFEST)
-- This will only delete departments that aren't being used
DELETE FROM `department`
WHERE id NOT IN (
    SELECT DISTINCT department_id 
    FROM `admins` 
    WHERE department_id IS NOT NULL
);

-- STEP 6: Option B - Delete ALL departments (⚠️ DANGEROUS - breaks foreign keys!)
-- Uncomment ONLY if you're sure and have handled foreign key constraints:
-- SET FOREIGN_KEY_CHECKS = 0;
-- DELETE FROM `department`;
-- SET FOREIGN_KEY_CHECKS = 1;

-- STEP 7: Option C - Delete specific departments by name
-- Uncomment and modify:
-- DELETE FROM `department`
-- WHERE name = 'DepartmentName';  -- Replace with actual name

-- STEP 8: Verify
SELECT 
    COUNT(*) AS remaining_departments,
    GROUP_CONCAT(name ORDER BY name SEPARATOR ', ') AS remaining_names
FROM `department`;

-- ============================================
-- IMPORTANT NOTES:
-- 1. If you delete departments that have admins assigned, you'll need to:
--    - Set admins.department_id to NULL first, OR
--    - Delete those admins first, OR
--    - Temporarily disable foreign key checks
-- 2. Always backup first!
-- 3. Test in development environment first!
-- ============================================

