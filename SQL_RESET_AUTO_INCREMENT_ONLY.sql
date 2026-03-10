-- ============================================
-- Script: Reset AUTO_INCREMENT Only (Keep Existing IDs)
-- ============================================
-- This only resets the counter for NEW departments
-- Existing departments keep their current IDs
-- ⚠️ Use this if other tables reference department_id!

-- STEP 1: Check current max ID
SELECT MAX(department_id) AS max_id FROM `departments`;

-- STEP 2: Reset AUTO_INCREMENT to start from 1
-- This means the NEXT new department will get ID = 1
-- But existing departments keep their current IDs

ALTER TABLE `departments` AUTO_INCREMENT = 1;

-- STEP 3: Verify
SHOW TABLE STATUS WHERE Name = 'departments';
-- Check the "Auto_increment" column - should show 1

-- STEP 4: Test by viewing current departments
SELECT department_id, name FROM `departments` ORDER BY department_id;

-- ============================================
-- NOTE: This only affects NEW departments.
-- Existing departments still have their old IDs (5, 6, 7, etc.)
-- If you want to renumber existing ones, use SQL_RESET_DEPARTMENT_IDS_SIMPLE.sql
-- ============================================

