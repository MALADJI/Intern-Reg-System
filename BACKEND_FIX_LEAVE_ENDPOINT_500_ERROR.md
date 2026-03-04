# Backend Fix: Leave Endpoint 500 Error

## Problem
`GET /api/leave` is returning 500 Internal Server Error when called from admin dashboard.

---

## Common Causes of 500 Error:

### Cause 1: Missing Department Filter Handling
The endpoint might be trying to filter by `departmentId` but the parameter is null/undefined.

### Cause 2: Database Query Error
The query might be failing due to:
- Missing JOIN with department table
- Null pointer exception when department is null
- SQL syntax error

### Cause 3: Missing Authentication/Authorization
The endpoint might not be properly secured or user context is missing.

---

## Backend Fix:

### Fix 1: Update Leave Controller

**File:** `LeaveController.java` or `LeaveRequestController.java`

```java
@RestController
@RequestMapping("/api/leave")
public class LeaveController {
    
    @Autowired
    private LeaveRequestService leaveRequestService;
    
    /**
     * Get all leave requests
     * ✅ Handle optional departmentId parameter
     */
    @GetMapping
    public ResponseEntity<?> getAllLeaveRequests(
            @RequestParam(required = false) String status,
            @RequestParam(required = false) Long departmentId) {
        try {
            List<LeaveRequest> requests;
            
            // ✅ If departmentId is provided, filter by department
            if (departmentId != null) {
                requests = leaveRequestService.getLeaveRequestsByDepartment(departmentId, status);
            } else {
                // ✅ If no departmentId, return all (or filter by authenticated user's department)
                requests = leaveRequestService.getAllLeaveRequests(status);
            }
            
            return ResponseEntity.ok(requests);
        } catch (Exception e) {
            // ✅ Log the actual error for debugging
            log.error("Error fetching leave requests", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(new ErrorResponse("Failed to fetch leave requests: " + e.getMessage()));
        }
    }
}
```

### Fix 2: Update Leave Service

**File:** `LeaveRequestService.java`

```java
@Service
public class LeaveRequestService {
    
    @Autowired
    private LeaveRequestRepository leaveRequestRepository;
    
    /**
     * Get all leave requests (optionally filtered by status)
     */
    public List<LeaveRequest> getAllLeaveRequests(String status) {
        if (status != null && !status.isEmpty()) {
            return leaveRequestRepository.findByStatus(status);
        }
        return leaveRequestRepository.findAll();
    }
    
    /**
     * Get leave requests by department
     * ✅ NEW METHOD: Filter by department
     */
    public List<LeaveRequest> getLeaveRequestsByDepartment(Long departmentId, String status) {
        // ✅ Verify department exists
        Department department = departmentRepository.findById(departmentId)
            .orElseThrow(() -> new ResourceNotFoundException("Department not found"));
        
        // ✅ Query leave requests by department
        if (status != null && !status.isEmpty()) {
            return leaveRequestRepository.findByDepartmentIdAndStatus(departmentId, status);
        }
        return leaveRequestRepository.findByDepartmentId(departmentId);
    }
}
```

### Fix 3: Update Leave Repository

**File:** `LeaveRequestRepository.java`

```java
@Repository
public interface LeaveRequestRepository extends JpaRepository<LeaveRequest, Long> {
    
    // Existing methods...
    List<LeaveRequest> findByStatus(String status);
    
    // ✅ NEW: Find by department
    @Query("SELECT lr FROM LeaveRequest lr " +
           "JOIN lr.intern i " +
           "JOIN i.department d " +
           "WHERE d.id = :departmentId")
    List<LeaveRequest> findByDepartmentId(@Param("departmentId") Long departmentId);
    
    // ✅ NEW: Find by department and status
    @Query("SELECT lr FROM LeaveRequest lr " +
           "JOIN lr.intern i " +
           "JOIN i.department d " +
           "WHERE d.id = :departmentId AND lr.status = :status")
    List<LeaveRequest> findByDepartmentIdAndStatus(
        @Param("departmentId") Long departmentId, 
        @Param("status") String status
    );
}
```

### Fix 4: Add Error Handling

**File:** `LeaveController.java`

```java
@GetMapping
public ResponseEntity<?> getAllLeaveRequests(
        @RequestParam(required = false) String status,
        @RequestParam(required = false) Long departmentId) {
    try {
        // ✅ Validate status if provided
        if (status != null && !status.isEmpty()) {
            if (!Arrays.asList("PENDING", "APPROVED", "REJECTED").contains(status.toUpperCase())) {
                return ResponseEntity.badRequest()
                    .body(new ErrorResponse("Invalid status: " + status));
            }
        }
        
        // ✅ Validate departmentId if provided
        if (departmentId != null && departmentId <= 0) {
            return ResponseEntity.badRequest()
                .body(new ErrorResponse("Invalid department ID"));
        }
        
        List<LeaveRequest> requests;
        if (departmentId != null) {
            requests = leaveRequestService.getLeaveRequestsByDepartment(departmentId, status);
        } else {
            requests = leaveRequestService.getAllLeaveRequests(status);
        }
        
        return ResponseEntity.ok(requests);
        
    } catch (ResourceNotFoundException e) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND)
            .body(new ErrorResponse(e.getMessage()));
    } catch (Exception e) {
        log.error("Error in getAllLeaveRequests", e);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
            .body(new ErrorResponse("An error occurred while fetching leave requests"));
    }
}
```

---

## Quick Debug Steps:

1. **Check Backend Logs:**
   - Look for the actual exception/stack trace
   - Common errors: NullPointerException, SQLException, EntityNotFoundException

2. **Test Endpoint Directly:**
   ```bash
   # Test without parameters
   curl http://localhost:8082/api/leave -H "Authorization: Bearer YOUR_TOKEN"
   
   # Test with departmentId
   curl "http://localhost:8082/api/leave?departmentId=1" -H "Authorization: Bearer YOUR_TOKEN"
   ```

3. **Check Database:**
   ```sql
   -- Verify leave_requests table exists
   DESCRIBE leave_requests;
   
   -- Check if there are any leave requests
   SELECT COUNT(*) FROM leave_requests;
   ```

---

## Common Issues:

### Issue 1: LeaveRequest Entity Missing Department Relationship
If `LeaveRequest` doesn't have a relationship to `Department` through `Intern`:

```java
@Entity
public class LeaveRequest {
    @ManyToOne
    @JoinColumn(name = "intern_id")
    private Intern intern; // ✅ Must have this
    
    // Department is accessed through: intern.getDepartment()
}
```

### Issue 2: Missing JOIN in Query
Make sure the query properly joins through Intern to Department:

```java
@Query("SELECT lr FROM LeaveRequest lr " +
       "JOIN FETCH lr.intern i " +  // ✅ JOIN FETCH to avoid lazy loading
       "JOIN FETCH i.department d " + // ✅ JOIN to department
       "WHERE d.id = :departmentId")
```

---

## Testing After Fix:

1. **Test without departmentId:**
   ```
   GET /api/leave
   ```

2. **Test with departmentId:**
   ```
   GET /api/leave?departmentId=1
   ```

3. **Test with status:**
   ```
   GET /api/leave?status=PENDING
   ```

4. **Test with both:**
   ```
   GET /api/leave?departmentId=1&status=PENDING
   ```

---

**After implementing these fixes, restart your backend and test again.**

