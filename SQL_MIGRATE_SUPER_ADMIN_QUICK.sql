-- ============================================
-- QUICK SCRIPT: Move Super Admin from Admin to Super_Admin Table
-- ============================================
-- Run this in SQL Workbench step by step

-- STEP 1: Check current state
SELECT 
    'Current Super Admins in Admin Table' AS info,
    COUNT(*) AS count,
    GROUP_CONCAT(email ORDER BY email SEPARATOR ', ') AS emails
FROM admin
WHERE role = 'SUPER_ADMIN' 
   OR role = 'SUPERADMIN' 
   OR role LIKE '%SUPER%';

-- STEP 2: Create backup (IMPORTANT!)
CREATE TABLE IF NOT EXISTS admin_backup AS SELECT * FROM admin;
SELECT 'Backup created' AS status, COUNT(*) AS records_backed_up FROM admin_backup;

-- STEP 3: Create super_admin table (if it doesn't exist)
-- Adjust column names/types to match your schema
CREATE TABLE IF NOT EXISTS super_admin (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    password VARCHAR(255) NOT NULL,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    last_login TIMESTAMP NULL,
    has_signature BOOLEAN DEFAULT FALSE,
    signature TEXT NULL,
    INDEX idx_super_admin_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- STEP 4: Migrate super admins to super_admin table
-- Adjust column names to match your actual admin table structure
INSERT INTO super_admin (
    user_id,
    email,
    name,
    password,
    active,
    created_at,
    last_login,
    has_signature,
    signature
)
SELECT 
    user_id,
    email,
    name,
    password,
    COALESCE(active, TRUE) AS active,
    created_at,
    last_login,
    COALESCE(has_signature, FALSE) AS has_signature,
    signature
FROM admin
WHERE role = 'SUPER_ADMIN' 
   OR role = 'SUPERADMIN' 
   OR role LIKE '%SUPER%'
ON DUPLICATE KEY UPDATE
    name = VALUES(name),
    active = VALUES(active);

-- STEP 5: Verify migration
SELECT 
    'Verification' AS info,
    (SELECT COUNT(*) FROM admin WHERE role LIKE '%SUPER%') AS remaining_in_admin,
    (SELECT COUNT(*) FROM super_admin) AS migrated_to_super_admin;

-- STEP 6: Show migrated super admins
SELECT 
    id,
    email,
    name,
    active,
    created_at
FROM super_admin
ORDER BY email;

-- STEP 7: ⚠️ DELETE FROM ADMIN TABLE (Uncomment after verifying Step 5 & 6)
-- Make sure migrated_to_super_admin count matches the number you expect!
-- DELETE FROM admin
-- WHERE role = 'SUPER_ADMIN' 
--    OR role = 'SUPERADMIN' 
--    OR role LIKE '%SUPER%';

-- STEP 8: Final verification
SELECT 
    'Final Status' AS info,
    (SELECT COUNT(*) FROM admin WHERE role LIKE '%SUPER%') AS super_admins_in_admin,
    (SELECT COUNT(*) FROM super_admin) AS super_admins_in_super_admin_table;

-- ============================================
-- DONE! Super admins have been migrated.
-- ============================================

