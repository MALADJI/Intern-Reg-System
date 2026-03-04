declare var bootstrap: any;

// Leaflet type declarations
declare var L: any;

import { Component, OnInit, OnDestroy, ChangeDetectorRef, NgZone } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { StorageService } from '../../services/storage.service';
import { DepartmentService } from '../../services/department.service';
import { DepartmentApiService, Department } from '../../services/department-api.service';
import { InternService, InternResponse } from '../../services/intern.service';
import { SupervisorService } from '../../services/supervisor.service';
import { LeaveRequestService } from '../../services/leave-request.service';
import { AttendanceService } from '../../services/attendance.service';
import { ReportService } from '../../services/report.service';
import { AdminService, AdminUser } from '../../services/admin.service';
import { DataPreloadService } from '../../services/data-preload.service';
import { LocationService, Location } from '../../services/location.service';
import { SidebarService } from '../../services/sidebar.service';
import { ApiService, API_BASE_URL } from '../../services/api.service';
import { Profile } from '../../profile/profile';
import { LoadingComponent } from '../../shared/components/loading/loading.component';
import { WebSocketService } from '../../services/websocket.service';
import { Subscription, forkJoin, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import Swal from 'sweetalert2';
import type { SweetAlertResult } from 'sweetalert2';


// ===== Interfaces =====
interface OverviewStat {
  label: string;
  value: number;
  icon: string;
  color: string;
}

interface AttendanceRecord {
  name: string;
  email?: string;
  department: string;
  present: number;
  absent: number;
  leave: number;
  attendanceRate: number;
  field?: string;
  signature?: string;
  lastActive?: string | Date;
}
interface Supervisor {
  id?: number;
  name: string;
  surname: string;
  email: string;
  department: string;
  departmentId?: number; // Added for backend operations
  field: string;
  assignedInterns?: string[];
  status: 'Active' | 'On Leave' | 'Inactive';
  active?: boolean; // Whether the supervisor is active or deactivated
  createdAt?: string; // Date when supervisor was created
  lastLogin?: string | null; // Date of last login, null if never logged in
  hasSignature?: boolean;
}

// Edit supervisor form interface
interface EditSupervisorForm {
  name: string;
  surname: string;
  email: string;
  departmentId?: number;
  field?: string;
  password?: string;
  confirmPassword?: string;
}

// Edit intern form interface
interface EditInternForm {
  name: string;
  email: string;
  idNumber?: string;
  startDate?: string;
  endDate?: string;
  supervisor: string;
  supervisorId?: number;
  employer?: string;
  department: string;
  departmentId?: number;
  field: string;
  status: 'Present' | 'Absent' | 'On Leave' | 'Not Signed Out';
}

interface LeaveRequest {
  id?: number;
  name: string;
  email: string;
  department: string;
  startDate: string;
  endDate: string;
  reason: string; // Intern's reason when submitted, admin/supervisor's decline message when rejected
  status: 'Approved' | 'Pending' | 'Declined';
  document?: string;
  field?: string;
}

interface Intern {
  id?: number;
  name: string;
  email: string;
  idNumber?: string; // ID Number from sign-up
  startDate?: string; // Internship start date
  endDate?: string; // Internship end date
  supervisor: string;
  supervisorId?: number;
  employer?: string;
  department: string;
  departmentId?: number;
  field: string;
  signature?: string;
  status: 'Present' | 'Absent' | 'On Leave' | 'Not Signed Out';
  active?: boolean; // Whether the intern is active or deactivated
  recordsByDay?: {
    [day: string]: {
      action: 'Signed In' | 'Signed Out' | 'On Leave' | 'Absent';
      timeIn?: Date;
      timeOut?: Date;
    };
  };
}

interface Admin {
  name: string;
  email: string;
  role: string;
  Department: string | null; // ✅ Department name (from backend database, selected by super admin)
  departmentId?: number | null; // ✅ Department ID (for backend operations)
  field?: string | null; // ✅ Field name if applicable
}

// Location interface is now imported from LocationService

// ===== Typed dashboard sections =====
type DashboardSection = 'overview' | 'Manage Field' | 'Supervisor' | 'interns' | 'Intern Leave status' | 'Attendance history' | 'reports' | 'Locations' | 'profile';

// ===== Component =====
@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, Profile, LoadingComponent],
  providers: [DatePipe],
  templateUrl: './admin-dashboard.html',
  styleUrls: ['./admin-dashboard.css'],
})
export class AdminDashboard implements OnInit, OnDestroy {
  private subscriptions = new Subscription();
  isSidebarExpanded: boolean = true;
  currentTime: string = '';
  currentDate: string = '';
  private clockTimer: any;

  // ===== Admin Info =====
  admin: Admin | null = null;

  // ===== Loading States =====
  isLoading: boolean = true; // Global loading state
  isLoadingInterns: boolean = false;
  isLoadingSupervisors: boolean = false;
  isLoadingUsers: boolean = false;
  internsLoadError: string | null = null;
  supervisorsLoadError: string | null = null;
  usersLoadError: string | null = null;

  // ===== Admin Users Data =====
  allUsers: AdminUser[] = [];

  // Object to store intern signatures
  internSignatures: { [id: number]: string } = {};

  // ===== Dashboard Sections =====
  sections: DashboardSection[] = ['overview', 'Manage Field', 'Supervisor', 'interns', 'Intern Leave status', 'Attendance history', 'reports', 'Locations'];
  activeSection: DashboardSection = 'overview';

  // Constant mapping for template-safe comparisons
  Section = {
    Overview: 'overview' as DashboardSection,
    Departments: 'Manage Field' as DashboardSection,
    Supervisor: 'Supervisor' as DashboardSection,
    Interns: 'interns' as DashboardSection,
    Leave: 'Intern Leave status' as DashboardSection,
    History: 'Attendance history' as DashboardSection,
    Reports: 'reports' as DashboardSection,
    Locations: 'Locations' as DashboardSection,
  };

  // Navigation items with icons
  navigationItems: Array<{ id: DashboardSection; label: string; icon: string }> = [
    { id: 'overview', label: 'Dashboard', icon: 'bi bi-grid-3x3-gap' },
    { id: 'Manage Field', label: 'Fields', icon: 'bi bi-building' },
    { id: 'Supervisor', label: 'Supervisors', icon: 'bi bi-person-badge' },
    { id: 'interns', label: 'Interns', icon: 'bi bi-people-fill' },
    { id: 'Intern Leave status', label: 'Leave Status', icon: 'bi bi-calendar-check' },
    { id: 'Attendance history', label: 'History', icon: 'bi bi-clock-history' },
    { id: 'reports', label: 'Reports', icon: 'bi bi-file-earmark-text' },
    { id: 'Locations', label: 'Locations', icon: 'bi bi-geo-alt-fill' }
  ];

  // Auto-refresh interval for supervisors (to detect when they log in)
  private supervisorRefreshInterval: ReturnType<typeof setInterval> | null = null;

  // ===== Navigation =====
  showSection(section: DashboardSection) {
    this.activeSection = section;
    // Initialize map when Locations section is shown
    if (section === 'Locations') {
      this.getCurrentLocation();
      setTimeout(() => {
        this.initMap();
      }, 100);
    }
    // Auto-refresh supervisors when Supervisor section is shown
    if (section === 'Supervisor') {
      // Load supervisors immediately
      this.loadSupervisors();
      // Set up auto-refresh every 30 seconds to detect when supervisors log in
      this.startSupervisorAutoRefresh();
    } else {
      // Stop auto-refresh when leaving Supervisor section
      this.stopSupervisorAutoRefresh();
    }
  }

  // Helper method to check if a section is active (avoids TypeScript type narrowing issues)
  isSectionActive(section: DashboardSection): boolean {
    return this.activeSection === section;
  }

  // Start auto-refresh for supervisors
  startSupervisorAutoRefresh(): void {
    // Clear any existing interval
    this.stopSupervisorAutoRefresh();
    // Refresh supervisors every 30 seconds to detect login status changes
    this.supervisorRefreshInterval = setInterval(() => {
      this.loadSupervisors();
    }, 30000); // 30 seconds
  }

  // Stop auto-refresh for supervisors
  stopSupervisorAutoRefresh(): void {
    if (this.supervisorRefreshInterval) {
      clearInterval(this.supervisorRefreshInterval);
      this.supervisorRefreshInterval = null;
    }
  }

  logout() {
    // Logout confirmation
    Swal.fire({
      title: 'Logout?',
      text: 'Are you sure you want to logout?',
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#3085d6',
      confirmButtonText: 'Yes, logout',
      cancelButtonText: 'Cancel'
    }).then((result: SweetAlertResult) => {
      if (result.isConfirmed) {
        this.authService.logout();
        this.router.navigate(['/login']);
      }
    });
  }

  public toggleSidebar(): void {
    if (this.sidebarService) {
      this.sidebarService.toggleSidebar();
    }
  }

  // ===== Overview Stats =====
  get overviewStats(): OverviewStat[] {
    const totalActiveInterns = this.interns.filter(i => i.active !== false).length;
    const presentCount = this.interns.filter(i => i.status === 'Present' && i.active !== false).length;
    const onLeaveCount = this.interns.filter(i => i.status === 'On Leave' && i.active !== false).length;
    const absentCount = this.interns.filter(i => i.status === 'Absent' && i.active !== false).length;

    return [
      { label: 'Total Interns', value: totalActiveInterns, icon: 'bi bi-people-fill', color: 'primary' },
      { label: 'Present Today', value: presentCount, icon: 'bi bi-check-circle', color: 'success' },
      { label: 'On Leave', value: onLeaveCount, icon: 'bi bi-clock', color: 'warning' },
      { label: 'Absent', value: absentCount, icon: 'bi bi-x-circle', color: 'danger' },
    ];
  }

  selectedStat: OverviewStat | null = null;

  openModal(stat: OverviewStat): void {
    this.selectedStat = stat;

    if (stat.label === 'Total Interns') {
      this.activeSection = 'interns';
      return;
    }

    const modalElement = document.getElementById('adminModal');
    if (modalElement) {
      const modal = new bootstrap.Modal(modalElement);
      modal.show();
    }

    if (stat.label === 'Absent') {
      this.attendanceFilterName = '';
      this.attendanceFilterDepartment = '';
      this.attendanceFilterField = '';
      this.filteredAttendanceFields = [];
      this.attendancePage = 1;
    }
  }


  // ===================== MANAGE DEPARTMENTS =====================

  // Form properties for adding departments and fields
  newDepartmentName: string = '';
  selectedDepartmentForField: string = '';
  newFieldName: string = '';
  departmentSelectionError: string = '';

  // ADD DEPARTMENT
  createDepartment() {
    if (!this.newDepartmentName || this.newDepartmentName.trim() === '') {
      Swal.fire('Error', 'Please enter a department name', 'error');
      return;
    }

    const deptName = this.newDepartmentName.trim();

    // Check if department already exists
    if (this.departmentList.includes(deptName)) {
      Swal.fire('Error', 'This department already exists', 'error');
      return;
    }

    // Create department in backend first
    this.departmentApiService.createDepartment(deptName).subscribe({
      next: (createdDept) => {
        // Update local department service
        const response = this.departmentService.addDepartment(deptName);

        if (response.success) {
          // Update department ID map with the new department's ID
          if (createdDept.id) {
            this.departmentIdMap.set(deptName, createdDept.id);
          }

          // Clear form
          this.newDepartmentName = '';

          // Trigger change detection
          this.cdr.markForCheck();
          this.cdr.detectChanges();
          Swal.fire('Added!', `Department "${deptName}" has been created successfully.`, 'success');
        } else {
          Swal.fire('Error', response.message, 'error');
        }
      },
      error: (error) => {
        console.error('Error creating department:', error);
        const errorMessage = error?.error?.message || error?.message || 'Failed to create department';
        Swal.fire('Error', errorMessage, 'error');
      }
    });
  }

  openAddDepartmentModal() {
    Swal.fire({
      title: 'Add New Department',
      input: 'text',
      inputPlaceholder: 'Enter department name',
      showCancelButton: true,
      confirmButtonText: 'Add',
      inputValidator: (value: string) => {
        if (!value) return 'Department name cannot be empty';
        if (this.departmentList.includes(value)) return 'This department already exists';
        return null;
      }
    }).then((result: SweetAlertResult) => {
      if (result.isConfirmed && result.value) {
        const deptName = result.value.trim();

        // Create department in backend first
        this.departmentApiService.createDepartment(deptName).subscribe({
          next: (createdDept) => {
            // Update local department service
            const response = this.departmentService.addDepartment(deptName);

            if (response.success) {
              // Update department ID map with the new department's ID
              if (createdDept.id) {
                this.departmentIdMap.set(deptName, createdDept.id);
              }

              // Trigger change detection
              this.cdr.markForCheck();
              this.cdr.detectChanges();
              Swal.fire('Added!', `Department "${deptName}" has been created successfully.`, 'success');
            } else {
              Swal.fire('Error', response.message, 'error');
            }
          },
          error: (error) => {
            console.error('Error creating department:', error);
            const errorMessage = error?.error?.message || error?.message || 'Failed to create department';
            Swal.fire('Error', errorMessage, 'error');
          }
        });
      }
    });
  }

  // EDIT DEPARTMENT
  editDepartment(dept: string, index: number) {
    const deptId = this.getDepartmentId(dept);
    if (!deptId) {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: 'Department ID not found. Please refresh the page.'
      });
      return;
    }

    Swal.fire({
      title: 'Edit Department',
      input: 'text',
      inputValue: dept,
      showCancelButton: true,
      confirmButtonText: 'Save',
      inputValidator: (value: string) => {
        if (!value) return 'Department name cannot be empty';
        if (this.departmentList.includes(value) && value !== dept) return 'This department already exists';
        return null;
      }
    }).then((result: SweetAlertResult) => {
      if (result.isConfirmed && result.value) {
        const newName = result.value.trim();

        this.departmentApiService.updateDepartment(deptId, newName).subscribe({
          next: (updatedDept) => {
            // Update local department service
            const localResponse = this.departmentService.updateDepartment(dept, newName);

            if (localResponse.success) {
              // Update department ID map
              this.departmentIdMap.delete(dept);
              if (updatedDept.id) {
                this.departmentIdMap.set(newName, updatedDept.id);
              }

              // Update all interns with this department
              this.interns.forEach(intern => {
                if (intern.department === dept) {
                  intern.department = newName;
                }
              });

              // Create new array reference to trigger change detection
              this.interns = [...this.interns];

              // Trigger change detection
              this.cdr.markForCheck();
              this.cdr.detectChanges();
              Swal.fire('Updated!', `Department updated to "${newName}".`, 'success');
            } else {
              Swal.fire('Error', localResponse.message, 'error');
            }
          },
          error: (error) => {
            Swal.fire('Error', error.message || 'Failed to update department', 'error');
          }
        });
      }
    });
  }

  // DELETE DEPARTMENT
  deleteDepartment(dept: string, index: number) {
    const deptId = this.getDepartmentId(dept);
    if (!deptId) {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: 'Department ID not found. Please refresh the page.'
      });
      return;
    }

    // Check if any interns are using this department
    const internsInDept = this.interns.filter(i => i.department === dept);

    if (internsInDept.length > 0) {
      Swal.fire({
        icon: 'error',
        title: 'Cannot Delete Department',
        html: `
              <div class="text-start">
                <p class="mb-3">This department cannot be deleted because it is assigned to <strong>${internsInDept.length}</strong> intern(s).</p>
                <div class="alert alert-info mb-0">
                  <i class="bi bi-info-circle me-2"></i>
                  Please reassign these interns to another department before deleting.
                </div>
              </div>
            `,
        confirmButtonText: 'OK',
        confirmButtonColor: '#1e3a5f'
      });
      return;
    }

    Swal.fire({
      title: `Delete "${dept}"?`,
      text: "This will remove all associated fields!",
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Delete',
      cancelButtonText: 'Cancel'
    }).then((result: SweetAlertResult) => {
      if (result.isConfirmed) {
        this.departmentApiService.deleteDepartment(deptId).subscribe({
          next: () => {
            // Update local department service
            const localResponse = this.departmentService.deleteDepartment(dept, () => 0);

            if (localResponse.success) {
              // Remove from ID map
              this.departmentIdMap.delete(dept);

              // Trigger change detection
              this.cdr.markForCheck();
              this.cdr.detectChanges();
              Swal.fire('Deleted!', `Department "${dept}" has been deleted.`, 'success');
            } else {
              Swal.fire('Error', localResponse.message, 'error');
            }
          },
          error: (error) => {
            Swal.fire('Error', error.message || 'Failed to delete department', 'error');
          }
        });
      }
    });
  }

  validateDepartmentSelection() {
    this.departmentSelectionError = '';

    if (!this.selectedDepartmentForField) {
      return; // No selection yet, no error
    }

    // Check if selected department matches admin's assigned department
    if (this.selectedDepartmentForField !== this.adminDepartment) {
      this.departmentSelectionError = `You can only manage fields for your assigned department (${this.adminDepartment}). Please select ${this.adminDepartment}.`;
      // Reset to admin's department
      this.selectedDepartmentForField = this.adminDepartment || '';
      this.cdr.detectChanges();
    }
  }

  addFieldToDepartment() {
    // ✅ CRITICAL: Always use admin's department from backend (selected by super admin)
    // Don't rely on dropdown selection - use the admin's actual department
    const deptName = this.adminDepartment;

    if (!deptName) {
      Swal.fire('Error', 'No department assigned. Please contact the administrator to assign you to a department.', 'error');
      return;
    }

    // Ensure selectedDepartmentForField matches admin's department
    if (this.selectedDepartmentForField !== deptName) {
      this.selectedDepartmentForField = deptName;
    }

    if (!this.newFieldName || this.newFieldName.trim() === '') {
      Swal.fire('Error', 'Please enter a field name', 'error');
      return;
    }

    const fieldName = this.newFieldName.trim();

    // ✅ Find the department using admin's department ID (selected by super admin)
    // This ensures fields are always created in the correct department
    let department = null;

    // First, try to find by admin's department ID (most reliable)
    if (this.adminDepartmentId) {
      department = this.departments.find(dept => dept.id === this.adminDepartmentId);
      console.log('Found department by ID:', { adminDepartmentId: this.adminDepartmentId, department });
    }

    // Fallback to finding by name if ID lookup fails
    if (!department) {
      department = this.departments.find(dept => dept.name === deptName);
      console.log('Found department by name:', { deptName, department });
    }

    if (!department || !department.id) {
      Swal.fire('Error', `Department "${deptName}" not found. Please refresh and try again.`, 'error');
      console.error('Department not found:', {
        deptName,
        adminDepartmentId: this.adminDepartmentId,
        departments: this.departments.map(d => ({ id: d.id, name: d.name }))
      });
      return;
    }

    // ✅ Verify we're using the admin's assigned department
    if (this.adminDepartmentId && department.id !== this.adminDepartmentId) {
      console.warn('Department ID mismatch. Using admin department ID instead.');
      const adminDept = this.departments.find(dept => dept.id === this.adminDepartmentId);
      if (adminDept && adminDept.id) {
        department = adminDept;
      }
    }

    // ✅ Type guard: Ensure department.id is defined before using it
    // This fixes TypeScript error: department.id might be undefined
    if (!department.id || typeof department.id !== 'number') {
      Swal.fire('Error', 'Department ID is missing. Please refresh and try again.', 'error');
      console.error('Department ID is undefined:', department);
      return;
    }

    // ✅ Explicit type assertion after type guard - TypeScript now knows department.id is a number
    const departmentId: number = department.id as number;

    console.log('Creating field in department:', {
      departmentName: department.name,
      departmentId: departmentId,
      adminDepartmentId: this.adminDepartmentId,
      fieldName: fieldName
    });

    // Check if field already exists in the backend data
    const existingFields = this.getFieldsForDepartment(departmentId);
    if (existingFields.includes(fieldName)) {
      Swal.fire('Error', 'This field already exists in this department', 'error');
      return;
    }

    // ✅ Use backend API to add field - departmentId is now guaranteed to be a number
    this.departmentApiService.addFieldToDepartment(departmentId, fieldName).subscribe({
      next: (updatedDepartment) => {
        console.log('Field added successfully, updated department:', updatedDepartment);

        // Reload departments to get the latest data from MySQL
        this.loadDepartments();

        // Clear form
        this.newFieldName = '';
        this.departmentSelectionError = '';

        // Force change detection after departments are reloaded
        setTimeout(() => {
          this.cdr.detectChanges();
          // Verify the field was added
          const dept = this.departments.find(d => d.id === department.id);
          if (dept && dept.fields) {
            const fieldNames = dept.fields.map((f: any) => typeof f === 'string' ? f : f.name).filter((n: string) => n);
            console.log('Fields after reload:', fieldNames);
          }
        }, 300);

        Swal.fire({
          icon: 'success',
          title: 'Added!',
          text: `Field "${fieldName}" has been added to ${deptName} and saved to database.`,
          timer: 2000,
          showConfirmButton: false
        });
      },
      error: (error) => {
        console.error('Error adding field:', error);
        const errorMessage = error?.error?.message || error?.error?.error || error?.message || 'Failed to add field. Please try again.';
        Swal.fire({
          icon: 'error',
          title: 'Error',
          text: errorMessage
        });
      }
    });
  }

  deactivateField(dept: string, index: number) {
    // Find the department in the backend departments array
    const department = this.departments.find(d => d.name === dept);
    if (!department || !department.id) {
      Swal.fire('Error', 'Department not found. Please refresh and try again.', 'error');
      return;
    }

    // Get fields from backend
    const fields = this.getFieldsForDepartment(department.id);
    const fieldToToggle = fields[index];
    if (!fieldToToggle) return;

    // Find the field object in the department's fields array to get its ID
    const fieldObj = department.fields?.find((f: any) => {
      const fieldName = typeof f === 'string' ? f : (f.name || f);
      return fieldName === fieldToToggle;
    });

    if (!fieldObj) {
      Swal.fire('Error', 'Field not found. Please refresh and try again.', 'error');
      return;
    }

    // Get field ID (field might be an object with fieldId, id, or just a string)
    let fieldId: number | null = null;
    if (typeof fieldObj === 'object') {
      fieldId = (fieldObj as any).fieldId || (fieldObj as any).id || null;
    }

    if (!fieldId || typeof fieldId !== 'number') {
      Swal.fire('Error', 'Field ID not found. Please refresh and try again.', 'error');
      return;
    }

    // Check if field is currently active (from backend data)
    const isCurrentlyActive = typeof fieldObj === 'object' && 'active' in fieldObj
      ? (fieldObj as any).active !== false
      : true; // Default to active if not specified

    // Check if any interns are using this field
    const internsUsingField = this.interns.filter(i =>
      i.department === dept && (i.field === fieldToToggle || i.field?.trim() === fieldToToggle.trim())
    );

    Swal.fire({
      title: isCurrentlyActive ? 'Deactivate Field?' : 'Activate Field?',
      html: `
        <div class="text-start">
          <p class="mb-3">Are you sure you want to ${isCurrentlyActive ? 'deactivate' : 'activate'} <strong>"${fieldToToggle}"</strong>?</p>
          ${internsUsingField.length > 0
          ? `<div class="alert alert-warning mb-2">
                <i class="bi bi-exclamation-triangle me-2"></i>
                <strong>Note:</strong> This field is currently assigned to <strong>${internsUsingField.length}</strong> intern(s). ${isCurrentlyActive ? 'Deactivating' : 'Activating'} will ${isCurrentlyActive ? 'prevent new assignments but won\'t affect existing interns' : 'allow new assignments to this field'}.
              </div>`
          : ''
        }
          <div class="alert alert-info mb-0">
            <i class="bi bi-info-circle me-2"></i>
            <strong>Note:</strong> ${isCurrentlyActive ? 'Deactivating' : 'Activating'} this field will ${isCurrentlyActive ? 'mark it as inactive' : 'mark it as active'} in the system. Historical information and existing assignments will be preserved.
          </div>
        </div>
      `,
      icon: isCurrentlyActive ? 'warning' : 'question',
      showCancelButton: true,
      confirmButtonText: isCurrentlyActive ? 'Yes, Deactivate' : 'Yes, Activate',
      cancelButtonText: 'Cancel',
      confirmButtonColor: isCurrentlyActive ? '#ffc107' : '#28a745',
      cancelButtonColor: '#6c757d',
      reverseButtons: true
    }).then((result: SweetAlertResult) => {
      if (result.isConfirmed) {
        // Use backend API to toggle field status
        if (!department.id) {
          Swal.fire('Error', 'Department ID not found. Please refresh and try again.', 'error');
          return;
        }

        const apiCall = isCurrentlyActive
          ? this.departmentApiService.deactivateField(department.id, fieldId)
          : this.departmentApiService.activateField(department.id, fieldId);

        apiCall.subscribe({
          next: (updatedDepartment) => {
            // Reload departments to get updated field status
            this.loadDepartments();

            // Update local deactivatedFields map for UI consistency
            const key = `${dept}:${fieldToToggle}`;
            this.deactivatedFields.set(key, !isCurrentlyActive);

            // Trigger change detection
            this.cdr.detectChanges();

            // Show success message
            Swal.fire({
              icon: 'success',
              title: isCurrentlyActive ? 'Deactivated!' : 'Activated!',
              text: `Field "${fieldToToggle}" has been ${isCurrentlyActive ? 'deactivated' : 'activated'} successfully.`,
              timer: 2000,
              showConfirmButton: false
            });
          },
          error: (error) => {
            console.error('Error toggling field status:', error);
            const errorMessage = error?.error?.message || error?.message || 'Failed to update field status. Please try again.';
            Swal.fire('Error', errorMessage, 'error');
          }
        });
      }
    });
  }

  // ADD FIELD
  openAddFieldModal(dept: string) {
    Swal.fire({
      title: `Add Field to ${dept}`,
      input: 'text',
      inputPlaceholder: 'Enter field name',
      showCancelButton: true,
      confirmButtonText: 'Add',
      inputValidator: (value: string) => {
        if (!value) return 'Field name cannot be empty';
        const fields = this.fieldMap[dept] || [];
        if (fields.includes(value)) return 'This field already exists';
        return null;
      }
    }).then((result: SweetAlertResult) => {
      if (result.isConfirmed && result.value) {
        const fieldName = result.value.trim();
        const response = this.departmentService.addField(dept, fieldName);
        if (response.success) {
          // Trigger change detection
          this.cdr.markForCheck();
          this.cdr.detectChanges();
          Swal.fire('Added!', response.message, 'success');
        } else {
          Swal.fire('Error', response.message, 'error');
        }
      }
    });
  }

  // EDIT FIELD
  editField(dept: string, index: number) {
    const fields = this.fieldMap[dept] || [];
    const currentField = fields[index];
    if (!currentField) return;

    Swal.fire({
      title: 'Edit Field',
      input: 'text',
      inputValue: currentField,
      showCancelButton: true,
      confirmButtonText: 'Save',
      inputValidator: (value: string) => {
        if (!value) return 'Field name cannot be empty';
        if (fields.includes(value) && value !== currentField) return 'This field already exists';
        return null;
      }
    }).then((result: SweetAlertResult) => {
      if (result.isConfirmed && result.value) {
        const oldField = currentField;
        const newField = result.value.trim();
        const response = this.departmentService.updateField(dept, oldField, newField);

        if (response.success) {
          // Update all interns with this field in this department
          this.interns.forEach(intern => {
            if (intern.department === dept && (intern.field === oldField || intern.field?.trim() === oldField.trim())) {
              intern.field = newField;
            }
          });

          // Create new array reference to trigger change detection
          this.interns = [...this.interns];

          // Trigger change detection
          this.cdr.markForCheck();
          this.cdr.detectChanges();
          Swal.fire('Updated!', response.message, 'success');
        } else {
          Swal.fire('Error', response.message, 'error');
        }
      }
    });
  }

  // DELETE FIELD
  deleteField(dept: string, index: number) {
    const fieldToDelete = this.fieldMap[dept][index];

    // Check if any interns are using this field
    const internsUsingField = this.interns.filter(i =>
      i.department === dept && (i.field === fieldToDelete || i.field?.trim() === fieldToDelete.trim())
    );

    if (internsUsingField.length > 0) {
      Swal.fire({
        title: `Delete "${fieldToDelete}"?`,
        html: `
          <div class="text-start">
            <p class="mb-3">This field is currently assigned to <strong>${internsUsingField.length}</strong> intern(s):</p>
            <ul class="text-start mb-3">
              ${internsUsingField.slice(0, 5).map(i => `<li>${i.name}</li>`).join('')}
              ${internsUsingField.length > 5 ? `<li><em>... and ${internsUsingField.length - 5} more</em></li>` : ''}
            </ul>
            <div class="alert alert-warning mb-0">
              <i class="bi bi-exclamation-triangle me-2"></i>
              <strong>Warning:</strong> Deleting this field will not automatically update these interns. You will need to manually assign them a new field.
            </div>
          </div>
        `,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Delete Anyway',
        cancelButtonText: 'Cancel',
        confirmButtonColor: '#dc3545',
        cancelButtonColor: '#6c757d'
      }).then((result: SweetAlertResult) => {
        if (result.isConfirmed) {
          const checkUsage = (department: string, field: string) => {
            return this.interns.filter(i =>
              i.department === department && (i.field === field || i.field?.trim() === field.trim())
            ).length;
          };
          const response = this.departmentService.deleteField(dept, fieldToDelete, checkUsage);
          if (response.success) {
            // Trigger change detection
            this.cdr.markForCheck();
            this.cdr.detectChanges();
            Swal.fire('Deleted!', response.message, 'success');
          } else {
            Swal.fire('Error', response.message, 'error');
          }
        }
      });
    } else {
      Swal.fire({
        title: `Delete "${fieldToDelete}"?`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Delete',
        cancelButtonText: 'Cancel'
      }).then((result: SweetAlertResult) => {
        if (result.isConfirmed) {
          const checkUsage = (department: string, field: string) => {
            return this.interns.filter(i =>
              i.department === department && (i.field === field || i.field?.trim() === field.trim())
            ).length;
          };
          const response = this.departmentService.deleteField(dept, fieldToDelete, checkUsage);
          if (response.success) {
            // Trigger change detection
            this.cdr.markForCheck();
            this.cdr.detectChanges();
            Swal.fire('Deleted!', response.message, 'success');
          } else {
            Swal.fire('Error', response.message, 'error');
          }
        }
      });
    }
  }

  // ===== Attendance Summary (Absent Modal) =====
  // Generate attendance records from actual interns data
  get overviewAttendance(): AttendanceRecord[] {
    return this.interns
      .filter(i => i.active !== false) // Only active interns
      .map(intern => {
        // Calculate attendance from recordsByDay if available
        let present = 0;
        let absent = 0;
        let leave = 0;

        if (intern.recordsByDay) {
          Object.values(intern.recordsByDay).forEach(record => {
            if (record.action === 'Signed In' || record.action === 'Signed Out') {
              present++;
            } else if (record.action === 'Absent') {
              absent++;
            } else if (record.action === 'On Leave') {
              leave++;
            }
          });
        } else {
          // Default values based on current status
          if (intern.status === 'Present') present = 5;
          else if (intern.status === 'Absent') absent = 5;
          else if (intern.status === 'On Leave') leave = 5;
        }

        const total = present + absent + leave;
        const attendanceRate = total > 0 ? Math.round((present / total) * 100) : 0;

        return {
          name: intern.name,
          email: intern.email,
          department: intern.department,
          field: intern.field,
          present,
          absent,
          leave,
          attendanceRate,
          signature: intern.id ? this.internSignatures[intern.id] : undefined,
          lastActive: new Date() // You can update this with actual last active date
        };
      });
  }

  // Overview Attendance Filters
  overviewAttendanceSearch: string = '';
  overviewAttendanceFilterDepartment: string = '';
  overviewAttendanceFilterField: string = '';
  filteredFieldsForOverviewAttendance: string[] = [];

  get filteredOverviewAttendance(): AttendanceRecord[] {
    return this.overviewAttendance.filter((record) => {
      if (this.overviewAttendanceSearch && !record.name.toLowerCase().includes(this.overviewAttendanceSearch.toLowerCase())) return false;
      if (this.overviewAttendanceFilterDepartment && record.department !== this.overviewAttendanceFilterDepartment) return false;
      if (this.overviewAttendanceFilterField && record.field !== this.overviewAttendanceFilterField) return false;
      return true;
    });
  }

  updateFilteredOverviewAttendance() {
    // This method is called on input change, filtering is handled by the getter
  }

  updateOverviewAttendanceFields() {
    this.filteredFieldsForOverviewAttendance = this.overviewAttendanceFilterDepartment
      ? this.fieldMap[this.overviewAttendanceFilterDepartment] || []
      : [];
    this.overviewAttendanceFilterField = '';
  }

  attendanceFilterName = '';
  attendanceFilterDepartment = '';
  attendanceFilterField = '';
  filteredAttendanceFields: string[] = [];

  get filteredAttendance(): AttendanceRecord[] {
    return this.overviewAttendance.filter((record) => {
      if (this.attendanceFilterName && !record.name.toLowerCase().includes(this.attendanceFilterName.toLowerCase())) return false;
      if (this.attendanceFilterDepartment && record.department !== this.attendanceFilterDepartment) return false;
      if (this.attendanceFilterField && record.field !== this.attendanceFilterField) return false;
      return true;
    });
  }

  updateAttendanceFields() {
    this.filteredAttendanceFields = this.attendanceFilterDepartment
      ? this.fieldMap[this.attendanceFilterDepartment] || []
      : [];
    this.attendanceFilterField = '';
  }

  resetAttendanceFilters() {
    this.attendanceFilterName = '';
    this.attendanceFilterDepartment = '';
    this.attendanceFilterField = '';
    this.filteredAttendanceFields = [];
  }

  // ===== Pagination for Attendance =====
  attendancePage = 1;
  attendancePerPage = 3;

  get paginatedAttendance() {
    const start = (this.attendancePage - 1) * this.attendancePerPage;
    return this.filteredAttendance.slice(start, start + this.attendancePerPage);
  }

  get totalAttendancePages() {
    return Math.ceil(this.filteredAttendance.length / this.attendancePerPage) || 1;
  }

  prevAttendancePage() {
    if (this.attendancePage > 1) this.attendancePage--;
  }

  nextAttendancePage() {
    if (this.attendancePage < this.totalAttendancePages) this.attendancePage++;
  }



  // ===== PRESENT INTERNS SECTION =====

  presentFilterName: string = '';
  presentFilterDepartment: string = '';
  presentFilterField: string = '';
  filteredPresentFields: string[] = [];



  // Pagination
  presentPage: number = 1;
  presentPerPage: number = 5;

  // Computed (filtered + paginated)
  get filteredPresentInterns() {
    return this.interns.filter(i =>
      i.status === 'Present' &&
      (!this.presentFilterName || i.name.toLowerCase().includes(this.presentFilterName.toLowerCase())) &&
      (!this.presentFilterDepartment || i.department === this.presentFilterDepartment) &&
      (!this.presentFilterField || i.field === this.presentFilterField)
    );
  }

  get paginatedPresentInterns() {
    const start = (this.presentPage - 1) * this.presentPerPage;
    const end = start + this.presentPerPage;
    return this.filteredPresentInterns.slice(start, end);
  }

  get totalPresentPages() {
    return Math.ceil(this.filteredPresentInterns.length / this.presentPerPage) || 1;
  }

  // Pagination controls
  prevPresentPage() {
    if (this.presentPage > 1) this.presentPage--;
  }

  nextPresentPage() {
    if (this.presentPage < this.totalPresentPages) this.presentPage++;
  }

  // Department/Field filter helpers
  updatePresentFields() {
    this.filteredPresentFields = this.presentFilterDepartment
      ? this.fieldMap[this.presentFilterDepartment] || []
      : [];
    this.presentFilterField = '';
    this.presentPage = 1;
  }

  resetPresentFilters() {
    this.presentFilterName = '';
    this.presentFilterDepartment = '';
    this.presentFilterField = '';
    this.filteredPresentFields = [];
    this.presentPage = 1;
  }



  // ===== On Leave Section =====
  filterDepartment = '';
  filterField = '';
  filterName = '';
  filteredFields: string[] = [];

  get filteredLeaves() {
    return this.overviewLeaves.filter((leave) => {
      if (this.filterDepartment && leave.department !== this.filterDepartment) return false;
      if (this.filterField && leave.field !== this.filterField) return false;
      if (this.filterName && !leave.name.toLowerCase().includes(this.filterName.toLowerCase())) return false;
      return true;
    });
  }

  currentPage = 1;
  itemsPerPage = 3;

  get paginatedLeaves() {
    const start = (this.currentPage - 1) * this.itemsPerPage;
    return this.filteredLeaves.slice(start, start + this.itemsPerPage);
  }

  get totalPages() {
    return Math.ceil(this.filteredLeaves.length / this.itemsPerPage) || 1;
  }

  nextPage() {
    if (this.currentPage < this.totalPages) this.currentPage++;
  }

  prevPage() {
    if (this.currentPage > 1) this.currentPage--;
  }

  // ===== Leave Requests =====
  // Get overview leaves from leaveRequests array (connected to actual data)
  get overviewLeaves(): LeaveRequest[] {
    return this.leaveRequests.slice(0, 5); // Show first 5 for overview
  }

  // Overview Leave Filters
  overviewLeaveSearch: string = '';
  overviewLeaveFilterDepartment: string = '';
  overviewLeaveFilterField: string = '';
  overviewLeaveFilterStatus: string = '';
  filteredFieldsForOverviewLeave: string[] = [];

  get filteredOverviewLeaves(): LeaveRequest[] {
    return this.overviewLeaves.filter((leave) => {
      if (this.overviewLeaveSearch && !leave.name.toLowerCase().includes(this.overviewLeaveSearch.toLowerCase())) return false;
      if (this.overviewLeaveFilterDepartment && leave.department !== this.overviewLeaveFilterDepartment) return false;
      if (this.overviewLeaveFilterField && leave.field !== this.overviewLeaveFilterField) return false;
      if (this.overviewLeaveFilterStatus && leave.status !== this.overviewLeaveFilterStatus) return false;
      return true;
    });
  }

  updateFilteredOverviewLeaves() {
    // This method is called on input change, filtering is handled by the getter
  }

  updateOverviewLeaveFields() {
    this.filteredFieldsForOverviewLeave = this.overviewLeaveFilterDepartment
      ? this.fieldMap[this.overviewLeaveFilterDepartment] || []
      : [];
    this.overviewLeaveFilterField = '';
  }

  // ===== Interns =====
  interns: Intern[] = [];

  internSearch = '';
  internFilterDepartment = '';
  internFilterField = '';
  internFilterEmployer = '';
  filteredFieldsForInterns: string[] = [];
  internCurrentPage = 1;
  internItemsPerPage = 25;
  internFilterStatus: string = '';

  // Get unique employers list for filter
  get employerList(): string[] {
    const employers = this.interns
      .map(i => i.employer)
      .filter((emp, index, self) => emp && self.indexOf(emp) === index) as string[];
    return employers.sort();
  }

  // ===== Updated filteredInterns Getter =====
  get filteredInterns(): Intern[] {
    return this.interns
      .filter(i => {
        if (this.internSearch) {
          const searchLower = this.internSearch.toLowerCase();
          return i.name.toLowerCase().includes(searchLower) || i.email.toLowerCase().includes(searchLower);
        }
        return true;
      })
      .filter(i => !this.internFilterDepartment || i.department === this.internFilterDepartment)
      .filter(i => !this.internFilterField || i.field === this.internFilterField)
      .filter(i => !this.internFilterEmployer || i.employer === this.internFilterEmployer)
      .filter(i => {
        // Filter by status, but also handle inactive status
        if (this.internFilterStatus) {
          if (this.internFilterStatus === 'Inactive') {
            return i.active === false;
          } else {
            return i.status === this.internFilterStatus && i.active !== false;
          }
        }
        return true;
      });
  }

  // ===== Pagination helpers for interns =====
  get paginatedInterns(): Intern[] {
    const start = (this.internCurrentPage - 1) * this.internItemsPerPage;
    return this.filteredInterns.slice(start, start + this.internItemsPerPage);
  }

  get totalInternPages(): number {
    return Math.ceil(this.filteredInterns.length / this.internItemsPerPage) || 1;
  }

  // TrackBy function for better change detection
  trackByInternEmail(index: number, intern: Intern): any {
    // Return a combination of email and key fields to ensure changes are detected
    return `${intern.email}-${intern.field}-${intern.status}-${intern.supervisor}-${index}`;
  }

  // Get count of active interns (excluding inactive)
  get activeInternsCount(): number {
    return this.interns.filter(i => i.active !== false).length;
  }

  prevInternPage() {
    if (this.internCurrentPage > 1) this.internCurrentPage--;
  }

  nextInternPage() {
    if (this.internCurrentPage < this.totalInternPages) this.internCurrentPage++;
  }

  goToInternPage(page: number) {
    if (page >= 1 && page <= this.totalInternPages) {
      this.internCurrentPage = page;
    }
  }

  getInternPageNumbers(): number[] {
    const total = this.totalInternPages;
    const current = this.internCurrentPage;
    const pages: number[] = [];

    if (total <= 7) {
      for (let i = 1; i <= total; i++) {
        pages.push(i);
      }
    } else {
      if (current <= 3) {
        for (let i = 1; i <= 5; i++) pages.push(i);
        pages.push(-1);
        pages.push(total);
      } else if (current >= total - 2) {
        pages.push(1);
        pages.push(-1);
        for (let i = total - 4; i <= total; i++) pages.push(i);
      } else {
        pages.push(1);
        pages.push(-1);
        for (let i = current - 1; i <= current + 1; i++) pages.push(i);
        pages.push(-1);
        pages.push(total);
      }
    }
    return pages;
  }

  // ===== Filter helper =====
  updateFilteredInterns() {
    this.internCurrentPage = 1;
    this.filteredFieldsForInterns = this.internFilterDepartment ? this.fieldMap[this.internFilterDepartment] || [] : [];
    this.internFilterField = '';
  }

  resetInternFilters() {
    this.internSearch = '';
    this.internFilterDepartment = '';
    this.internFilterField = '';
    this.internFilterEmployer = '';
    this.internFilterStatus = '';
    this.filteredFieldsForInterns = [];
    this.internCurrentPage = 1;
  }

  // ===== Leave Requests actions =====
  leaveRequests: LeaveRequest[] = [];
  clearedLeaveRequests: LeaveRequest[] = [];

  // ===== New Leave Requests Alert System =====
  // Track seen leave request IDs
  seenLeaveRequestIds: Set<number> = new Set();

  // New leave requests count
  newLeaveRequestsCount: number = 0;

  // Track if alert has been shown this session
  alertShownThisSession: boolean = false;

  // Interval for periodic leave request checking
  private leaveRequestCheckInterval?: any;

  approveRequest(request: LeaveRequest) {
    Swal.fire({
      title: 'Approve Leave Request?',
      text: `Are you sure you want to approve the leave request from ${request.name}?`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Yes, Approve',
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#198754',
      cancelButtonColor: '#6c757d'
    }).then((result: SweetAlertResult) => {
      if (result.isConfirmed) {
        const requestId = this.getRequestId(request);

        this.leaveRequestService.approveLeaveRequest(requestId).subscribe({
          next: (updatedRequest) => {
            // Execute inside Angular zone
            this.ngZone.run(() => {
              request.status = 'Approved';

              // Update intern status to 'On Leave' if they match
              const intern = this.interns.find(i =>
                (i.email === request.email || i.name === request.name) && i.active !== false
              );
              if (intern) {
                intern.status = 'On Leave';
                // Create new array reference to trigger change detection
                this.interns = [...this.interns];
              }

              // Mark as seen when approved
              this.seenLeaveRequestIds.add(requestId);
              this.saveSeenLeaveRequests();
              this.updateNewLeaveRequestsCount();

              // Force change detection
              this.cdr.markForCheck();
              this.cdr.detectChanges();
            });

            Swal.fire({
              icon: 'success',
              title: 'Approved!',
              text: `Leave request from ${request.name} has been approved.`,
              timer: 2000,
              showConfirmButton: false
            });
          },
          error: (error) => {
            Swal.fire({
              icon: 'error',
              title: 'Error',
              text: error.message || 'Failed to approve leave request'
            });
          }
        });
      }
    });
  }

  declineRequest(request: LeaveRequest): void {
    // Check for ID in multiple possible fields
    const requestId = request.id || (request as any).requestId;
    if (!requestId) {
      console.error('Leave request missing ID:', request);
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: 'Invalid leave request ID'
      });
      return;
    }

    Swal.fire({
      title: 'Decline Leave Request',
      input: 'textarea',
      inputLabel: 'Reason for declining:',
      inputPlaceholder: 'Type your reason here...',
      showCancelButton: true,
      confirmButtonText: 'Submit',
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#d33',
      cancelButtonColor: '#6c757d',
      inputValidator: (value: string) => {
        if (!value || !value.trim()) {
          return 'A reason is required to decline the request.';
        }
        return null;
      }
    }).then((result: SweetAlertResult) => {
      if (result.isConfirmed && result.value) {
        const reason = result.value as string;

        const requestIdToUse = request.id || (request as any).requestId;
        if (!requestIdToUse) {
          Swal.fire({
            icon: 'error',
            title: 'Error',
            text: 'Invalid leave request ID'
          });
          return;
        }

        this.leaveRequestService.rejectLeaveRequest(requestIdToUse, reason).subscribe({
          next: (updatedRequest) => {
            // Update local request
            const index = this.leaveRequests.findIndex(r =>
              (r.id === requestIdToUse) || ((r as any).requestId === requestIdToUse)
            );
            if (index !== -1) {
              this.leaveRequests[index] = {
                ...this.leaveRequests[index],
                id: updatedRequest.id || requestIdToUse,
                status: 'Declined',
                reason: reason // Store decline message in reason field
              };
            }

            // Update intern status back to 'Present' if they match (since leave was declined)
            const intern = this.interns.find(i =>
              (i.email === request.email || i.name === request.name) && i.active !== false
            );
            if (intern && intern.status === 'On Leave') {
              intern.status = 'Present';
              this.interns = [...this.interns];
            }

            // Mark as seen when declined
            const requestId = this.getRequestId(request);
            this.seenLeaveRequestIds.add(requestId);
            this.saveSeenLeaveRequests();
            this.updateNewLeaveRequestsCount();

            this.cdr.markForCheck();
            this.cdr.detectChanges();

            Swal.fire({
              icon: 'success',
              title: 'Declined!',
              text: `Leave request from ${request.name} has been declined.`,
              timer: 2000,
              showConfirmButton: false
            });
          },
          error: (error) => {
            Swal.fire({
              icon: 'error',
              title: 'Error',
              text: error.message || 'Failed to decline leave request'
            });
          }
        });
      }
    });
  }

  clearLeaveRequest(index: number) {
    const item = this.leaveRequests.splice(index, 1)[0];
    if (item) this.clearedLeaveRequests.push(item);
  }

  clearLeaveRequestByRequest(request: LeaveRequest) {
    const index = this.leaveRequests.findIndex(r => r.email === request.email && r.startDate === request.startDate);
    if (index !== -1) {
      const item = this.leaveRequests.splice(index, 1)[0];
      if (item) this.clearedLeaveRequests.push(item);
      // Reset to first page if current page becomes empty
      if (this.paginatedLeaveRequests.length === 0 && this.leaveCurrentPage > 1) {
        this.leaveCurrentPage = 1;
      }
    }
  }

  undoClear() {
    this.leaveRequests.push(...this.clearedLeaveRequests);
    this.clearedLeaveRequests = [];
  }

  resetLeaveFilters() {
    this.leaveFilterName = '';
    this.leaveFilterDepartment = '';
    this.leaveFilterField = '';
    this.filteredLeaveFields = [];
    this.leaveCurrentPage = 1;
  }

  getAttachmentUrl(filename: string): string {
    return `${API_BASE_URL}/leave/attachment/${filename}`;
  }

  downloadAttachment(filename: string): void {
    if (!filename) return;

    this.leaveRequestService.downloadAttachment(filename).subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.click();
        window.URL.revokeObjectURL(url);
      },
      error: (error) => {
        console.error('Error downloading attachment:', error);
        Swal.fire({
          icon: 'error',
          title: 'Download Failed',
          text: 'Could not download the attachment. Please try again.'
        });
      }
    });
  }

  // ===== New Leave Requests Alert System Methods =====

  // Generate unique ID for a leave request
  getRequestId(request: LeaveRequest): number {
    // Use existing id if available (preferred)
    if (request.id) {
      return request.id;
    }
    // Fallback to requestId if available
    if ((request as any).requestId) {
      return (request as any).requestId;
    }
    // Generate a simple hash from email, name, and startDate as last resort
    const str = `${request.email}_${request.name}_${request.startDate || ''}`;
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  // Load seen leave request IDs from localStorage
  loadSeenLeaveRequests(): void {
    const seenIds = this.storageService.getItem<number[]>('adminSeenLeaveRequests');
    if (seenIds) {
      this.seenLeaveRequestIds = new Set(seenIds);
    }
  }

  // Save seen leave request IDs to localStorage
  saveSeenLeaveRequests(): void {
    this.storageService.setItem('adminSeenLeaveRequests', Array.from(this.seenLeaveRequestIds));
  }

  // Update new leave requests count
  updateNewLeaveRequestsCount(): void {
    const pendingRequests = this.leaveRequests.filter(req => req.status === 'Pending');

    const newRequests = pendingRequests.filter(req => {
      const requestId = this.getRequestId(req);
      return !this.seenLeaveRequestIds.has(requestId);
    });

    this.newLeaveRequestsCount = newRequests.length;
  }

  // Check for new leave requests and show alert
  checkForNewLeaveRequests(forceShow: boolean = false): void {
    // Ensure leave requests are loaded
    if (!this.leaveRequests || this.leaveRequests.length === 0) {
      console.log('[Leave Alert] No leave requests loaded yet, skipping check');
      return;
    }

    console.log('[Leave Alert] Checking for new leave requests...');
    console.log('[Leave Alert] Total leave requests:', this.leaveRequests.length);

    // Update the count first
    this.updateNewLeaveRequestsCount();

    // Get pending leave requests
    const pendingRequests = this.leaveRequests.filter(req => {
      const isPending = req.status === 'Pending';
      console.log(`[Leave Alert] Request ${req.name}: status=${req.status}, isPending=${isPending}`);
      return isPending;
    });

    console.log('[Leave Alert] Pending requests:', pendingRequests.length);
    console.log('[Leave Alert] Seen request IDs:', Array.from(this.seenLeaveRequestIds));

    // Filter new requests (not seen before)
    const newRequests = pendingRequests.filter(req => {
      const requestId = this.getRequestId(req);
      const isNew = !this.seenLeaveRequestIds.has(requestId);
      console.log(`[Leave Alert] Request ${req.name} (ID: ${requestId}): ${isNew ? 'NEW' : 'SEEN'}`);
      return isNew;
    });

    console.log('[Leave Alert] New requests found:', newRequests.length);
    console.log('[Leave Alert] Alert shown this session:', this.alertShownThisSession);

    // Show alert if there are new requests
    // Always show if forced (on login/load), or if there are new requests that haven't been seen
    if (newRequests.length > 0) {
      // Show alert if forced (login/load) OR if not shown this session yet
      if (forceShow || !this.alertShownThisSession) {
        if (!forceShow) {
          // Only mark as shown if not forced (prevents multiple alerts for same requests)
          this.alertShownThisSession = true;
        }
        console.log('[Leave Alert] ✅ Showing alert for', newRequests.length, 'new request(s)');
        // Small delay to ensure UI is ready
        setTimeout(() => {
          this.showNewLeaveRequestAlert(newRequests);
        }, 1000);
      } else {
        console.log('[Leave Alert] ⚠️ Alert already shown this session, skipping');
      }
    } else {
      console.log('[Leave Alert] ℹ️ No new requests to show');
    }
  }

  // Show alert for new leave requests
  showNewLeaveRequestAlert(newRequests: LeaveRequest[]): void {
    const count = newRequests.length;
    const names = newRequests.slice(0, 3).map(req => req.name || 'Unknown').join(', ');
    const moreText = count > 3 ? ` and ${count - 3} more` : '';

    Swal.fire({
      title: 'New Leave Request' + (count > 1 ? 's' : '') + '!',
      html: `
        <div style="text-align: left;">
          <p><strong>You have ${count} new pending leave request${count > 1 ? 's' : ''}.</strong></p>
          <p style="margin: 10px 0;"><strong>From:</strong> ${names}${moreText}</p>
          <p style="margin-top: 15px; color: #666; font-size: 14px;">
            <i class="bi bi-info-circle"></i> Click "View Requests" to review and take action.
          </p>
        </div>
      `,
      icon: 'info',
      iconColor: '#1976d2',
      showCancelButton: true,
      confirmButtonText: 'View Requests',
      cancelButtonText: 'Later',
      confirmButtonColor: '#1976d2',
      cancelButtonColor: '#6c757d',
      allowOutsideClick: false,
      allowEscapeKey: true
    }).then((result: SweetAlertResult) => {
      if (result.isConfirmed) {
        // Navigate to leave status section
        this.showSection('Intern Leave status');
      }
      // Mark all new requests as seen (whether they clicked view or later)
      newRequests.forEach(req => {
        const requestId = this.getRequestId(req);
        this.seenLeaveRequestIds.add(requestId);
      });
      this.saveSeenLeaveRequests();
      // Update count after marking as seen
      this.updateNewLeaveRequestsCount();
    });
  }

  // Mark leave requests as seen when viewing the leave status section
  markLeaveRequestsAsSeen(): void {
    const pendingRequests = this.leaveRequests.filter(req => req.status === 'Pending');
    pendingRequests.forEach(req => {
      const requestId = this.getRequestId(req);
      this.seenLeaveRequestIds.add(requestId);
    });
    this.saveSeenLeaveRequests();
    this.updateNewLeaveRequestsCount();
  }

  // Test method to manually trigger alert check
  testLeaveAlert(): void {
    console.log('[Leave Alert] Manual test triggered');
    this.alertShownThisSession = false; // Reset to allow testing
    this.checkForNewLeaveRequests(true);
  }

  // Method to clear seen requests (for testing/manual reset)
  clearSeenLeaveRequests(): void {
    this.seenLeaveRequestIds.clear();
    this.saveSeenLeaveRequests();
    this.updateNewLeaveRequestsCount();
    console.log('[Leave Alert] Cleared all seen leave requests');
    Swal.fire({
      icon: 'success',
      title: 'Cleared',
      text: 'All seen leave requests have been cleared. Refresh to see alerts again.',
      timer: 2000,
      showConfirmButton: false
    });
  }



  // ===== Leave Requests Filters & Pagination =====
  leaveFilterName = '';
  leaveFilterDepartment = '';
  leaveFilterField = '';
  filteredLeaveFields: string[] = [];

  leaveCurrentPage = 1;
  leaveItemsPerPage = 25; // Number of rows per page

  // ===== Filtered Leave Requests Getter =====
  get filteredLeaveRequests(): LeaveRequest[] {
    return this.leaveRequests.filter((r) => {
      if (this.leaveFilterName && !r.name.toLowerCase().includes(this.leaveFilterName.toLowerCase())) return false;
      if (this.leaveFilterDepartment && r.department !== this.leaveFilterDepartment) return false;
      if (this.leaveFilterField && r.field !== this.leaveFilterField) return false;
      return true;
    });
  }

  // ===== Paginated Leave Requests Getter =====
  get paginatedLeaveRequests(): LeaveRequest[] {
    const start = (this.leaveCurrentPage - 1) * this.leaveItemsPerPage;
    return this.filteredLeaveRequests.slice(start, start + this.leaveItemsPerPage);
  }

  get totalLeavePages(): number {
    return Math.ceil(this.filteredLeaveRequests.length / this.leaveItemsPerPage) || 1;
  }

  // ===== Pagination Helpers =====
  prevLeavePage() {
    if (this.leaveCurrentPage > 1) this.leaveCurrentPage--;
  }

  nextLeavePage() {
    if (this.leaveCurrentPage < this.totalLeavePages) this.leaveCurrentPage++;
  }

  goToLeavePage(page: number) {
    if (page >= 1 && page <= this.totalLeavePages) {
      this.leaveCurrentPage = page;
    }
  }

  getLeavePageNumbers(): number[] {
    const total = this.totalLeavePages;
    const current = this.leaveCurrentPage;
    const pages: number[] = [];

    if (total <= 7) {
      for (let i = 1; i <= total; i++) {
        pages.push(i);
      }
    } else {
      if (current <= 3) {
        for (let i = 1; i <= 5; i++) pages.push(i);
        pages.push(-1);
        pages.push(total);
      } else if (current >= total - 2) {
        pages.push(1);
        pages.push(-1);
        for (let i = total - 4; i <= total; i++) pages.push(i);
      } else {
        pages.push(1);
        pages.push(-1);
        for (let i = current - 1; i <= current + 1; i++) pages.push(i);
        pages.push(-1);
        pages.push(total);
      }
    }
    return pages;
  }

  // ===== Update Fields for Field Dropdown =====
  updateLeaveFields() {
    this.filteredLeaveFields = this.leaveFilterDepartment ? this.fieldMap[this.leaveFilterDepartment] || [] : [];
    this.leaveFilterField = '';
    this.leaveCurrentPage = 1; // Reset to first page after filter
  }
  // ===== Attendance History =====
  logs: Array<{
    intern: string;
    image?: string;
    date: Date | string;
    location?: string;
    timeIn?: Date | null;
    timeOut?: Date | null;
    action?: string;
  }> = [
      {
        intern: 'Dzulani Monyayi',
        image: 'assets/signatures/dzulani.png',
        date: new Date('2025-10-01'),
        location: 'Lab A',
        timeIn: new Date('2025-10-01T08:05:00'),
        timeOut: new Date('2025-10-01T16:00:00'),
        action: 'Signed In'
      },
      {
        intern: 'Jane Doe',
        image: 'assets/signatures/jane.png',
        date: new Date('2025-10-02'),
        location: 'Office 3',
        timeIn: new Date('2025-10-02T08:10:00'),
        timeOut: new Date('2025-10-02T15:45:00'),
        action: 'Signed Out'
      }
    ];

  filteredLogs: any[] = [];
  historyFilterMonday: string = '';
  historyFilterFriday: string = '';
  historyFilterName: string = '';
  historyFilterDepartment: string = '';
  historyFilterField: string = '';
  historyFilterStatus: string = '';
  weekendSelected: boolean = false;

  // ===== Departments & Fields =====
  // Use getters to access department service data
  get departmentList(): string[] {
    return this.departmentService.departmentList;
  }

  // Get only the admin's assigned department
  get adminDepartment(): string | null {
    return this.admin?.Department || null;
  }

  // Get allowed departments (only admin's assigned department)
  get allowedDepartments(): string[] {
    if (this.adminDepartment) {
      return [this.adminDepartment];
    }
    return [];
  }

  get fieldMap(): { [dept: string]: string[] } {
    return this.departmentService.fieldMap;
  }

  // Track deactivated fields (field name -> active status)
  private deactivatedFields: Map<string, boolean> = new Map();

  // Get fields for admin's department only
  get adminDepartmentFields(): string[] {
    if (!this.adminDepartment) {
      console.log('No admin department set');
      return [];
    }
    // Find the department in the backend departments array
    const department = this.departments.find(dept => dept.name === this.adminDepartment);
    if (!department) {
      console.log('Department not found:', this.adminDepartment, 'Available departments:', this.departments.map(d => d.name));
      return [];
    }
    if (!department.fields || department.fields.length === 0) {
      console.log('No fields found for department:', this.adminDepartment, 'Department ID:', department.id, 'Fields array:', department.fields);
      return [];
    }
    // Return field names from the department's fields array
    // Fields can be objects with {fieldId, name, active} or just strings
    const fieldNames = department.fields.map((field: any) => {
      if (typeof field === 'string') return field;
      // If field is an object, extract the name
      const name = field.name || field.fieldName || '';
      return name;
    }).filter((name: string) => name && name.trim() !== ''); // Filter out any null/undefined/empty values

    console.log(`Admin department "${this.adminDepartment}" fields (${fieldNames.length}):`, fieldNames);
    return fieldNames;
  }

  // Check if a field is active (from backend data)
  isFieldActive(dept: string, fieldName: string): boolean {
    // First check backend data
    const department = this.departments.find(d => d.name === dept);
    if (department && department.fields) {
      const fieldObj = department.fields.find((f: any) => {
        const fName = typeof f === 'string' ? f : (f.name || f);
        return fName === fieldName;
      });
      if (fieldObj) {
        // If field object has active property, use it
        if (typeof fieldObj === 'object' && 'active' in fieldObj) {
          return (fieldObj as any).active !== false;
        }
      }
    }

    // Fallback to local map
    const key = `${dept}:${fieldName}`;
    return this.deactivatedFields.get(key) !== false; // Default to true if not in map
  }

  // Get fields for the selected department
  get selectedDepartmentFields(): string[] {
    if (!this.selectedDepartmentForField) return [];
    return this.fieldMap[this.selectedDepartmentForField] || [];
  }

  get fieldList(): string[] {
    return Object.values(this.fieldMap).flat();
  }
  filteredFieldsForHistory: string[] = [];
  filteredFieldsForReport: string[] = [];

  // Department Management Filters
  departmentSearch: string = '';
  departmentFieldFilter: string = '';

  get filteredDepartmentList(): string[] {
    // Return all departments for admin to select from
    return this.departmentList;
  }

  updateFilteredDepartments() {
    // This method is called on input change, filtering is handled by the getter
  }

  getTotalFields(): number {
    return this.departmentService.getTotalFields();
  }

  getAverageFieldsPerDepartment(): number {
    return this.departmentService.getAverageFieldsPerDepartment();
  }

  getDepartmentIndex(dept: string): number {
    return this.departmentList.indexOf(dept);
  }

  getDepartmentColor(index: number): string {
    const colors = [
      '#1e3a5f', // Blue
      '#198754', // Green
      '#ffc107', // Yellow
      '#dc3545', // Red
      '#6f42c1', // Purple
      '#0dcaf0', // Cyan
      '#fd7e14', // Orange
      '#20c997'  // Teal
    ];
    return colors[index % colors.length];
  }

  getDepartmentGradient(index: number): string {
    const gradients = [
      '#1e3a5f, #0a58ca', // Blue gradient
      '#198754, #146c43', // Green gradient
      '#ffc107, #ffca2c', // Yellow gradient
      '#dc3545, #bb2d3b', // Red gradient
      '#6f42c1, #5a32a3', // Purple gradient
      '#0dcaf0, #0aa2c0', // Cyan gradient
      '#fd7e14, #dc6502', // Orange gradient
      '#20c997, #198754'  // Teal gradient
    ];
    return gradients[index % gradients.length];
  }

  // ===== Filter Helpers =====
  updateHistoryFields() {
    if (this.historyFilterDepartment && this.fieldMap[this.historyFilterDepartment]) {
      this.filteredFieldsForHistory = this.fieldMap[this.historyFilterDepartment];
    } else {
      this.filteredFieldsForHistory = [];
    }
    this.historyFilterField = '';
  }

  updateReportFields() {
    if (this.reportDepartment && this.fieldMap[this.reportDepartment]) {
      this.filteredFieldsForReport = this.fieldMap[this.reportDepartment];
    } else {
      this.filteredFieldsForReport = [];
    }
    this.reportField = '';
  }

  // ===== Weekly Register =====
  getWeeklyRegister() {
    if (!this.historyFilterMonday || !this.historyFilterFriday) return [];

    const monday = new Date(this.historyFilterMonday);
    const friday = new Date(this.historyFilterFriday);

    if (monday.getDay() !== 1 || friday.getDay() !== 5) {
      this.weekendSelected = true;
      return [];
    }

    this.weekendSelected = false;
    const weekDates: Date[] = [];
    for (let d = new Date(monday); d <= friday; d.setDate(d.getDate() + 1)) {
      weekDates.push(new Date(d));
    }

    const result: any[] = [];

    for (const intern of this.interns) {
      if (
        this.historyFilterName &&
        !intern.name.toLowerCase().includes(this.historyFilterName.toLowerCase())
      ) continue;

      if (
        this.historyFilterDepartment &&
        intern.department !== this.historyFilterDepartment
      ) continue;

      if (
        this.historyFilterField &&
        intern.field !== this.historyFilterField
      ) continue;

      // Status filter logic
      if (this.historyFilterStatus) {
        if (this.historyFilterStatus === 'Inactive') {
          // Show only inactive interns
          if (intern.active !== false) continue;
        } else {
          // Show only active interns with matching status
          if (intern.active === false || intern.status !== this.historyFilterStatus) continue;
        }
      } else {
        // If no status filter, show only active interns by default
        if (intern.active === false) continue;
      }

      for (const date of weekDates) {
        const log = this.logs.find(
          (l) =>
            l.intern === intern.name &&
            new Date(l.date).toDateString() === date.toDateString()
        );

        result.push(
          log
            ? { ...log, intern: intern.name, date: new Date(date) }
            : {
              intern: intern.name,
              image: 'assets/signatures/placeholder.png',
              date: new Date(date),
              location: '-',
              timeIn: null,
              timeOut: null,
              action: 'Absent'
            }
        );
      }
    }

    this.filteredLogs = result;
    this.historyCurrentPage = 1; // reset pagination
    return result;
  }

  resetHistoryFilter() {
    this.historyFilterMonday = '';
    this.historyFilterFriday = '';
    this.historyFilterName = '';
    this.historyFilterDepartment = '';
    this.historyFilterField = '';
    this.historyFilterStatus = '';
    this.weekendSelected = false;
    this.filteredLogs = [];
    this.filteredFieldsForHistory = [];
    this.historyCurrentPage = 1;
  }

  // ===== Helper: Group weekly logs by intern for HTML table =====
  get internsForWeek() {
    const weekDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
    const grouped: { [name: string]: any } = {};

    for (const log of this.filteredLogs) {
      if (!grouped[log.intern]) {
        grouped[log.intern] = {
          name: log.intern,
          recordsByDay: {} as { [day: string]: any }
        };
      }

      const date = new Date(log.date);
      const dayName = weekDays[date.getDay() - 1]; // Monday=1
      if (dayName) grouped[log.intern].recordsByDay[dayName] = log;
    }

    for (const internName in grouped) {
      for (const day of weekDays) {
        if (!grouped[internName].recordsByDay[day]) {
          grouped[internName].recordsByDay[day] = {
            action: 'Absent',
            timeIn: null,
            timeOut: null
          };
        }
      }
    }

    return Object.values(grouped);
  }

  // ===== Pagination =====
  historyCurrentPage: number = 1;
  historyItemsPerPage: number = 10;

  get totalHistoryPages(): number {
    return Math.ceil(this.internsForWeek.length / this.historyItemsPerPage) || 1;
  }

  get paginatedInternsForWeek() {
    const start = (this.historyCurrentPage - 1) * this.historyItemsPerPage;
    return this.internsForWeek.slice(start, start + this.historyItemsPerPage);
  }

  prevHistoryPage() {
    if (this.historyCurrentPage > 1) this.historyCurrentPage--;
  }

  nextHistoryPage() {
    if (this.historyCurrentPage < this.totalHistoryPages) this.historyCurrentPage++;
  }

  goToHistoryPage(page: number) {
    if (page > 0 && page <= this.totalHistoryPages) {
      this.historyCurrentPage = page;
    }
  }

  getHistoryPageNumbers(): number[] {
    const total = this.totalHistoryPages;
    const current = this.historyCurrentPage;
    const pages: number[] = [];

    if (total <= 7) {
      // Show all pages if 7 or fewer
      for (let i = 1; i <= total; i++) {
        pages.push(i);
      }
    } else {
      // Show first page, last page, current page, and pages around current
      pages.push(1);

      if (current > 3) {
        pages.push(-1); // Ellipsis
      }

      const start = Math.max(2, current - 1);
      const end = Math.min(total - 1, current + 1);

      for (let i = start; i <= end; i++) {
        pages.push(i);
      }

      if (current < total - 2) {
        pages.push(-1); // Ellipsis
      }

      pages.push(total);
    }

    return pages;
  }

  // Quick week selection methods
  selectCurrentWeek() {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const diff = today.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1); // Adjust to Monday
    const monday = new Date(today.getFullYear(), today.getMonth(), diff);
    const friday = new Date(monday);
    friday.setDate(monday.getDate() + 4);

    this.historyFilterMonday = this.formatDateForInput(monday);
    this.historyFilterFriday = this.formatDateForInput(friday);
    this.onHistoryDateChange();
  }

  selectLastWeek() {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const diff = today.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1) - 7; // Last week's Monday
    const monday = new Date(today.getFullYear(), today.getMonth(), diff);
    const friday = new Date(monday);
    friday.setDate(monday.getDate() + 4);

    this.historyFilterMonday = this.formatDateForInput(monday);
    this.historyFilterFriday = this.formatDateForInput(friday);
    this.onHistoryDateChange();
  }

  selectPreviousWeek() {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const diff = today.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1) - 14; // 2 weeks ago Monday
    const monday = new Date(today.getFullYear(), today.getMonth(), diff);
    const friday = new Date(monday);
    friday.setDate(monday.getDate() + 4);

    this.historyFilterMonday = this.formatDateForInput(monday);
    this.historyFilterFriday = this.formatDateForInput(friday);
    this.onHistoryDateChange();
  }

  formatDateForInput(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  onHistoryDateChange() {
    this.historyCurrentPage = 1; // Reset to first page
    if (this.historyFilterMonday && this.historyFilterFriday) {
      this.filteredLogs = this.getWeeklyRegister();
    }
  }

  onHistoryFilterChange() {
    this.historyCurrentPage = 1; // Reset to first page
    if (this.historyFilterMonday && this.historyFilterFriday) {
      this.filteredLogs = this.getWeeklyRegister();
    }
  }

  // Statistics helpers for history section
  getTotalPresentDays(): number {
    let count = 0;
    for (const intern of this.internsForWeek) {
      for (const day of ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']) {
        if (intern.recordsByDay[day]?.action === 'Signed In') {
          count++;
        }
      }
    }
    return count;
  }

  getTotalLeaveDays(): number {
    let count = 0;
    for (const intern of this.internsForWeek) {
      for (const day of ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']) {
        if (intern.recordsByDay[day]?.action === 'On Leave') {
          count++;
        }
      }
    }
    return count;
  }

  getTotalAbsentDays(): number {
    let count = 0;
    for (const intern of this.internsForWeek) {
      for (const day of ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']) {
        if (intern.recordsByDay[day]?.action === 'Absent') {
          count++;
        }
      }
    }
    return count;
  }

  getDayDate(day: string): Date {
    if (!this.historyFilterMonday) return new Date();

    const monday = new Date(this.historyFilterMonday);
    const dayIndex = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].indexOf(day);
    const targetDate = new Date(monday);
    targetDate.setDate(monday.getDate() + dayIndex);
    return targetDate;
  }

  // ===== Reports =====
  reportInternName = '';
  reportDepartment = '';
  reportField = '';
  reportFilterStatus: string = '';
  reportFromDate: string = '';
  reportToDate: string = '';

  filteredReportData: AttendanceRecord[] = [];
  lastReportGenerated: Date | null = null;

  // Pagination for Reports Section
  reportCurrentPage: number = 1;
  reportItemsPerPage: number = 25;

  generateReport() {
    this.reportCurrentPage = 1; // Reset to first page when generating new report
    this.filteredReportData = this.overviewAttendance.filter((r) => {
      const matchesIntern = !this.reportInternName || r.name.toLowerCase().includes(this.reportInternName.toLowerCase());
      const matchesDept = !this.reportDepartment || r.department === this.reportDepartment;
      const matchesField = !this.reportField || r.field === this.reportField;

      // Get the intern to check status
      const intern = this.interns.find(i => i.name === r.name);
      let matchesStatus = true;
      if (this.reportFilterStatus) {
        if (this.reportFilterStatus === 'Inactive') {
          matchesStatus = intern ? intern.active === false : false;
        } else {
          matchesStatus = intern ? intern.status === this.reportFilterStatus && intern.active !== false : false;
        }
      }

      let matchesDate = true;
      if (this.reportFromDate && r.lastActive) {
        matchesDate = matchesDate && new Date(r.lastActive) >= new Date(this.reportFromDate);
      }
      if (this.reportToDate && r.lastActive) {
        matchesDate = matchesDate && new Date(r.lastActive) <= new Date(this.reportToDate);
      }

      return matchesIntern && matchesDept && matchesField && matchesStatus && matchesDate;
    });
    this.lastReportGenerated = new Date();
  }

  // Paginated report data
  get paginatedReportData(): AttendanceRecord[] {
    const start = (this.reportCurrentPage - 1) * this.reportItemsPerPage;
    return this.filteredReportData.slice(start, start + this.reportItemsPerPage);
  }

  get totalReportPages(): number {
    return Math.ceil(this.filteredReportData.length / this.reportItemsPerPage) || 1;
  }

  // Pagination helpers for Reports
  prevReportPage() {
    if (this.reportCurrentPage > 1) this.reportCurrentPage--;
  }

  nextReportPage() {
    if (this.reportCurrentPage < this.totalReportPages) this.reportCurrentPage++;
  }

  goToReportPage(page: number) {
    if (page > 0 && page <= this.totalReportPages) {
      this.reportCurrentPage = page;
    }
  }

  getReportPageNumbers(): number[] {
    const total = this.totalReportPages;
    const current = this.reportCurrentPage;
    const pages: number[] = [];

    if (total <= 7) {
      for (let i = 1; i <= total; i++) {
        pages.push(i);
      }
    } else {
      pages.push(1);
      if (current > 3) {
        pages.push(-1);
      }
      const start = Math.max(2, current - 1);
      const end = Math.min(total - 1, current + 1);
      for (let i = start; i <= end; i++) {
        pages.push(i);
      }
      if (current < total - 2) {
        pages.push(-1);
      }
      pages.push(total);
    }
    return pages;
  }

  // Signature Modal
  selectedSignature: string | null = null;

  viewSignature(signature: string): void {
    this.selectedSignature = signature;
  }

  closeSignatureModal(): void {
    this.selectedSignature = null;
  }

  // Report statistics helpers
  getAverageAttendance(): number {
    if (this.filteredReportData.length === 0) return 0;
    const total = this.filteredReportData.reduce((sum, record) => sum + record.attendanceRate, 0);
    return Math.round(total / this.filteredReportData.length);
  }

  getTotalPresent(): number {
    return this.filteredReportData.reduce((sum, record) => sum + record.present, 0);
  }

  getTotalAbsent(): number {
    return this.filteredReportData.reduce((sum, record) => sum + record.absent, 0);
  }

  resetReportFilter() {
    this.reportInternName = '';
    this.reportDepartment = '';
    this.reportField = '';
    this.reportFilterStatus = '';
    this.reportFromDate = '';
    this.reportToDate = '';
    this.filteredReportData = [];
    this.lastReportGenerated = null;
    this.filteredFieldsForReport = [];
    this.reportCurrentPage = 1;
  }


  downloadReportPDF() {
    const filters = {
      internName: this.reportInternName || undefined,
      department: this.reportDepartment || undefined,
      field: this.reportField || undefined,
      fromDate: this.reportFromDate || undefined,
      toDate: this.reportToDate || undefined
    };

    this.reportService.downloadPDF(filters);
  }

  downloadReportExcel() {
    const filters = {
      internName: this.reportInternName || undefined,
      department: this.reportDepartment || undefined,
      field: this.reportField || undefined,
      fromDate: this.reportFromDate || undefined,
      toDate: this.reportToDate || undefined
    };

    this.reportService.downloadExcel(filters);
  }

  // ===== Helpers =====
  /**
   * ✅ Open edit intern modal (Bootstrap modal like supervisor)
   */
  openEditInternModal(intern: Intern): void {
    this.editingIntern = intern;

    // Get current department's fields
    const departmentFields = this.fieldMap[intern.department] || [];

    // Find department ID
    const departmentId = intern.departmentId || this.getDepartmentId(intern.department);

    // Find supervisor ID
    const supervisor = this.supervisors.find(s => s.name === intern.supervisor);
    const supervisorId = supervisor?.id;

    this.editInternForm = {
      name: intern.name || '',
      email: intern.email || '',
      idNumber: intern.idNumber || undefined,
      startDate: intern.startDate || undefined,
      endDate: intern.endDate || undefined,
      supervisor: intern.supervisor || '',
      supervisorId: supervisorId || undefined,
      employer: intern.employer || undefined, // ✅ From backend database
      department: intern.department || '',
      departmentId: departmentId || undefined,
      field: intern.field || '',
      status: intern.status || 'Present' // ✅ From backend database
    };

    // ✅ Log to verify data is being loaded
    console.log('✅ Edit Intern Modal - Data loaded from backend:', {
      employer: this.editInternForm.employer,
      status: this.editInternForm.status,
      internData: {
        employer: intern.employer,
        status: intern.status
      }
    });

    this.showEditInternModal = true;
  }

  /**
   * ✅ Close edit intern modal
   */
  closeEditInternModal(): void {
    this.showEditInternModal = false;
    this.editingIntern = null;
    this.editInternForm = {
      name: '',
      email: '',
      idNumber: undefined,
      startDate: undefined,
      endDate: undefined,
      supervisor: '',
      supervisorId: undefined,
      employer: undefined,
      department: '',
      departmentId: undefined,
      field: '',
      status: 'Present'
    };
  }

  /**
   * ✅ Update intern details
   */
  updateInternField(): void {
    if (!this.editingIntern) {
      return;
    }

    // Validate form
    if (!this.editInternForm.field || !this.editInternForm.field.trim()) {
      Swal.fire({
        icon: 'warning',
        title: 'Validation Error',
        text: 'Please select a field for the intern.'
      });
      return;
    }

    if (!this.editInternForm.status) {
      Swal.fire({
        icon: 'warning',
        title: 'Validation Error',
        text: 'Please select a status for the intern.'
      });
      return;
    }

    this.loading = true;

    // Find supervisor ID from supervisor name
    const supervisor = this.supervisors.find(s => s.name === this.editInternForm.supervisor);
    const supervisorId = supervisor?.id || this.editInternForm.supervisorId;

    // Find department ID
    const departmentId = this.editInternForm.departmentId || this.getDepartmentId(this.editInternForm.department);

    if (!departmentId) {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: 'Department ID not found. Please refresh the page.'
      });
      this.loading = false;
      return;
    }

    const updateData: any = {
      field: this.editInternForm.field.trim(),
      status: this.editInternForm.status
    };

    if (supervisorId) {
      updateData.supervisorId = supervisorId;
    }

    if (!this.editingIntern.id) {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: 'Intern ID not found. Please refresh the page.'
      });
      this.loading = false;
      return;
    }

    this.internService.updateIntern(this.editingIntern.id, updateData).subscribe({
      next: (response: any) => {
        this.loading = false;

        // Update the intern in the local array
        const index = this.interns.findIndex(i => i.id === this.editingIntern?.id);
        if (index !== -1) {
          this.interns[index].field = this.editInternForm.field;
          this.interns[index].status = this.editInternForm.status;
          if (supervisorId) {
            this.interns[index].supervisorId = supervisorId;
            this.interns[index].supervisor = this.editInternForm.supervisor;
          }
        }

        Swal.fire({
          icon: 'success',
          title: 'Intern Updated!',
          text: 'Intern details have been updated successfully.',
          timer: 2000,
          showConfirmButton: false
        });

        this.closeEditInternModal();
        this.cdr.detectChanges();
      },
      error: (error) => {
        this.loading = false;
        console.error('Error updating intern:', error);

        const errorMessage = error.error?.error || error.error?.message || 'Failed to update intern. Please try again.';
        Swal.fire({
          icon: 'error',
          title: 'Update Failed',
          text: errorMessage
        });
      }
    });
  }

  /**
   * Legacy method - redirects to new modal
   */
  openEditModal(intern: Intern) {
    this.openEditInternModal(intern);
  }

  /**
   * Map frontend status to backend status
   */
  private mapStatusToBackend(status: string): string {
    if (status === 'Present') return 'PRESENT';
    if (status === 'Absent') return 'ABSENT';
    if (status === 'On Leave') return 'ON_LEAVE';
    return 'PRESENT';
  }

  deactivateIntern(intern: Intern) {
    const index = this.interns.findIndex(i => i.email === intern.email);
    if (index === -1) return;

    // Check if intern is already deactivated
    const isCurrentlyActive = intern.active !== false;

    Swal.fire({
      title: isCurrentlyActive ? 'Deactivate Intern?' : 'Activate Intern?',
      html: `
        <div class="text-start">
          <p class="mb-3">Are you sure you want to ${isCurrentlyActive ? 'deactivate' : 'activate'} <strong>${intern.name}</strong>?</p>
          <div class="alert alert-info mb-0">
            <i class="bi bi-info-circle me-2"></i>
            <strong>Note:</strong> ${isCurrentlyActive ? 'Deactivating' : 'Activating'} this intern will ${isCurrentlyActive ? 'mark them as inactive' : 'mark them as active'} in the system. Their historical information, attendance records, and leave requests will be preserved.
          </div>
        </div>
      `,
      icon: isCurrentlyActive ? 'warning' : 'question',
      showCancelButton: true,
      confirmButtonText: isCurrentlyActive ? 'Yes, Deactivate' : 'Yes, Activate',
      cancelButtonText: 'Cancel',
      confirmButtonColor: isCurrentlyActive ? '#ffc107' : '#28a745',
      cancelButtonColor: '#6c757d',
      reverseButtons: true
    }).then((result: SweetAlertResult) => {
      if (result.isConfirmed && intern.id) {
        // Call backend API to activate/deactivate
        const apiCall = isCurrentlyActive
          ? this.internService.deactivateIntern(intern.id)
          : this.internService.activateIntern(intern.id);

        apiCall.subscribe({
          next: (updatedInternResponse) => {
            // Update local intern object
            const updatedIntern: Intern = {
              id: updatedInternResponse.id,
              name: updatedInternResponse.name,
              email: updatedInternResponse.email,
              supervisor: updatedInternResponse.supervisorName || intern.supervisor,
              supervisorId: updatedInternResponse.supervisorId,
              employer: updatedInternResponse.employer,
              department: updatedInternResponse.departmentName,
              departmentId: updatedInternResponse.departmentId,
              field: updatedInternResponse.field || intern.field,
              status: this.mapStatus(updatedInternResponse.status),
              active: updatedInternResponse.active !== false,
              recordsByDay: intern.recordsByDay || {}
            };

            // Update in local array
            const newInternsArray = [...this.interns];
            const localIndex = newInternsArray.findIndex(i => i.id === intern.id);
            if (localIndex !== -1) {
              newInternsArray[localIndex] = updatedIntern;
              this.interns = newInternsArray;
            }

            // Reset to first page if current page becomes empty
            if (this.paginatedInterns.length === 0 && this.internCurrentPage > 1) {
              this.internCurrentPage = 1;
            }

            this.cdr.detectChanges();

            // Show success message
            Swal.fire({
              icon: 'success',
              title: isCurrentlyActive ? 'Deactivated!' : 'Activated!',
              text: `Intern "${intern.name}" has been ${isCurrentlyActive ? 'deactivated' : 'activated'} successfully.`,
              timer: 2000,
              showConfirmButton: false
            });
          },
          error: (error) => {
            console.error('Error activating/deactivating intern:', error);
            const errorMessage = error.error?.error || error.error?.message || error.message || 'Failed to update intern status. Please try again.';
            Swal.fire({
              icon: 'error',
              title: 'Update Failed',
              text: errorMessage
            });
          }
        });
      } else if (!intern.id) {
        Swal.fire({
          icon: 'error',
          title: 'Error',
          text: 'Intern ID not found. Please refresh the page.'
        });
      }
    });
  }

  // ===== SUPERVISORS SECTION =====
  supervisors: Supervisor[] = [];

  // Create supervisor form
  showCreateSupervisorForm: boolean = false;
  isCreatingSupervisor: boolean = false;
  showCreateSupervisorPassword: boolean = false;
  showCreateSupervisorConfirmPassword: boolean = false;
  supervisorForm: {
    name: string;
    surname: string;
    email: string;
    password: string;
    confirmPassword: string;
    departmentId?: number;
    field?: string;
  } = {
      name: '',
      surname: '',
      email: '',
      password: '',
      confirmPassword: '',
      departmentId: undefined,
      field: undefined
    };

  // Edit supervisor modal
  showEditSupervisorModal: boolean = false;
  editingSupervisor: Supervisor | null = null;
  showEditSupervisorPassword: boolean = false;
  showEditSupervisorConfirmPassword: boolean = false;
  editSupervisorForm: EditSupervisorForm = {
    name: '',
    surname: '',
    email: '',
    departmentId: undefined,
    field: undefined,
    password: undefined,
    confirmPassword: undefined
  };

  // Edit intern modal
  showEditInternModal: boolean = false;
  editingIntern: Intern | null = null;
  editInternForm: EditInternForm = {
    name: '',
    email: '',
    supervisor: '',
    supervisorId: undefined,
    employer: undefined,
    department: '',
    departmentId: undefined,
    field: '',
    status: 'Present'
  };
  loading: boolean = false;
  private lastEditSupervisorEmailValue: string = '';

  // Invite link card
  showInviteCard: boolean = false;
  newlyCreatedSupervisor: Supervisor | null = null;
  inviteLink: string = '';
  inviteMessage: string = '';
  supervisorPassword: string = ''; // Store password temporarily for the message

  // Expose Math for template
  Math = Math;

  // Filters
  supervisorSearch: string = '';
  supervisorFilterDepartment: string = '';
  supervisorFilterField: string = '';
  supervisorFilterStatus: string = '';
  filteredFieldsForSupervisors: string[] = [];

  // Filters for Recently Added Supervisors table
  recentSupervisorsSearch: string = '';
  recentSupervisorsFilterDepartment: string = '';
  recentSupervisorsFilterField: string = '';

  // Pagination
  supervisorCurrentPage: number = 1;
  supervisorItemsPerPage: number = 25;
  recentSupervisorsCurrentPage: number = 1;
  recentSupervisorsItemsPerPage: number = 25;

  // Derived + Helper data
  // Get supervisors who haven't logged in yet (recently added) - base list
  get supervisorsNotLoggedInBase(): Supervisor[] {
    return this.supervisors
      .filter(s => {
        // Filter supervisors who haven't logged in (lastLogin is null, undefined, or empty string)
        // A supervisor has logged in if lastLogin exists and is not null/undefined/empty
        const hasLoggedIn = s.lastLogin &&
          s.lastLogin !== null &&
          s.lastLogin !== undefined &&
          s.lastLogin !== '';
        // Only include supervisors who haven't logged in AND are active
        return !hasLoggedIn && s.active !== false;
      })
      .sort((a, b) => {
        // Sort by createdAt (most recent first) or by name if createdAt is not available
        if (a.createdAt && b.createdAt) {
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        }
        if (a.createdAt) return -1;
        if (b.createdAt) return 1;
        return a.name.localeCompare(b.name);
      });
  }

  // Get filtered supervisors who haven't logged in yet (with filters applied)
  get supervisorsNotLoggedIn(): Supervisor[] {
    return this.supervisorsNotLoggedInBase
      .filter(s => {
        // Filter by search (name or email)
        if (this.recentSupervisorsSearch) {
          const searchLower = this.recentSupervisorsSearch.toLowerCase();
          if (!s.name.toLowerCase().includes(searchLower) && !s.email.toLowerCase().includes(searchLower)) {
            return false;
          }
        }
        // Filter by department
        if (this.recentSupervisorsFilterDepartment && s.department !== this.recentSupervisorsFilterDepartment) {
          return false;
        }
        // Filter by field
        if (this.recentSupervisorsFilterField && s.field !== this.recentSupervisorsFilterField) {
          return false;
        }
        return true;
      });
  }

  get filteredSupervisors(): Supervisor[] {
    return this.supervisors
      .filter(s => {
        if (this.supervisorSearch) {
          const searchLower = this.supervisorSearch.toLowerCase();
          return s.name.toLowerCase().includes(searchLower) || s.email.toLowerCase().includes(searchLower);
        }
        return true;
      })
      .filter(s => !this.supervisorFilterDepartment || s.department === this.supervisorFilterDepartment)
      .filter(s => !this.supervisorFilterField || s.field === this.supervisorFilterField)
      .filter(s => {
        // Filter by status, but also handle inactive status
        if (this.supervisorFilterStatus) {
          if (this.supervisorFilterStatus === 'Inactive') {
            return s.active === false;
          } else {
            return s.status === this.supervisorFilterStatus && s.active !== false;
          }
        }
        return true;
      });
  }

  // Get count of active supervisors (excluding inactive)
  get activeSupervisorsCount(): number {
    return this.supervisors.filter(s => s.active !== false).length;
  }

  get paginatedSupervisors(): Supervisor[] {
    const start = (this.supervisorCurrentPage - 1) * this.supervisorItemsPerPage;
    return this.filteredSupervisors.slice(start, start + this.supervisorItemsPerPage);
  }

  get totalSupervisorPages(): number {
    return Math.ceil(this.filteredSupervisors.length / this.supervisorItemsPerPage) || 1;
  }

  /**
   * Get paginated recently added supervisors
   */
  get paginatedRecentSupervisors(): Supervisor[] {
    const start = (this.recentSupervisorsCurrentPage - 1) * this.recentSupervisorsItemsPerPage;
    return this.supervisorsNotLoggedIn.slice(start, start + this.recentSupervisorsItemsPerPage);
  }

  /**
   * Get total number of pages for recently added supervisors
   */
  get totalRecentSupervisorsPages(): number {
    return Math.ceil(this.supervisorsNotLoggedIn.length / this.recentSupervisorsItemsPerPage) || 1;
  }

  // Pagination helpers
  prevSupervisorPage() {
    if (this.supervisorCurrentPage > 1) this.supervisorCurrentPage--;
  }

  nextSupervisorPage() {
    if (this.supervisorCurrentPage < this.totalSupervisorPages) this.supervisorCurrentPage++;
  }

  goToSupervisorPage(page: number) {
    if (page >= 1 && page <= this.totalSupervisorPages) {
      this.supervisorCurrentPage = page;
    }
  }

  getSupervisorPageNumbers(): number[] {
    const total = this.totalSupervisorPages;
    const current = this.supervisorCurrentPage;
    const pages: number[] = [];

    if (total <= 7) {
      // Show all pages if 7 or less
      for (let i = 1; i <= total; i++) {
        pages.push(i);
      }
    } else {
      // Show first page, current page with neighbors, and last page
      if (current <= 3) {
        for (let i = 1; i <= 5; i++) pages.push(i);
        pages.push(-1); // Ellipsis
        pages.push(total);
      } else if (current >= total - 2) {
        pages.push(1);
        pages.push(-1); // Ellipsis
        for (let i = total - 4; i <= total; i++) pages.push(i);
      } else {
        pages.push(1);
        pages.push(-1); // Ellipsis
        for (let i = current - 1; i <= current + 1; i++) pages.push(i);
        pages.push(-1); // Ellipsis
        pages.push(total);
      }
    }
    return pages;
  }

  // Filter helpers
  updateFilteredSupervisors() {
    this.supervisorCurrentPage = 1;
    this.filteredFieldsForSupervisors = this.supervisorFilterDepartment ? this.fieldMap[this.supervisorFilterDepartment] || [] : [];
    this.supervisorFilterField = '';
  }

  /**
   * Get list of unique department names from recently added supervisors
   */
  get recentSupervisorsDepartmentList(): string[] {
    const departments = this.supervisorsNotLoggedInBase
      .map(s => s.department)
      .filter((value, index, self) => self.indexOf(value) === index && value)
      .sort();
    return departments;
  }

  /**
   * Get list of unique field names from recently added supervisors (filtered by selected department)
   */
  get recentSupervisorsFieldList(): string[] {
    let fields = this.supervisorsNotLoggedInBase
      .filter(s => !this.recentSupervisorsFilterDepartment || s.department === this.recentSupervisorsFilterDepartment)
      .map(s => s.field)
      .filter((value, index, self) => self.indexOf(value) === index && value)
      .sort();
    return fields;
  }

  resetSupervisorFilters() {
    this.supervisorSearch = '';
    this.supervisorFilterDepartment = '';
    this.supervisorFilterField = '';
    this.supervisorFilterStatus = '';
    this.filteredFieldsForSupervisors = [];
    this.supervisorCurrentPage = 1;
  }

  /**
   * Reset filters for Recently Added Supervisors table
   */
  resetRecentSupervisorsFilters() {
    this.recentSupervisorsSearch = '';
    this.recentSupervisorsFilterDepartment = '';
    this.recentSupervisorsFilterField = '';
    this.recentSupervisorsCurrentPage = 1;
  }

  // Pagination helpers for Recently Added Supervisors
  prevRecentSupervisorsPage(): void {
    if (this.recentSupervisorsCurrentPage > 1) this.recentSupervisorsCurrentPage--;
  }

  nextRecentSupervisorsPage(): void {
    if (this.recentSupervisorsCurrentPage < this.totalRecentSupervisorsPages) this.recentSupervisorsCurrentPage++;
  }

  goToRecentSupervisorsPage(page: number): void {
    if (page >= 1 && page <= this.totalRecentSupervisorsPages) {
      this.recentSupervisorsCurrentPage = page;
    }
  }

  getRecentSupervisorsPageNumbers(): number[] {
    const total = this.totalRecentSupervisorsPages;
    const current = this.recentSupervisorsCurrentPage;
    const pages: number[] = [];

    if (total <= 7) {
      // Show all pages if 7 or less
      for (let i = 1; i <= total; i++) {
        pages.push(i);
      }
    } else {
      // Show first page, current page with neighbors, and last page
      if (current <= 3) {
        for (let i = 1; i <= 5; i++) pages.push(i);
        pages.push(-1); // Ellipsis
        pages.push(total);
      } else if (current >= total - 2) {
        pages.push(1);
        pages.push(-1); // Ellipsis
        for (let i = total - 4; i <= total; i++) pages.push(i);
      } else {
        pages.push(1);
        pages.push(-1); // Ellipsis
        for (let i = current - 1; i <= current + 1; i++) pages.push(i);
        pages.push(-1); // Ellipsis
        pages.push(total);
      }
    }
    return pages;
  }

  // Actions
  /**
   * Open edit supervisor modal
   */
  openEditSupervisorModal(supervisor: Supervisor): void {
    this.editingSupervisor = supervisor;
    this.editSupervisorForm = {
      name: supervisor.name || '',
      surname: supervisor.surname || '',
      email: supervisor.email || '',
      departmentId: supervisor.departmentId || undefined,
      field: supervisor.field || undefined,
      password: '',
      confirmPassword: ''
    };
    this.showEditSupervisorPassword = false;
    this.showEditSupervisorConfirmPassword = false;
    this.lastEditSupervisorEmailValue = '';
    this.showEditSupervisorModal = true;
  }

  /**
   * Close edit supervisor modal
   */
  closeEditSupervisorModal(): void {
    this.showEditSupervisorModal = false;
    this.editingSupervisor = null;
    this.editSupervisorForm = {
      name: '',
      surname: '',
      email: '',
      departmentId: undefined,
      field: undefined,
      password: '',
      confirmPassword: ''
    };
    this.showEditSupervisorPassword = false;
    this.showEditSupervisorConfirmPassword = false;
    this.lastEditSupervisorEmailValue = '';
  }

  onEditSupervisorEmailKeyDown(event: KeyboardEvent): void {
    const input = event.target as HTMLInputElement;
    this.lastEditSupervisorEmailValue = input.value;
  }

  onEditSupervisorEmailInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const currentValue = this.editSupervisorForm.email || input.value;

    // Check if the value just changed to end with "@" (user just typed "@")
    // and doesn't already contain "@univen.ac.za"
    if (currentValue &&
      currentValue.endsWith('@') &&
      !currentValue.includes('@univen.ac.za') &&
      this.lastEditSupervisorEmailValue !== currentValue) {

      // Auto-complete to "@univen.ac.za"
      const newValue = currentValue + 'univen.ac.za';
      this.editSupervisorForm.email = newValue;

      // Select the auto-completed part so user can easily accept or replace it
      setTimeout(() => {
        const startPosition = currentValue.length; // Position after "@"
        const endPosition = newValue.length;
        input.setSelectionRange(startPosition, endPosition);
      }, 0);
    }

    this.lastEditSupervisorEmailValue = currentValue;
  }

  /**
   * ✅ Handle department change in edit supervisor modal
   * Clears the field when department changes and updates available fields
   */
  onEditSupervisorDepartmentChange(departmentId: number | undefined): void {
    // Clear the field when department changes
    this.editSupervisorForm.field = undefined;

    // Log for debugging
    console.log('✅ Edit Supervisor - Department changed:', {
      departmentId: departmentId,
      availableFields: this.getFieldsForDepartment(departmentId).length
    });

    // Trigger change detection to update field selector
    this.cdr.detectChanges();
  }

  /**
   * Update supervisor details (name, email, department, field)
   */
  updateSupervisorField(): void {
    if (!this.editingSupervisor) {
      return;
    }

    // Validate form
    if (!this.editSupervisorForm.name || !this.editSupervisorForm.name.trim()) {
      Swal.fire({
        icon: 'warning',
        title: 'Validation Error',
        text: 'Please enter a name for the supervisor.'
      });
      return;
    }

    if (!this.editSupervisorForm.email || !this.editSupervisorForm.email.trim()) {
      Swal.fire({
        icon: 'warning',
        title: 'Validation Error',
        text: 'Please enter an email address for the supervisor.'
      });
      return;
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(this.editSupervisorForm.email)) {
      Swal.fire({
        icon: 'warning',
        title: 'Invalid Email',
        text: 'Please enter a valid email address.'
      });
      return;
    }

    // ✅ Validate password if provided
    if (this.editSupervisorForm.password || this.editSupervisorForm.confirmPassword) {
      if (!this.editSupervisorForm.password || this.editSupervisorForm.password.trim().length === 0) {
        Swal.fire({
          icon: 'warning',
          title: 'Password Required',
          text: 'Please enter a new password or leave both fields blank to keep the current password.'
        });
        return;
      }

      if (this.editSupervisorForm.password.length < 6) {
        Swal.fire({
          icon: 'warning',
          title: 'Password Too Short',
          text: 'Password must be at least 6 characters long.'
        });
        return;
      }

      if (this.editSupervisorForm.password !== this.editSupervisorForm.confirmPassword) {
        Swal.fire({
          icon: 'error',
          title: 'Password Mismatch',
          text: 'Passwords do not match. Please try again.'
        });
        return;
      }
    }

    this.loading = true;
    const updateData: any = {
      name: this.editSupervisorForm.name.trim(),
      surname: this.editSupervisorForm.surname.trim(),
      email: this.editSupervisorForm.email.trim()
    };

    // Add departmentId if provided
    if (this.editSupervisorForm.departmentId !== undefined && this.editSupervisorForm.departmentId !== null) {
      updateData.departmentId = this.editSupervisorForm.departmentId;
    }

    // If field is undefined or null, send empty string
    if (this.editSupervisorForm.field === undefined || this.editSupervisorForm.field === null || this.editSupervisorForm.field === '') {
      updateData.field = '';
    } else {
      updateData.field = this.editSupervisorForm.field;
    }

    // ✅ Add password if provided
    if (this.editSupervisorForm.password && this.editSupervisorForm.password.trim().length > 0) {
      updateData.password = this.editSupervisorForm.password.trim();
    }

    if (!this.editingSupervisor.id) {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: 'Supervisor ID not found. Please refresh the page.'
      });
      this.loading = false;
      return;
    }

    this.supervisorService.updateSupervisor(this.editingSupervisor.id, updateData).subscribe({
      next: (response: any) => {
        this.loading = false;

        // Extract field name from response (handle both string and object formats)
        let fieldName = '';
        if (typeof response.field === 'string') {
          fieldName = response.field;
        } else if (response.field && typeof response.field === 'object') {
          fieldName = (response.field as any).name || '';
        } else {
          fieldName = this.editSupervisorForm.field || '';
        }

        // Extract department name
        let departmentName = '';
        if (typeof response.department === 'string') {
          departmentName = response.department;
        } else if (response.department && typeof response.department === 'object') {
          departmentName = (response.department as any).name || '';
        }

        // Map assigned interns
        let assignedInterns: string[] = [];
        if (response.interns && Array.isArray(response.interns)) {
          assignedInterns = response.interns.map((intern: any) => intern.name || intern.email || '').filter((name: string) => name);
        }

        // Update the supervisor in the local array
        const supervisorId = response.supervisorId || response.id || this.editingSupervisor!.id;
        const index = this.supervisors.findIndex(s => s.id === supervisorId);
        if (index !== -1) {
          this.supervisors[index] = {
            ...this.supervisors[index],
            id: supervisorId,
            name: response.name || this.editSupervisorForm.name,
            surname: response.surname || this.editSupervisorForm.surname,
            email: response.email || this.editSupervisorForm.email,
            field: fieldName,
            department: departmentName || this.supervisors[index].department,
            departmentId: response.departmentId || this.editSupervisorForm.departmentId || this.supervisors[index].departmentId,
            assignedInterns: assignedInterns.length > 0 ? assignedInterns : this.supervisors[index].assignedInterns
          };
        }

        // Reload supervisors to ensure we have the latest data
        this.loadSupervisors();

        Swal.fire({
          icon: 'success',
          title: 'Success!',
          text: `Supervisor details updated successfully for ${this.editSupervisorForm.name}.`,
          timer: 2000,
          showConfirmButton: false
        });

        this.closeEditSupervisorModal();
        this.cdr.detectChanges();
      },
      error: (error: any) => {
        console.error('Error updating supervisor:', error);
        this.loading = false;
        const errorMessage = error?.error?.message || error?.message || 'Failed to update supervisor. Please try again.';
        Swal.fire({
          icon: 'error',
          title: 'Error',
          text: errorMessage
        });
      }
    });
  }

  /**
   * Delete a supervisor
   */
  deleteSupervisor(supervisor: Supervisor): void {
    Swal.fire({
      title: 'Delete Supervisor?',
      html: `
        <div class="text-start">
          <p class="mb-3">Are you sure you want to delete <strong>${supervisor.name}</strong> (${supervisor.email})?</p>
          <div class="alert alert-danger mb-0">
            <i class="bi bi-exclamation-triangle me-2"></i>
            <strong>Warning:</strong> This action cannot be undone. Deleting this supervisor will permanently remove them from the system, including their user account and all associated data.
          </div>
        </div>
      `,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#6c757d',
      confirmButtonText: 'Yes, delete it!',
      cancelButtonText: 'Cancel'
    }).then((result: SweetAlertResult) => {
      if (result.isConfirmed) {
        this.loading = true;

        if (!supervisor.id) {
          Swal.fire({
            icon: 'error',
            title: 'Error',
            text: 'Supervisor ID not found. Please refresh the page.'
          });
          this.loading = false;
          return;
        }

        this.api.delete<any>(`supervisors/${supervisor.id}`).subscribe({
          next: (response) => {
            // Remove supervisor from the list
            const index = this.supervisors.findIndex(s => s.id === supervisor.id);
            if (index !== -1) {
              this.supervisors.splice(index, 1);
            }

            this.loading = false;
            Swal.fire({
              icon: 'success',
              title: 'Deleted!',
              text: `Supervisor "${supervisor.name}" has been deleted successfully.`,
              timer: 2000,
              showConfirmButton: false
            });
            this.cdr.detectChanges();
          },
          error: (error: any) => {
            console.error('Error deleting supervisor:', error);
            this.loading = false;
            const errorMessage = error?.error?.message || error?.message || 'Failed to delete supervisor. Please try again.';
            Swal.fire({
              icon: 'error',
              title: 'Error',
              text: errorMessage
            });
            this.cdr.detectChanges();
          }
        });
      }
    });
  }

  /**
   * Update supervisor signature
   */
  updateSupervisorSignature(supervisorId: number): void {
    Swal.fire({
      title: 'Update Signature',
      html: `
        <p class="mb-3">Upload or paste signature data for this supervisor.</p>
        <input type="file" id="signatureFile" accept="image/*" class="form-control mb-3">
        <textarea id="signatureData" class="form-control" rows="5" placeholder="Or paste base64 signature data here..."></textarea>
      `,
      showCancelButton: true,
      confirmButtonText: 'Update',
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#1e3a5f',
      cancelButtonColor: '#6c757d',
      preConfirm: () => {
        const fileInput = document.getElementById('signatureFile') as HTMLInputElement;
        const dataInput = document.getElementById('signatureData') as HTMLTextAreaElement;

        return new Promise((resolve) => {
          if (fileInput?.files && fileInput.files[0]) {
            const file = fileInput.files[0];
            const reader = new FileReader();
            reader.onload = (e) => {
              const result = e.target?.result as string;
              resolve({ signature: result });
            };
            reader.readAsDataURL(file);
          } else if (dataInput?.value) {
            resolve({ signature: dataInput.value });
          } else {
            Swal.showValidationMessage('Please provide a signature file or data');
            resolve(false);
          }
        });
      }
    }).then((result: SweetAlertResult) => {
      if (result.isConfirmed && result.value) {
        const signature = (result.value as any).signature;
        this.api.put<any>(`admins/supervisors/${supervisorId}/signature`, { signature }).subscribe({
          next: () => {
            Swal.fire({
              icon: 'success',
              title: 'Success!',
              text: 'Signature updated successfully.',
              timer: 2000,
              showConfirmButton: false
            });
            this.loadSupervisors();
          },
          error: (error: any) => {
            console.error('Error updating signature:', error);
            Swal.fire({
              icon: 'error',
              title: 'Error',
              text: 'Failed to update signature. Please try again.'
            });
          }
        });
      }
    });
  }

  deactivateSupervisor(supervisor: Supervisor) {
    const index = this.supervisors.findIndex(s => s.email === supervisor.email);
    if (index === -1) return;

    const isCurrentlyActive = supervisor.active !== false;

    Swal.fire({
      title: isCurrentlyActive ? 'Deactivate Supervisor?' : 'Activate Supervisor?',
      html: `
        <div class="text-start">
          <p class="mb-3">Are you sure you want to ${isCurrentlyActive ? 'deactivate' : 'activate'} <strong>${supervisor.name}</strong>?</p>
          ${supervisor.assignedInterns && supervisor.assignedInterns.length > 0 ? `
            <div class="alert alert-warning mb-3">
              <i class="bi bi-exclamation-triangle me-2"></i>
              <strong>Warning:</strong> This supervisor has <strong>${supervisor.assignedInterns.length}</strong> assigned intern(s). 
              ${isCurrentlyActive ? 'Deactivating' : 'Activating'} this supervisor ${isCurrentlyActive ? 'may' : 'will'} affect their assignments.
            </div>
          ` : ''}
          <div class="alert alert-info mb-0">
            <i class="bi bi-info-circle me-2"></i>
            <strong>Note:</strong> ${isCurrentlyActive ? 'Deactivating' : 'Activating'} this supervisor will ${isCurrentlyActive ? 'mark them as inactive' : 'mark them as active'} in the system. Their historical information will be preserved.
          </div>
        </div>
      `,
      icon: isCurrentlyActive ? 'warning' : 'question',
      showCancelButton: true,
      confirmButtonText: isCurrentlyActive ? 'Yes, Deactivate' : 'Yes, Activate',
      cancelButtonText: 'Cancel',
      confirmButtonColor: isCurrentlyActive ? '#ffc107' : '#28a745',
      cancelButtonColor: '#6c757d',
      reverseButtons: true
    }).then((result: SweetAlertResult) => {
      if (result.isConfirmed && supervisor.id) {
        // Show loading state
        Swal.fire({
          title: isCurrentlyActive ? 'Deactivating...' : 'Activating...',
          text: 'Please wait...',
          allowOutsideClick: false,
          didOpen: () => {
            Swal.showLoading();
          }
        });

        // Call backend API to activate/deactivate
        const apiCall = isCurrentlyActive
          ? this.supervisorService.deactivateSupervisor(supervisor.id)
          : this.supervisorService.activateSupervisor(supervisor.id);

        apiCall.subscribe({
          next: (response) => {
            // Reload supervisors from backend to get updated state
            this.loadSupervisors();

            // Handle intern reassignment if deactivating
            if (isCurrentlyActive && supervisor.assignedInterns && supervisor.assignedInterns.length > 0) {
              // Wait a bit for supervisors to reload, then check for replacement
              setTimeout(() => {
                const replacementSupervisor = this.supervisors.find(s =>
                  s.field === supervisor.field &&
                  s.status === 'Active' &&
                  s.email !== supervisor.email &&
                  s.active !== false
                );

                if (replacementSupervisor && supervisor.assignedInterns && supervisor.assignedInterns.length > 0) {
                  const assignedInterns = supervisor.assignedInterns; // Store in local variable for type narrowing
                  assignedInterns.forEach(internName => {
                    const intern = this.interns.find(i => i.name === internName);
                    if (intern) {
                      intern.supervisor = replacementSupervisor.name;
                    }
                  });
                  this.interns = [...this.interns];

                  Swal.fire({
                    icon: 'info',
                    title: 'Interns Reassigned',
                    text: `${assignedInterns.length} intern(s) have been reassigned to ${replacementSupervisor.name}.`,
                    timer: 3000,
                    showConfirmButton: false
                  });
                } else {
                  Swal.fire({
                    icon: 'warning',
                    title: 'No Replacement Found',
                    text: `No active supervisor found with field "${supervisor.field}". Interns will need to be manually reassigned.`,
                    timer: 3000,
                    showConfirmButton: false
                  });
                }
              }, 500);
            } else {
              Swal.fire({
                icon: 'success',
                title: isCurrentlyActive ? 'Deactivated!' : 'Activated!',
                text: `Supervisor "${supervisor.name}" has been ${isCurrentlyActive ? 'deactivated' : 'activated'} successfully.`,
                timer: 2000,
                showConfirmButton: false
              });
            }
          },
          error: (error) => {
            console.error('Error activating/deactivating supervisor:', error);
            Swal.fire({
              icon: 'error',
              title: 'Error',
              text: error.error?.error || `Failed to ${isCurrentlyActive ? 'deactivate' : 'activate'} supervisor. Please try again.`,
              confirmButtonText: 'OK'
            });
          }
        });
      }
    });
  }


  // ===== Locations Management =====
  locations: Location[] = [];
  isLoadingLocations: boolean = false;
  map: any = null;
  mapMarkers: any[] = [];
  selectedLocation: Location | null = null;
  isMapReady: boolean = false;
  selectedLat: number = -22.9756; // University of Venda coordinates
  selectedLng: number = 30.4414;
  currentLocation: { lat: number; lng: number } | null = null;
  userLocationMarker: any = null;

  initMap() {
    if (this.map) {
      return; // Map already initialized
    }

    const mapElement = document.getElementById('locations-map');
    if (!mapElement) {
      return;
    }

    // Check if Leaflet is loaded (wait a bit if script is still loading)
    const checkLeaflet = (attempts: number = 0) => {
      if (typeof L !== 'undefined') {
        this.initializeMapInstance(mapElement);
        return;
      }

      if (attempts < 10) {
        // Wait for Leaflet to load (check every 200ms for up to 2 seconds)
        setTimeout(() => checkLeaflet(attempts + 1), 200);
      } else {
        // Leaflet failed to load
        console.error('Leaflet library is not loaded. Please check your internet connection.');
        Swal.fire({
          icon: 'error',
          title: 'Map Library Not Available',
          html: `
            <div class="text-start">
              <p class="mb-3"><strong>Leaflet map library could not be loaded.</strong></p>
              <p class="mb-3">Please check your internet connection and try refreshing the page.</p>
              <div class="alert alert-info mb-0">
                <i class="bi bi-info-circle me-2"></i>
                <strong>Note:</strong> Leaflet uses OpenStreetMap which is free and doesn't require an API key.
              </div>
            </div>
          `,
          confirmButtonText: 'OK',
          confirmButtonColor: '#1e3a5f',
          width: '600px'
        });
      }
    };

    checkLeaflet();
  }

  initializeMapInstance(mapElement: HTMLElement) {
    if (this.map) {
      return; // Map already initialized
    }

    // Check if Leaflet is available
    if (typeof L === 'undefined') {
      return;
    }

    try {
      // Initialize Leaflet map centered on University of Venda
      this.map = L.map(mapElement).setView([-22.9756, 30.4414], 16);

      // Add OpenStreetMap tile layer
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '', // Remove attribution message
        maxZoom: 19
      }).addTo(this.map);

      // Add click listener to map
      this.map.on('click', (event: any) => {
        this.onMapClick(event);
      });

      this.isMapReady = true;
      this.loadLocationsOnMap();
    } catch (error) {
      console.error('Error initializing Leaflet map:', error);
      Swal.fire({
        icon: 'error',
        title: 'Map Initialization Failed',
        text: 'There was an error initializing the map. Please try refreshing the page.',
        confirmButtonText: 'OK',
        confirmButtonColor: '#1e3a5f'
      });
    }
  }

  onMapClick(event: any) {
    this.selectedLat = event.latlng.lat;
    this.selectedLng = event.latlng.lng;

    // Ensure interns are loaded
    if (this.interns.length === 0) {
      this.loadInterns();
    }

    // Show input dialog for location name with intern assignment option
    const internOptions = this.interns
      .filter(intern => intern.active !== false)
      .map(intern => `<option value="${intern.id}">${intern.name} (${intern.email})</option>`)
      .join('');

    Swal.fire({
      title: 'Add New Location',
      html: `
        <div class="text-start">
          <div class="mb-3">
            <label for="locationName" class="form-label fw-semibold">Location Name <span class="text-danger">*</span></label>
            <input type="text" id="locationName" class="form-control" placeholder="e.g., Building A, Library, etc." required>
          </div>
          <div class="mb-3">
            <label for="locationRadius" class="form-label fw-semibold">Radius (meters) <span class="text-danger">*</span></label>
            <input type="number" id="locationRadius" class="form-control" value="100" min="10" max="500" required>
            <small class="text-muted">Allowed radius for sign-in (10-500 meters)</small>
          </div>
          <div class="mb-3">
            <label for="locationDescription" class="form-label fw-semibold">Description</label>
            <textarea id="locationDescription" class="form-control" rows="2" placeholder="Optional description"></textarea>
          </div>
          <div class="mb-3">
            <label for="assignToIntern" class="form-label fw-semibold">
              <i class="bi bi-person-check me-1"></i>Assign to Intern (Optional)
            </label>
            <select id="assignToIntern" class="form-select">
              <option value="">No assignment (all interns can use this location)</option>
              ${internOptions}
            </select>
            <small class="text-muted">If selected, only this intern can sign in at this location</small>
          </div>
          <div class="alert alert-info mb-0">
            <i class="bi bi-info-circle me-2"></i>
            Coordinates: ${this.selectedLat.toFixed(6)}, ${this.selectedLng.toFixed(6)}
          </div>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: 'Add Location',
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#1e3a5f',
      cancelButtonColor: '#6c757d',
      focusConfirm: false,
      width: '600px',
      preConfirm: () => {
        const name = (document.getElementById('locationName') as HTMLInputElement)?.value;
        const radius = parseInt((document.getElementById('locationRadius') as HTMLInputElement)?.value || '100');
        const description = (document.getElementById('locationDescription') as HTMLTextAreaElement)?.value || '';
        const assignToIntern = (document.getElementById('assignToIntern') as HTMLSelectElement)?.value || '';

        if (!name || name.trim() === '') {
          Swal.showValidationMessage('Please enter a location name');
          return false;
        }

        if (isNaN(radius) || radius < 10 || radius > 500) {
          Swal.showValidationMessage('Radius must be between 10 and 500 meters');
          return false;
        }

        return {
          name: name.trim(),
          radius,
          description: description.trim(),
          assignToIntern: assignToIntern ? parseInt(assignToIntern) : null
        };
      }
    }).then((result: SweetAlertResult) => {
      if (result.isConfirmed && result.value) {
        this.addLocation(
          result.value.name,
          result.value.radius,
          result.value.description,
          result.value.assignToIntern
        );
      }
    });
  }

  addLocation(name: string, radius: number, description: string = '', assignToInternId: number | null = null) {
    // Create location via backend API
    const locationData = {
      name,
      latitude: this.selectedLat,
      longitude: this.selectedLng,
      radius,
      description: description || undefined
    };

    this.locationService.createLocation(locationData).subscribe({
      next: (savedLocation: Location) => {
        // Map backend response to frontend format
        const newLocation: Location = {
          id: savedLocation.locationId || savedLocation.id,
          locationId: savedLocation.locationId || savedLocation.id,
          name: savedLocation.name,
          latitude: savedLocation.latitude,
          longitude: savedLocation.longitude,
          radius: savedLocation.radius,
          description: savedLocation.description,
          active: savedLocation.active
        };

        this.locations.push(newLocation);
        this.loadLocationsOnMap();

        // If intern assignment is requested, assign the location to the intern
        if (assignToInternId) {
          const locationId = newLocation.locationId || newLocation.id;
          if (locationId !== undefined) {
            this.assignLocationToIntern(assignToInternId, locationId);
          }
        } else {
          Swal.fire({
            icon: 'success',
            title: 'Location Added!',
            text: `"${name}" has been added successfully and saved to database.`,
            timer: 2000,
            showConfirmButton: false
          });
        }

        this.cdr.detectChanges();
      },
      error: (error) => {
        console.error('Error creating location:', error);
        const errorMessage = error?.error?.message || error?.error?.error || error?.message || 'Failed to add location. Please try again.';
        Swal.fire({
          icon: 'error',
          title: 'Error',
          text: errorMessage
        });
      }
    });
  }

  /**
   * Assign location to intern
   */
  assignLocationToIntern(internId: number, locationId: number): void {
    this.internService.assignLocationToIntern(internId, locationId).subscribe({
      next: (response) => {
        const intern = this.interns.find(i => i.id === internId);
        const location = this.locations.find(l => (l.locationId || l.id) === locationId);

        Swal.fire({
          icon: 'success',
          title: 'Location Assigned!',
          html: `
            <p><strong>"${location?.name || 'Location'}"</strong> has been assigned to <strong>${intern?.name || 'Intern'}</strong>.</p>
            <p class="text-muted small mb-0">This intern can now only sign in at this location.</p>
          `,
          timer: 3000,
          showConfirmButton: false
        });

        console.log('✓ Location assigned to intern:', {
          internId,
          internName: intern?.name,
          locationId,
          locationName: location?.name
        });
      },
      error: (error) => {
        console.error('Error assigning location to intern:', error);
        const errorMessage = error?.error?.message || error?.error?.error || error?.message || 'Failed to assign location.';
        Swal.fire({
          icon: 'error',
          title: 'Assignment Failed',
          text: errorMessage
        });
      }
    });
  }

  getCurrentLocation() {
    if (!navigator.geolocation) {
      console.warn('Geolocation is not supported by this browser.');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        this.currentLocation = {
          lat: position.coords.latitude,
          lng: position.coords.longitude
        };
        // Update map if it's already initialized
        if (this.map && this.isMapReady) {
          this.loadLocationsOnMap();
        }
        this.cdr.detectChanges();
      },
      (error) => {
        console.error('Error getting location:', error);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }

  /**
   * Refresh the map - reload tiles and markers
   */
  refreshMap(): void {
    if (!this.map || !this.isMapReady || typeof L === 'undefined') {
      Swal.fire({
        icon: 'warning',
        title: 'Map Not Ready',
        text: 'Please wait for the map to finish loading before refreshing.',
        timer: 2000,
        showConfirmButton: false
      });
      return;
    }

    // Show loading indicator
    const refreshButton = document.querySelector('[title="Refresh Map"]') as HTMLButtonElement;
    if (refreshButton) {
      refreshButton.disabled = true;
      const originalHTML = refreshButton.innerHTML;
      refreshButton.innerHTML = '<i class="bi bi-arrow-clockwise me-1"></i>Refreshing...';

      // Reload map tiles by invalidating the current view
      this.map.invalidateSize();

      // Reload all markers
      this.loadLocationsOnMap();

      // Reset button after a short delay
      setTimeout(() => {
        refreshButton.disabled = false;
        refreshButton.innerHTML = originalHTML;
      }, 1000);
    } else {
      // Fallback if button not found
      this.map.invalidateSize();
      this.loadLocationsOnMap();
    }

    Swal.fire({
      icon: 'success',
      title: 'Map Refreshed!',
      text: 'The map has been refreshed successfully.',
      timer: 1500,
      showConfirmButton: false
    });
  }

  loadLocationsOnMap() {
    if (!this.map || !this.isMapReady || typeof L === 'undefined') {
      return;
    }

    // Clear existing markers and circles
    this.mapMarkers.forEach(marker => {
      if (marker) {
        // Remove marker from map
        if (this.map && marker.remove) {
          this.map.removeLayer(marker);
        }
        // Remove associated circle if it exists
        if ((marker as any).circle && (marker as any).circle.remove) {
          this.map.removeLayer((marker as any).circle);
        }
      }
    });
    this.mapMarkers = [];

    // Remove user location marker if exists
    if (this.userLocationMarker) {
      this.map.removeLayer(this.userLocationMarker);
      this.userLocationMarker = null;
    }

    // Add current location marker if available
    if (this.currentLocation) {
      const userIcon = L.divIcon({
        className: 'user-location-marker',
        html: `<div style="width: 20px; height: 20px; border-radius: 50%; background: #28a745; border: 3px solid white; box-shadow: 0 2px 5px rgba(0,0,0,0.3);"></div>`,
        iconSize: [20, 20],
        iconAnchor: [10, 10]
      });

      this.userLocationMarker = L.marker([this.currentLocation.lat, this.currentLocation.lng], {
        icon: userIcon,
        title: 'Your Current Location'
      }).addTo(this.map);

      // Add popup for current location
      this.userLocationMarker.bindPopup('<strong>Your Current Location</strong>');
    }

    // Add markers for each location
    this.locations.forEach(location => {
      // Create custom icon for marker
      const customIcon = L.divIcon({
        className: 'custom-marker',
        html: `<div class="leaflet-custom-marker-icon"></div>`,
        iconSize: [20, 20],
        iconAnchor: [10, 10]
      });

      // Create marker
      const marker = L.marker([location.latitude, location.longitude], {
        icon: customIcon,
        title: location.name
      }).addTo(this.map);

      // Create circle for radius
      const circle = L.circle([location.latitude, location.longitude], {
        radius: location.radius,
        fillColor: '#1e3a5f',
        fillOpacity: 0.2,
        color: '#1e3a5f',
        weight: 2,
        opacity: 0.5
      }).addTo(this.map);

      // Create popup content
      const popupContent = `
        <div class="p-2">
          <h6 class="fw-bold mb-1">${location.name}</h6>
          <p class="mb-1 small">${location.description || 'No description'}</p>
          <p class="mb-0 small text-muted">Radius: ${location.radius}m</p>
        </div>
      `;

      // Bind popup to marker
      marker.bindPopup(popupContent);

      // Store circle reference on marker for cleanup
      (marker as any).circle = circle;

      // Add click listener to marker
      marker.on('click', () => {
        marker.openPopup();
      });

      this.mapMarkers.push(marker);
    });

    // Fit map to show all locations and current location
    if (this.locations.length > 0 || this.currentLocation) {
      const boundsPoints: [number, number][] = [];

      // Add all location points
      this.locations.forEach(loc => {
        boundsPoints.push([loc.latitude, loc.longitude]);
      });

      // Add current location if available
      if (this.currentLocation) {
        boundsPoints.push([this.currentLocation.lat, this.currentLocation.lng]);
      }

      if (boundsPoints.length > 0) {
        const bounds = L.latLngBounds(boundsPoints);
        this.map.fitBounds(bounds, { padding: [20, 20] });
      }
    }
  }

  deleteLocation(location: Location) {
    Swal.fire({
      title: `Delete "${location.name}"?`,
      text: "This location will be removed permanently.",
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Delete',
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#dc3545',
      cancelButtonColor: '#6c757d'
    }).then((result: SweetAlertResult) => {
      if (result.isConfirmed && location.id) {
        const locationId = location.locationId || location.id;
        this.locationService.deleteLocation(locationId).subscribe({
          next: () => {
            this.locations = this.locations.filter(l => (l.locationId || l.id) !== locationId);
            this.loadLocationsOnMap();
            this.cdr.detectChanges();

            Swal.fire({
              icon: 'success',
              title: 'Deleted!',
              text: `"${location.name}" has been removed from database.`,
              timer: 2000,
              showConfirmButton: false
            });
          },
          error: (error) => {
            console.error('Error deleting location:', error);
            const errorMessage = error?.error?.message || error?.error?.error || error?.message || 'Failed to delete location. Please try again.';
            Swal.fire({
              icon: 'error',
              title: 'Error',
              text: errorMessage
            });
          }
        });
      }
    });
  }

  editLocation(location: Location) {
    // Ensure interns are loaded
    if (this.interns.length === 0) {
      this.loadInterns();
    }

    // Find which intern is currently assigned to this location (if any)
    // This would require loading intern data with location assignments
    // For now, we'll show all interns in the dropdown

    const internOptions = this.interns
      .filter(intern => intern.active !== false)
      .map(intern => `<option value="${intern.id}">${intern.name} (${intern.email})</option>`)
      .join('');

    Swal.fire({
      title: 'Edit Location',
      html: `
        <div class="text-start">
          <div class="mb-3">
            <label for="editLocationName" class="form-label fw-semibold">Location Name <span class="text-danger">*</span></label>
            <input type="text" id="editLocationName" class="form-control" value="${location.name}" required>
          </div>
          <div class="mb-3">
            <label for="editLocationRadius" class="form-label fw-semibold">Radius (meters) <span class="text-danger">*</span></label>
            <input type="number" id="editLocationRadius" class="form-control" value="${location.radius}" min="10" max="500" required>
            <small class="text-muted">Allowed radius for sign-in (10-500 meters)</small>
          </div>
          <div class="mb-3">
            <label for="editLocationDescription" class="form-label fw-semibold">Description</label>
            <textarea id="editLocationDescription" class="form-control" rows="2" placeholder="Optional description">${location.description || ''}</textarea>
          </div>
          <div class="mb-3">
            <label for="editAssignToIntern" class="form-label fw-semibold">
              <i class="bi bi-person-check me-1"></i>Assign to Intern (Optional)
            </label>
            <select id="editAssignToIntern" class="form-select">
              <option value="">No assignment (all interns can use this location)</option>
              ${internOptions}
            </select>
            <small class="text-muted">If selected, only this intern can sign in at this location</small>
          </div>
          <div class="alert alert-info mb-0">
            <i class="bi bi-info-circle me-2"></i>
            Coordinates: ${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}
          </div>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: 'Save Changes',
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#1e3a5f',
      cancelButtonColor: '#6c757d',
      focusConfirm: false,
      width: '600px',
      preConfirm: () => {
        const name = (document.getElementById('editLocationName') as HTMLInputElement)?.value;
        const radius = parseInt((document.getElementById('editLocationRadius') as HTMLInputElement)?.value || '100');
        const description = (document.getElementById('editLocationDescription') as HTMLTextAreaElement)?.value || '';
        const assignToIntern = (document.getElementById('editAssignToIntern') as HTMLSelectElement)?.value || '';

        if (!name || name.trim() === '') {
          Swal.showValidationMessage('Please enter a location name');
          return false;
        }

        if (isNaN(radius) || radius < 10 || radius > 500) {
          Swal.showValidationMessage('Radius must be between 10 and 500 meters');
          return false;
        }

        return {
          name: name.trim(),
          radius,
          description: description.trim(),
          assignToIntern: assignToIntern ? parseInt(assignToIntern) : null
        };
      }
    }).then((result: SweetAlertResult) => {
      if (result.isConfirmed && result.value && location.id) {
        const locationId = location.locationId || location.id;
        const updateData = {
          name: result.value.name,
          radius: result.value.radius,
          description: result.value.description
        };

        this.locationService.updateLocation(locationId, updateData).subscribe({
          next: (updatedLocation: Location) => {
            // Update location in local array
            const index = this.locations.findIndex(l => (l.locationId || l.id) === locationId);
            if (index !== -1) {
              this.locations[index] = {
                id: updatedLocation.locationId || updatedLocation.id,
                locationId: updatedLocation.locationId || updatedLocation.id,
                name: updatedLocation.name,
                latitude: updatedLocation.latitude,
                longitude: updatedLocation.longitude,
                radius: updatedLocation.radius,
                description: updatedLocation.description,
                active: updatedLocation.active
              };
            }

            this.loadLocationsOnMap();

            // If intern assignment is requested, assign the location to the intern
            if (result.value.assignToIntern) {
              this.assignLocationToIntern(result.value.assignToIntern, locationId);
            } else {
              Swal.fire({
                icon: 'success',
                title: 'Updated!',
                text: `"${updatedLocation.name}" has been updated in database.`,
                timer: 2000,
                showConfirmButton: false
              });
            }

            this.cdr.detectChanges();
          },
          error: (error) => {
            console.error('Error updating location:', error);
            const errorMessage = error?.error?.message || error?.error?.error || error?.message || 'Failed to update location. Please try again.';
            Swal.fire({
              icon: 'error',
              title: 'Error',
              text: errorMessage
            });
          }
        });
      }
    });
  }

  // ===== Constructor =====
  constructor(
    private authService: AuthService,
    private router: Router,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef,
    private ngZone: NgZone,
    private storageService: StorageService,
    private departmentService: DepartmentService,
    private departmentApiService: DepartmentApiService,
    private internService: InternService,
    private supervisorService: SupervisorService,
    private leaveRequestService: LeaveRequestService,
    private attendanceService: AttendanceService,
    private reportService: ReportService,
    private adminService: AdminService,
    private dataPreloadService: DataPreloadService,
    private locationService: LocationService,
    private api: ApiService,
    private sidebarService: SidebarService,
    private webSocketService: WebSocketService
  ) { }

  // Admin's department ID for filtering
  adminDepartmentId: number | undefined = undefined;

  /**
   * Subscribe to real-time updates via WebSocket
   */
  private subscribeToRealTimeUpdates(): void {
    console.log('🔌 Subscribing to real-time updates in Admin Dashboard...');

    // Subscribe to Leave Request updates
    this.subscriptions.add(
      this.dataPreloadService.getUpdateObservable('leaveRequests').subscribe(updatedRequests => {
        if (updatedRequests) {
          console.log('🔄 Real-time update: Leave Requests updated', updatedRequests.length);

          // Map backend format to frontend format if necessary
          // Note: dataPreloadService typically returns raw backend data, so we might need mapping
          // But usually the service handles caching. Here we just need to refresh our view.

          // Optimization: merging strategy or full replace? 
          // For simplicity and safety, we reload the mapped requests from cache or re-map

          // Check if we need to re-map. The cache usually stores raw backend objects.
          // Let's rely on loadLeaveRequests logic but use the pushed data if possible.
          // Actually, simplest is to just re-trigger loadLeaveRequests() which acts on cache if available,
          // OR manually map the new data.

          // Let's look at how loadLeaveRequests maps it:
          const mappedRequests = updatedRequests.map((req: any) => ({
            id: req.id,
            name: req.name,
            email: req.email,
            internId: req.internId,
            department: req.department,
            field: req.field,
            startDate: req.startDate,
            endDate: req.endDate,
            reason: req.reason,
            status: this.mapLeaveStatus(req.status),
            leaveType: req.leaveType,
            document: req.document
          }));

          // Filter by admin's department
          let finalRequests = mappedRequests;
          if (this.adminDepartment) {
            finalRequests = mappedRequests.filter((req: any) => req.department === this.adminDepartment);
          }

          this.leaveRequests = finalRequests;

          // Re-run filters to update the view
          // this.updateFilteredLeaveRequests(); // Removed: filteredLeaveRequests is a getter

          // Trigger Alerts
          this.checkForNewLeaveRequests();

          // Reload interns to update status (e.g. 'On Leave')
          this.loadInterns();

          this.cdr.detectChanges();
        }
      })
    );

    // Subscribe to Intern updates (e.g. status changes)
    this.subscriptions.add(
      this.dataPreloadService.getUpdateObservable('interns').subscribe(updatedInterns => {
        if (updatedInterns) {
          console.log('🔄 Real-time update: Interns updated', updatedInterns.length);
          // We can either reload execution or just assume interns are updated in cache
          // Let's re-run the filtering logic for interns

          // Note: Implementation of mapping/filtering typically exists in loadInterns
          // For now, let's just trigger a reload to ensures consistency
          this.loadInterns();
        }
      })
    );

    // Subscribe to Supervisor updates
    this.subscriptions.add(
      this.dataPreloadService.getUpdateObservable('supervisors').subscribe(updatedSupervisors => {
        if (updatedSupervisors) {
          console.log('🔄 Real-time update: Supervisors updated', updatedSupervisors.length);
          this.loadSupervisors();
        }
      })
    );

    // Subscribe to Department updates
    this.subscriptions.add(
      this.dataPreloadService.getUpdateObservable('departments').subscribe(updatedDepartments => {
        if (updatedDepartments) {
          console.log('🔄 Real-time update: Departments updated', updatedDepartments.length);
          this.departments = updatedDepartments;
          this.dataPreloadService.setCachedData('departments', updatedDepartments);
          this.cdr.detectChanges();
        }
      })
    );

    // Subscribe to Attendance updates
    this.subscriptions.add(
      this.dataPreloadService.getUpdateObservable('attendance').subscribe(updatedAttendance => {
        if (updatedAttendance) {
          console.log('🔄 Real-time update: Attendance updated');
          this.loadAttendance();
          // Reload interns to update status (e.g. 'Present', 'Absent')
          this.loadInterns();
        }
      })
    );

    // Subscribe to User updates
    this.subscriptions.add(
      this.dataPreloadService.getUpdateObservable('users').subscribe(updatedUsers => {
        if (updatedUsers && Array.isArray(updatedUsers)) {
          this.cdr.detectChanges();
          console.log('🔄 Real-time update: Users updated');
        }
      })
    );

    // Direct WebSocket subscriptions for immediate real-time updates
    this.subscriptions.add(
      this.webSocketService.leaveRequestUpdates$.subscribe(message => {
        console.log('📨 WebSocket leave request update:', message.type);
        this.loadLeaveRequests();
        this.checkForNewLeaveRequests();
      })
    );

    this.subscriptions.add(
      this.webSocketService.internUpdates$.subscribe(message => {
        console.log('📨 WebSocket intern update:', message.type);
        this.loadInterns();
      })
    );

    this.subscriptions.add(
      this.webSocketService.supervisorUpdates$.subscribe(message => {
        console.log('📨 WebSocket supervisor update:', message.type);
        this.loadSupervisors();
      })
    );

    this.subscriptions.add(
      this.webSocketService.departmentUpdates$.subscribe(message => {
        console.log('📨 WebSocket department update:', message.type);
        this.loadDepartments();
      })
    );

    this.subscriptions.add(
      this.webSocketService.attendanceUpdates$.subscribe(message => {
        console.log('📨 WebSocket attendance update:', message.type);
        this.loadAttendance();
        this.loadInterns();
      })
    );

  }

  ngOnInit(): void {
    // Check authentication
    if (!this.authService.isLoggedIn()) {
      this.router.navigate(['/login']);
      return;
    }

    // Subscribe to query params to handle section navigation
    this.subscriptions.add(
      this.route.queryParams.subscribe(params => {
        if (params['section']) {
          const section = params['section'];
          // Validate section
          const validSections: DashboardSection[] = ['overview', 'Manage Field', 'Supervisor', 'interns', 'Intern Leave status', 'Attendance history', 'reports', 'Locations'];
          if (validSections.includes(section)) {
            this.activeSection = section;
          }
        }
      })
    );

    // Subscribe to Real-Time Updates
    this.subscribeToRealTimeUpdates();

    // Subscribe to sidebar state
    this.subscriptions.add(
      this.sidebarService.isSidebarExpanded$.subscribe(expanded => {
        this.isSidebarExpanded = expanded;
        this.cdr.detectChanges();
      })
    );

    // ✅ Get current user from auth service (contains department selected by super admin)
    const currentUser = this.authService.getCurrentUserSync();

    // ✅ Debug: Log full currentUser to see what backend is returning
    console.log('🔍 DEBUG: Full currentUser from AuthService:', JSON.stringify(currentUser, null, 2));

    if (currentUser) {
      // ✅ Store admin's department ID from backend (selected by super admin when creating admin)
      // This department ID is used to filter data and connect fields to the correct department
      this.adminDepartmentId = currentUser.departmentId;

      // ✅ Get department from backend database (fetched from Admin entity via login response)
      // This department was selected by super admin when creating this admin
      let adminDepartmentFromBackend = currentUser.department || null;

      // ✅ FALLBACK: If department is missing, fetch from backend database
      if (!this.adminDepartmentId && !adminDepartmentFromBackend) {
        console.log('⚠️ Department missing from login response, fetching from backend database...');
        this.fetchAdminDepartmentFromDatabase();
      }

      // ✅ FALLBACK: If department name is missing but departmentId exists, try to get it from departments list
      if (!adminDepartmentFromBackend && this.adminDepartmentId && this.departments.length > 0) {
        const foundDept = this.departments.find(dept => dept.id === this.adminDepartmentId);
        if (foundDept) {
          adminDepartmentFromBackend = foundDept.name;
          console.log('✅ Found department name from departments list using departmentId:', {
            departmentId: this.adminDepartmentId,
            departmentName: adminDepartmentFromBackend
          });
        }
      }

      // ✅ If still no department, check if departments haven't loaded yet (will retry after load)
      if (!adminDepartmentFromBackend && this.adminDepartmentId) {
        console.warn('⚠️ Department name not found. Will retry after departments load. departmentId:', this.adminDepartmentId);
      }

      this.admin = {
        name: this.authService.getUserName(),
        email: this.authService.getUserEmail(),
        role: 'Administrator',
        Department: adminDepartmentFromBackend, // ✅ Fetched from backend database
        departmentId: this.adminDepartmentId, // ✅ Department ID for backend operations
        field: currentUser.field || null // ✅ Field from backend database
      };

      // Log department info for debugging
      console.log('✅ Admin profile loaded from backend:', {
        name: this.admin.name,
        email: this.admin.email,
        department: this.admin.Department, // ✅ From backend database
        departmentId: this.adminDepartmentId, // ✅ From backend database
        currentUserDepartment: currentUser.department,
        currentUserDepartmentId: currentUser.departmentId
      });

      // ✅ CRITICAL: Auto-select admin's department from backend (selected by super admin)
      // This ensures fields are always created in the admin's assigned department
      // The department comes from the super admin's selection when the admin was created
      if (this.admin && this.admin.Department) {
        this.selectedDepartmentForField = this.admin.Department;
        console.log('✅ Admin department set for field management:', {
          departmentName: this.admin.Department,
          departmentId: this.adminDepartmentId
        });
        // Trigger change detection to ensure dropdown updates
        setTimeout(() => {
          this.cdr.detectChanges();
        }, 0);
      } else {
        console.warn('⚠️ Admin has no department assigned. Fields cannot be created. Super admin must assign a department.');
      }
    }

    // Set current date
    const today = new Date();
    this.currentDate = today.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    // Check for query parameter to show specific section
    this.route.queryParams.subscribe(params => {
      if (params['section']) {
        const section = params['section'] as DashboardSection;
        if (this.sections.includes(section)) {
          this.showSection(section);
        }
      }
    });

    // Load locations from localStorage
    this.loadLocations();

    // Load seen leave requests from localStorage
    this.loadSeenLeaveRequests();

    // Try to load from cache first, then refresh in background
    this.loadFromCache();

    // Load all data from backend with a small delay to ensure token is stored
    // This prevents race conditions where API calls happen before token is saved
    setTimeout(() => {
      this.loadAllData();
      this.loadAttendance();

      // Check for new leave requests after a short delay
      setTimeout(() => {
        this.checkForNewLeaveRequests();
        // Subscribe to real-time updates
        this.subscribeToRealTimeUpdates();
      }, 1000);
    }, 100);

    // If Supervisor section is active on init, start auto-refresh
    if (this.activeSection === 'Supervisor') {
      this.startSupervisorAutoRefresh();
    }

    // Initialize clock
    this.updateClock();
    this.clockTimer = setInterval(() => this.updateClock(), 1000);
  }



  ngOnDestroy(): void {
    // Clean up auto-refresh interval when component is destroyed
    this.stopSupervisorAutoRefresh();

    // Clear intervals
    if (this.leaveRequestCheckInterval) {
      clearInterval(this.leaveRequestCheckInterval);
    }
    if (this.clockTimer) {
      clearInterval(this.clockTimer);
    }

    // Unsubscribe from all real-time updates
    this.subscriptions.unsubscribe();
  }

  private updateClock(): void {
    const now = new Date();
    this.currentTime = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    this.currentDate = now.toLocaleDateString([], {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
    this.cdr.detectChanges();

    // Disable loading screen after 1.5 seconds
    setTimeout(() => {
      this.isLoading = false;
      this.cdr.detectChanges();
    }, 1500);
  }

  /**
   * Start periodic checking for new leave requests
   */
  startPeriodicLeaveRequestCheck(): void {
    // Clear any existing interval
    if (this.leaveRequestCheckInterval) {
      clearInterval(this.leaveRequestCheckInterval);
    }

    // Check for new leave requests every 2 minutes
    this.leaveRequestCheckInterval = setInterval(() => {
      console.log('[Leave Alert] Periodic check for new leave requests...');
      // Reload leave requests first, then check for new ones
      this.loadLeaveRequests();
    }, 120000); // 2 minutes = 120000ms
  }

  /**
   * ✅ Fetch admin's department from backend database
   * This is a fallback if department is not in login response
   */
  fetchAdminDepartmentFromDatabase(): void {
    const adminEmail = this.authService.getUserEmail();
    if (!adminEmail) {
      console.error('❌ Cannot fetch department: Admin email not available');
      return;
    }

    console.log('🔄 Fetching admin department from backend database for:', adminEmail);

    // Option 1: Use auth/me endpoint to get current user with department
    this.authService.getCurrentUser().subscribe({
      next: (user) => {
        console.log('✅ Fetched user from backend:', user);
        if (user.departmentId || user.department) {
          this.adminDepartmentId = user.departmentId || this.adminDepartmentId;
          const departmentName = user.department || null;

          if (departmentName && this.admin) {
            this.admin.Department = departmentName;
            this.admin.departmentId = this.adminDepartmentId;
            console.log('✅ Department fetched from backend database:', {
              departmentId: this.adminDepartmentId,
              departmentName: departmentName
            });
            this.cdr.detectChanges();
          }
        } else {
          console.warn('⚠️ Backend /auth/me endpoint also does not return department');
        }
      },
      error: (error) => {
        console.error('❌ Error fetching user from backend:', error);
        // Try alternative: fetch from admins list
        this.fetchDepartmentFromAdminsList(adminEmail);
      }
    });
  }

  /**
   * ✅ Alternative: Fetch department from admins list
   * If auth/me doesn't work, try getting from super-admin/admins endpoint
   */
  fetchDepartmentFromAdminsList(adminEmail: string): void {
    console.log('🔄 Trying to fetch department from admins list...');
    this.api.get<any[]>('super-admin/admins').subscribe({
      next: (admins) => {
        const admin = admins.find(a => a.email === adminEmail);
        if (admin && (admin.departmentId || admin.departmentName)) {
          this.adminDepartmentId = admin.departmentId || this.adminDepartmentId;
          const departmentName = admin.departmentName || null;

          if (departmentName && this.admin) {
            this.admin.Department = departmentName;
            this.admin.departmentId = this.adminDepartmentId;
            console.log('✅ Department fetched from admins list:', {
              departmentId: this.adminDepartmentId,
              departmentName: departmentName
            });
            this.cdr.detectChanges();
          }
        } else {
          console.warn('⚠️ Admin not found in admins list or has no department');
        }
      },
      error: (error) => {
        console.error('❌ Error fetching from admins list:', error);
      }
    });
  }

  /**
   * Load data from cache
   */
  loadFromCache(): void {
    // Users
    const cachedUsers = this.dataPreloadService.getCachedData<any[]>('users');
    if (cachedUsers && cachedUsers.length > 0) {
      this.allUsers = cachedUsers;
      console.log(`✅ Loaded ${cachedUsers.length} users from cache`);
    }

    // Leave Requests
    const cachedLeaveRequests = this.dataPreloadService.getCachedData<any[]>('leaveRequests');
    if (cachedLeaveRequests && cachedLeaveRequests.length > 0) {
      this.leaveRequests = cachedLeaveRequests.map(req => ({
        id: req.id,
        name: req.name,
        email: req.email,
        internId: req.internId,
        department: req.department,
        field: req.field,
        startDate: req.startDate,
        endDate: req.endDate,
        reason: req.reason,
        status: this.mapLeaveStatus(req.status),
        leaveType: req.leaveType,
        document: req.document
      }));
      console.log(`✅ Loaded ${cachedLeaveRequests.length} leave requests from cache`);
      this.updateNewLeaveRequestsCount();
    }

    // Interns
    const cachedInterns = this.dataPreloadService.getCachedData<any[]>('interns');
    if (cachedInterns && cachedInterns.length > 0) {
      this.interns = cachedInterns.map(intern => ({
        id: intern.id,
        name: intern.name,
        email: intern.email,
        supervisor: intern.supervisorName || '',
        supervisorId: intern.supervisorId,
        employer: intern.employer,
        department: intern.departmentName,
        departmentId: intern.departmentId,
        field: intern.field || '',
        status: this.mapStatus(intern.status),
        active: intern.active !== false,
        recordsByDay: {}
      }));
      console.log(`✅ Loaded ${cachedInterns.length} interns from cache`);
    }

    // Supervisors
    const cachedSupervisors = this.dataPreloadService.getCachedData<any[]>('supervisors');
    if (cachedSupervisors && cachedSupervisors.length > 0) {
      this.supervisors = cachedSupervisors.map(s => ({
        id: s.id,
        name: s.name,
        surname: s.surname,
        email: s.email,
        department: s.department,
        departmentId: s.departmentId,
        field: s.field || '',
        assignedInterns: s.assignedInterns || [],
        status: s.status || 'Active',
        active: s.active !== false
      }));
      console.log(`✅ Loaded ${cachedSupervisors.length} supervisors from cache`);
    }

    // Departments
    const cachedDepartments = this.dataPreloadService.getCachedData<any[]>('departments');
    if (cachedDepartments && cachedDepartments.length > 0) {
      // Store departments (same as super-admin)
      this.departments = cachedDepartments;

      this.departmentIdMap.clear();
      cachedDepartments.forEach(dept => {
        this.departmentIdMap.set(dept.name, dept.id);
      });
      console.log(`✅ Loaded ${cachedDepartments.length} departments from cache`);
    }
  }

  /**
   * Load all data from backend
   */
  loadAllData(): void {
    this.loadUsers(); // Load users first (admin endpoint)
    this.loadInterns();
    this.loadSupervisors();
    this.loadLeaveRequests();
    this.loadDepartments();
    this.loadLocations(); // Load locations from backend
  }

  /**
   * Load all users from admin endpoint
   */
  loadUsers(): void {
    this.isLoadingUsers = true;
    this.usersLoadError = null;
    console.log('Loading all users from admin endpoint...');

    this.adminService.getAllUsers().subscribe({
      next: (users: AdminUser[]) => {
        this.isLoadingUsers = false;
        this.allUsers = users;
        // Update cache
        this.dataPreloadService.setCachedData('users', users);
        console.log('Users loaded successfully:', users.length, 'users found');

        if (users.length === 0) {
          console.warn('No users found in database');
          this.usersLoadError = 'No users found in database.';
        }

        this.cdr.detectChanges();
      },
      error: (error) => {
        this.isLoadingUsers = false;
        console.error('Error loading users:', error);
        const errorMessage = error?.message || 'Failed to load users';

        // Check if it's an authentication error
        if (errorMessage.includes('Unauthorized') || errorMessage.includes('401')) {
          this.usersLoadError = 'Authentication failed. The backend is rejecting your login token. Please check backend JWT configuration or try logging out and logging back in.';
          console.warn('Authentication error loading users - user may need to re-login');
        } else {
          this.usersLoadError = `Failed to load users: ${errorMessage}`;
          console.warn('Error loading users:', errorMessage);
        }
        this.cdr.detectChanges();
      }
    });
  }

  /**
   * Load interns from backend
   */
  loadInterns(): void {
    this.isLoadingInterns = true;
    this.internsLoadError = null;
    console.log('Loading interns from backend...');

    // Filter by admin's department if available
    // TODO: Once backend supports departmentId parameter, this will work
    // For now, backend may not support it, so we'll filter on frontend as fallback
    this.internService.getAllInterns(this.adminDepartmentId).subscribe({
      next: (interns: InternResponse[]) => {
        this.isLoadingInterns = false;
        console.log('Interns loaded successfully:', interns.length, 'interns found');

        if (interns.length === 0) {
          console.warn('No interns found in database');
          this.internsLoadError = 'No interns found in database. Please add interns to get started.';
        }

        let mappedInterns = interns.map(intern => ({
          id: intern.id,
          name: intern.name,
          email: intern.email,
          idNumber: intern.idNumber,
          startDate: intern.startDate,
          endDate: intern.endDate,
          supervisor: intern.supervisorName || '',
          supervisorId: intern.supervisorId,
          employer: intern.employer,
          department: intern.departmentName,
          departmentId: intern.departmentId,
          field: intern.field || '',
          status: this.mapStatus(intern.status),
          active: intern.active !== false,
          recordsByDay: {}
        }));

        // Additional frontend filtering by department if backend doesn't filter
        if (this.adminDepartment) {
          mappedInterns = mappedInterns.filter(intern => intern.department === this.adminDepartment);
        }

        this.interns = mappedInterns;

        // After loading interns, load their signatures
        this.loadInternSignatures();

        // Update cache
        this.dataPreloadService.setCachedData('interns', mappedInterns);
        this.cdr.detectChanges();
      },
      error: (error) => {
        this.isLoadingInterns = false;
        console.error('Error loading interns:', error);
        const errorMessage = error?.message || 'Failed to load interns';

        // Check if it's an authentication error
        if (errorMessage.includes('Unauthorized') || errorMessage.includes('401')) {
          this.internsLoadError = 'Authentication failed. The backend is rejecting your login token. Please check backend JWT configuration or try logging out and logging back in.';
          console.warn('Authentication error loading interns - data may not load correctly');
          console.warn('This is likely a backend authentication configuration issue');
          console.warn('You can try clicking the Refresh button or manually logout/login if needed');
        } else {
          this.internsLoadError = `Failed to load interns: ${errorMessage}`;
          // Only show popup for non-authentication errors
          Swal.fire({
            icon: 'error',
            title: 'Error Loading Interns',
            text: errorMessage,
            showCancelButton: true,
            cancelButtonText: 'Retry',
            confirmButtonText: 'OK'
          }).then((result) => {
            if (result.dismiss === Swal.DismissReason.cancel) {
              setTimeout(() => this.loadInterns(), 1000);
            }
          });
        }
        this.cdr.detectChanges();
      }
    });
  }

  /**
   * Load signatures for all interns
   */
  loadInternSignatures(): void {
    const internsWithId = this.interns.filter(i => i.id);
    if (internsWithId.length === 0) return;

    this.internSignatures = {};

    const signatureObservables = internsWithId.map(intern =>
      this.api.get<any>(`interns/${intern.id}/signature`).pipe(
        map(response => ({ id: intern.id, signature: response.signature })),
        catchError(() => of({ id: intern.id, signature: undefined }))
      )
    );

    forkJoin(signatureObservables).subscribe({
      next: (results) => {
        results.forEach(res => {
          if (res.id && res.signature) {
            this.internSignatures[res.id] = res.signature;
            // Also update the intern object in the array for other views
            const intern = this.interns.find(i => i.id === res.id);
            if (intern) {
              intern.signature = res.signature;
            }
          }
        });
        // ✅ Regenerate report to include signatures
        this.generateReport();
        this.cdr.detectChanges();
      }
    });
  }

  /**
   * Load supervisors from backend
   */
  // Departments from backend (same as super-admin)
  departments: Department[] = [];

  // Get active departments for dropdown (same as super-admin)
  get activeDepartments(): Department[] {
    // For admins, only return their assigned department
    if (this.adminDepartmentId) {
      return this.departments.filter(dept => dept.id === this.adminDepartmentId && dept.active !== false);
    } else if (this.adminDepartment) {
      return this.departments.filter(dept => dept.name === this.adminDepartment && dept.active !== false);
    }
    return this.departments.filter(dept => dept.active !== false);
  }

  // Helper method to get department name by ID
  getDepartmentNameById(departmentId: number): string {
    const department = this.departments.find(d => d.id === departmentId);
    return department?.name || '';
  }

  // Get fields for a specific department (from backend department object)
  getFieldsForDepartment(departmentId?: number): string[] {
    if (!departmentId) {
      console.log('getFieldsForDepartment: No departmentId provided');
      return [];
    }
    const department = this.departments.find(dept => dept.id === departmentId);
    if (!department) {
      console.log('getFieldsForDepartment: Department not found for ID:', departmentId);
      return [];
    }
    if (!department.fields || department.fields.length === 0) {
      console.log('getFieldsForDepartment: No fields found for department ID:', departmentId, 'Department:', department.name, 'Fields:', department.fields);
      return [];
    }
    // Return field names from the department's fields array
    // Fields can be objects with {fieldId, name, active} or just strings
    const fieldNames = department.fields.map((field: any) => {
      if (typeof field === 'string') return field;
      // If field is an object, extract the name
      return field.name || field;
    }).filter((name: string) => name); // Filter out any null/undefined values

    console.log('getFieldsForDepartment: Fields for department ID', departmentId, ':', fieldNames);
    return fieldNames;
  }

  // Open create supervisor form
  openCreateSupervisorForm(): void {
    // Ensure departments are loaded (same as super-admin)
    if (this.departments.length === 0) {
      this.loadDepartments();
    }

    // Set the admin's department automatically
    const adminDept = this.departments.find(d => d.name === this.adminDepartment);
    const adminDeptId = adminDept?.id;

    this.supervisorForm = {
      name: '',
      surname: '',
      email: '',
      password: '',
      confirmPassword: '',
      departmentId: adminDeptId,
      field: undefined
    };
    this.lastSupervisorEmailValue = '';
    this.showCreateSupervisorForm = true;
  }

  // Close create supervisor form
  closeCreateSupervisorForm(): void {
    this.showCreateSupervisorForm = false;
    this.showCreateSupervisorPassword = false;
    this.showCreateSupervisorConfirmPassword = false;
    this.supervisorForm = {
      name: '',
      surname: '',
      email: '',
      password: '',
      confirmPassword: '',
      departmentId: undefined,
      field: undefined
    };
    this.lastSupervisorEmailValue = '';
  }

  private lastSupervisorEmailValue: string = '';

  onSupervisorEmailKeyDown(event: KeyboardEvent): void {
    const input = event.target as HTMLInputElement;
    this.lastSupervisorEmailValue = input.value;
  }

  onSupervisorEmailInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const currentValue = this.supervisorForm.email || input.value;

    // Check if the value just changed to end with "@" (user just typed "@")
    // and doesn't already contain "@univen.ac.za"
    if (currentValue &&
      currentValue.endsWith('@') &&
      !currentValue.includes('@univen.ac.za') &&
      this.lastSupervisorEmailValue !== currentValue) {

      // Auto-complete to "@univen.ac.za"
      const newValue = currentValue + 'univen.ac.za';
      this.supervisorForm.email = newValue;

      // Select the auto-completed part so user can easily accept or replace it
      setTimeout(() => {
        const startPosition = currentValue.length; // Position after "@"
        const endPosition = newValue.length;
        input.setSelectionRange(startPosition, endPosition);
      }, 0);
    }

    this.lastSupervisorEmailValue = currentValue;
  }

  // Get available fields for supervisor form (reactive)
  get availableSupervisorFields(): string[] {
    return this.getFieldsForDepartment(this.supervisorForm.departmentId);
  }

  // Handle department change for supervisor form
  onSupervisorDepartmentChange(departmentId: number | undefined): void {
    // Reset field when department changes
    this.supervisorForm.field = undefined;
    // Trigger change detection to update field dropdown
    setTimeout(() => {
      this.cdr.detectChanges();
    }, 0);
  }

  // Create supervisor
  createSupervisor(): void {
    // Validate form
    if (!this.supervisorForm.name || !this.supervisorForm.surname || !this.supervisorForm.email || !this.supervisorForm.password || !this.supervisorForm.departmentId) {
      Swal.fire({
        icon: 'warning',
        title: 'Validation Error',
        text: 'Please fill in all required fields.'
      });
      return;
    }

    if (this.supervisorForm.password.length < 6) {
      Swal.fire({
        icon: 'warning',
        title: 'Password Too Short',
        text: 'Password must be at least 6 characters long.'
      });
      return;
    }

    if (this.supervisorForm.password !== this.supervisorForm.confirmPassword) {
      Swal.fire({
        icon: 'error',
        title: 'Password Mismatch',
        text: 'Passwords do not match. Please try again.'
      });
      return;
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(this.supervisorForm.email)) {
      Swal.fire({
        icon: 'warning',
        title: 'Invalid Email',
        text: 'Please enter a valid email address.'
      });
      return;
    }

    this.isCreatingSupervisor = true;
    const supervisorData: any = {
      name: this.supervisorForm.name,
      surname: this.supervisorForm.surname,
      email: this.supervisorForm.email,
      password: this.supervisorForm.password,
      departmentId: this.supervisorForm.departmentId
    };

    if (this.supervisorForm.field) {
      supervisorData.field = this.supervisorForm.field;
    }

    this.supervisorService.createSupervisor(supervisorData).subscribe({
      next: (response) => {
        // Extract department and field names from response (handle both string and object formats)
        let departmentName = '';
        if (typeof response.department === 'string') {
          departmentName = response.department;
        } else if (response.department && typeof response.department === 'object') {
          departmentName = (response.department as any).name || (response.department as any).departmentName || '';
        } else {
          departmentName = this.adminDepartment || '';
        }

        let fieldName = '';
        if (typeof response.field === 'string') {
          fieldName = response.field;
        } else if (response.field && typeof response.field === 'object') {
          fieldName = (response.field as any).name || '';
        } else {
          fieldName = this.supervisorForm.field || '';
        }

        // Store the newly created supervisor
        this.newlyCreatedSupervisor = {
          id: response.id,
          name: response.name || this.supervisorForm.name,
          surname: (response as any).surname || this.supervisorForm.surname,
          email: response.email || this.supervisorForm.email,
          department: departmentName,
          departmentId: response.departmentId || this.supervisorForm.departmentId,
          field: fieldName,
          assignedInterns: response.assignedInterns || [],
          status: response.status || 'Active',
          active: response.active !== false
        };

        // Store password temporarily for the invite message
        this.supervisorPassword = this.supervisorForm.password;

        // Generate invite link
        this.generateInviteLink();

        // Generate default friendly message
        this.generateDefaultMessage();

        // Show success message
        Swal.fire({
          icon: 'success',
          title: 'Success!',
          text: `Supervisor "${this.supervisorForm.name}" has been created successfully.`,
          timer: 2000,
          showConfirmButton: false
        });

        // Close form and show invite card
        this.closeCreateSupervisorForm();
        this.showInviteCard = true;
        this.loadSupervisors();
        this.isCreatingSupervisor = false;
      },
      error: (error) => {
        this.isCreatingSupervisor = false;
        console.error('Error creating supervisor:', error);
        const errorMessage = error?.error?.message || error?.message || 'Failed to create supervisor. Please try again.';
        Swal.fire({
          icon: 'error',
          title: 'Error',
          text: errorMessage
        });
      }
    });
  }

  // Generate invite link
  generateInviteLink(): void {
    const baseUrl = window.location.origin;
    // Use email from supervisorForm or newlyCreatedSupervisor
    const email = this.supervisorForm.email || this.newlyCreatedSupervisor?.email || '';
    // Generate a simple token or use email as identifier
    const token = btoa(email + ':' + Date.now());
    this.inviteLink = `${baseUrl}/login?invite=${token}&email=${encodeURIComponent(email)}`;
  }

  // Generate default friendly message template
  generateDefaultMessage(): void {
    const supervisorName = this.newlyCreatedSupervisor?.name || 'Supervisor';
    const supervisorEmail = this.newlyCreatedSupervisor?.email || '';
    const hasPassword = !!this.supervisorPassword;

    if (hasPassword) {
      // Message for newly created supervisor (with password)
      this.inviteMessage = `Hello ${supervisorName},

Welcome to the Intern Register System! Your supervisor account has been created successfully.

Your login credentials are:
Email: ${supervisorEmail}
Password: ${this.supervisorPassword}

Please use the link below to log in and access your supervisor dashboard:
${this.inviteLink}

After logging in, we recommend that you change your password for security purposes.

If you have any questions or need assistance, please don't hesitate to contact us.

Best regards,
Admin`;
    } else {
      // Message for resending to existing supervisor (without password)
      this.inviteMessage = `Hello ${supervisorName},

This is a reminder of your login credentials for the Intern Register System.

Your login email is: ${supervisorEmail}

Please use the link below to log in and access your supervisor dashboard:
${this.inviteLink}

If you have forgotten your password, please contact the administrator to reset it.

If you have any questions or need assistance, please don't hesitate to contact us.

Best regards,
Admin`;
    }
  }

  // Resend invite email for existing supervisor
  resendInviteEmail(supervisor: Supervisor): void {
    // Set the supervisor as the newly created supervisor (for the invite card)
    this.newlyCreatedSupervisor = {
      id: supervisor.id,
      name: supervisor.name,
      surname: supervisor.surname,
      email: supervisor.email,
      department: supervisor.department,
      departmentId: supervisor.departmentId,
      field: supervisor.field || '',
      assignedInterns: supervisor.assignedInterns || [],
      status: supervisor.status || 'Active',
      active: supervisor.active !== false
    };

    // Clear password since we don't have it for existing supervisors
    this.supervisorPassword = '';

    // Generate invite link
    this.generateInviteLink();

    // Generate default friendly message (without password)
    this.generateDefaultMessage();

    // Show the invite card
    this.showInviteCard = true;

    // Scroll to the invite card
    setTimeout(() => {
      const inviteCard = document.querySelector('.border-success');
      if (inviteCard) {
        inviteCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 100);
  }

  // Copy invite link to clipboard
  copyInviteLink(): void {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(this.inviteLink).then(() => {
        Swal.fire({
          icon: 'success',
          title: 'Copied!',
          text: 'Invite link has been copied to clipboard.',
          timer: 2000,
          showConfirmButton: false
        });
      }).catch(() => {
        this.fallbackCopyInviteLink();
      });
    } else {
      this.fallbackCopyInviteLink();
    }
  }

  // Fallback copy method
  fallbackCopyInviteLink(): void {
    const textArea = document.createElement('textarea');
    textArea.value = this.inviteLink;
    document.body.appendChild(textArea);
    textArea.select();
    try {
      document.execCommand('copy');
      Swal.fire({
        icon: 'success',
        title: 'Copied!',
        text: 'Invite link has been copied to clipboard.',
        timer: 2000,
        showConfirmButton: false
      });
    } catch (err) {
      Swal.fire({
        icon: 'error',
        title: 'Copy Failed',
        text: 'Please manually copy the link.'
      });
    }
    document.body.removeChild(textArea);
  }

  // Send invite email
  sendInviteEmail(): void {
    if (!this.newlyCreatedSupervisor) return;

    if (!this.inviteMessage.trim()) {
      Swal.fire({
        icon: 'warning',
        title: 'Message Required',
        text: 'Please enter a message before sending the email.',
        timer: 2000,
        showConfirmButton: false
      });
      return;
    }

    this.isCreatingSupervisor = true;

    const inviteData: any = {
      supervisorId: this.newlyCreatedSupervisor.id,
      email: this.newlyCreatedSupervisor.email,
      name: this.newlyCreatedSupervisor.name,
      inviteLink: this.inviteLink,
      message: this.inviteMessage
    };

    // Include password only if it exists (for newly created supervisors)
    if (this.supervisorPassword) {
      inviteData.password = this.supervisorPassword;
    }

    this.supervisorService.sendSupervisorInvite(inviteData).subscribe({
      next: (response) => {
        Swal.fire({
          icon: 'success',
          title: 'Email Sent!',
          text: `Invitation email has been sent successfully to ${this.newlyCreatedSupervisor?.email}`,
          timer: 3000,
          showConfirmButton: false
        });
        this.isCreatingSupervisor = false;
      },
      error: (error) => {
        console.error('Error sending invite email:', error);
        const errorMessage = error?.error?.message || error?.message || 'Failed to send invitation email. Please try again.';
        Swal.fire({
          icon: 'error',
          title: 'Error',
          text: errorMessage,
          timer: 3000,
          showConfirmButton: false
        });
        this.isCreatingSupervisor = false;
      }
    });
  }

  // Close invite card
  closeInviteCard(): void {
    this.showInviteCard = false;
    this.newlyCreatedSupervisor = null;
    this.inviteLink = '';
    this.inviteMessage = '';
    this.supervisorPassword = '';
  }

  loadSupervisors(): void {
    this.isLoadingSupervisors = true;
    this.supervisorsLoadError = null;
    console.log('Loading supervisors from backend...');

    // Filter by admin's department if available
    this.supervisorService.getAllSupervisors(this.adminDepartmentId).subscribe({
      next: (supervisors) => {
        this.isLoadingSupervisors = false;
        console.log('Supervisors loaded successfully:', supervisors.length, 'supervisors found');

        if (supervisors.length === 0) {
          console.warn('No supervisors found in database');
          this.supervisorsLoadError = 'No supervisors found in database. Please add supervisors to get started.';
        }

        let mappedSupervisors = supervisors.map((s: any) => {
          // Map supervisorId to id (backend uses supervisorId, frontend uses id)
          const supervisorId = s.supervisorId || s.id;

          // Extract department name - handle both string and object formats
          let departmentName = '';
          let departmentId: number | undefined;

          if (typeof s.department === 'string') {
            departmentName = s.department;
          } else if (s.department && typeof s.department === 'object') {
            departmentName = (s.department as any).name || (s.department as any).departmentName || '';
            departmentId = (s.department as any).departmentId || (s.department as any).id || s.departmentId;
          } else {
            departmentId = s.departmentId;
            departmentName = departmentId ? this.getDepartmentNameById(departmentId) : '';
          }

          // Extract field name - handle both string and object formats
          let fieldName = '';
          if (typeof s.field === 'string') {
            fieldName = s.field;
          } else if (s.field && typeof s.field === 'object') {
            fieldName = (s.field as any).name || '';
          }

          // Map assigned interns
          let assignedInterns: string[] = [];
          if (s.interns && Array.isArray(s.interns)) {
            assignedInterns = s.interns.map((intern: any) => intern.name || intern.email || '').filter((name: string) => name);
          } else if (s.assignedInterns && Array.isArray(s.assignedInterns)) {
            assignedInterns = s.assignedInterns;
          }

          return {
            id: supervisorId,
            name: s.name || '',
            surname: s.surname || '',
            email: s.email || '',
            department: departmentName,
            departmentId: departmentId,
            field: fieldName || '',
            assignedInterns: assignedInterns,
            status: s.status || 'Active',
            active: s.active !== false,
            createdAt: s.createdAt || s.created_at || null,
            lastLogin: s.lastLogin || s.last_login || s.lastLoginDate || null,
            hasSignature: s.hasSignature || false
          };
        });

        // Additional frontend filtering by department if backend doesn't filter
        if (this.adminDepartment) {
          mappedSupervisors = mappedSupervisors.filter(s => s.department === this.adminDepartment);
        }

        this.supervisors = mappedSupervisors;
        // Update cache
        this.dataPreloadService.setCachedData('supervisors', mappedSupervisors);
        this.cdr.detectChanges();
      },
      error: (error) => {
        this.isLoadingSupervisors = false;
        console.error('Error loading supervisors:', error);
        const errorMessage = error?.message || 'Failed to load supervisors';

        // Check if it's an authentication error
        if (errorMessage.includes('Unauthorized') || errorMessage.includes('401')) {
          this.supervisorsLoadError = 'Authentication failed. The backend is rejecting your login token. Please check backend JWT configuration or try logging out and logging back in.';
          console.warn('Authentication error loading supervisors - user may need to re-login');
        } else {
          this.supervisorsLoadError = `Failed to load supervisors: ${errorMessage}`;
          console.warn('Error loading supervisors:', errorMessage);
        }
        this.cdr.detectChanges();
      }
    });
  }

  /**
   * Load leave requests from backend
   */
  loadLeaveRequests(): void {
    // TODO: Once backend supports departmentId parameter, uncomment the line below
    // For now, we'll load all leave requests and filter on the frontend
    // this.leaveRequestService.getAllLeaveRequests(undefined, this.adminDepartmentId).subscribe({
    this.leaveRequestService.getAllLeaveRequests().subscribe({
      next: (requests) => {
        console.log('Loaded leave requests from backend:', requests);

        // Map leave requests
        let mappedRequests = requests.map(req => ({
          id: req.id, // Include ID for approve/decline operations
          name: req.name,
          email: req.email,
          internId: req.internId,
          department: req.department,
          field: req.field,
          startDate: req.startDate,
          endDate: req.endDate,
          reason: req.reason, // Backend returns reason (intern's reason or decline message)
          status: this.mapLeaveStatus(req.status),
          leaveType: req.leaveType,
          document: req.document
        }));

        // Filter by admin's department on the frontend
        // This ensures admins only see leave requests from their department
        if (this.adminDepartment) {
          mappedRequests = mappedRequests.filter(req => req.department === this.adminDepartment);
          console.log(`Filtered leave requests by department "${this.adminDepartment}":`, mappedRequests.length, 'requests');
        }

        this.leaveRequests = mappedRequests;
        // Update cache
        this.dataPreloadService.setCachedData('leaveRequests', mappedRequests);
        console.log('Mapped leave requests:', this.leaveRequests);
        this.updateNewLeaveRequestsCount();

        // Check for new leave requests after loading - reset session flag to allow alerts on login
        console.log('[Leave Alert] Leave requests loaded, checking for new alerts...');
        // Reset alert shown flag when leave requests are loaded (allows alerts on page refresh/login)
        this.alertShownThisSession = false;
        setTimeout(() => {
          this.checkForNewLeaveRequests(true); // Force show on load
        }, 1000);

        this.cdr.detectChanges();
      },
      error: (error) => {
        console.error('❌ Error loading leave requests:', error);
        const errorMessage = error?.message || 'Failed to load leave requests';
        const statusCode = error?.status || error?.error?.status || 0;

        // ✅ Handle different error types gracefully
        if (statusCode === 401 || errorMessage.includes('Unauthorized')) {
          console.warn('⚠️ Authentication error - user may need to re-login');
          this.leaveRequests = [];
        } else if (statusCode === 500 || errorMessage.includes('500') || errorMessage.includes('Server error')) {
          console.warn('⚠️ Backend returned 500 error for leave requests endpoint');
          console.warn('⚠️ This may indicate the backend endpoint has an issue or is not fully implemented');
          console.warn('⚠️ Setting leave requests to empty array - admin can still use other features');

          // ✅ Set empty array instead of retrying (to avoid infinite loop)
          this.leaveRequests = [];
          this.dataPreloadService.setCachedData('leaveRequests', []);
          this.updateNewLeaveRequestsCount();
          this.cdr.detectChanges();
        } else {
          console.warn('Error loading leave requests:', errorMessage);
          this.leaveRequests = [];
          this.cdr.detectChanges();
        }
      }
    });
  }

  // Department ID mapping for backend operations
  private departmentIdMap: Map<string, number> = new Map();

  /**
   * Load attendance records from backend
   */
  loadAttendance(): void {
    this.attendanceService.getAllAttendance().subscribe({
      next: (records) => {
        console.log('Loaded attendance records from backend:', records.length);
        // Process attendance records for display
        // This can be used for attendance history section
        this.cdr.detectChanges();
      },
      error: (error) => {
        console.error('Error loading attendance:', error);
        const errorMessage = error?.message || 'Failed to load attendance records';

        if (errorMessage.includes('Unauthorized') || errorMessage.includes('401')) {
          console.warn('Authentication error loading attendance - user may need to re-login');
        } else {
          console.warn('Error loading attendance:', errorMessage);
        }
      }
    });
  }

  /**
   * Load departments from backend
   */
  loadDepartments(): void {
    this.departmentApiService.getAllDepartments().subscribe({
      next: (departments) => {
        // Filter to only show admin's department if admin has a department assigned
        if (this.adminDepartmentId) {
          const adminDept = departments.find(dept => dept.id === this.adminDepartmentId);
          if (adminDept) {
            this.departments = [adminDept];
            console.log('Admin department loaded:', adminDept.name, 'ID:', adminDept.id);

            // ✅ FALLBACK: If admin.Department is missing, set it from the loaded department
            if (this.admin && !this.admin.Department && adminDept.name) {
              this.admin.Department = adminDept.name;
              console.log('✅ Set admin.Department from loaded department:', adminDept.name);
              this.cdr.detectChanges();
            }
          } else {
            // If admin's department not found, still filter by name as fallback
            const adminDeptByName = departments.find(dept => dept.name === this.adminDepartment);
            this.departments = adminDeptByName ? [adminDeptByName] : [];
            console.warn('Admin department ID not found, using name match:', this.adminDepartment);

            // ✅ FALLBACK: Try to set department name if we found it by name
            if (adminDeptByName && this.admin && !this.admin.Department) {
              this.admin.Department = adminDeptByName.name;
              console.log('✅ Set admin.Department from name match:', adminDeptByName.name);
              this.cdr.detectChanges();
            }
          }
        } else {
          // If no department ID, filter by department name
          if (this.adminDepartment) {
            const adminDept = departments.find(dept => dept.name === this.adminDepartment);
            this.departments = adminDept ? [adminDept] : [];
            console.log('Admin department loaded by name:', this.adminDepartment);

            // ✅ FALLBACK: Set department name if found
            if (adminDept && this.admin && !this.admin.Department) {
              this.admin.Department = adminDept.name;
              console.log('✅ Set admin.Department from name match:', adminDept.name);
              this.cdr.detectChanges();
            }
          } else {
            // No department assigned - show empty
            this.departments = [];
            console.warn('⚠️ Admin has no department assigned');
            console.warn('⚠️ Admin department ID:', this.adminDepartmentId);
            console.warn('⚠️ Admin department name:', this.adminDepartment);
            console.warn('⚠️ This admin needs to be assigned a department by the super admin');

            // ✅ Show user-friendly warning
            Swal.fire({
              icon: 'warning',
              title: 'No Department Assigned',
              html: `
                <p>This admin account does not have a department assigned.</p>
                <p><strong>Impact:</strong></p>
                <ul class="text-start">
                  <li>Cannot manage fields</li>
                  <li>Cannot filter interns/supervisors by department</li>
                  <li>May see all data instead of department-specific data</li>
                </ul>
                <p><strong>Solution:</strong> Ask the super admin to assign a department to this admin account.</p>
              `,
              confirmButtonText: 'OK',
              timer: 10000
            });
          }
        }

        // Debug: Log departments and their fields
        console.log('✅ Loaded departments for admin:', this.departments.length);
        this.departments.forEach(dept => {
          const fieldCount = dept.fields ? dept.fields.length : 0;
          const fieldNames = dept.fields ? dept.fields.map((f: any) => typeof f === 'string' ? f : (f.name || '')).filter((n: string) => n) : [];
          console.log(`Department: ${dept.name} (ID: ${dept.id}), Fields (${fieldCount}):`, fieldNames);
        });

        // Build department ID map for backward compatibility
        this.departmentIdMap.clear();
        this.departments.forEach(dept => {
          if (dept.id) {
            this.departmentIdMap.set(dept.name, dept.id);
          }
        });

        // Update cache
        this.dataPreloadService.setCachedData('departments', this.departments);

        // Force change detection to update UI
        this.cdr.detectChanges();
      },
      error: (error) => {
        console.error('Error loading departments:', error);
        const errorMessage = error?.message || 'Failed to load departments';

        // Check if it's an authentication error
        if (errorMessage.includes('Unauthorized') || errorMessage.includes('401')) {
          console.warn('Authentication error loading departments - user may need to re-login');
        } else {
          console.warn('Error loading departments:', errorMessage);
        }
      }
    });
  }

  /**
   * Refresh all data from backend
   * Can be called manually by user or automatically on retry
   */
  refreshAllData(): void {
    console.log('Refreshing all admin dashboard data...');
    this.loadAllData();
  }

  /**
   * Get department ID by name
   */
  private getDepartmentId(name: string): number | null {
    return this.departmentIdMap.get(name) || null;
  }

  /**
   * Map backend status to frontend status
   */
  private mapStatus(status?: string): 'Present' | 'Absent' | 'On Leave' | 'Not Signed Out' {
    if (!status) return 'Present';
    const upperStatus = status.toUpperCase();
    if (upperStatus === 'PRESENT') return 'Present';
    if (upperStatus === 'ABSENT') return 'Absent';
    if (upperStatus === 'ON_LEAVE' || upperStatus === 'ON LEAVE') return 'On Leave';
    if (upperStatus === 'NOT_SIGNED_OUT') return 'Not Signed Out';
    return 'Present';
  }

  /**
   * Map backend leave status to frontend status
   */
  private mapLeaveStatus(status: string): 'Approved' | 'Pending' | 'Declined' {
    const upperStatus = status.toUpperCase();
    if (upperStatus === 'APPROVED') return 'Approved';
    if (upperStatus === 'PENDING') return 'Pending';
    if (upperStatus === 'REJECTED') return 'Declined';
    return 'Pending';
  }

  // ===== Locations Storage =====
  // saveLocations() removed - locations are now saved directly to backend via API

  /**
   * Load locations from backend database
   */
  loadLocations(): void {
    this.isLoadingLocations = true;
    this.locationService.getAllLocations().subscribe({
      next: (locations: Location[]) => {
        // Map backend locationId to frontend id for compatibility
        this.locations = locations.map(loc => ({
          id: loc.locationId || loc.id,
          locationId: loc.locationId || loc.id,
          name: loc.name,
          latitude: loc.latitude,
          longitude: loc.longitude,
          radius: loc.radius,
          description: loc.description,
          active: loc.active !== false
        }));
        this.isLoadingLocations = false;
        console.log('✓ Loaded', this.locations.length, 'location(s) from database');
        this.cdr.detectChanges();
      },
      error: (error) => {
        console.error('Error loading locations:', error);
        this.isLoadingLocations = false;
        // Fallback to empty array if backend fails
        this.locations = [];
        this.cdr.detectChanges();
      }
    });
  }
}
