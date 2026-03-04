-- ============================================
-- Script: Delete Admins with Null Department
-- ============================================
-- This script will delete admins that have NULL department_id
-- so you can add them again with proper department assignment
-- 
-- ✅ Table name confirmed: `admins` (plural)

-- STEP 0: First check your table structure!
-- Run this to see what columns your admins table has:
-- DESCRIBE `admins`;
-- OR
-- SELECT * FROM `admins` LIMIT 1;

-- STEP 1: Check current state - See which admins have NULL department
-- ⚠️ Adjust column names based on your actual table structure!
-- Common column names: admin_id, adminId, user_id, userId, etc.
SELECT 
    'Admins with NULL Department' AS info,
    admin_id,  -- ⚠️ CHANGE THIS - might be: id, adminId, user_id, etc.
    email,
    name,
    department_id,
    role,
    created_at,
    active
FROM `admins`
WHERE department_id IS NULL
ORDER BY email;

-- STEP 2: Count how many will be deleted
SELECT 
    'Summary' AS info,
    COUNT(*) AS total_admins_with_null_department,
    GROUP_CONCAT(email ORDER BY email SEPARATOR ', ') AS admin_emails_to_delete
FROM `admins`
WHERE department_id IS NULL;

-- STEP 3: Create backup of admins that will be deleted (IMPORTANT!)
CREATE TABLE IF NOT EXISTS `admin_null_dept_backup` AS 
SELECT * FROM `admins`
WHERE department_id IS NULL;

-- Verify backup
SELECT 
    'Backup Status' AS info,
    COUNT(*) AS backed_up_records,
    GROUP_CONCAT(email ORDER BY email SEPARATOR ', ') AS backed_up_emails
FROM `admin_null_dept_backup`;

-- STEP 4: Show what will be deleted (Review this carefully!)
-- ⚠️ Adjust column names based on your actual table structure!
SELECT 
    '⚠️ These admins will be DELETED' AS warning,
    admin_id,  -- ⚠️ CHANGE THIS - might be: id, adminId, user_id, etc.
    email,
    name,
    department_id,
    role,
    created_at,
    active
FROM `admins`
WHERE department_id IS NULL
ORDER BY email;

-- STEP 5: ⚠️ DELETE ADMINS WITH NULL DEPARTMENT
-- Uncomment the line below ONLY after reviewing Step 4
-- Make sure you want to delete these specific admins!

-- DELETE FROM `admins`
-- WHERE department_id IS NULL;

-- STEP 6: Verify deletion
SELECT 
    'Verification' AS info,
    COUNT(*) AS remaining_admins_with_null_department
FROM `admins`
WHERE department_id IS NULL;

-- STEP 7: Show remaining admins (should have departments assigned)
-- ⚠️ Replace 'department' with your actual department table name if different!
SELECT 
    'Remaining Admins (with departments)' AS info,
    COUNT(*) AS total_count,
    GROUP_CONCAT(
        CONCAT(a.email, ' (', COALESCE(d.name, 'No Dept'), ')') 
        ORDER BY a.email 
        SEPARATOR ', '
    ) AS admin_list
FROM `admins` a
LEFT JOIN `department` d ON a.department_id = d.id  -- ⚠️ CHANGE 'department' if your table is named differently
WHERE a.department_id IS NOT NULL;

-- ============================================
-- DONE! Admins with NULL department have been deleted.
-- You can now add them again with proper department assignment.
-- ============================================

