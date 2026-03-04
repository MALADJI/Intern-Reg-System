-- ============================================
-- Simple Script: Delete Admins with NULL Department
-- ============================================
-- This will delete admins that have NULL department_id
-- so you can add them again with proper department assignment

-- STEP 1: Preview - See which admins have NULL department
SELECT 
    email,
    name,
    department_id
FROM `admins`
WHERE department_id IS NULL
ORDER BY email;

-- STEP 2: Count how many will be deleted
SELECT 
    COUNT(*) AS total_to_delete,
    GROUP_CONCAT(email ORDER BY email SEPARATOR ', ') AS emails_to_delete
FROM `admins`
WHERE department_id IS NULL;

-- STEP 3: Create backup (IMPORTANT!)
CREATE TABLE IF NOT EXISTS `admin_null_dept_backup` AS 
SELECT * FROM `admins`
WHERE department_id IS NULL;

-- Verify backup was created
SELECT 
    COUNT(*) AS backed_up_count,
    GROUP_CONCAT(email ORDER BY email SEPARATOR ', ') AS backed_up_emails
FROM `admin_null_dept_backup`;

-- STEP 4: ⚠️ DELETE ADMINS WITH NULL DEPARTMENT
-- Uncomment the DELETE statement below ONLY after reviewing Steps 1-3
-- Make sure you want to delete these admins!

-- DELETE FROM `admins`
-- WHERE department_id IS NULL;

-- STEP 5: Verify deletion (should return 0)
SELECT 
    COUNT(*) AS remaining_with_null_department
FROM `admins`
WHERE department_id IS NULL;

-- STEP 6: Show remaining admins (all should have departments)
SELECT 
    a.email,
    a.name,
    d.name AS department_name
FROM `admins` a
LEFT JOIN `department` d ON a.department_id = d.id
WHERE a.department_id IS NOT NULL
ORDER BY a.email;

-- ============================================
-- DONE! Admins with NULL department have been deleted.
-- You can now add them again through your application with proper departments.
-- ============================================

