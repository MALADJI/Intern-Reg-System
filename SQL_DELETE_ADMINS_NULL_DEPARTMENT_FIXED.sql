-- ============================================
-- Script: Delete Admins with Null Department (FIXED VERSION)
-- ============================================
-- This version uses backticks to handle case sensitivity
-- 
-- ⚠️ FIRST: Run SQL_FIND_AND_FIX_TABLE_NAME.sql to find your exact table name!
-- Then replace `admin` below with your actual table name

-- STEP 1: Find your table name first (run this!)
-- SHOW TABLES LIKE '%admin%';

-- STEP 2: Check current state - See which admins have NULL department
-- ⚠️ Replace `admin` with your actual table name (use backticks for case sensitivity)
SELECT 
    'Admins with NULL Department' AS info,
    id,
    email,
    name,
    department_id,
    role,
    created_at,
    active
FROM `admin`  -- ⚠️ CHANGE THIS - Use backticks and your actual table name
WHERE department_id IS NULL
ORDER BY email;

-- STEP 3: Count how many will be deleted
SELECT 
    'Summary' AS info,
    COUNT(*) AS total_admins_with_null_department,
    GROUP_CONCAT(email ORDER BY email SEPARATOR ', ') AS admin_emails_to_delete
FROM `admin`  -- ⚠️ CHANGE THIS
WHERE department_id IS NULL;

-- STEP 4: Create backup of admins that will be deleted (IMPORTANT!)
CREATE TABLE IF NOT EXISTS `admin_null_dept_backup` AS 
SELECT * FROM `admin`  -- ⚠️ CHANGE THIS
WHERE department_id IS NULL;

-- Verify backup
SELECT 
    'Backup Status' AS info,
    COUNT(*) AS backed_up_records,
    GROUP_CONCAT(email ORDER BY email SEPARATOR ', ') AS backed_up_emails
FROM `admin_null_dept_backup`;

-- STEP 5: Show what will be deleted (Review this carefully!)
SELECT 
    '⚠️ These admins will be DELETED' AS warning,
    id,
    email,
    name,
    department_id,
    role,
    created_at,
    active
FROM `admin`  -- ⚠️ CHANGE THIS
WHERE department_id IS NULL
ORDER BY email;

-- STEP 6: ⚠️ DELETE ADMINS WITH NULL DEPARTMENT
-- Uncomment the line below ONLY after reviewing Step 5
-- Make sure you want to delete these specific admins!

-- DELETE FROM `admin`  -- ⚠️ CHANGE THIS
-- WHERE department_id IS NULL;

-- STEP 7: Verify deletion
SELECT 
    'Verification' AS info,
    COUNT(*) AS remaining_admins_with_null_department
FROM `admin`  -- ⚠️ CHANGE THIS
WHERE department_id IS NULL;

-- STEP 8: Show remaining admins (should have departments assigned)
-- ⚠️ Replace `admin` and `department` with your actual table names
SELECT 
    'Remaining Admins (with departments)' AS info,
    COUNT(*) AS total_count,
    GROUP_CONCAT(
        CONCAT(a.email, ' (', COALESCE(d.name, 'No Dept'), ')') 
        ORDER BY a.email 
        SEPARATOR ', '
    ) AS admin_list
FROM `admin` a  -- ⚠️ CHANGE THIS
LEFT JOIN `department` d ON a.department_id = d.id  -- ⚠️ CHANGE `department` if different
WHERE a.department_id IS NOT NULL;

-- ============================================
-- DONE! Admins with NULL department have been deleted.
-- You can now add them again with proper department assignment.
-- ============================================

