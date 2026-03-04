# Issues: Causes and Fixes

## Issue 1: 500 Error on `/api/leave` Endpoint

### 🔍 Cause:
The backend `/api/leave` endpoint is returning a 500 Internal Server Error. This typically happens when:

1. **Missing Error Handling**: The endpoint doesn't handle null/undefined parameters properly
2. **Database Query Error**: The query might be failing due to:
   - Missing JOIN with department/intern tables
   - Null pointer exception when department is null
   - SQL syntax error
3. **Missing Method Implementation**: The service method might not exist or has a bug

### ✅ Frontend Fix (Already Done):
- Frontend now handles 500 errors gracefully
- Sets leave requests to empty array instead of crashing
- Logs clear warning messages

### ✅ Backend Fix Required:
See `BACKEND_FIX_LEAVE_ENDPOINT_500_ERROR.md` for complete implementation.

**Quick Fix:**
```java
@GetMapping("/leave")
public ResponseEntity<?> getAllLeaveRequests(
        @RequestParam(required = false) String status,
        @RequestParam(required = false) Long departmentId) {
    try {
        // ✅ Handle null departmentId
        List<LeaveRequest> requests;
        if (departmentId != null) {
            requests = leaveRequestService.getLeaveRequestsByDepartment(departmentId, status);
        } else {
            requests = leaveRequestService.getAllLeaveRequests(status);
        }
        return ResponseEntity.ok(requests);
    } catch (Exception e) {
        log.error("Error fetching leave requests", e);
        return ResponseEntity.status(500)
            .body(new ErrorResponse("Failed to fetch leave requests"));
    }
}
```

---

## Issue 2: Admin Has No Department Assigned

### 🔍 Cause:
The admin's `departmentId` is `undefined` and `department` is `null`. This happens because:

1. **Backend Not Saving Department**: When super admin creates an admin, the backend is not saving `departmentId` to the database
2. **Backend Not Returning Department**: The login response doesn't include `departmentId` or `department`
3. **Admin Created Before Fix**: The admin was created before the department requirement was added

### ✅ Frontend Status:
- ✅ Frontend is correctly sending `departmentId` when creating admin
- ✅ Frontend is correctly requesting department in login
- ✅ Frontend shows warning when department is missing

### ✅ Backend Fix Required:
See `BACKEND_FIX_ADMIN_DEPARTMENT_ASSIGNMENT.md` for complete implementation.

**Quick Fix:**
```java
// In POST /api/super-admin/admins:
admin.setDepartment(department); // ✅ ADD THIS
admin.setDepartmentId(department.getId()); // ✅ ADD THIS

// In POST /api/auth/login:
if (user.getRole() == Role.ADMIN) {
    Admin admin = adminRepository.findByUserId(user.getId());
    if (admin != null && admin.getDepartment() != null) {
        userDTO.setDepartment(admin.getDepartment().getName()); // ✅ ADD THIS
        userDTO.setDepartmentId(admin.getDepartment().getId()); // ✅ ADD THIS
    }
}
```

---

## Summary of Root Causes:

| Issue | Root Cause | Fix Location |
|-------|------------|--------------|
| **500 Error on `/api/leave`** | Backend endpoint has bug/doesn't handle null parameters | `BACKEND_FIX_LEAVE_ENDPOINT_500_ERROR.md` |
| **Admin No Department** | Backend not saving/returning departmentId | `BACKEND_FIX_ADMIN_DEPARTMENT_ASSIGNMENT.md` |

---

## Action Items:

### For Backend Developer:

1. **Fix Leave Endpoint** (Priority: High)
   - Open `BACKEND_FIX_LEAVE_ENDPOINT_500_ERROR.md`
   - Implement error handling in `GET /api/leave`
   - Add proper null checks
   - Test endpoint

2. **Fix Admin Department Assignment** (Priority: Critical)
   - Open `BACKEND_FIX_ADMIN_DEPARTMENT_ASSIGNMENT.md`
   - Update `POST /api/super-admin/admins` to save departmentId
   - Update `POST /api/auth/login` to return department
   - Test creating admin and logging in

3. **Database Check**
   - Verify `admins` table has `department_id` column
   - If missing, run migration from SQL guide

### For Frontend (Already Fixed):
- ✅ Error handling for leave requests
- ✅ Warning when admin has no department
- ✅ Logging for debugging

---

## Testing After Backend Fixes:

1. **Test Leave Endpoint:**
   ```bash
   # Should return 200 OK, not 500
   GET http://localhost:8082/api/leave
   ```

2. **Test Admin Creation:**
   - Create admin with department
   - Check database: `SELECT * FROM admins WHERE email = 'test@univen.ac.za';`
   - Verify `department_id` is saved

3. **Test Admin Login:**
   - Login as created admin
   - Check response includes `department` and `departmentId`
   - Admin dashboard should show department

---

**Both issues are backend problems. Frontend is ready and waiting for backend fixes.**

