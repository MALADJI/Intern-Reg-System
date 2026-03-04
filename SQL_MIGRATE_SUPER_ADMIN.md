# SQL Script: Migrate Super Admin Data from Admin Table to Super_Admin Table

This script will help you move all super admin data from the `admin` table to a separate `super_admin` table.

---

## Step 1: Check Current State

### 1.1 Check if super_admin table exists
```sql
-- Check if super_admin table exists
SHOW TABLES LIKE 'super_admin';

-- Check admin table structure
DESCRIBE admin;

-- Check current admins and their roles
SELECT 
    id,
    email,
    name,
    role,
    department_id,
    created_at
FROM admin
ORDER BY role, email;
```

### 1.2 Count super admins in admin table
```sql
-- Count how many super admins exist
SELECT 
    COUNT(*) AS total_super_admins,
    GROUP_CONCAT(email ORDER BY email SEPARATOR ', ') AS super_admin_emails
FROM admin
WHERE role = 'SUPER_ADMIN' OR role = 'SUPERADMIN' OR role LIKE '%SUPER%';
```

---

## Step 2: Create Super_Admin Table (If It Doesn't Exist)

### 2.1 Create super_admin table structure
```sql
-- Create super_admin table (adjust column names/types to match your schema)
CREATE TABLE IF NOT EXISTS super_admin (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NULL,  -- If you have a user table
    email VARCHAR(255) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    password VARCHAR(255) NOT NULL,  -- Hashed password
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    last_login TIMESTAMP NULL,
    has_signature BOOLEAN DEFAULT FALSE,
    signature TEXT NULL,
    INDEX idx_super_admin_email (email),
    INDEX idx_super_admin_active (active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### 2.2 Alternative: If super_admin table already exists, check its structure
```sql
-- Check existing super_admin table structure
DESCRIBE super_admin;
SHOW CREATE TABLE super_admin;
```

---

## Step 3: Backup Data (IMPORTANT!)

### 3.1 Create backup table
```sql
-- Create backup of admin table before migration
CREATE TABLE admin_backup AS 
SELECT * FROM admin;

-- Verify backup
SELECT COUNT(*) AS backup_count FROM admin_backup;
SELECT COUNT(*) AS original_count FROM admin;
```

---

## Step 4: Migrate Super Admin Data

### 4.1 Option A: Move Super Admins to Super_Admin Table

```sql
-- Insert super admins into super_admin table
-- Adjust column names to match your actual table structure
INSERT INTO super_admin (
    user_id,
    email,
    name,
    password,  -- Make sure this column exists in admin table
    active,
    created_at,
    last_login,
    has_signature,
    signature
)
SELECT 
    user_id,  -- If exists in admin table
    email,
    name,
    password,  -- Make sure password column exists
    COALESCE(active, TRUE) AS active,
    created_at,
    last_login,
    COALESCE(has_signature, FALSE) AS has_signature,
    signature
FROM admin
WHERE role = 'SUPER_ADMIN' 
   OR role = 'SUPERADMIN' 
   OR role LIKE '%SUPER%'
   OR role = 'ROLE_SUPER_ADMIN';  -- Adjust based on your role naming

-- Verify the migration
SELECT 
    COUNT(*) AS migrated_count,
    GROUP_CONCAT(email ORDER BY email SEPARATOR ', ') AS migrated_emails
FROM super_admin;
```

### 4.2 Option B: If Super_Admin Table Has Different Structure

```sql
-- If super_admin table has different columns, adjust accordingly
INSERT INTO super_admin (
    email,
    name,
    password,
    active,
    created_at
)
SELECT 
    email,
    name,
    password,
    COALESCE(active, TRUE),
    created_at
FROM admin
WHERE role = 'SUPER_ADMIN' 
   OR role = 'SUPERADMIN'
   OR role LIKE '%SUPER%';
```

---

## Step 5: Verify Migration

### 5.1 Check migrated data
```sql
-- Compare counts
SELECT 
    'Admin Table' AS source,
    COUNT(*) AS super_admin_count
FROM admin
WHERE role = 'SUPER_ADMIN' OR role = 'SUPERADMIN' OR role LIKE '%SUPER%'

UNION ALL

SELECT 
    'Super_Admin Table' AS source,
    COUNT(*) AS super_admin_count
FROM super_admin;

-- Check specific records
SELECT 
    'SUPER_ADMIN' AS type,
    email,
    name,
    created_at
FROM admin
WHERE role = 'SUPER_ADMIN' OR role = 'SUPERADMIN' OR role LIKE '%SUPER%'

UNION ALL

SELECT 
    'super_admin table' AS type,
    email,
    name,
    created_at
FROM super_admin
ORDER BY email;
```

### 5.2 Verify data integrity
```sql
-- Check if all super admins were migrated
SELECT 
    a.email AS admin_email,
    a.name AS admin_name,
    sa.email AS super_admin_email,
    sa.name AS super_admin_name,
    CASE 
        WHEN sa.email IS NULL THEN '❌ NOT MIGRATED'
        ELSE '✅ MIGRATED'
    END AS status
FROM admin a
LEFT JOIN super_admin sa ON a.email = sa.email
WHERE a.role = 'SUPER_ADMIN' 
   OR a.role = 'SUPERADMIN' 
   OR a.role LIKE '%SUPER%';
```

---

## Step 6: Delete Super Admins from Admin Table (After Verification)

### 6.1 Preview what will be deleted (DO THIS FIRST!)
```sql
-- Preview records that will be deleted
SELECT 
    id,
    email,
    name,
    role,
    created_at
FROM admin
WHERE role = 'SUPER_ADMIN' 
   OR role = 'SUPERADMIN' 
   OR role LIKE '%SUPER%';
```

### 6.2 Delete super admins from admin table
```sql
-- ⚠️ WARNING: This will permanently delete super admins from admin table
-- Make sure you've verified the migration in Step 5 before running this!

-- Option 1: Delete by role
DELETE FROM admin
WHERE role = 'SUPER_ADMIN' 
   OR role = 'SUPERADMIN' 
   OR role LIKE '%SUPER%';

-- Option 2: Delete by email (safer - delete specific ones)
DELETE FROM admin
WHERE email IN (
    SELECT email FROM super_admin
);

-- Verify deletion
SELECT 
    COUNT(*) AS remaining_super_admins_in_admin_table
FROM admin
WHERE role = 'SUPER_ADMIN' 
   OR role = 'SUPERADMIN' 
   OR role LIKE '%SUPER%';
```

---

## Step 7: Update Foreign Keys and Relationships

### 7.1 Check for foreign key references
```sql
-- Check if any other tables reference admin table for super admins
SELECT 
    TABLE_NAME,
    COLUMN_NAME,
    CONSTRAINT_NAME,
    REFERENCED_TABLE_NAME,
    REFERENCED_COLUMN_NAME
FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
WHERE REFERENCED_TABLE_NAME = 'admin'
  AND TABLE_SCHEMA = DATABASE();
```

### 7.2 Update any foreign key references (if needed)
```sql
-- Example: If you have a user_roles table that references admin
-- You might need to update it to reference super_admin instead
-- Adjust based on your actual schema

-- Check what needs updating
SELECT * FROM user_roles 
WHERE admin_id IN (
    SELECT id FROM admin_backup 
    WHERE role = 'SUPER_ADMIN'
);
```

---

## Complete Migration Script (All-in-One)

```sql
-- ============================================
-- COMPLETE SUPER ADMIN MIGRATION SCRIPT
-- ============================================
-- Run this script step by step, verifying each step

-- STEP 1: Backup
CREATE TABLE IF NOT EXISTS admin_backup AS SELECT * FROM admin;
SELECT 'Backup created' AS status, COUNT(*) AS backup_count FROM admin_backup;

-- STEP 2: Create super_admin table (if needed)
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

-- STEP 3: Migrate data
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
    COALESCE(active, TRUE),
    created_at,
    last_login,
    COALESCE(has_signature, FALSE),
    signature
FROM admin
WHERE role = 'SUPER_ADMIN' 
   OR role = 'SUPERADMIN' 
   OR role LIKE '%SUPER%'
ON DUPLICATE KEY UPDATE
    name = VALUES(name),
    password = VALUES(password),
    active = VALUES(active);

-- STEP 4: Verify migration
SELECT 
    'Migration Status' AS info,
    (SELECT COUNT(*) FROM admin WHERE role LIKE '%SUPER%') AS remaining_in_admin,
    (SELECT COUNT(*) FROM super_admin) AS migrated_to_super_admin;

-- STEP 5: Show migrated records
SELECT 
    id,
    email,
    name,
    active,
    created_at
FROM super_admin
ORDER BY email;

-- STEP 6: DELETE FROM ADMIN TABLE (Uncomment after verification)
-- DELETE FROM admin
-- WHERE role = 'SUPER_ADMIN' 
--    OR role = 'SUPERADMIN' 
--    OR role LIKE '%SUPER%';

-- ============================================
```

---

## Troubleshooting

### Issue 1: Duplicate Email Error
```sql
-- Check for duplicate emails
SELECT email, COUNT(*) as count
FROM admin
WHERE role LIKE '%SUPER%'
GROUP BY email
HAVING count > 1;

-- Use INSERT IGNORE or ON DUPLICATE KEY UPDATE
INSERT IGNORE INTO super_admin (...)
SELECT ... FROM admin WHERE ...;
```

### Issue 2: Missing Password Column
```sql
-- If password column doesn't exist in admin table
-- You might need to handle authentication differently
-- Check your actual table structure first
DESCRIBE admin;
```

### Issue 3: Foreign Key Constraints
```sql
-- If you get foreign key errors, check dependencies
SELECT 
    CONSTRAINT_NAME,
    TABLE_NAME,
    COLUMN_NAME
FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
WHERE REFERENCED_TABLE_NAME = 'admin'
  AND TABLE_SCHEMA = DATABASE();
```

---

## Verification Checklist

After migration, verify:

- [ ] Backup table created successfully
- [ ] Super_admin table exists with correct structure
- [ ] All super admins migrated to super_admin table
- [ ] Data integrity verified (emails, names match)
- [ ] Super admins removed from admin table (if desired)
- [ ] No foreign key constraint errors
- [ ] Application can still authenticate super admins
- [ ] Super admin login works correctly

---

## Rollback Plan (If Something Goes Wrong)

```sql
-- If you need to rollback, restore from backup
-- ⚠️ Only use if migration failed

-- Step 1: Delete migrated data from super_admin
DELETE FROM super_admin;

-- Step 2: Restore from backup
INSERT INTO admin
SELECT * FROM admin_backup
WHERE role = 'SUPER_ADMIN' 
   OR role = 'SUPERADMIN' 
   OR role LIKE '%SUPER%'
ON DUPLICATE KEY UPDATE
    email = VALUES(email);

-- Step 3: Verify rollback
SELECT COUNT(*) FROM admin WHERE role LIKE '%SUPER%';
```

---

**Important Notes:**
1. **Always backup first** - The script includes backup creation
2. **Verify each step** - Don't skip the verification queries
3. **Test in development first** - Never run on production without testing
4. **Adjust column names** - Match your actual database schema
5. **Check role naming** - Your roles might be named differently (e.g., 'ROLE_SUPER_ADMIN')

---

**Need to adjust the script?** Check your actual table structure first:
```sql
DESCRIBE admin;
DESCRIBE super_admin;  -- If it exists
SHOW CREATE TABLE admin;
```

