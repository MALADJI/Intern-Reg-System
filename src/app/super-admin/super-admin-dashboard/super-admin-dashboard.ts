import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { StorageService } from '../../services/storage.service';
import { ApiService } from '../../services/api.service';
import { DepartmentApiService, Department } from '../../services/department-api.service';
import { DataPreloadService } from '../../services/data-preload.service';
import { SidebarService } from '../../services/sidebar.service';
import { Profile } from '../../profile/profile';
import { LoadingComponent } from '../../shared/components/loading/loading.component';
import { Subscription } from 'rxjs';
import Swal from 'sweetalert2';
import type { SweetAlertResult } from 'sweetalert2';

interface Admin {
  adminId: number;
  userId?: number;
  name: string;
  surname?: string;
  email: string;
  createdAt?: string;
  hasSignature?: boolean;
  active?: boolean;
  departmentId?: number;
  departmentName?: string;
  lastLogin?: string | null; // Date of last login, null if never logged in
}

interface AdminForm {
  name: string;
  surname: string;
  email: string;
  password: string;
  confirmPassword: string;
  departmentId?: number;
  signature?: string;
}

@Component({
  selector: 'app-super-admin-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, Profile, LoadingComponent],
  providers: [DatePipe],
  templateUrl: './super-admin-dashboard.html',
  styleUrl: './super-admin-dashboard.css'
})
export class SuperAdminDashboard implements OnInit, OnDestroy {
  private subscriptions = new Subscription();

  admin: any = {};
  isSidebarExpanded: boolean = true;
  activeSection: string = 'overview';
  currentTime: string = '';
  currentDate: string = '';
  private clockTimer: any;

  admins: Admin[] = [];
  isLoading: boolean = true; // Global loading state
  loading: boolean = false;
  showCreateAdminForm: boolean = false;
  showPassword: boolean = false;
  showConfirmPassword: boolean = false;

  // Invite link card
  showInviteCard: boolean = false;
  newlyCreatedAdmin: Admin | null = null;
  inviteLink: string = '';
  inviteMessage: string = '';
  adminPassword: string = ''; // Store password temporarily for the message

  // Filters
  adminSearch: string = '';
  adminFilterDepartment: string = '';
  adminFilterStatus: string = '';

  // Filters for Recently Added Admins table
  recentAdminsSearch: string = '';
  recentAdminsFilterDepartment: string = '';

  // Pagination
  adminCurrentPage: number = 1;
  adminItemsPerPage: number = 25;
  recentAdminsCurrentPage: number = 1;
  recentAdminsItemsPerPage: number = 25;

  // Auto-refresh interval for admins (to detect when they log in)
  private adminRefreshInterval: any = null;

  // Expose Math for template
  Math = Math;

  // Department management
  departments: Department[] = [];
  isLoadingDepartments: boolean = false;
  showCreateDepartmentForm: boolean = false;
  departmentForm: { name: string } = { name: '' };
  editingDepartment: Department | null = null;

  // Edit admin department
  showEditDepartmentModal: boolean = false;
  editingAdmin: Admin | null = null;
  editDepartmentForm: { name: string; surname: string; email: string; password: string; confirmPassword: string; departmentId?: number | null } = {
    name: '',
    surname: '',
    email: '',
    password: '',
    confirmPassword: '',
    departmentId: undefined
  };
  showEditPassword: boolean = false;
  showEditConfirmPassword: boolean = false;

  adminForm: AdminForm = {
    name: '',
    surname: '',
    email: '',
    password: '',
    confirmPassword: '',
    departmentId: undefined,
    signature: ''
  };

  navigationItems = [
    { id: 'overview', label: 'Overview', icon: 'bi bi-speedometer2' },
    { id: 'admins', label: 'Manage Admins', icon: 'bi bi-people-fill' },
    { id: 'departments', label: 'Departments', icon: 'bi bi-building' }
  ];

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private authService: AuthService,
    private storage: StorageService,
    private api: ApiService,
    private departmentApiService: DepartmentApiService,
    private dataPreloadService: DataPreloadService,
    private sidebarService: SidebarService,
    private cdr: ChangeDetectorRef
  ) { }

  ngOnInit(): void {
    this.updateCurrentDate();
    this.loadAdminProfile();

    // Subscribe to sidebar state
    this.subscriptions.add(
      this.sidebarService.isSidebarExpanded$.subscribe(expanded => {
        this.isSidebarExpanded = expanded;
        this.cdr.detectChanges();
      })
    );

    // Initialize clock
    this.updateClock();
    this.clockTimer = setInterval(() => this.updateClock(), 1000);

    // Try to load from cache first
    const cachedAdmins = this.dataPreloadService.getCachedData<any[]>('admins');
    const cachedDepartments = this.dataPreloadService.getCachedData<any[]>('departments');

    if (cachedAdmins && cachedAdmins.length > 0) {
      console.log('✅ Using preloaded admins data');
      this.admins = cachedAdmins;
    } else {
      console.log('⚠️ No cached admins data, fetching...');
      this.loadAdmins();
    }

    if (cachedDepartments && cachedDepartments.length > 0) {
      console.log('✅ Using preloaded departments data');
      this.departments = cachedDepartments;
    } else {
      console.log('⚠️ No cached departments data, fetching...');
      this.loadDepartments();
    }

    // Check for query parameter to show specific section
    this.route.queryParams.subscribe(params => {
      if (params['section']) {
        this.showSection(params['section']);
      }
    });

    // Update date every minute
    setInterval(() => this.updateCurrentDate(), 60000);

    // Subscribe to real-time updates
    this.subscribeToRealTimeUpdates();

    // Disable loading screen after 1.5 seconds
    setTimeout(() => {
      this.isLoading = false;
      this.cdr.detectChanges();
    }, 1500);
  }

  /**
   * Subscribe to real-time updates via WebSocket
   */
  private subscribeToRealTimeUpdates(): void {
    // Subscribe to admin updates
    this.subscriptions.add(
      this.dataPreloadService.getUpdateObservable('admins').subscribe(updatedAdmins => {
        if (updatedAdmins && Array.isArray(updatedAdmins)) {
          this.admins = updatedAdmins;
          this.cdr.detectChanges();
          console.log('🔄 Admins updated in real-time');
        }
      })
    );

    // Subscribe to department updates
    this.subscriptions.add(
      this.dataPreloadService.getUpdateObservable('departments').subscribe(updatedDepartments => {
        if (updatedDepartments && Array.isArray(updatedDepartments)) {
          this.departments = updatedDepartments;
          this.cdr.detectChanges();
          console.log('🔄 Departments updated in real-time');
        }
      })
    );
  }

  updateCurrentDate(): void {
    const now = new Date();
    this.currentDate = now.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

  loadAdminProfile(): void {
    // Get current user from auth service (has department info)
    const currentUser = this.authService.getCurrentUserSync();
    if (currentUser) {
      this.admin = {
        name: this.authService.getUserName(),
        email: this.authService.getUserEmail(),
        role: currentUser.role || 'SUPER_ADMIN',
        department: currentUser.department || null
      };
    } else {
      // Fallback to storage if auth service doesn't have user
      const userData = this.storage.getItem('user');
      if (userData) {
        try {
          this.admin = typeof userData === 'string' ? JSON.parse(userData) : userData;
        } catch (e) {
          console.error('Error parsing user data:', e);
          this.admin = {};
        }
      }
    }
  }

  loadAdmins(): void {
    this.loading = true;
    this.api.get<Admin[]>('super-admin/admins').subscribe({
      next: (admins) => {
        // ✅ Map admins to include lastLogin and preserve departmentId/departmentName from backend
        this.admins = admins.map(a => {
          const lastLoginValue = (a as any).lastLoginAt || (a as any).lastLogin || (a as any).last_login || (a as any).lastLoginDate || null;
          // Debug logging for lastLogin mapping
          if (lastLoginValue) {
            console.log(`✅ Admin ${a.name} (${a.email}) has lastLogin:`, lastLoginValue);
          } else {
            console.log(`⚠️ Admin ${a.name} (${a.email}) has NO lastLogin (will appear in "Not Logged In" table)`);
          }
          return {
            ...a,
            // Check for lastLoginAt (backend field) first, then fallback to other possible field names
            lastLogin: lastLoginValue,
            // ✅ Preserve departmentId and departmentName from backend response
            departmentId: (a as any).departmentId || (a as any).department_id || a.departmentId,
            departmentName: (a as any).departmentName || (a as any).department_name || a.departmentName
          };
        });

        // ✅ Log department info for debugging
        console.log('✅ Admins loaded with department info:', this.admins.map(a => ({
          name: a.name,
          email: a.email,
          departmentId: a.departmentId,
          departmentName: a.departmentName
        })));

        // Update cache
        this.dataPreloadService.setCachedData('admins', this.admins);
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: (error) => {
        console.error('Error loading admins:', error);
        Swal.fire({
          icon: 'error',
          title: 'Error',
          text: 'Failed to load admins. Please try again.'
        });
        this.loading = false;
        this.cdr.detectChanges();
      }
    });
  }

  // Helper method to check if a section is active (avoids TypeScript type narrowing issues)
  isSectionActive(section: string): boolean {
    return this.activeSection === section;
  }

  showSection(section: string, event?: Event): void {
    // Prevent any default behavior or navigation
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    // Set the active section
    this.activeSection = section;

    // Load data for specific sections
    if (section === 'admins') {
      // Load admins immediately
      this.loadAdmins();
      // Set up auto-refresh every 30 seconds to detect when admins log in
      this.startAdminAutoRefresh();
    } else {
      // Stop auto-refresh when leaving admins section
      this.stopAdminAutoRefresh();
      if (section === 'departments') {
        this.loadDepartments();
      }
    }

    // Ensure we stay on the dashboard and update the view
    this.cdr.detectChanges();
  }

  // Start auto-refresh for admins
  startAdminAutoRefresh(): void {
    // Clear any existing interval
    this.stopAdminAutoRefresh();
    // Refresh admins every 30 seconds to detect login status changes
    this.adminRefreshInterval = setInterval(() => {
      this.loadAdmins();
    }, 30000); // 30 seconds
  }

  // Stop auto-refresh for admins
  stopAdminAutoRefresh(): void {
    if (this.adminRefreshInterval) {
      clearInterval(this.adminRefreshInterval);
      this.adminRefreshInterval = null;
    }
  }

  ngOnDestroy(): void {
    // Unsubscribe from all real-time updates
    this.subscriptions.unsubscribe();

    // Clean up intervals
    this.stopAdminAutoRefresh();
    if (this.clockTimer) {
      clearInterval(this.clockTimer);
    }
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
  }

  public toggleSidebar(): void {
    if (this.sidebarService) {
      this.sidebarService.toggleSidebar();
    }
  }

  openCreateAdminForm(): void {
    // ✅ Always reload departments to ensure we have the latest data
    console.log('📋 Opening create admin form. Current departments count:', this.departments.length);

    // Load departments if not loaded or reload to get latest
    if (this.departments.length === 0 || this.isLoadingDepartments === false) {
      console.log('🔄 Loading departments from backend...');
      this.isLoadingDepartments = true;
      this.loadDepartments();
    }

    // Wait for departments to load
    const checkDepartments = () => {
      if (this.isLoadingDepartments) {
        // Still loading, wait a bit more
        setTimeout(checkDepartments, 200);
        return;
      }

      // Check if we have departments
      if (this.activeDepartments.length === 0) {
        Swal.fire({
          icon: 'warning',
          title: 'No Departments Available',
          html: `
            <p>Please create at least one department before creating an admin.</p>
            <p class="text-muted small">Admins must be assigned to a department.</p>
          `,
          confirmButtonText: 'Create Department',
          cancelButtonText: 'Cancel',
          showCancelButton: true
        }).then((result) => {
          if (result.isConfirmed) {
            this.showSection('departments');
            this.showCreateDepartmentForm = true;
          }
        });
        return;
      }

      // ✅ Log available departments for debugging
      console.log('✅ Departments loaded. Available departments:', this.activeDepartments.length);
      console.log('✅ Active departments:', this.activeDepartments.map(d => ({ id: d.id, name: d.name })));

      // Initialize form
      this.adminForm = {
        name: '',
        surname: '',
        email: '',
        password: '',
        confirmPassword: '',
        departmentId: undefined,
        signature: ''
      };
      this.lastEmailValue = '';
      this.showCreateAdminForm = true;
      this.cdr.detectChanges();
    };

    // Start checking
    setTimeout(checkDepartments, 100);
  }

  closeCreateAdminForm(): void {
    this.showCreateAdminForm = false;
    this.adminForm = {
      name: '',
      surname: '',
      email: '',
      password: '',
      confirmPassword: '',
      departmentId: undefined,
      signature: ''
    };
    this.lastEmailValue = '';
    this.showPassword = false;
    this.showConfirmPassword = false;
  }

  togglePasswordVisibility(): void {
    this.showPassword = !this.showPassword;
  }

  toggleConfirmPasswordVisibility(): void {
    this.showConfirmPassword = !this.showConfirmPassword;
  }

  private lastEmailValue: string = '';

  onEmailKeyDown(event: KeyboardEvent): void {
    const input = event.target as HTMLInputElement;
    this.lastEmailValue = input.value;
  }

  onEmailInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const currentValue = this.adminForm.email || input.value;

    // Check if the value just changed to end with "@" (user just typed "@")
    // and doesn't already contain "@univen.ac.za"
    if (currentValue &&
      currentValue.endsWith('@') &&
      !currentValue.includes('@univen.ac.za') &&
      this.lastEmailValue !== currentValue) {

      // Auto-complete to "@univen.ac.za"
      const newValue = currentValue + 'univen.ac.za';
      this.adminForm.email = newValue;

      // Select the auto-completed part so user can easily accept or replace it
      // Note: setSelectionRange doesn't work on email input types, so we wrap in try-catch
      setTimeout(() => {
        const startPosition = currentValue.length; // Position after "@"
        const endPosition = newValue.length;
        try {
          input.setSelectionRange(startPosition, endPosition);
        } catch (e) {
          // Ignore error - email input types don't support setSelectionRange
          // The auto-complete still works, just without text selection
        }
      }, 0);
    }

    this.lastEmailValue = currentValue;
  }


  createAdmin(): void {
    // Validate form
    if (!this.adminForm.name || !this.adminForm.surname || !this.adminForm.email || !this.adminForm.password) {
      Swal.fire({
        icon: 'warning',
        title: 'Validation Error',
        text: 'Please fill in all required fields.'
      });
      return;
    }

    // ✅ Validate department is selected (REQUIRED)
    if (!this.adminForm.departmentId || this.adminForm.departmentId === undefined || this.adminForm.departmentId === null) {
      Swal.fire({
        icon: 'warning',
        title: 'Department Required',
        text: 'Please select a department for this admin. The admin will inherit this department assignment.'
      });
      return;
    }

    if (this.adminForm.password.length < 6) {
      Swal.fire({
        icon: 'warning',
        title: 'Password Too Short',
        text: 'Password must be at least 6 characters long.'
      });
      return;
    }

    if (this.adminForm.password !== this.adminForm.confirmPassword) {
      Swal.fire({
        icon: 'error',
        title: 'Password Mismatch',
        text: 'Passwords do not match. Please try again.'
      });
      return;
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(this.adminForm.email)) {
      Swal.fire({
        icon: 'warning',
        title: 'Invalid Email',
        text: 'Please enter a valid email address.'
      });
      return;
    }

    this.loading = true;

    // ✅ CRITICAL: Always include departmentId - it's required for admin to inherit department
    // Ensure it's a number, not a string or undefined
    let departmentId: number;

    // Check if departmentId is set
    if (this.adminForm.departmentId === undefined || this.adminForm.departmentId === null) {
      this.loading = false;
      Swal.fire({
        icon: 'warning',
        title: 'Department Required',
        text: 'Please select a department for this admin. The admin will inherit this department assignment.'
      });
      return;
    }

    // Convert to number
    departmentId = Number(this.adminForm.departmentId);
    if (isNaN(departmentId) || departmentId <= 0) {
      this.loading = false;
      Swal.fire({
        icon: 'error',
        title: 'Invalid Department',
        text: 'Department ID must be a valid number. Please select a department again.'
      });
      return;
    }

    const adminData: any = {
      name: this.adminForm.name,
      surname: this.adminForm.surname,
      email: this.adminForm.email,
      password: this.adminForm.password,
      departmentId: departmentId  // ✅ Required - admin inherits this department (ensured to be number)
    };

    // Log department assignment for debugging
    const selectedDept = this.departments.find(d => d.id === this.adminForm.departmentId);
    console.log('✅ Creating admin with department assignment:', {
      adminName: this.adminForm.name,
      adminSurname: this.adminForm.surname,
      adminEmail: this.adminForm.email,
      departmentId: this.adminForm.departmentId,
      departmentName: selectedDept?.name || 'Unknown'
    });

    if (this.adminForm.signature) {
      adminData.signature = this.adminForm.signature;
    }

    console.log('📤 Sending admin creation request to backend:', {
      name: adminData.name,
      surname: adminData.surname,
      email: adminData.email,
      departmentId: adminData.departmentId,
      hasSignature: !!adminData.signature
    });

    this.api.post<any>('super-admin/admins', adminData).subscribe({
      next: (response) => {
        console.log('✅ Backend response:', response);

        // ✅ CRITICAL: Verify backend saved the department
        if (!response.departmentId && this.adminForm.departmentId) {
          console.error('❌ CRITICAL ERROR: Backend did not save departmentId!');
          console.error('❌ Request sent departmentId:', this.adminForm.departmentId);
          console.error('❌ Response received departmentId:', response.departmentId);
          Swal.fire({
            icon: 'error',
            title: 'Department Not Saved',
            html: `
              <p>The admin was created but the department was <strong>NOT</strong> assigned.</p>
              <p><strong>Backend Issue:</strong> The backend is not saving the departmentId.</p>
              <p>Please edit this admin to assign a department, or fix the backend.</p>
            `,
            confirmButtonText: 'OK',
            timer: 8000
          });
        } else if (response.departmentId) {
          console.log('✅ Department successfully saved by backend:', {
            departmentId: response.departmentId,
            departmentName: response.departmentName
          });
        }

        // Store the newly created admin
        this.newlyCreatedAdmin = {
          adminId: response.adminId || response.id,
          userId: response.userId,
          name: response.name || this.adminForm.name,
          surname: response.surname || this.adminForm.surname,
          email: response.email || this.adminForm.email,
          createdAt: response.createdAt,
          hasSignature: response.hasSignature || false,
          active: response.active !== false,
          departmentId: response.departmentId || this.adminForm.departmentId, // ✅ Fallback to form value
          departmentName: response.departmentName || selectedDept?.name // ✅ Fallback to form value
        };

        // Store password temporarily for the invite message
        this.adminPassword = this.adminForm.password;

        // Generate invite link (pointing to login page)
        this.generateInviteLink(response);

        // Generate default friendly message
        this.generateDefaultMessage();

        // Show success message
        Swal.fire({
          icon: 'success',
          title: 'Success!',
          text: `Admin "${this.adminForm.name}" has been created successfully.`,
          timer: 2000,
          showConfirmButton: false
        });

        // Close form and show invite card
        this.closeCreateAdminForm();
        this.showInviteCard = true;
        this.loadAdmins();
        this.loading = false;
      },
      error: (error) => {
        console.error('Error creating admin:', error);
        const errorMessage = error?.error?.message || error?.message || 'Failed to create admin. Please try again.';
        Swal.fire({
          icon: 'error',
          title: 'Error',
          text: errorMessage
        });
        this.loading = false;
      }
    });
  }

  updateAdminSignature(adminId: number): void {
    Swal.fire({
      title: 'Update Signature',
      html: `
        <p class="mb-3">Upload or paste signature data for this admin.</p>
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
        this.api.put<any>(`super-admin/admins/${adminId}/signature`, { signature }).subscribe({
          next: () => {
            Swal.fire({
              icon: 'success',
              title: 'Success!',
              text: 'Signature updated successfully.',
              timer: 2000,
              showConfirmButton: false
            });
            this.loadAdmins();
          },
          error: (error) => {
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

  /**
   * Deactivate or activate admin
   */
  deactivateAdmin(admin: Admin): void {
    const isCurrentlyActive = admin.active !== false;

    Swal.fire({
      title: isCurrentlyActive ? 'Deactivate Admin?' : 'Activate Admin?',
      html: `
        <div class="text-start">
          <p class="mb-3">Are you sure you want to ${isCurrentlyActive ? 'deactivate' : 'activate'} <strong>${admin.name}</strong>?</p>
          <div class="alert alert-info mb-0">
            <i class="bi bi-info-circle me-2"></i>
            <strong>Note:</strong> ${isCurrentlyActive ? 'Deactivating' : 'Activating'} this admin will ${isCurrentlyActive ? 'prevent them from accessing the system' : 'restore their access to the system'}. Historical information will be preserved.
          </div>
        </div>
      `,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: isCurrentlyActive ? '#d33' : '#28a745',
      cancelButtonColor: '#6c757d',
      confirmButtonText: `Yes, ${isCurrentlyActive ? 'deactivate' : 'activate'} it!`,
      cancelButtonText: 'Cancel'
    }).then((result: SweetAlertResult) => {
      if (result.isConfirmed) {
        this.loading = true;
        const endpoint = isCurrentlyActive
          ? `super-admin/admins/${admin.adminId}/deactivate`
          : `super-admin/admins/${admin.adminId}/activate`;

        this.api.put<any>(endpoint, {}).subscribe({
          next: (response) => {
            const index = this.admins.findIndex(a => a.adminId === admin.adminId);
            if (index !== -1) {
              // Explicitly update the active status
              this.admins[index].active = !isCurrentlyActive;
            }
            this.loading = false;
            Swal.fire({
              icon: 'success',
              title: 'Success!',
              text: `Admin "${admin.name}" has been ${isCurrentlyActive ? 'deactivated' : 'activated'}.`,
              timer: 2000,
              showConfirmButton: false
            });
            this.cdr.detectChanges();
          },
          error: (error) => {
            console.error(`Error ${isCurrentlyActive ? 'deactivating' : 'activating'} admin:`, error);
            this.loading = false;
            const errorMessage = error?.error?.message || error?.message || `Failed to ${isCurrentlyActive ? 'deactivate' : 'activate'} admin. Please try again.`;
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

  refreshData(): void {
    this.loadAdmins();
    this.loadDepartments();
    Swal.fire({
      icon: 'success',
      title: 'Refreshed!',
      text: 'Data has been refreshed.',
      timer: 1500,
      showConfirmButton: false
    });
  }

  // ===================== EDIT ADMIN DEPARTMENT =====================

  /**
   * Open edit department modal for an admin
   * ✅ Fetches department from backend (departmentId or departmentName)
   */
  openEditDepartmentModal(admin: Admin): void {
    this.editingAdmin = admin;

    // ✅ Get departmentId from admin object (from backend)
    let departmentId: number | undefined = admin.departmentId;

    // ✅ If departmentId is missing but departmentName exists, find it from departments list
    if (!departmentId && admin.departmentName && this.departments.length > 0) {
      const foundDept = this.departments.find(dept => dept.name === admin.departmentName);
      if (foundDept) {
        departmentId = foundDept.id;
        console.log('✅ Found departmentId from departmentName:', {
          departmentName: admin.departmentName,
          departmentId: departmentId
        });
      }
    }

    // ✅ Log for debugging
    console.log('✅ Opening edit modal for admin:', {
      adminId: admin.adminId,
      name: admin.name,
      email: admin.email,
      departmentId: departmentId || 'Not set',
      departmentName: admin.departmentName || 'Not set',
      availableDepartments: this.departments.length
    });

    this.editDepartmentForm = {
      name: admin.name || '',
      surname: admin.surname || '',
      email: admin.email || '',
      password: '',
      confirmPassword: '',
      departmentId: departmentId || null // ✅ Set departmentId from backend (null if not set)
    };
    this.showEditPassword = false;
    this.showEditConfirmPassword = false;
    this.showEditDepartmentModal = true;

    // ✅ Trigger change detection to ensure selector shows correct value
    setTimeout(() => {
      this.cdr.detectChanges();
    }, 0);
  }

  /**
   * Close edit department modal
   */
  closeEditDepartmentModal(): void {
    this.showEditDepartmentModal = false;
    this.editingAdmin = null;
    this.editDepartmentForm = {
      name: '',
      surname: '',
      email: '',
      password: '',
      confirmPassword: '',
      departmentId: undefined
    };
    this.lastEditAdminEmailValue = '';
    this.showEditPassword = false;
    this.showEditConfirmPassword = false;
  }

  toggleEditPasswordVisibility(): void {
    this.showEditPassword = !this.showEditPassword;
  }

  toggleEditConfirmPasswordVisibility(): void {
    this.showEditConfirmPassword = !this.showEditConfirmPassword;
  }

  private lastEditAdminEmailValue: string = '';

  onEditAdminEmailKeyDown(event: KeyboardEvent): void {
    const input = event.target as HTMLInputElement;
    this.lastEditAdminEmailValue = input.value;
  }

  onEditAdminEmailInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const currentValue = this.editDepartmentForm.email || input.value;

    // Check if the value just changed to end with "@" (user just typed "@")
    // and doesn't already contain "@univen.ac.za"
    if (currentValue &&
      currentValue.endsWith('@') &&
      !currentValue.includes('@univen.ac.za') &&
      this.lastEditAdminEmailValue !== currentValue) {

      // Auto-complete to "@univen.ac.za"
      const newValue = currentValue + 'univen.ac.za';
      this.editDepartmentForm.email = newValue;

      // Select the auto-completed part so user can easily accept or replace it
      // Note: setSelectionRange doesn't work on email input types, so we wrap in try-catch
      setTimeout(() => {
        const startPosition = currentValue.length; // Position after "@"
        const endPosition = newValue.length;
        try {
          input.setSelectionRange(startPosition, endPosition);
        } catch (e) {
          // Ignore error - email input types don't support setSelectionRange
          // The auto-complete still works, just without text selection
        }
      }, 0);
    }

    this.lastEditAdminEmailValue = currentValue;
  }

  /**
   * Update admin details (name, email, department)
   */
  updateAdminDepartment(): void {
    if (!this.editingAdmin) {
      return;
    }

    // Validate form
    if (!this.editDepartmentForm.name || !this.editDepartmentForm.name.trim() || !this.editDepartmentForm.surname || !this.editDepartmentForm.surname.trim()) {
      Swal.fire({
        icon: 'warning',
        title: 'Validation Error',
        text: 'Please enter both name and surname for the admin.'
      });
      return;
    }

    if (!this.editDepartmentForm.email || !this.editDepartmentForm.email.trim()) {
      Swal.fire({
        icon: 'warning',
        title: 'Validation Error',
        text: 'Please enter an email address for the admin.'
      });
      return;
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(this.editDepartmentForm.email)) {
      Swal.fire({
        icon: 'warning',
        title: 'Invalid Email',
        text: 'Please enter a valid email address.'
      });
      return;
    }

    // Password validation (if password is provided)
    if (this.editDepartmentForm.password && this.editDepartmentForm.password.trim()) {
      if (this.editDepartmentForm.password.length < 6) {
        Swal.fire({
          icon: 'warning',
          title: 'Password Too Short',
          text: 'Password must be at least 6 characters long.'
        });
        return;
      }

      if (!this.editDepartmentForm.confirmPassword || !this.editDepartmentForm.confirmPassword.trim()) {
        Swal.fire({
          icon: 'warning',
          title: 'Confirm Password Required',
          text: 'Please confirm the new password.'
        });
        return;
      }

      if (this.editDepartmentForm.password !== this.editDepartmentForm.confirmPassword) {
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
      name: this.editDepartmentForm.name.trim(),
      surname: this.editDepartmentForm.surname.trim(),
      email: this.editDepartmentForm.email.trim()
    };

    // Add password only if provided
    if (this.editDepartmentForm.password && this.editDepartmentForm.password.trim()) {
      updateData.password = this.editDepartmentForm.password.trim();
    }

    // ✅ If departmentId is undefined or null, send null to remove department
    // If it's a number, send it to set the department
    if (this.editDepartmentForm.departmentId === undefined || this.editDepartmentForm.departmentId === null) {
      updateData.departmentId = null;
    } else {
      updateData.departmentId = this.editDepartmentForm.departmentId;
    }

    console.log('✅ Updating admin with department:', {
      adminId: this.editingAdmin?.adminId,
      departmentId: updateData.departmentId,
      previousDepartmentId: this.editingAdmin?.departmentId
    });

    this.api.put<any>(`super-admin/admins/${this.editingAdmin.adminId}`, updateData).subscribe({
      next: (response) => {
        this.loading = false;

        // Update the admin in the local array
        const index = this.admins.findIndex(a => a.adminId === this.editingAdmin!.adminId);
        if (index !== -1) {
          this.admins[index] = {
            ...this.admins[index],
            name: response.name || this.editDepartmentForm.name,
            surname: response.surname || this.editDepartmentForm.surname,
            email: response.email || this.editDepartmentForm.email,
            departmentId: response.departmentId || undefined,
            departmentName: response.departmentName || undefined
          };
        }

        // Update cache if needed
        this.dataPreloadService.setCachedData('admins', this.admins);

        Swal.fire({
          icon: 'success',
          title: 'Success!',
          text: `Admin details updated successfully for ${this.editDepartmentForm.name}.`,
          timer: 2000,
          showConfirmButton: false
        });

        this.closeEditDepartmentModal();
        this.cdr.detectChanges();
      },
      error: (error) => {
        this.loading = false;
        console.error('Error updating admin details:', error);
        const errorMessage = error?.error?.message || error?.message || 'Failed to update admin details. Please try again.';
        Swal.fire({
          icon: 'error',
          title: 'Error',
          text: errorMessage
        });
        this.cdr.detectChanges();
      }
    });
  }

  /**
   * Get count of admins with signatures
   */
  get adminsWithSignatureCount(): number {
    return this.admins.filter(admin => admin.hasSignature === true).length;
  }

  /**
   * Get count of admins without signatures
   */
  get adminsWithoutSignatureCount(): number {
    return this.admins.filter(admin => !admin.hasSignature).length;
  }

  // ===================== DEPARTMENT MANAGEMENT =====================

  /**
   * Load all departments from backend
   */
  loadDepartments(): void {
    this.isLoadingDepartments = true;
    console.log('🔄 Fetching departments from API: GET /api/departments');

    this.departmentApiService.getAllDepartments().subscribe({
      next: (departments) => {
        console.log('✅ Departments loaded successfully:', departments.length);
        console.log('📋 Departments data:', departments.map(d => ({ id: d.id, name: d.name, active: d.active })));

        this.departments = departments;
        // Update cache
        this.dataPreloadService.setCachedData('departments', departments);
        this.isLoadingDepartments = false;
        this.cdr.detectChanges();
      },
      error: (error) => {
        console.error('❌ Error loading departments:', error);
        console.error('❌ Error details:', {
          status: error.status,
          statusText: error.statusText,
          message: error.message,
          error: error.error
        });

        this.isLoadingDepartments = false;

        let errorMessage = 'Failed to load departments from the backend.';
        if (error.status === 401) {
          errorMessage = 'Authentication required. Please log in again.';
        } else if (error.status === 404) {
          errorMessage = 'Departments endpoint not found. Please check backend configuration.';
        } else if (error.status === 0) {
          errorMessage = 'Cannot connect to backend server. Please ensure the backend is running and accessible on the network.';
        } else if (error.error?.error) {
          errorMessage = error.error.error;
        }

        Swal.fire({
          icon: 'error',
          title: 'Error Loading Departments',
          html: `
            <p>${errorMessage}</p>
            <p class="text-muted small mt-2">Status: ${error.status || 'Unknown'}</p>
            <p class="text-muted small">Endpoint: GET /api/departments</p>
          `,
          confirmButtonText: 'Retry',
          showCancelButton: true,
          cancelButtonText: 'Cancel'
        }).then((result) => {
          if (result.isConfirmed) {
            this.loadDepartments();
          }
        });

        this.cdr.detectChanges();
      }
    });
  }

  /**
   * Open create department form
   */
  openCreateDepartmentForm(): void {
    this.departmentForm = { name: '' };
    this.editingDepartment = null;
    this.showCreateDepartmentForm = true;
  }

  /**
   * Close create department form
   */
  closeCreateDepartmentForm(): void {
    this.showCreateDepartmentForm = false;
    this.departmentForm = { name: '' };
    this.editingDepartment = null;
  }

  /**
   * Create a new department
   */
  createDepartment(): void {
    if (!this.departmentForm.name || !this.departmentForm.name.trim()) {
      Swal.fire({
        icon: 'warning',
        title: 'Validation Error',
        text: 'Please enter a department name.'
      });
      return;
    }

    const deptName = this.departmentForm.name.trim();

    // Check if department already exists
    if (this.departments.some(d => d.name.toLowerCase() === deptName.toLowerCase())) {
      Swal.fire({
        icon: 'warning',
        title: 'Duplicate Department',
        text: 'A department with this name already exists.'
      });
      return;
    }

    this.isLoadingDepartments = true;
    this.departmentApiService.createDepartment(deptName).subscribe({
      next: (createdDept) => {
        // Reload the full departments list to ensure all data is up to date
        this.loadDepartments();
        this.closeCreateDepartmentForm();
        Swal.fire({
          icon: 'success',
          title: 'Success!',
          text: `Department "${deptName}" has been created successfully.`,
          timer: 2000,
          showConfirmButton: false
        });
        this.cdr.detectChanges();
      },
      error: (error) => {
        console.error('Error creating department:', error);
        this.isLoadingDepartments = false;
        const errorMessage = error?.error?.message || error?.message || 'Failed to create department. Please try again.';
        Swal.fire({
          icon: 'error',
          title: 'Error',
          text: errorMessage
        });
        this.cdr.detectChanges();
      }
    });
  }

  /**
   * Edit department
   */
  editDepartment(department: Department): void {
    this.editingDepartment = department;
    this.departmentForm = { name: department.name };
    this.showCreateDepartmentForm = true;
  }

  /**
   * Update department
   */
  updateDepartment(): void {
    if (!this.editingDepartment || !this.departmentForm.name || !this.departmentForm.name.trim()) {
      Swal.fire({
        icon: 'warning',
        title: 'Validation Error',
        text: 'Please enter a department name.'
      });
      return;
    }

    const newName = this.departmentForm.name.trim();

    // Check if another department with this name already exists
    if (this.departments.some(d => d.id !== this.editingDepartment!.id && d.name.toLowerCase() === newName.toLowerCase())) {
      Swal.fire({
        icon: 'warning',
        title: 'Duplicate Department',
        text: 'A department with this name already exists.'
      });
      return;
    }

    if (!this.editingDepartment.id) {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: 'Department ID is missing. Please refresh and try again.'
      });
      return;
    }

    this.isLoadingDepartments = true;
    this.departmentApiService.updateDepartment(this.editingDepartment.id, newName).subscribe({
      next: (updatedDept) => {
        const index = this.departments.findIndex(d => d.id === updatedDept.id);
        if (index !== -1) {
          this.departments[index] = updatedDept;
        }
        this.closeCreateDepartmentForm();
        this.isLoadingDepartments = false;
        Swal.fire({
          icon: 'success',
          title: 'Success!',
          text: `Department updated to "${newName}".`,
          timer: 2000,
          showConfirmButton: false
        });
        this.cdr.detectChanges();
      },
      error: (error) => {
        console.error('Error updating department:', error);
        this.isLoadingDepartments = false;
        const errorMessage = error?.error?.message || error?.message || 'Failed to update department. Please try again.';
        Swal.fire({
          icon: 'error',
          title: 'Error',
          text: errorMessage
        });
        this.cdr.detectChanges();
      }
    });
  }

  /**
   * Deactivate department
   */
  deactivateDepartment(department: Department): void {
    const isCurrentlyActive = department.active !== false;

    Swal.fire({
      title: isCurrentlyActive ? 'Deactivate Department?' : 'Activate Department?',
      html: `
        <div class="text-start">
          <p class="mb-3">Are you sure you want to ${isCurrentlyActive ? 'deactivate' : 'activate'} <strong>${department.name}</strong>?</p>
          <div class="alert alert-info mb-0">
            <i class="bi bi-info-circle me-2"></i>
            <strong>Note:</strong> ${isCurrentlyActive ? 'Deactivating' : 'Activating'} this department will ${isCurrentlyActive ? 'mark it as inactive' : 'mark it as active'} in the system. Historical information will be preserved.
          </div>
        </div>
      `,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: isCurrentlyActive ? '#d33' : '#28a745',
      cancelButtonColor: '#6c757d',
      confirmButtonText: `Yes, ${isCurrentlyActive ? 'deactivate' : 'activate'} it!`,
      cancelButtonText: 'Cancel'
    }).then((result: SweetAlertResult) => {
      if (result.isConfirmed) {
        if (!department.id) {
          Swal.fire({
            icon: 'error',
            title: 'Error',
            text: 'Department ID is missing. Please refresh and try again.'
          });
          return;
        }

        this.isLoadingDepartments = true;
        const action = isCurrentlyActive
          ? this.departmentApiService.deactivateDepartment(department.id)
          : this.departmentApiService.activateDepartment(department.id);

        action.subscribe({
          next: (response) => {
            // Update the department with new active status
            const index = this.departments.findIndex(d => d.id === department.id);
            if (index !== -1) {
              this.departments[index] = {
                ...this.departments[index],
                active: !isCurrentlyActive
              };
            }
            // Update cache
            this.dataPreloadService.setCachedData('departments', this.departments);
            this.isLoadingDepartments = false;
            Swal.fire({
              icon: 'success',
              title: 'Success!',
              text: `Department "${department.name}" has been ${isCurrentlyActive ? 'deactivated' : 'activated'}.`,
              timer: 2000,
              showConfirmButton: false
            });
            this.cdr.detectChanges();
          },
          error: (error) => {
            console.error(`Error ${isCurrentlyActive ? 'deactivating' : 'activating'} department:`, error);
            this.isLoadingDepartments = false;
            const errorMessage = error?.error?.message || error?.message || `Failed to ${isCurrentlyActive ? 'deactivate' : 'activate'} department. Please try again.`;
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
   * Save department (create or update)
   */
  saveDepartment(): void {
    if (this.editingDepartment) {
      this.updateDepartment();
    } else {
      this.createDepartment();
    }
  }

  /**
   * Get active departments for dropdown
   */
  get activeDepartments(): Department[] {
    return this.departments.filter(dept => dept.active !== false);
  }

  /**
   * Generate invite link for newly created admin (points to login page)
   */
  generateInviteLink(adminResponse?: any): void {
    // Generate a token or use admin ID for the invite link
    const baseUrl = window.location.origin;
    const admin = adminResponse || this.newlyCreatedAdmin;
    if (!admin) return;

    const token = (adminResponse as any)?.inviteToken || admin.adminId;
    const email = admin.email || this.adminForm.email;
    // Link points to login page with invite token and email
    this.inviteLink = `${baseUrl}/login?invite=${token}&email=${encodeURIComponent(email)}`;
  }

  /**
   * Generate default friendly message template
   */
  generateDefaultMessage(): void {
    const adminName = this.newlyCreatedAdmin?.name || 'Admin';
    const adminEmail = this.newlyCreatedAdmin?.email || '';

    this.inviteMessage = `Hello ${adminName},

Welcome to the Intern Register System! Your admin account has been created successfully.

Your login credentials are:
Email: ${adminEmail}
Password: ${this.adminPassword}

Please use the link below to log in and access your admin dashboard:
${this.inviteLink}

After logging in, we recommend that you change your password for security purposes.

If you have any questions or need assistance, please don't hesitate to contact us.

Best regards,
Super Admin`;
  }

  /**
   * Copy invite link to clipboard
   */
  copyInviteLink(): void {
    navigator.clipboard.writeText(this.inviteLink).then(() => {
      Swal.fire({
        icon: 'success',
        title: 'Copied!',
        text: 'Invite link has been copied to clipboard.',
        timer: 2000,
        showConfirmButton: false
      });
    }).catch(() => {
      // Fallback for older browsers
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
          title: 'Error',
          text: 'Failed to copy invite link. Please copy it manually.'
        });
      }
      document.body.removeChild(textArea);
    });
  }

  /**
   * Send invite link via email
   */
  sendInviteEmail(): void {
    if (!this.newlyCreatedAdmin) return;

    this.loading = true;
    this.api.post<any>('super-admin/admins/send-invite', {
      adminId: this.newlyCreatedAdmin.adminId,
      email: this.newlyCreatedAdmin.email,
      inviteLink: this.inviteLink,
      message: this.inviteMessage,
      password: this.adminPassword
    }).subscribe({
      next: () => {
        this.loading = false;
        Swal.fire({
          icon: 'success',
          title: 'Invite Sent!',
          text: `Invite link has been sent to ${this.newlyCreatedAdmin?.email}`,
          timer: 2000,
          showConfirmButton: false
        });
      },
      error: (error) => {
        console.error('Error sending invite email:', error);
        this.loading = false;
        const errorMessage = error?.error?.message || error?.message || 'Failed to send invite email. You can copy the link manually.';
        Swal.fire({
          icon: 'warning',
          title: 'Email Not Sent',
          text: errorMessage,
          footer: '<small>You can copy the invite link manually using the copy button.</small>'
        });
      }
    });
  }

  /**
   * Close invite card
   */
  closeInviteCard(): void {
    this.showInviteCard = false;
    this.newlyCreatedAdmin = null;
    this.inviteLink = '';
    this.inviteMessage = '';
    this.adminPassword = '';
  }

  // ===================== ADMIN FILTERING & PAGINATION =====================

  /**
   * Get admins who haven't logged in yet (recently added) - base list
   */
  get adminsNotLoggedInBase(): Admin[] {
    const filtered = this.admins
      .filter(a => {
        // Filter admins who haven't logged in (lastLogin is null, undefined, or empty string)
        // An admin has logged in if lastLogin exists and is not null/undefined/empty
        const hasLoggedIn = a.lastLogin &&
          a.lastLogin !== null &&
          a.lastLogin !== undefined &&
          a.lastLogin !== '';

        // Debug logging
        if (hasLoggedIn) {
          console.log(`🔍 Admin ${a.name} (${a.email}) has logged in (lastLogin: ${a.lastLogin}) - EXCLUDED from "Not Logged In" table`);
        }

        // Only include admins who haven't logged in AND are active
        const shouldInclude = !hasLoggedIn && a.active !== false;
        if (shouldInclude) {
          console.log(`🔍 Admin ${a.name} (${a.email}) has NOT logged in - INCLUDED in "Not Logged In" table`);
        }
        return shouldInclude;
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

    console.log(`📊 Filtered ${filtered.length} admins who haven't logged in (out of ${this.admins.length} total admins)`);
    return filtered;
  }

  /**
   * Get filtered admins who haven't logged in yet (with filters applied)
   */
  get adminsNotLoggedIn(): Admin[] {
    return this.adminsNotLoggedInBase
      .filter(a => {
        // Filter by search (name or email)
        if (this.recentAdminsSearch) {
          const searchLower = this.recentAdminsSearch.toLowerCase();
          if (!a.name.toLowerCase().includes(searchLower) && !a.email.toLowerCase().includes(searchLower)) {
            return false;
          }
        }
        // Filter by department
        if (this.recentAdminsFilterDepartment && a.departmentName !== this.recentAdminsFilterDepartment) {
          return false;
        }
        return true;
      });
  }

  /**
   * Get filtered admins based on search and filter criteria
   */
  get filteredAdmins(): Admin[] {
    return this.admins
      .filter(a => {
        if (this.adminSearch) {
          const searchLower = this.adminSearch.toLowerCase();
          return a.name.toLowerCase().includes(searchLower) || a.email.toLowerCase().includes(searchLower);
        }
        return true;
      })
      .filter(a => !this.adminFilterDepartment || a.departmentName === this.adminFilterDepartment)
      .filter(a => {
        // Filter by status
        if (this.adminFilterStatus) {
          if (this.adminFilterStatus === 'Inactive') {
            return a.active === false;
          } else {
            return a.active !== false;
          }
        }
        return true;
      });
  }

  /**
   * Get count of active admins (excluding inactive)
   */
  get activeAdminsCount(): number {
    return this.admins.filter(a => a.active !== false).length;
  }

  /**
   * Get paginated admins
   */
  get paginatedAdmins(): Admin[] {
    const start = (this.adminCurrentPage - 1) * this.adminItemsPerPage;
    return this.filteredAdmins.slice(start, start + this.adminItemsPerPage);
  }

  /**
   * Get total number of pages
   */
  get totalAdminPages(): number {
    return Math.ceil(this.filteredAdmins.length / this.adminItemsPerPage) || 1;
  }

  /**
   * Get paginated recently added admins
   */
  get paginatedRecentAdmins(): Admin[] {
    const start = (this.recentAdminsCurrentPage - 1) * this.recentAdminsItemsPerPage;
    return this.adminsNotLoggedIn.slice(start, start + this.recentAdminsItemsPerPage);
  }

  /**
   * Get total number of pages for recently added admins
   */
  get totalRecentAdminsPages(): number {
    return Math.ceil(this.adminsNotLoggedIn.length / this.recentAdminsItemsPerPage) || 1;
  }

  /**
   * Get list of unique department names from admins
   */
  get adminDepartmentList(): string[] {
    const departments = this.admins
      .filter(a => a.departmentName)
      .map(a => a.departmentName!)
      .filter((value, index, self) => self.indexOf(value) === index)
      .sort();
    return departments;
  }

  /**
   * Get list of unique department names from recently added admins
   */
  get recentAdminsDepartmentList(): string[] {
    const departments = this.adminsNotLoggedInBase
      .filter(a => a.departmentName)
      .map(a => a.departmentName!)
      .filter((value, index, self) => self.indexOf(value) === index)
      .sort();
    return departments;
  }

  // Pagination helpers
  prevAdminPage(): void {
    if (this.adminCurrentPage > 1) this.adminCurrentPage--;
  }

  nextAdminPage(): void {
    if (this.adminCurrentPage < this.totalAdminPages) this.adminCurrentPage++;
  }

  goToAdminPage(page: number): void {
    if (page >= 1 && page <= this.totalAdminPages) {
      this.adminCurrentPage = page;
    }
  }

  getAdminPageNumbers(): number[] {
    const total = this.totalAdminPages;
    const current = this.adminCurrentPage;
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

  // Pagination helpers for Recently Added Admins
  prevRecentAdminsPage(): void {
    if (this.recentAdminsCurrentPage > 1) this.recentAdminsCurrentPage--;
  }

  nextRecentAdminsPage(): void {
    if (this.recentAdminsCurrentPage < this.totalRecentAdminsPages) this.recentAdminsCurrentPage++;
  }

  goToRecentAdminsPage(page: number): void {
    if (page >= 1 && page <= this.totalRecentAdminsPages) {
      this.recentAdminsCurrentPage = page;
    }
  }

  getRecentAdminsPageNumbers(): number[] {
    const total = this.totalRecentAdminsPages;
    const current = this.recentAdminsCurrentPage;
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
  resetAdminFilters(): void {
    this.adminSearch = '';
    this.adminFilterDepartment = '';
    this.adminFilterStatus = '';
    this.adminCurrentPage = 1;
  }

  /**
   * Reset filters for Recently Added Admins table
   */
  resetRecentAdminsFilters(): void {
    this.recentAdminsSearch = '';
    this.recentAdminsFilterDepartment = '';
    this.recentAdminsCurrentPage = 1;
  }

  /**
   * Delete an admin
   */
  deleteAdmin(admin: Admin): void {
    Swal.fire({
      title: 'Delete Admin?',
      html: `
        <div class="text-start">
          <p class="mb-3">Are you sure you want to delete <strong>${admin.name}</strong> (${admin.email})?</p>
          <div class="alert alert-danger mb-0">
            <i class="bi bi-exclamation-triangle me-2"></i>
            <strong>Warning:</strong> This action cannot be undone. Deleting this admin will permanently remove them from the system, including their user account and all associated data.
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

        this.api.delete<any>(`super-admin/admins/${admin.adminId}`).subscribe({
          next: (response) => {
            // Remove admin from the list
            const index = this.admins.findIndex(a => a.adminId === admin.adminId);
            if (index !== -1) {
              this.admins.splice(index, 1);
            }

            this.loading = false;
            Swal.fire({
              icon: 'success',
              title: 'Deleted!',
              text: `Admin "${admin.name}" has been deleted successfully.`,
              timer: 2000,
              showConfirmButton: false
            });
            this.cdr.detectChanges();
          },
          error: (error) => {
            console.error('Error deleting admin:', error);
            this.loading = false;
            const errorMessage = error?.error?.message || error?.message || 'Failed to delete admin. Please try again.';
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
   * Resend invite email to an admin
   */
  resendInviteEmail(admin: Admin): void {
    // Set the admin as the newly created admin (for the invite card)
    this.newlyCreatedAdmin = {
      adminId: admin.adminId,
      userId: admin.userId,
      name: admin.name,
      email: admin.email,
      createdAt: admin.createdAt,
      hasSignature: admin.hasSignature,
      active: admin.active !== false,
      departmentId: admin.departmentId,
      departmentName: admin.departmentName,
      lastLogin: admin.lastLogin
    };

    // Clear password since we don't have it for existing admins
    this.adminPassword = '';

    // Generate invite link
    this.generateInviteLink(this.newlyCreatedAdmin);

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

  logout(): void {
    Swal.fire({
      title: 'Logout',
      text: 'Are you sure you want to logout?',
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#6c757d',
      confirmButtonText: 'Yes, logout',
      cancelButtonText: 'Cancel'
    }).then((result: SweetAlertResult) => {
      if (result.isConfirmed) {
        this.authService.logout();
        this.router.navigate(['/login']);
      }
    });
  }
}

