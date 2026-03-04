-- ============================================
-- Script: Delete Departments from Department Table
-- ============================================
-- This will delete departments so you can add them again
-- ⚠️ Be careful - this will also affect admins/interns/supervisors linked to these departments!

-- STEP 1: Preview all departments
SELECT 
    id,
    name,
    created_at
FROM `department`
ORDER BY name;

-- STEP 2: Count departments
SELECT 
    COUNT(*) AS total_departments
FROM `department`;

-- STEP 3: Check which departments are being used by admins
SELECT 
    d.id,
    d.name AS department_name,
    COUNT(a.email) AS admin_count,
    GROUP_CONCAT(a.email ORDER BY a.email SEPARATOR ', ') AS admin_emails
FROM `department` d
LEFT JOIN `admins` a ON d.id = a.department_id
GROUP BY d.id, d.name
ORDER BY admin_count DESC, d.name;

-- STEP 4: Check which departments are being used by interns (if you have interns table)
-- Uncomment if you have an interns table:
-- SELECT 
--     d.id,
--     d.name AS department_name,
--     COUNT(i.email) AS intern_count
-- FROM `department` d
-- LEFT JOIN `interns` i ON d.id = i.department_id
-- GROUP BY d.id, d.name
-- ORDER BY intern_count DESC, d.name;

-- STEP 5: Create backup (IMPORTANT!)
CREATE TABLE IF NOT EXISTS `department_backup` AS 
SELECT * FROM `department`;

-- Verify backup
SELECT 
    COUNT(*) AS backed_up_departments,
    GROUP_CONCAT(name ORDER BY name SEPARATOR ', ') AS backed_up_department_names
FROM `department_backup`;

-- STEP 6: ⚠️ DELETE ALL DEPARTMENTS
-- Uncomment ONLY after reviewing Steps 1-5
-- WARNING: This will delete ALL departments!

-- DELETE FROM `department`;

-- STEP 7: ⚠️ DELETE SPECIFIC DEPARTMENTS (Alternative - Safer)
-- Uncomment and modify to delete specific departments by name:

-- DELETE FROM `department`
-- WHERE name IN ('Department1', 'Department2');  -- Replace with actual department names

-- OR delete by ID:

-- DELETE FROM `department`
-- WHERE id IN (1, 2, 3);  -- Replace with actual department IDs

-- STEP 8: Verify deletion
SELECT 
    COUNT(*) AS remaining_departments
FROM `department`;
-- Should return 0 if you deleted all, or the count of remaining ones

-- ============================================
-- DONE! Departments have been deleted.
-- You can now add them again through your application.
-- ============================================

