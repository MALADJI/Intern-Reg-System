# Safe Script: Delete Admins with Null Department

This guide provides a safe way to delete admins that have NULL department assignments so you can add them again with proper departments.

---

## ⚠️ WARNING
**This will permanently delete admins from the database!**
- Always backup first
- Review the list before deleting
- Test in development environment first

---

## Step 1: Preview What Will Be Deleted

```sql
-- See all admins with NULL department
SELECT 
    id,
    email,
    name,
    department_id,
    role,
    created_at,
    active
FROM admin
WHERE department_id IS NULL
ORDER BY email;
```

---

## Step 2: Create Backup

```sql
-- Create backup of admins that will be deleted
CREATE TABLE admin_null_dept_backup AS 
SELECT * FROM admin 
WHERE department_id IS NULL;

-- Verify backup was created
SELECT 
    COUNT(*) AS backup_count,
    GROUP_CONCAT(email ORDER BY email SEPARATOR ', ') AS backed_up_emails
FROM admin_null_dept_backup;
```

---

## Step 3: Count Records to Delete

```sql
-- Count how many admins will be deleted
SELECT 
    COUNT(*) AS total_to_delete,
    GROUP_CONCAT(email ORDER BY email SEPARATOR ', ') AS emails_to_delete
FROM admin
WHERE department_id IS NULL;
```

---

## Step 4: Delete Admins with NULL Department

```sql
-- ⚠️ DELETE - Only run after reviewing Steps 1-3
DELETE FROM admin
WHERE department_id IS NULL;
```

---

## Step 5: Verify Deletion

```sql
-- Check that admins with NULL department are gone
SELECT 
    COUNT(*) AS remaining_null_department_admins
FROM admin
WHERE department_id IS NULL;
-- Should return 0

-- Show remaining admins (all should have departments)
SELECT 
    a.id,
    a.email,
    a.name,
    d.name AS department_name,
    a.department_id
FROM admin a
LEFT JOIN department d ON a.department_id = d.id
ORDER BY a.email;
```

---

## Step 6: Re-add Admins with Departments

After deletion, you can re-add the admins through your application or use SQL:

```sql
-- Example: Re-add an admin with a department
-- Adjust values based on your backup
INSERT INTO admin (
    email,
    name,
    password,  -- You'll need to hash this
    role,
    department_id,
    active,
    created_at
)
SELECT 
    email,
    name,
    password,
    role,
    (SELECT id FROM department WHERE name = 'HR' LIMIT 1) AS department_id,  -- Assign to HR
    active,
    created_at
FROM admin_null_dept_backup
WHERE email = 'admin@univen.ac.za';  -- Specific admin
```

---

## Rollback Plan (If You Need to Restore)

```sql
-- If you need to restore deleted admins from backup
INSERT INTO admin
SELECT * FROM admin_null_dept_backup
ON DUPLICATE KEY UPDATE
    email = VALUES(email);

-- Verify restoration
SELECT COUNT(*) FROM admin WHERE department_id IS NULL;
```

---

## Alternative: Update Instead of Delete

If you prefer to keep the admins and just assign them departments:

```sql
-- Option 1: Assign all NULL department admins to a default department
UPDATE admin
SET department_id = (SELECT id FROM department WHERE name = 'ICT' LIMIT 1)
WHERE department_id IS NULL;

-- Option 2: Assign specific admins to specific departments
UPDATE admin
SET department_id = (SELECT id FROM department WHERE name = 'HR' LIMIT 1)
WHERE email = 'admin1@univen.ac.za' AND department_id IS NULL;

UPDATE admin
SET department_id = (SELECT id FROM department WHERE name = 'ICT' LIMIT 1)
WHERE email = 'admin2@univen.ac.za' AND department_id IS NULL;
```

---

## Complete Safe Script

```sql
-- ============================================
-- COMPLETE SAFE DELETION SCRIPT
-- ============================================

-- STEP 1: Preview
SELECT 
    'PREVIEW: Admins to be deleted' AS step,
    id,
    email,
    name,
    department_id,
    role
FROM admin
WHERE department_id IS NULL
ORDER BY email;

-- STEP 2: Count
SELECT 
    'COUNT: Total to delete' AS step,
    COUNT(*) AS count
FROM admin
WHERE department_id IS NULL;

-- STEP 3: Backup
CREATE TABLE IF NOT EXISTS admin_null_dept_backup AS 
SELECT * FROM admin 
WHERE department_id IS NULL;

SELECT 
    'BACKUP: Created' AS step,
    COUNT(*) AS backup_count
FROM admin_null_dept_backup;

-- STEP 4: Review backup
SELECT 
    'BACKUP REVIEW' AS step,
    id,
    email,
    name,
    role
FROM admin_null_dept_backup
ORDER BY email;

-- STEP 5: DELETE (Uncomment after reviewing above steps)
-- DELETE FROM admin
-- WHERE department_id IS NULL;

-- STEP 6: Verify
SELECT 
    'VERIFICATION' AS step,
    COUNT(*) AS remaining_null_department_admins
FROM admin
WHERE department_id IS NULL;
-- Should be 0 after deletion

-- ============================================
```

---

## Quick Reference

### Delete All Admins with NULL Department
```sql
DELETE FROM admin WHERE department_id IS NULL;
```

### Delete Specific Admin by Email
```sql
DELETE FROM admin 
WHERE email = 'admin@univen.ac.za' 
  AND department_id IS NULL;
```

### Delete Multiple Specific Admins
```sql
DELETE FROM admin 
WHERE email IN (
    'admin1@univen.ac.za',
    'admin2@univen.ac.za',
    'admin3@univen.ac.za'
)
AND department_id IS NULL;
```

### Delete Admins with NULL Department and Specific Role
```sql
DELETE FROM admin 
WHERE department_id IS NULL 
  AND role = 'ADMIN';
```

---

## Safety Checklist

Before running DELETE:
- [ ] Previewed the list of admins to be deleted
- [ ] Created backup table
- [ ] Verified backup contains correct records
- [ ] Counted how many will be deleted
- [ ] Reviewed each email address
- [ ] Tested in development environment
- [ ] Have rollback plan ready

---

## Need Help?

If you're unsure:
1. **Don't delete** - Use the UPDATE alternative instead
2. **Test first** - Run on a test database
3. **Backup always** - The script creates backup automatically
4. **Verify after** - Check that deletion worked correctly

---

**Remember:** You can always restore from the `admin_null_dept_backup` table if needed!

