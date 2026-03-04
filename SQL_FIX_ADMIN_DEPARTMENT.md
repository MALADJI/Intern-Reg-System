# SQL Fix: Admin Department in Database

This guide will help you fix the admin department issue in your MySQL database using SQL Workbench.

## Problem
Admins are showing "No Department" because:
1. The `Admin` table might not have a `department_id` column
2. Admins might not have `department_id` assigned
3. The backend login endpoint might not be joining the Department table

## Step 1: Check Current Database Structure

### 1.1 Check if Admin table has department_id column
```sql
-- Check Admin table structure
DESCRIBE admin;
-- OR
SHOW COLUMNS FROM admin;
```

### 1.2 Check if Department table exists
```sql
-- Check Department table structure
DESCRIBE department;
-- OR
SHOW COLUMNS FROM department;
```

### 1.3 Check current admin records
```sql
-- See all admins and their department assignments
SELECT 
    a.id AS admin_id,
    a.email,
    a.name,
    a.department_id,
    d.name AS department_name
FROM admin a
LEFT JOIN department d ON a.department_id = d.id;
```

## Step 2: Add department_id Column (If Missing)

### 2.1 Add department_id column to Admin table
```sql
-- Add department_id column if it doesn't exist
ALTER TABLE admin 
ADD COLUMN department_id INT NULL,
ADD CONSTRAINT fk_admin_department 
    FOREIGN KEY (department_id) 
    REFERENCES department(id) 
    ON DELETE SET NULL 
    ON UPDATE CASCADE;

-- Add index for better performance
CREATE INDEX idx_admin_department_id ON admin(department_id);
```

## Step 3: Assign Departments to Existing Admins

### 3.1 First, check what departments exist
```sql
-- List all departments
SELECT id, name FROM department ORDER BY name;
```

### 3.2 Update admins with their departments

**Option A: Update by email (if you know which admin should have which department)**
```sql
-- Example: Assign HR department to admin with email 'thabisoelgin@univen.ac.za'
UPDATE admin 
SET department_id = (
    SELECT id FROM department WHERE name = 'HR' LIMIT 1
)
WHERE email = 'thabisoelgin@univen.ac.za';

-- Verify the update
SELECT 
    a.id,
    a.email,
    a.name,
    a.department_id,
    d.name AS department_name
FROM admin a
LEFT JOIN department d ON a.department_id = d.id
WHERE a.email = 'thabisoelgin@univen.ac.za';
```

**Option B: Assign all admins to a default department (if needed)**
```sql
-- Assign all admins without department to 'ICT' department
UPDATE admin 
SET department_id = (
    SELECT id FROM department WHERE name = 'ICT' LIMIT 1
)
WHERE department_id IS NULL;

-- Verify
SELECT 
    a.id,
    a.email,
    a.name,
    a.department_id,
    d.name AS department_name
FROM admin a
LEFT JOIN department d ON a.department_id = d.id;
```

**Option C: Bulk update multiple admins**
```sql
-- Update multiple admins at once
UPDATE admin 
SET department_id = (SELECT id FROM department WHERE name = 'HR' LIMIT 1)
WHERE email IN (
    'admin1@univen.ac.za',
    'admin2@univen.ac.za',
    'admin3@univen.ac.za'
);

UPDATE admin 
SET department_id = (SELECT id FROM department WHERE name = 'ICT' LIMIT 1)
WHERE email IN (
    'admin4@univen.ac.za',
    'admin5@univen.ac.za'
);
```

## Step 4: Verify the Data

### 4.1 Check all admins with their departments
```sql
-- Complete admin-department mapping
SELECT 
    a.id AS admin_id,
    a.email,
    a.name AS admin_name,
    a.department_id,
    d.id AS dept_id,
    d.name AS department_name,
    CASE 
        WHEN a.department_id IS NULL THEN '❌ NO DEPARTMENT'
        ELSE '✅ HAS DEPARTMENT'
    END AS status
FROM admin a
LEFT JOIN department d ON a.department_id = d.id
ORDER BY a.email;
```

### 4.2 Check for admins without departments
```sql
-- Find all admins without department assignment
SELECT 
    id,
    email,
    name,
    'MISSING DEPARTMENT' AS issue
FROM admin
WHERE department_id IS NULL;
```

### 4.3 Check department assignments count
```sql
-- Count admins per department
SELECT 
    d.name AS department_name,
    COUNT(a.id) AS admin_count,
    GROUP_CONCAT(a.email ORDER BY a.email SEPARATOR ', ') AS admin_emails
FROM department d
LEFT JOIN admin a ON d.id = a.department_id
GROUP BY d.id, d.name
ORDER BY admin_count DESC, d.name;
```

## Step 5: Fix Backend Login Response (Important!)

After fixing the database, make sure your backend login endpoint returns the department. The backend should:

### 5.1 Join Admin with Department in Login Query
```java
// In your AdminRepository or AdminService
@Query("SELECT a FROM Admin a LEFT JOIN FETCH a.department WHERE a.email = :email")
Optional<Admin> findByEmailWithDepartment(@Param("email") String email);
```

### 5.2 Return Department in Login Response DTO
```java
// In your LoginResponse or UserDTO
public class LoginResponse {
    private String token;
    private UserDTO user;
    
    public static class UserDTO {
        private Long id;
        private String email;
        private String role;
        private String name;
        private String department;        // ✅ Department name
        private Long departmentId;       // ✅ Department ID
        // ... other fields
    }
}
```

### 5.3 Map Department in Login Service
```java
// In your AuthService or LoginService
public LoginResponse login(LoginRequest request) {
    Admin admin = adminRepository.findByEmailWithDepartment(request.getEmail())
        .orElseThrow(() -> new RuntimeException("Admin not found"));
    
    // ... authentication logic ...
    
    UserDTO userDTO = new UserDTO();
    userDTO.setId(admin.getId());
    userDTO.setEmail(admin.getEmail());
    userDTO.setRole("ADMIN");
    userDTO.setName(admin.getName());
    
    // ✅ Map department if it exists
    if (admin.getDepartment() != null) {
        userDTO.setDepartment(admin.getDepartment().getName());
        userDTO.setDepartmentId(admin.getDepartment().getId());
    }
    
    // ... return response ...
}
```

## Step 6: Test the Fix

### 6.1 Test in Database
```sql
-- Test query that backend should return
SELECT 
    a.id,
    a.email,
    a.name,
    a.department_id,
    d.name AS department_name
FROM admin a
LEFT JOIN department d ON a.department_id = d.id
WHERE a.email = 'thabisoelgin@univen.ac.za';
```

### 6.2 Expected Result
```
+----+---------------------------+--------+---------------+-----------------+
| id | email                     | name   | department_id | department_name |
+----+---------------------------+--------+---------------+-----------------+
|  1 | thabisoelgin@univen.ac.za | Thabiso|             2 | HR              |
+----+---------------------------+--------+---------------+-----------------+
```

## Step 7: Common Issues and Solutions

### Issue 1: Foreign Key Constraint Error
```sql
-- If you get foreign key errors, check if department IDs exist
SELECT id, name FROM department;

-- Make sure the department_id you're assigning exists
SELECT * FROM department WHERE id = 2; -- Replace 2 with your department_id
```

### Issue 2: Duplicate Department Names
```sql
-- Check for duplicate department names
SELECT name, COUNT(*) as count 
FROM department 
GROUP BY name 
HAVING count > 1;

-- If duplicates exist, use the ID instead of name in UPDATE
UPDATE admin 
SET department_id = 2  -- Use actual ID
WHERE email = 'admin@univen.ac.za';
```

### Issue 3: Admins Still Showing No Department After Fix
```sql
-- Verify the admin has department_id
SELECT id, email, department_id FROM admin WHERE email = 'your-admin@univen.ac.za';

-- If department_id is NULL, assign it
UPDATE admin 
SET department_id = (SELECT id FROM department WHERE name = 'HR' LIMIT 1)
WHERE email = 'your-admin@univen.ac.za';
```

## Quick Fix Script (All-in-One)

Run this script to fix everything at once:

```sql
-- ============================================
-- QUICK FIX SCRIPT FOR ADMIN DEPARTMENT
-- ============================================

-- Step 1: Add department_id column if missing
SET @column_exists = (
    SELECT COUNT(*) 
    FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_SCHEMA = DATABASE() 
    AND TABLE_NAME = 'admin' 
    AND COLUMN_NAME = 'department_id'
);

SET @sql = IF(@column_exists = 0,
    'ALTER TABLE admin ADD COLUMN department_id INT NULL',
    'SELECT "Column department_id already exists" AS message'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Step 2: Add foreign key if missing
SET @fk_exists = (
    SELECT COUNT(*) 
    FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE 
    WHERE TABLE_SCHEMA = DATABASE() 
    AND TABLE_NAME = 'admin' 
    AND CONSTRAINT_NAME = 'fk_admin_department'
);

SET @sql = IF(@fk_exists = 0,
    'ALTER TABLE admin ADD CONSTRAINT fk_admin_department FOREIGN KEY (department_id) REFERENCES department(id) ON DELETE SET NULL ON UPDATE CASCADE',
    'SELECT "Foreign key already exists" AS message'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Step 3: Show current status
SELECT 
    'Current Admin-Department Status' AS info,
    COUNT(*) AS total_admins,
    SUM(CASE WHEN department_id IS NULL THEN 1 ELSE 0 END) AS admins_without_dept,
    SUM(CASE WHEN department_id IS NOT NULL THEN 1 ELSE 0 END) AS admins_with_dept
FROM admin;

-- Step 4: List all admins (update manually based on your needs)
SELECT 
    a.id,
    a.email,
    a.name,
    a.department_id,
    d.name AS department_name
FROM admin a
LEFT JOIN department d ON a.department_id = d.id
ORDER BY a.email;

-- ============================================
-- MANUAL STEP: Update admins with departments
-- ============================================
-- Example: Assign HR to specific admin
-- UPDATE admin SET department_id = (SELECT id FROM department WHERE name = 'HR' LIMIT 1) WHERE email = 'admin@univen.ac.za';
```

## Verification Checklist

After running the fixes, verify:

- [ ] Admin table has `department_id` column
- [ ] Foreign key constraint exists between `admin.department_id` and `department.id`
- [ ] All admins have `department_id` assigned (or NULL if intentionally unassigned)
- [ ] Backend login endpoint joins Admin with Department
- [ ] Backend login response includes `department` and `departmentId` fields
- [ ] Frontend receives department in login response
- [ ] Admin dashboard displays department correctly

## Need Help?

If you're still seeing "No Department" after these fixes:

1. **Check backend logs** - Verify the login response includes department
2. **Check browser console** - Look for the debug logs we added
3. **Check database** - Run the verification queries above
4. **Check backend code** - Ensure the login endpoint joins and returns department

---

**Note:** Replace table names (`admin`, `department`) with your actual table names if they're different (e.g., `Admin`, `Department`, `admins`, `departments`).

