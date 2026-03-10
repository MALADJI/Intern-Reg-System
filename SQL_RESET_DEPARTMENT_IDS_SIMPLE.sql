-- ============================================
-- Simple Script: Reset Department IDs to Start from 1
-- ============================================
-- ⚠️ WARNING: This will renumber all departments!
-- Make sure no other tables reference department_id before running!

-- STEP 1: Preview current departments
SELECT department_id, name FROM `departments` ORDER BY department_id;

-- STEP 2: Backup
CREATE TABLE `departments_backup` AS SELECT * FROM `departments`;

-- STEP 3: Reset AUTO_INCREMENT and Renumber Departments
-- This will:
-- 1. Disable foreign key checks
-- 2. Renumber all departments starting from 1
-- 3. Reset AUTO_INCREMENT to 1
-- 4. Re-enable foreign key checks

SET FOREIGN_KEY_CHECKS = 0;

-- Create temp table with new sequential IDs
CREATE TEMPORARY TABLE `temp_depts` AS
SELECT 
    ROW_NUMBER() OVER (ORDER BY department_id) AS new_id,
    name,
    created_at,
    updated_at,
    active
FROM `departments`;

-- Clear and reset
TRUNCATE TABLE `departments`;

-- Insert with new IDs
INSERT INTO `departments` (department_id, name, created_at, updated_at, active)
SELECT new_id, name, created_at, updated_at, active
FROM `temp_depts`;

-- Reset AUTO_INCREMENT
ALTER TABLE `departments` AUTO_INCREMENT = 1;

SET FOREIGN_KEY_CHECKS = 1;

DROP TEMPORARY TABLE `temp_depts`;

-- STEP 4: Verify
SELECT department_id, name FROM `departments` ORDER BY department_id;

-- ============================================
-- DONE! IDs now start from 1.
-- ============================================

