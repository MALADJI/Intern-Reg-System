# Quick SQL Fix for Admin Department

## 🎯 Goal
Fix admins showing "No Department" by assigning departments in the database.

---

## Step 1: Check Your Tables

Run this to see your current setup:

```sql
-- Check if admin table has department_id
DESCRIBE admin;

-- Check what departments exist
SELECT id, name FROM department;

-- Check current admin-department assignments
SELECT 
    a.id,
    a.email,
    a.name,
    a.department_id,
    d.name AS department_name
FROM admin a
LEFT JOIN department d ON a.department_id = d.id;
```

---

## Step 2: Add department_id Column (If Missing)

If `department_id` column doesn't exist, run:

```sql
ALTER TABLE admin 
ADD COLUMN department_id INT NULL;

ALTER TABLE admin 
ADD CONSTRAINT fk_admin_department 
    FOREIGN KEY (department_id) 
    REFERENCES department(id) 
    ON DELETE SET NULL 
    ON UPDATE CASCADE;
```

---

## Step 3: Assign Departments to Admins

### Example 1: Assign HR to one admin
```sql
UPDATE admin 
SET department_id = (SELECT id FROM department WHERE name = 'HR' LIMIT 1)
WHERE email = 'thabisoelgin@univen.ac.za';
```

### Example 2: Assign ICT to one admin
```sql
UPDATE admin 
SET department_id = (SELECT id FROM department WHERE name = 'ICT' LIMIT 1)
WHERE email = 'admin@univen.ac.za';
```

### Example 3: Assign all admins to a default department
```sql
-- Assign all admins without department to 'ICT'
UPDATE admin 
SET department_id = (SELECT id FROM department WHERE name = 'ICT' LIMIT 1)
WHERE department_id IS NULL;
```

---

## Step 4: Verify It Worked

```sql
-- Check the admin now has a department
SELECT 
    a.email,
    a.name,
    d.name AS department_name
FROM admin a
LEFT JOIN department d ON a.department_id = d.id
WHERE a.email = 'thabisoelgin@univen.ac.za';
```

**Expected Result:**
```
+---------------------------+--------+-----------------+
| email                     | name   | department_name |
+---------------------------+--------+-----------------+
| thabisoelgin@univen.ac.za | Thabiso| HR              |
+---------------------------+--------+-----------------+
```

---

## Step 5: Update Backend Code

After fixing the database, make sure your backend:

1. **Joins Admin with Department** in the login query
2. **Returns department** in the login response

### Backend Java Example:

```java
// In AdminRepository
@Query("SELECT a FROM Admin a LEFT JOIN FETCH a.department WHERE a.email = :email")
Optional<Admin> findByEmailWithDepartment(@Param("email") String email);

// In LoginService - Map department to response
if (admin.getDepartment() != null) {
    userDTO.setDepartment(admin.getDepartment().getName());
    userDTO.setDepartmentId(admin.getDepartment().getId());
}
```

---

## ✅ Checklist

- [ ] Admin table has `department_id` column
- [ ] Admins have `department_id` assigned
- [ ] Backend login returns `department` and `departmentId`
- [ ] Frontend receives department in login response

---

## 🐛 Still Not Working?

1. **Check database:**
   ```sql
   SELECT a.email, a.department_id, d.name 
   FROM admin a 
   LEFT JOIN department d ON a.department_id = d.id;
   ```

2. **Check backend logs** - Does login response include department?

3. **Check browser console** - Look for debug logs showing `currentUser`

4. **Clear browser cache** and log out/in again

---

**That's it!** After these steps, the admin dashboard should show the department. 🎉

