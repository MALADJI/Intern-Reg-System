-- ============================================
-- Script: Reset Department IDs to Start from 1
-- ============================================
-- This will reset the AUTO_INCREMENT and optionally renumber existing departments

-- STEP 1: Preview current departments
SELECT 
    department_id,
    name,
    created_at,
    active
FROM `departments`
ORDER BY department_id;

-- STEP 2: Count current departments
SELECT 
    COUNT(*) AS total_departments,
    MIN(department_id) AS min_id,
    MAX(department_id) AS max_id
FROM `departments`;

-- STEP 3: Create backup (IMPORTANT!)
CREATE TABLE `departments_backup_before_renumber` AS 
SELECT * FROM `departments`;

-- Verify backup
SELECT COUNT(*) AS backed_up_count FROM `departments_backup_before_renumber`;

-- STEP 4: Check if any other tables reference department_id
-- This is important to avoid breaking foreign keys!
SELECT 
    TABLE_NAME,
    COLUMN_NAME,
    CONSTRAINT_NAME
FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
WHERE REFERENCED_TABLE_NAME = 'departments'
  AND REFERENCED_COLUMN_NAME = 'department_id'
  AND TABLE_SCHEMA = DATABASE();

-- STEP 5: ⚠️ OPTION A - Reset AUTO_INCREMENT Only (Keeps existing IDs)
-- This only resets the counter, doesn't change existing IDs
-- Use this if you just want new departments to start from the next number

-- First, find the highest ID
SELECT MAX(department_id) AS max_id FROM `departments`;

-- Then reset AUTO_INCREMENT to start after the highest ID
-- Replace 'X' with (MAX(department_id) + 1) from above
-- ALTER TABLE `departments` AUTO_INCREMENT = 1;

-- STEP 6: ⚠️ OPTION B - Renumber All Departments Starting from 1 (More Complex)
-- This will renumber all existing departments and reset AUTO_INCREMENT
-- ⚠️ WARNING: This will break foreign key relationships if other tables reference department_id!
-- Only use this if you're sure no other tables reference departments

-- Step 6a: Disable foreign key checks temporarily
SET FOREIGN_KEY_CHECKS = 0;

-- Step 6b: Create temporary table with new IDs
CREATE TEMPORARY TABLE `departments_temp` AS
SELECT 
    ROW_NUMBER() OVER (ORDER BY department_id) AS new_department_id,
    name,
    created_at,
    updated_at,
    active
FROM `departments`;

-- Step 6c: Clear departments table
TRUNCATE TABLE `departments`;

-- Step 6d: Insert with new IDs
INSERT INTO `departments` (department_id, name, created_at, updated_at, active)
SELECT 
    new_department_id,
    name,
    created_at,
    updated_at,
    active
FROM `departments_temp`;

-- Step 6e: Reset AUTO_INCREMENT
ALTER TABLE `departments` AUTO_INCREMENT = 1;

-- Step 6f: Re-enable foreign key checks
SET FOREIGN_KEY_CHECKS = 1;

-- Step 6g: Clean up
DROP TEMPORARY TABLE `departments_temp`;

-- STEP 7: Verify the reset
SELECT 
    department_id,
    name,
    created_at,
    active
FROM `departments`
ORDER BY department_id;

-- Check AUTO_INCREMENT value
SHOW TABLE STATUS WHERE Name = 'departments';

-- ============================================
-- DONE! Department IDs have been reset.
-- ============================================

