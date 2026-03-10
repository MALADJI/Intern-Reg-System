-- ============================================
-- Quick Script: Delete All Departments
-- ============================================
-- Simple script to delete all departments

-- STEP 1: Preview departments
SELECT id, name FROM `department` ORDER BY name;

-- STEP 2: Backup
CREATE TABLE `department_backup` AS SELECT * FROM `department`;

-- STEP 3: Delete all departments
DELETE FROM `department`;

-- STEP 4: Verify (should return 0)
SELECT COUNT(*) AS remaining_departments FROM `department`;

-- ============================================
-- DONE! All departments deleted.
-- ============================================

