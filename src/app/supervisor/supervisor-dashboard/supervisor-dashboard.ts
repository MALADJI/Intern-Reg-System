import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { InternService, InternResponse } from '../../services/intern.service';
import { LeaveRequestService } from '../../services/leave-request.service';
import { AttendanceService } from '../../services/attendance.service';
import { DepartmentService } from '../../services/department.service';
import { SupervisorService } from '../../services/supervisor.service';
import { ReportService } from '../../services/report.service';
import { DataPreloadService } from '../../services/data-preload.service';
import { LocationService, Location } from '../../services/location.service';
import { ApiService, API_BASE_URL } from '../../services/api.service';
import { SidebarService } from '../../services/sidebar.service';
import { Profile } from '../../profile/profile';
import { LoadingComponent } from '../../shared/components/loading/loading.component';
import { LogHistoryComponent } from '../../shared/components/log-history/log-history.component';
import { WebSocketService } from '../../services/websocket.service';
import { ProfileTabService } from '../../services/profile-tab.service';
import { Subscription, forkJoin, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import Swal from 'sweetalert2';
import type { SweetAlertResult } from 'sweetalert2';
import { saveAs } from 'file-saver';


declare var bootstrap: any;
declare var L: any;

interface LeaveRequest {
  id: number;
  type: string;
  startDate: string;
  endDate: string;
  status: string;
  attachment?: string;
  supervisorEmail?: string;
  email?: string;
  name?: string;
  reason?: string; // Intern's reason when submitted, supervisor's decline message when rejected
  department?: string;
  field?: string;
  document?: string;
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
  department: string;
  departmentId?: number;
  field: string;
  status: 'Present' | 'Absent' | 'On Leave' | 'Not Signed Out';
  signature?: string;
  active?: boolean;
}



@Component({
  selector: 'app-supervisor-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, Profile, LoadingComponent, LogHistoryComponent],
  templateUrl: './supervisor-dashboard.html',
  styleUrls: ['./supervisor-dashboard.css']
})
export class SupervisorDashboard implements OnInit, OnDestroy {
  private subscriptions = new Subscription();
  isLoading: boolean = true;
  isSidebarExpanded: boolean = true;
  currentTime: string = '';
  currentDate: string = '';
  private clockTimer: any;
  private leaveRequestCheckInterval: any;

  constructor(
    private authService: AuthService,
    private router: Router,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef,
    private internService: InternService,
    private leaveRequestService: LeaveRequestService,
    private attendanceService: AttendanceService,
    private departmentService: DepartmentService,
    private supervisorService: SupervisorService,
    private reportService: ReportService,
    private dataPreloadService: DataPreloadService,
    private locationService: LocationService,
    private api: ApiService,
    private sidebarService: SidebarService,
    private webSocketService: WebSocketService,
    private profileTabService: ProfileTabService
  ) {
    // Don't call updateSummaries here as supervisor data isn't loaded yet
  }




  ngOnInit(): void {
    // Check authentication
    if (!this.authService.isLoggedIn()) {
      this.router.navigate(['/login']);
      return;
    }

    // Subscribe to query params to handle section navigation (e.g. from Navbar brand link)
    this.subscriptions.add(
      this.route.queryParams.subscribe(params => {
        if (params['section']) {
          const section = params['section'];
          // Validate section is valid for supervisor (checking against sections array or type)
          if (['overview', 'interns', 'leave-requests', 'attendance', 'reports', 'profile', 'logs'].includes(section)) {
            this.activeSection = section;
          } else if (section === 'overview') {
            this.activeSection = 'overview';
          }
        }
      })
    );

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

    const currentUser = this.authService.getCurrentUserSync();
    const supervisorEmail = this.authService.getUserEmail();

    // Initialize supervisor with basic info from auth
    if (currentUser) {
      this.supervisor = {
        name: this.authService.getUserName(),
        email: supervisorEmail,
        role: currentUser.role || 'Supervisor',
        Department: currentUser.department || '',
        field: currentUser.field || ''
      };
    } else {
      this.supervisor = {
        name: 'Unknown Supervisor',
        email: 'unidentified@univen.ac.za',
        role: 'Supervisor',
        Department: '',
        field: ''
      };
    }

    // Load supervisor data from backend to get department and field
    this.loadSupervisorData();

    // Initialize current date
    this.updateCurrentDate();

    // Load seen leave request IDs from localStorage
    this.loadSeenLeaveRequests();

    // Load interns first, then leave requests and attendance (which depend on intern IDs)
    // Add small delay to ensure token is stored before making API calls
    // Load interns first (dependent data will be loaded in the success callback)
    // Add small delay to ensure token is stored before making API calls
    setTimeout(() => {
      this.loadInterns();
      this.subscribeToRealTimeUpdates();
    }, 100);

    // Subscribe to sidebar state
    this.subscriptions.add(
      this.sidebarService.isSidebarExpanded$.subscribe(expanded => {
        this.isSidebarExpanded = expanded;
        this.cdr.detectChanges();
      })
    );

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
    // Subscribe to leave request updates via dataPreloadService
    this.subscriptions.add(
      this.dataPreloadService.getUpdateObservable('leaveRequests').subscribe(updatedRequests => {
        if (updatedRequests && Array.isArray(updatedRequests)) {
          this.leaveRequests = updatedRequests;
          // Filter by supervisor's interns
          const supervisorId = this.authService.getCurrentUserSync()?.id;
          if (supervisorId) {
            const internIds = this.interns.map(i => i.id || (i as any).internId).filter(id => id);
            this.leaveRequests = updatedRequests.filter((lr: any) =>
              internIds.includes(lr.internId || lr.intern?.id || lr.intern?.internId)
            );
          }
          // Reload interns to update status (e.g. 'On Leave')
          this.loadInterns();

          this.updateSummaries();
          this.updateFilteredLeaveRequests();
          this.checkForNewLeaveRequests();
          this.cdr.detectChanges();
          console.log('🔄 Leave requests updated in real-time');
        }
      })
    );

    // Subscribe to intern updates via dataPreloadService
    this.subscriptions.add(
      this.dataPreloadService.getUpdateObservable('interns').subscribe(updatedInterns => {
        if (updatedInterns && Array.isArray(updatedInterns)) {
          // Filter interns for this supervisor
          const supervisorId = this.authService.getCurrentUserSync()?.id;
          if (supervisorId) {
            this.interns = updatedInterns.filter((intern: any) =>
              intern.supervisorId === supervisorId || intern.supervisor?.id === supervisorId
            );
          } else {
            this.interns = updatedInterns;
          }
          this.updateSummaries();
          this.cdr.detectChanges();
          console.log('🔄 Interns updated in real-time');
        }
      })
    );

    // Subscribe to attendance updates via dataPreloadService
    this.subscriptions.add(
      this.dataPreloadService.getUpdateObservable('attendance').subscribe(updatedAttendance => {
        if (updatedAttendance) {
          console.log('🔄 Attendance updated in real-time');
          this.loadAttendanceHistory();
          // Reload interns to update status (e.g. 'Present', 'Absent')
          this.loadInterns();
        }
      })
    );

    // Direct WebSocket subscriptions for immediate real-time updates
    this.subscriptions.add(
      this.webSocketService.leaveRequestUpdates$.subscribe(message => {
        console.log('📨 WebSocket leave request update:', message.type);
        // Reload leave requests immediately on any change
        this.loadLeaveRequests();
        this.checkForNewLeaveRequests();
      })
    );

    this.subscriptions.add(
      this.webSocketService.internUpdates$.subscribe(message => {
        console.log('📨 WebSocket intern update:', message.type);
        // Reload interns immediately on any change
        this.loadInterns();
      })
    );

    this.subscriptions.add(
      this.webSocketService.attendanceUpdates$.subscribe(message => {
        console.log('📨 WebSocket attendance update:', message.type);
        // Reload attendance and interns immediately
        this.loadAttendanceHistory();
        this.loadInterns();
      })
    );
  }

  ngOnDestroy(): void {
    // Clear intervals when component is destroyed
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
   * Load supervisor data from backend to get department and field
   */
  loadSupervisorData(): void {
    const supervisorEmail = this.authService.getUserEmail();
    if (!supervisorEmail) {
      console.warn('Supervisor email not found');
      return;
    }

    // Get supervisor by email from backend
    this.supervisorService.getAllSupervisors().subscribe({
      next: (supervisors: any[]) => {
        // Find the supervisor with matching email
        const supervisorData = supervisors.find((s: any) =>
          (s.email || '').toLowerCase() === supervisorEmail.toLowerCase()
        );

        if (supervisorData) {
          // Extract department name
          let departmentName = '';
          if (typeof supervisorData.department === 'string') {
            departmentName = supervisorData.department;
          } else if (supervisorData.department && typeof supervisorData.department === 'object') {
            departmentName = supervisorData.department.name || supervisorData.department.departmentName || '';
          }

          // Extract field name
          let fieldName = '';
          if (typeof supervisorData.field === 'string') {
            fieldName = supervisorData.field;
          } else if (supervisorData.field && typeof supervisorData.field === 'object') {
            fieldName = supervisorData.field.name || '';
          }

          // Update supervisor object with backend data
          this.supervisor.Department = departmentName || this.supervisor.Department;
          this.supervisor.field = fieldName || this.supervisor.field;

          console.log('Supervisor data loaded:', {
            name: this.supervisor.name,
            department: this.supervisor.Department,
            field: this.supervisor.field
          });

          this.cdr.detectChanges();
        } else {
          console.warn('Supervisor not found in backend for email:', supervisorEmail);
        }
      },
      error: (error) => {
        console.error('Error loading supervisor data:', error);
        // Continue with default values if API call fails
      }
    });
  }

  public toggleSidebar(): void {
    if (this.sidebarService) {
      this.sidebarService.toggleSidebar();
    }
  }

  // ===== Navigation =====
  activeSection: 'overview' | 'interns' | 'Intern Leave status' | 'history' | 'reports' | 'Locations' | 'profile' | 'logs' = 'overview';

  showSection(section: string) {
    const validSections: Array<'overview' | 'interns' | 'Intern Leave status' | 'history' | 'reports' | 'Locations' | 'profile' | 'logs'> = [
      'overview', 'interns', 'Intern Leave status', 'history', 'reports', 'Locations', 'profile', 'logs'
    ];
    if (validSections.includes(section as any)) {
      this.activeSection = section as
        | 'overview'
        | 'interns'
        | 'Intern Leave status'
        | 'history'
        | 'reports'
        | 'Locations'
        | 'profile'
        | 'logs';

      // Mark leave requests as seen when viewing leave status section
      if (section === 'Intern Leave status') {
        this.markLeaveRequestsAsSeen();
      }

      // Initialize map when navigating to Locations section
      if (section === 'Locations') {
        // Load locations from backend first
        this.locationService.getAllLocations().subscribe({
          next: (locs: Location[]) => {
            this.locations = locs.map((l: any) => ({
              id: l.locationId || l.id,
              locationId: l.locationId || l.id,
              name: l.name,
              latitude: l.latitude,
              longitude: l.longitude,
              radius: l.radius,
              description: l.description,
              active: l.active
            }));
            this.cdr.detectChanges();
          },
          error: (err: any) => console.error('Error loading locations:', err)
        });
        // Init map after a short delay to allow DOM to render
        setTimeout(() => this.initMap(), 300);
      }
    }
  }

  // Helper method to check if a section is active (avoids TypeScript type narrowing issues)
  isSectionActive(section: string): boolean {
    return this.activeSection === section;
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
    }).then((result) => {
      if (result.isConfirmed) {
        this.authService.logout();
        this.router.navigate(['/login']);
      }
    });
  }

  // Navigation items with icons
  navigationItems = [
    { id: 'overview', label: 'Dashboard', icon: 'bi bi-grid-3x3-gap' },
    { id: 'interns', label: 'Interns', icon: 'bi bi-people-fill' },
    { id: 'Intern Leave status', label: 'Leave Status', icon: 'bi bi-calendar-check' },
    { id: 'history', label: 'History', icon: 'bi bi-clock-history' },
    { id: 'reports', label: 'Reports', icon: 'bi bi-file-earmark-text' },
    { id: 'logs', label: 'Log History', icon: 'bi bi-journal-text' },
    { id: 'Locations', label: 'Locations', icon: 'bi bi-geo-alt-fill' }
  ];

  // ===== Supervisor Info =====
  supervisor = {
    name: '',
    email: '',
    role: '',
    Department: '',
    field: ''

  };

  isProfileActive: boolean = false;

  // ===== Intern List =====
  interns: Intern[] = [];
  internSignatures: { [id: number]: string } = {};

  // ===== Intern Management =====
  currentIntern: any = {};
  isEditing = false;
  editIndex: number = -1;

  openEditModal(intern: any) {
    const index = this.interns.findIndex(i => i === intern);
    if (index !== -1) {
      this.isEditing = true;
      this.editIndex = index;
      this.currentIntern = { ...this.interns[index] };

      // Wait for next tick to ensure DOM is ready
      setTimeout(() => {
        const modalEl = document.getElementById('internModal');
        if (modalEl) {
          // Check if Bootstrap is available
          if (typeof bootstrap !== 'undefined' && bootstrap.Modal) {
            // Dispose existing modal instance if any
            const existingModal = bootstrap.Modal.getInstance(modalEl);
            if (existingModal) {
              existingModal.dispose();
            }
            // Create and show new modal
            const modal = new bootstrap.Modal(modalEl, {
              backdrop: true,
              keyboard: true
            });
            modal.show();
          } else {
            // Fallback: use data attributes if Bootstrap JS is not loaded
            modalEl.setAttribute('data-bs-toggle', 'modal');
            modalEl.setAttribute('data-bs-target', '#internModal');
            modalEl.classList.add('show');
            modalEl.style.display = 'block';
            document.body.classList.add('modal-open');
            const backdrop = document.createElement('div');
            backdrop.className = 'modal-backdrop fade show';
            backdrop.id = 'internModalBackdrop';
            document.body.appendChild(backdrop);
          }
        } else {
          console.error('Intern modal element not found');
          Swal.fire({
            icon: 'error',
            title: 'Error',
            text: 'Could not open edit modal. Please refresh the page and try again.'
          });
        }
      }, 0);
    }
  }

  saveIntern() {
    if (this.isEditing && this.editIndex > -1 && this.currentIntern.id) {
      // Update intern via backend
      const updateData: any = {
        field: this.currentIntern.field
      };

      if (this.currentIntern.supervisorId) {
        updateData.supervisorId = this.currentIntern.supervisorId;
      }

      this.internService.updateIntern(this.currentIntern.id, updateData).subscribe({
        next: (updatedIntern) => {
          // Update local intern
          this.interns[this.editIndex] = {
            ...this.currentIntern,
            name: updatedIntern.name,
            email: updatedIntern.email,
            department: updatedIntern.departmentName,
            field: updatedIntern.field || this.currentIntern.field,
            status: this.mapStatus(updatedIntern.status)
          };
          this.updateSummaries();
          this.cdr.detectChanges();

          Swal.fire({
            icon: 'success',
            title: 'Updated!',
            text: `Intern "${updatedIntern.name}" has been updated successfully.`,
            timer: 2000,
            showConfirmButton: false
          });
        },
        error: (error) => {
          Swal.fire({
            icon: 'error',
            title: 'Error',
            text: error.message || 'Failed to update intern.'
          });
        }
      });
    }

    // Close modal
    setTimeout(() => {
      const modalEl = document.getElementById('internModal');
      if (modalEl) {
        if (typeof bootstrap !== 'undefined' && bootstrap.Modal) {
          const modal = bootstrap.Modal.getInstance(modalEl);
          if (modal) {
            modal.hide();
          }
        } else {
          // Fallback: manually hide modal
          modalEl.classList.remove('show');
          modalEl.style.display = 'none';
          document.body.classList.remove('modal-open');
          const backdrop = document.getElementById('internModalBackdrop');
          if (backdrop) {
            backdrop.remove();
          }
        }
      }
    }, 100);
  }

  activateIntern(intern: any) {
    if (!intern.id) return;

    Swal.fire({
      title: 'Activate Intern?',
      text: `Are you sure you want to activate ${intern.name}?`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Yes, Activate',
      cancelButtonText: 'Cancel'
    }).then((result) => {
      if (result.isConfirmed) {
        this.internService.activateIntern(intern.id).subscribe({
          next: () => {
            // Update local state
            const index = this.interns.findIndex(i => i.id === intern.id);
            if (index !== -1) {
              this.interns[index].active = true;
              this.interns[index].status = 'Present'; // Reset to default active status
              this.updateSummaries();
              this.cdr.detectChanges();
            }
            Swal.fire('Activated!', `${intern.name} has been activated.`, 'success');
          },
          error: (err) => {
            console.error('Error activating intern:', err);
            Swal.fire('Error', 'Failed to activate intern.', 'error');
          }
        });
      }
    });
  }


  deactivateIntern(intern: any) {
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
            const updatedIntern: any = {
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

  // ===== Intern Filters =====
  internFilterName: string = '';
  internFilterDepartment: string = '';
  internFilterField: string = '';
  internFilterStatus: string = '';
  filteredInternFields: string[] = [];

  // ===== Intern Pagination =====
  internCurrentPage: number = 1;
  internItemsPerPage: number = 25;

  // ===== Filtered Interns Getter =====
  get filteredInterns() {
    let filtered = this.interns;

    // Filter by name
    if (this.internFilterName) {
      filtered = filtered.filter(i =>
        i.name.toLowerCase().includes(this.internFilterName.toLowerCase()) ||
        i.email.toLowerCase().includes(this.internFilterName.toLowerCase())
      );
    }

    // Filter by department
    if (this.internFilterDepartment) {
      filtered = filtered.filter(i =>
        i.department && i.department.toLowerCase() === this.internFilterDepartment.toLowerCase()
      );
    }

    // Filter by field
    if (this.internFilterField) {
      filtered = filtered.filter(i =>
        i.field && i.field.toLowerCase() === this.internFilterField.toLowerCase()
      );
    }

    // Filter by status
    if (this.internFilterStatus) {
      filtered = filtered.filter(i => i.status === this.internFilterStatus);
    }

    return filtered;
  }

  // ===== Paginated Interns Getter =====
  get paginatedInterns() {
    const start = (this.internCurrentPage - 1) * this.internItemsPerPage;
    return this.filteredInterns.slice(start, start + this.internItemsPerPage);
  }

  get totalInternPages(): number {
    return Math.ceil(this.filteredInterns.length / this.internItemsPerPage) || 1;
  }

  // ===== Pagination Helpers for Interns =====
  prevInternPage() {
    if (this.internCurrentPage > 1) this.internCurrentPage--;
  }

  nextInternPage() {
    if (this.internCurrentPage < this.totalInternPages) this.internCurrentPage++;
  }

  goToInternPage(page: number) {
    if (page > 0 && page <= this.totalInternPages) {
      this.internCurrentPage = page;
    }
  }

  // ===== Update Fields for Intern Field Dropdown =====
  updateInternFields() {
    this.filteredInternFields = this.internFilterDepartment ? this.fieldMap[this.internFilterDepartment] || [] : [];
    this.internFilterField = '';
    this.internCurrentPage = 1; // Reset to first page after filter
  }

  // ===== Reset Intern Filters =====
  resetInternFilters() {
    this.internFilterName = '';
    this.internFilterDepartment = '';
    this.internFilterField = '';
    this.internFilterStatus = '';
    this.filteredInternFields = [];
    this.internCurrentPage = 1;
  }

  // ===== Get Intern Page Numbers =====
  getInternPageNumbers(): number[] {
    const total = this.totalInternPages;
    const current = this.internCurrentPage;
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

  // ===== Leave Requests =====
  leaveRequests: LeaveRequest[] = [];
  filteredLeaveRequests: LeaveRequest[] = [];

  clearedLeaveRequests: any[] = [];

  // Track seen leave request IDs
  seenLeaveRequestIds: Set<number> = new Set();

  // New leave requests count
  newLeaveRequestsCount: number = 0;

  // Track if alert has been shown this session
  alertShownThisSession: boolean = false;


  // ===== Update Filtered Leave Requests =====
  updateFilteredLeaveRequests(): void {
    // Check if leaveRequests is empty or undefined
    if (!this.leaveRequests || this.leaveRequests.length === 0) {
      this.filteredLeaveRequests = [];
      return;
    }

    const filtered = this.leaveRequests.filter((r) => {
      // If name filter is set, check if it matches
      if (this.leaveFilterName && r.name && !r.name.toLowerCase().includes(this.leaveFilterName.toLowerCase())) {
        return false;
      }
      // If department filter is set, check if it matches (case-insensitive)
      if (this.leaveFilterDepartment && r.department && r.department.toLowerCase() !== this.leaveFilterDepartment.toLowerCase()) {
        return false;
      }
      // If field filter is set, check if it matches (case-insensitive)
      if (this.leaveFilterField && r.field && r.field.toLowerCase() !== this.leaveFilterField.toLowerCase()) {
        return false;
      }
      return true;
    });

    this.filteredLeaveRequests = filtered;
  }

  // ===== Paginated Leave Requests Getter =====
  get paginatedLeaveRequests() {
    const filtered = this.filteredLeaveRequests;
    const start = (this.leaveCurrentPage - 1) * this.leaveItemsPerPage;
    const paginated = filtered.slice(start, start + this.leaveItemsPerPage);

    // Reset to page 1 if current page is beyond available pages
    if (this.leaveCurrentPage > 1 && paginated.length === 0 && filtered.length > 0) {
      this.leaveCurrentPage = 1;
      return filtered.slice(0, this.leaveItemsPerPage);
    }

    return paginated;
  }

  get totalLeavePages(): number {
    return Math.ceil(this.filteredLeaveRequests.length / this.leaveItemsPerPage) || 1;
  }

  // ===== Pagination Helpers for Leave Status =====
  prevLeavePage() {
    if (this.leaveCurrentPage > 1) this.leaveCurrentPage--;
  }

  nextLeavePage() {
    if (this.leaveCurrentPage < this.totalLeavePages) this.leaveCurrentPage++;
  }

  // ===== Update Fields for Leave Status Field Dropdown =====
  updateLeaveFields() {
    this.filteredLeaveFields = this.leaveFilterDepartment ? this.fieldMap[this.leaveFilterDepartment] || [] : [];
    this.leaveFilterField = '';
    this.leaveCurrentPage = 1; // Reset to first page after filter
  }

  resetLeaveFilters() {
    this.leaveFilterName = '';
    this.leaveFilterDepartment = '';
    this.leaveFilterField = '';
    this.filteredLeaveFields = [];
    this.leaveCurrentPage = 1;
  }

  // Pagination helpers
  getLeavePageNumbers(): number[] {
    const total = this.totalLeavePages;
    const current = this.leaveCurrentPage;
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

  goToLeavePage(page: number) {
    if (page > 0 && page <= this.totalLeavePages) {
      this.leaveCurrentPage = page;
    }
  }

  // Expose Math for template
  Math = Math;

  clearLeaveRequest(index: number) {
    const removed = this.leaveRequests.splice(index, 1)[0];
    this.clearedLeaveRequests.push(removed);
    this.updateSummaries();
  }

  clearLeaveRequestByRequest(request: any) {
    const index = this.leaveRequests.findIndex(r => r === request);
    if (index !== -1) {
      this.clearLeaveRequest(index);
    }
  }

  undoClear() {
    this.leaveRequests.push(...this.clearedLeaveRequests);
    this.clearedLeaveRequests = [];
    this.updateSummaries();
  }

  loadInterns(): void {
    const currentUser = this.authService.getCurrentUserSync();
    if (!currentUser || !currentUser.id) {
      console.warn('⚠️ Cannot load interns: currentUser or currentUser.id is missing');
      return;
    }

    const supervisorDepartment = this.supervisor.Department || currentUser.department || '';
    const supervisorId = currentUser.id;

    console.log('🔍 Loading interns for supervisor:', {
      supervisorId: supervisorId,
      supervisorName: this.supervisor.name,
      supervisorEmail: this.supervisor.email,
      supervisorDepartment: supervisorDepartment
    });

    // Get all interns and filter by supervisor
    this.internService.getAllInterns().subscribe({
      next: (interns: InternResponse[]) => {
        console.log('📋 All interns from backend:', interns.length);
        console.log('📋 Interns data:', interns.map(i => ({
          id: i.id,
          name: i.name,
          email: i.email,
          department: i.departmentName,
          supervisorId: i.supervisorId,
          supervisorName: i.supervisorName,
          field: i.field
        })));

        // Filter interns:
        // 1. Interns assigned to this supervisor (supervisorId matches)
        // 2. OR interns from the same department (regardless of supervisor assignment)
        //    This allows supervisors to see all interns in their department
        const filteredInterns = interns.filter(intern => {
          const isAssignedToSupervisor = intern.supervisorId === supervisorId;
          const isSameDepartment = intern.departmentName &&
            supervisorDepartment &&
            intern.departmentName.toLowerCase().trim() === supervisorDepartment.toLowerCase().trim();

          const shouldInclude = isAssignedToSupervisor || isSameDepartment;

          if (shouldInclude) {
            console.log('✅ Including intern:', {
              name: intern.name,
              email: intern.email,
              reason: isAssignedToSupervisor ? 'Assigned to this supervisor' : 'Same department (Health)',
              department: intern.departmentName,
              field: intern.field,
              supervisorId: intern.supervisorId,
              supervisorName: intern.supervisorName || 'Not assigned'
            });
          } else {
            console.log('❌ Excluding intern:', {
              name: intern.name,
              department: intern.departmentName,
              supervisorDepartment: supervisorDepartment,
              supervisorId: intern.supervisorId,
              currentSupervisorId: supervisorId
            });
          }

          return shouldInclude;
        });

        console.log('✅ Filtered interns count:', filteredInterns.length);

        this.interns = filteredInterns.map(intern => ({
          id: intern.id,
          name: intern.name,
          email: intern.email,
          idNumber: intern.idNumber || undefined,
          startDate: intern.startDate || undefined,
          endDate: intern.endDate || undefined,
          supervisor: intern.supervisorName || this.supervisor.name,
          supervisorId: intern.supervisorId || supervisorId, // Use current supervisor if not assigned
          department: intern.departmentName,
          departmentId: intern.departmentId,
          field: intern.field || '',
          status: this.mapStatus(intern.status),
          active: intern.active !== false
        }));

        console.log('✅ Final interns array:', this.interns.map(i => ({
          name: i.name,
          department: i.department,
          field: i.field,
          supervisorId: i.supervisorId
        })));

        this.cdr.detectChanges();

        // Load dependent data now that interns are available
        this.loadInternSignatures();
        this.loadLeaveRequests();
        this.loadAttendanceHistory();
        this.updateSummaries();

        // Start periodic checking for new leave requests
        this.startPeriodicLeaveRequestCheck();

        // Subscribe to real-time updates now
        this.subscribeToRealTimeUpdates();
      },
      error: (error) => {
        console.error('❌ Error loading interns:', error);
        console.error('❌ Error details:', {
          status: error.status,
          statusText: error.statusText,
          message: error.message,
          error: error.error
        });
        this.interns = [];
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

    // Clear existing signatures before loading new ones
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
        this.cdr.detectChanges();
      },
      error: (err) => console.error('Error in forkJoin signatures:', err)
    });
  }

  // Signature Modal
  selectedSignature: string | null = null;

  viewSignature(signature: string): void {
    this.selectedSignature = signature;
  }

  closeSignatureModal(): void {
    this.selectedSignature = null;
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
   * Load leave requests from backend
   */
  loadLeaveRequests(): void {
    const currentUser = this.authService.getCurrentUserSync();
    if (!currentUser || !currentUser.id) {
      this.leaveRequests = [];
      this.filteredLeaveRequests = [];
      return;
    }

    // Get all leave requests (backend handles filtering for supervisor)
    console.log('🔍 [Supervisor] Requesting leave requests from backend...');
    this.leaveRequestService.getAllLeaveRequests().subscribe({
      next: (requests) => {
        console.log('✅ [Supervisor] Leave requests received from backend:', requests);
        if (requests && requests.length > 0) {
          console.log('   - First request sample:', requests[0]);
        } else {
          console.log('   - No requests returned.');
        }

        // Map backend response to frontend model
        this.leaveRequests = requests
          .map(req => ({
            id: req.id || 0,
            type: this.mapLeaveType(req.leaveType),
            startDate: req.startDate,
            endDate: req.endDate,
            status: req.status === 'APPROVED' ? 'Approved' : req.status === 'PENDING' ? 'Pending' : 'Declined',
            attachment: req.document,
            supervisorEmail: this.supervisor.email,
            email: req.email || '',
            name: req.name || '',
            reason: req.reason,
            department: req.department || '',
            field: req.field || '',
            document: req.document,
            internId: req.internId // Keep track of internId if available
          }))
          .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());

        this.updateFilteredLeaveRequests();
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
        console.error('Error loading leave requests:', error);
        this.leaveRequests = [];
        this.filteredLeaveRequests = [];
        this.cdr.detectChanges();
      }
    });
  }

  reloadLeaveRequests(): void {
    this.loadLeaveRequests();
  }

  /**
   * Map backend leave type to frontend format
   */
  private mapLeaveType(leaveType?: string): string {
    if (!leaveType) return 'Annual Leave';
    const typeMap: { [key: string]: string } = {
      'ANNUAL': 'Annual Leave',
      'SICK': 'Sick Leave',
      'PERSONAL': 'Family Responsibility',
      'EMERGENCY': 'Emergency Leave'
    };
    return typeMap[leaveType] || 'Annual Leave';
  }

  approveRequest(request: any) {
    if (!request.id) {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: 'Leave request ID not found.'
      });
      return;
    }

    Swal.fire({
      title: 'Approve Leave Request?',
      text: `Are you sure you want to approve the leave request from ${request.name}?`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Yes, Approve',
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#28a745',
      cancelButtonColor: '#6c757d'
    }).then((result: SweetAlertResult) => {
      if (result.isConfirmed) {
        this.leaveRequestService.approveLeaveRequest(request.id).subscribe({
          next: (updatedRequest) => {
            // Update local request
            const index = this.leaveRequests.findIndex(r => r.id === request.id);
            if (index !== -1) {
              this.leaveRequests[index].status = 'Approved';
            }

            // Mark as seen when approved
            const requestId = this.getRequestId(request);
            this.seenLeaveRequestIds.add(requestId);
            this.saveSeenLeaveRequests();

            this.updateFilteredLeaveRequests();
            this.updateSummaries();
            this.updateNewLeaveRequestsCount();
            this.cdr.detectChanges();

            Swal.fire({
              icon: 'success',
              title: 'Approved!',
              text: 'The leave request has been approved successfully.',
              timer: 2000,
              showConfirmButton: false
            });
          },
          error: (error) => {
            Swal.fire({
              icon: 'error',
              title: 'Error',
              text: error.message || 'Failed to approve leave request.'
            });
          }
        });
      }
    });
  }

  // Load seen leave request IDs from localStorage
  loadSeenLeaveRequests(): void {
    const seenIds = localStorage.getItem(`seenLeaveRequests_${this.supervisor.email}`);
    if (seenIds) {
      this.seenLeaveRequestIds = new Set(JSON.parse(seenIds));
    }
  }

  // Save seen leave request IDs to localStorage
  saveSeenLeaveRequests(): void {
    localStorage.setItem(`seenLeaveRequests_${this.supervisor.email}`, JSON.stringify(Array.from(this.seenLeaveRequestIds)));
  }

  // Check for new leave requests and show alert
  checkForNewLeaveRequests(forceShow: boolean = false): void {
    // Ensure supervisor email is set
    if (!this.supervisor.email) {
      console.log('[Leave Alert] Supervisor email not set');
      this.newLeaveRequestsCount = 0;
      return;
    }

    // Ensure leave requests are loaded
    if (!this.leaveRequests || this.leaveRequests.length === 0) {
      console.log('[Leave Alert] No leave requests loaded yet, skipping check');
      return;
    }

    console.log('[Leave Alert] Checking for new leave requests...');
    console.log('[Leave Alert] Total leave requests:', this.leaveRequests.length);
    console.log('[Leave Alert] Supervisor email:', this.supervisor.email);

    // Update the count first
    this.updateNewLeaveRequestsCount();

    // Get pending leave requests that belong to this supervisor
    // Since loadLeaveRequests already filters by supervisor's interns, all requests here are relevant
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

  // Test method to manually trigger alert check
  testLeaveAlert(): void {
    console.log('[Leave Alert] Manual test triggered');
    this.alertShownThisSession = false; // Reset to allow testing
    this.checkForNewLeaveRequests(true);
  }

  // Method to clear seen requests (for testing)
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

  // Generate unique ID for a leave request
  getRequestId(request: any): number {
    // Use existing id if available, otherwise generate one
    if (request.id) {
      return request.id;
    }
    // Generate a simple hash from email, name, and startDate
    const str = `${request.email}_${request.name}_${request.startDate || ''}`;
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  // Show alert for new leave requests
  showNewLeaveRequestAlert(newRequests: any[]): void {
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
      // Don't set timer property to auto-close (omitted)
    }).then((result) => {
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

  // Update new leave requests count
  updateNewLeaveRequestsCount(): void {
    if (!this.supervisor.email) {
      this.newLeaveRequestsCount = 0;
      return;
    }

    const pendingRequests = this.leaveRequests.filter(req => {
      return req.status === 'Pending' &&
        (req.supervisorEmail === this.supervisor.email || !req.supervisorEmail);
    });

    const newRequests = pendingRequests.filter(req => {
      const requestId = this.getRequestId(req);
      return !this.seenLeaveRequestIds.has(requestId);
    });

    this.newLeaveRequestsCount = newRequests.length;
  }

  // Mark leave requests as seen when viewing the leave status section
  markLeaveRequestsAsSeen(): void {
    const pendingRequests = this.leaveRequests.filter(req => {
      return req.status === 'Pending' &&
        (req.supervisorEmail === this.supervisor.email || !req.supervisorEmail);
    });
    pendingRequests.forEach(req => {
      const requestId = this.getRequestId(req);
      this.seenLeaveRequestIds.add(requestId);
    });
    this.saveSeenLeaveRequests();
    this.updateNewLeaveRequestsCount();
  }


  declineRequest(request: any): void {
    if (!request.id) {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: 'Leave request ID not found.'
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
      preConfirm: (reason: string) => {
        if (!reason || !reason.trim()) {
          Swal.showValidationMessage('A reason is required to decline the request.');
          return false;
        }
        return reason;
      }
    }).then((result: SweetAlertResult) => {
      if (result.isConfirmed && result.value) {
        const reason = result.value.trim();

        this.leaveRequestService.rejectLeaveRequest(request.id, reason).subscribe({
          next: (updatedRequest) => {
            // Update local request
            const index = this.leaveRequests.findIndex(r => r.id === request.id);
            if (index !== -1) {
              this.leaveRequests[index].status = 'Declined';
              this.leaveRequests[index].reason = reason;
            }

            // Mark as seen when declined
            const requestId = this.getRequestId(request);
            this.seenLeaveRequestIds.add(requestId);
            this.saveSeenLeaveRequests();

            this.updateFilteredLeaveRequests();
            this.updateSummaries();
            this.updateNewLeaveRequestsCount();
            this.cdr.detectChanges();

            Swal.fire({
              icon: 'success',
              title: 'Leave Declined',
              text: 'The leave request was declined successfully.',
              timer: 2500,
              showConfirmButton: false
            });
          },
          error: (error) => {
            Swal.fire({
              icon: 'error',
              title: 'Error',
              text: error.message || 'Failed to decline leave request.'
            });
          }
        });
      }
    });
  }



  // ===== Overview Stats =====
  overviewStats = [
    { label: 'Total Interns', value: 0, icon: 'bi bi-people-fill', color: 'primary' },
    { label: 'Present Today', value: 0, icon: 'bi bi-person-check-fill', color: 'success' },
    { label: 'On Leave', value: 0, icon: 'bi bi-calendar-event', color: 'warning' },
    { label: 'Absent', value: 0, icon: 'bi bi-person-x-fill', color: 'danger' }
  ];

  // Calculate overview attendance from backend data
  get overviewAttendance() {
    return this.interns.map(intern => {
      // Get attendance records for this intern
      const internAttendance = this.logs.filter(log => log.intern === intern.name);
      const present = internAttendance.filter(log => log.action === 'Signed In').length;
      const absent = internAttendance.filter(log => log.action === 'Absent').length;
      const leave = internAttendance.filter(log => log.action === 'On Leave').length;

      // Calculate attendance rate
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
        attendanceRate
      };
    });
  }

  // Get recent leave requests from backend data
  get overviewLeaves() {
    return this.leaveRequests
      .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime())
      .slice(0, 5) // Show 5 most recent
      .map(req => ({
        name: req.name || '',
        department: req.department || '',
        field: req.field || '',
        startDate: req.startDate,
        endDate: req.endDate,
        reason: req.reason || '',
        status: req.status
      }));
  }

  lastUpdated = new Date();

  // ===== Overview Modal =====
  selectedStat: any = null;

  // Filters for On Leave (Modal)
  filterName: string = '';
  filterDepartment: string = '';
  filterField: string = '';
  filteredFields: string[] = [];

  // Pagination for On Leave (Modal)
  currentPage: number = 1;
  pageSize: number = 5;

  // Filters for Leave Status Section
  leaveFilterName: string = '';
  leaveFilterDepartment: string = '';
  leaveFilterField: string = '';
  filteredLeaveFields: string[] = [];

  // Pagination for Leave Status Section
  leaveCurrentPage: number = 1;
  leaveItemsPerPage: number = 25;

  get filteredLeaves() {
    let leaves = this.interns.filter(i => i.status === 'On Leave');

    if (this.filterName) {
      leaves = leaves.filter(i => i.name.toLowerCase().includes(this.filterName.toLowerCase()));
    }
    if (this.filterDepartment) {
      leaves = leaves.filter(i => i.department === this.filterDepartment);
    }
    if (this.filterField) {
      leaves = leaves.filter(i => i.field === this.filterField);
    }
    return leaves;
  }

  // Filtered leave requests for modal (based on leaveRequests array)
  get filteredModalLeaveRequests() {
    let requests = this.leaveRequests;

    if (this.filterName) {
      requests = requests.filter(r => r.name && r.name.toLowerCase().includes(this.filterName.toLowerCase()));
    }
    if (this.filterDepartment) {
      requests = requests.filter(r => r.department === this.filterDepartment);
    }
    if (this.filterField) {
      requests = requests.filter(r => r.field === this.filterField);
    }
    return requests;
  }

  get paginatedLeaves() {
    const start = (this.currentPage - 1) * this.pageSize;
    return this.filteredLeaves.slice(start, start + this.pageSize);
  }

  // Paginated leave requests for modal
  get paginatedModalLeaveRequests() {
    const start = (this.currentPage - 1) * this.pageSize;
    return this.filteredModalLeaveRequests.slice(start, start + this.pageSize);
  }

  get totalPages() {
    return Math.ceil(this.filteredLeaves.length / this.pageSize) || 1;
  }

  // Total pages for leave requests modal
  get totalModalLeaveRequestPages() {
    return Math.ceil(this.filteredModalLeaveRequests.length / this.pageSize) || 1;
  }

  prevPage() {
    if (this.currentPage > 1) this.currentPage--;
  }

  nextPage() {
    // Use totalModalLeaveRequestPages for modal pagination (since modal shows leaveRequests)
    const maxPages = this.totalModalLeaveRequestPages;
    if (this.currentPage < maxPages) this.currentPage++;
  }

  // Filters for Absent Attendance
  attendanceFilterName: string = '';
  attendanceFilterDepartment: string = '';
  attendanceFilterField: string = '';
  filteredAttendanceFields: string[] = [];
  attendancePage: number = 1;
  attendancePageSize: number = 5;

  get filteredAttendance() {
    let data = this.interns.filter(i => i.status === 'Absent');

    if (this.attendanceFilterName) data = data.filter(i => i.name.toLowerCase().includes(this.attendanceFilterName.toLowerCase()));
    if (this.attendanceFilterDepartment) data = data.filter(i => i.department === this.attendanceFilterDepartment);
    if (this.attendanceFilterField) data = data.filter(i => i.field === this.attendanceFilterField);

    return data;
  }

  get paginatedAttendance() {
    const start = (this.attendancePage - 1) * this.attendancePageSize;
    return this.filteredAttendance.slice(start, start + this.attendancePageSize);
  }

  get totalAttendancePages() {
    return Math.ceil(this.filteredAttendance.length / this.attendancePageSize) || 1;
  }

  prevAttendancePage() { if (this.attendancePage > 1) this.attendancePage--; }
  nextAttendancePage() { if (this.attendancePage < this.totalAttendancePages) this.attendancePage++; }

  // Filters for Present Today
  presentFilterName: string = '';
  presentFilterDepartment: string = '';
  presentFilterField: string = '';
  filteredPresentFields: string[] = [];
  presentPage: number = 1;
  presentPageSize: number = 5;

  get filteredPresentInterns() {
    let data = this.interns.filter(i => i.status === 'Present');

    if (this.presentFilterName) data = data.filter(i => i.name.toLowerCase().includes(this.presentFilterName.toLowerCase()));
    if (this.presentFilterDepartment) data = data.filter(i => i.department === this.presentFilterDepartment);
    if (this.presentFilterField) data = data.filter(i => i.field === this.presentFilterField);

    return data;
  }

  get paginatedPresentInterns() {
    const start = (this.presentPage - 1) * this.presentPageSize;
    return this.filteredPresentInterns.slice(start, start + this.presentPageSize);
  }

  get totalPresentPages() {
    return Math.ceil(this.filteredPresentInterns.length / this.presentPageSize) || 1;
  }

  prevPresentPage() { if (this.presentPage > 1) this.presentPage--; }
  nextPresentPage() { if (this.presentPage < this.totalPresentPages) this.presentPage++; }


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

  handleStatCardClick(stat: any) {
    // If "Total Interns" card is clicked, navigate to interns section
    if (stat.label === 'Total Interns') {
      this.showSection('interns');
    } else {
      // For other cards, open the modal
      this.openModal(stat);
    }
  }

  openModal(stat: any) {
    this.selectedStat = stat;

    // Reset pagination & filters when opening modal
    this.currentPage = 1;
    this.attendancePage = 1;
    this.presentPage = 1;
    this.filterName = '';
    this.filterDepartment = '';
    this.filterField = '';
    this.attendanceFilterName = '';
    this.attendanceFilterDepartment = '';
    this.attendanceFilterField = '';
    this.presentFilterName = '';
    this.presentFilterDepartment = '';
    this.presentFilterField = '';
    this.filteredFields = [];
    this.filteredAttendanceFields = [];
    this.filteredPresentFields = [];

    const modalEl = document.getElementById('supervisorModal');
    const modal = new bootstrap.Modal(modalEl);
    modal.show();
  }

  // ===== Attendance History =====
  logs: Array<{
    intern: string;
    signature?: string;
    date: Date | string;
    location?: string;
    timeIn?: Date | null;
    timeOut?: Date | null;
    action?: string;
  }> = [];

  /**
   * Load attendance history for supervisor's interns
   */
  loadAttendanceHistory(): void {
    const supervisorInternIds = this.interns.map(i => i.id).filter(id => id !== undefined) as number[];

    if (supervisorInternIds.length === 0) {
      this.logs = [];
      this.filteredLogs = [];
      return;
    }

    // Load attendance for all supervisor's interns
    const attendanceObservables = supervisorInternIds.map(internId =>
      this.attendanceService.getAttendanceByIntern(internId)
    );

    forkJoin(attendanceObservables).subscribe({
      next: (results) => {
        this.logs = results
          .flat()
          .map(record => ({
            intern: record.internName || '',
            signature: record.signature,
            date: new Date(record.date),
            location: record.location,
            timeIn: record.timeIn ? new Date(record.timeIn) : null,
            timeOut: record.timeOut ? new Date(record.timeOut) : null,
            action: record.status === 'PRESENT' ? 'Signed In' : record.status === 'ABSENT' ? 'Absent' : 'On Leave'
          }))
          .sort((a, b) => {
            const dateA = new Date(a.date).getTime();
            const dateB = new Date(b.date).getTime();
            return dateB - dateA;
          });

        this.filteredLogs = [...this.logs];
        this.updateSummaries(); // Update summaries when attendance is loaded
        this.cdr.detectChanges();
      },
      error: (error) => {
        console.error('Error loading attendance history:', error);
        this.logs = [];
        this.filteredLogs = [];
      }
    });
  }

  filteredLogs: any[] = [];
  historyFilterMonday: string = '';
  historyFilterFriday: string = '';
  historyFilterName: string = '';
  historyFilterDepartment: string = '';
  historyFilterField: string = '';
  weekendSelected: boolean = false;

  // Pagination for History Section
  historyCurrentPage: number = 1;
  historyItemsPerPage: number = 10;

  //updateAttendanceFields() and updatePresentFields() errors
  updateAttendanceFields() {
    if (this.attendanceFilterDepartment && this.fieldMap[this.attendanceFilterDepartment]) {
      this.filteredAttendanceFields = this.fieldMap[this.attendanceFilterDepartment];
    } else {
      this.filteredAttendanceFields = [];
    }
    this.attendanceFilterField = '';
  }

  updatePresentFields() {
    if (this.presentFilterDepartment && this.fieldMap[this.presentFilterDepartment]) {
      this.filteredPresentFields = this.fieldMap[this.presentFilterDepartment];
    } else {
      this.filteredPresentFields = [];
    }
    this.presentFilterField = '';
  }


  // ===== Departments & Fields =====
  get departmentList(): string[] {
    return this.departmentService.departmentList;
  }

  get fieldMap(): { [dept: string]: string[] } {
    return this.departmentService.fieldMap;
  }

  get fieldList(): string[] {
    return Object.values(this.fieldMap).flat();
  }
  filteredFieldsForHistory: string[] = [];
  filteredFieldsForReport: string[] = [];

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
              signature: 'assets/signatures/placeholder.png',
              date: new Date(date),
              location: '-',
              timeIn: null,
              timeOut: null,
              action: 'Absent'
            }
        );
      }
    }

    return result;
  }

  resetHistoryFilter() {
    this.historyFilterMonday = '';
    this.historyFilterFriday = '';
    this.historyFilterName = '';
    this.historyFilterDepartment = '';
    this.historyFilterField = '';
    this.weekendSelected = false;
    this.filteredLogs = [];
    this.historyCurrentPage = 1;
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
    } else {
      this.filteredLogs = [];
      this.weekendSelected = false;
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

  // Paginated interns for history section
  get paginatedInternsForWeek() {
    const start = (this.historyCurrentPage - 1) * this.historyItemsPerPage;
    return this.internsForWeek.slice(start, start + this.historyItemsPerPage);
  }

  get totalHistoryPages(): number {
    return Math.ceil(this.internsForWeek.length / this.historyItemsPerPage) || 1;
  }

  // Pagination helpers for History
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

  // ===== Reports with Date Filter =====
  reportInternName: string = '';
  reportDepartment: string = '';
  reportField: string = '';
  reportFromDate: string = '';
  reportToDate: string = '';

  // Calculate report data from backend attendance records
  get allReportData(): Array<{
    name: string;
    department: string;
    field: string;
    present: number;
    absent: number;
    leave: number;
    attendanceRate: number;
    lastActive?: string;
    signature?: string;
  }> {
    return this.interns.map(intern => {
      // Filter attendance records for this intern within date range if specified
      let internAttendance = this.logs.filter(log => log.intern === intern.name);

      // Apply date filter if specified
      if (this.reportFromDate || this.reportToDate) {
        internAttendance = internAttendance.filter(log => {
          const logDate = new Date(log.date);
          if (this.reportFromDate && logDate < new Date(this.reportFromDate)) return false;
          if (this.reportToDate && logDate > new Date(this.reportToDate)) return false;
          return true;
        });
      }

      const present = internAttendance.filter(log => log.action === 'Signed In').length;
      const absent = internAttendance.filter(log => log.action === 'Absent').length;
      const leave = internAttendance.filter(log => log.action === 'On Leave').length;

      // Calculate attendance rate
      const total = present + absent + leave;
      const attendanceRate = total > 0 ? Math.round((present / total) * 100) : 0;

      // Get last active date (most recent attendance record)
      const lastActiveRecord = internAttendance
        .filter(log => log.action === 'Signed In')
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
      const lastActive = lastActiveRecord ? new Date(lastActiveRecord.date).toISOString().split('T')[0] : undefined;

      return {
        name: intern.name,
        department: intern.department,
        field: intern.field,
        present,
        absent,
        leave,
        attendanceRate,
        lastActive,
        signature: intern.signature || lastActiveRecord?.signature || undefined
      };
    });
  }

  filteredReportData: any[] = [];
  lastReportGenerated: Date | null = null;

  // Pagination for Reports Section
  reportCurrentPage: number = 1;
  reportItemsPerPage: number = 25;

  generateReport() {
    this.reportCurrentPage = 1; // Reset to first page when generating new report

    // Calculate report data from backend
    let reportData = [...this.allReportData];

    // Apply filters
    this.filteredReportData = reportData.filter((item) => {
      const matchesIntern = !this.reportInternName || item.name.toLowerCase().includes(this.reportInternName.toLowerCase());
      const matchesDept = !this.reportDepartment || item.department === this.reportDepartment;
      const matchesField = !this.reportField || item.field === this.reportField;

      let matchesDate = true;
      if (this.reportFromDate && item.lastActive) {
        matchesDate = matchesDate && new Date(item.lastActive) >= new Date(this.reportFromDate);
      }
      if (this.reportToDate && item.lastActive) {
        matchesDate = matchesDate && new Date(item.lastActive) <= new Date(this.reportToDate);
      }

      return matchesIntern && matchesDept && matchesField && matchesDate;
    });
    this.lastReportGenerated = new Date();
  }

  // Paginated report data
  get paginatedReportData() {
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
    this.reportFromDate = '';
    this.reportToDate = '';
    this.filteredReportData = [];
    this.lastReportGenerated = null;
    this.filteredFieldsForReport = [...this.fieldList];
    this.reportCurrentPage = 1;
  }

  downloadReportPDF() {
    if (this.filteredReportData.length === 0) {
      Swal.fire({
        icon: 'warning',
        title: 'No Data',
        text: 'Please generate a report first before downloading.',
        confirmButtonColor: '#1e3a5f'
      });
      return;
    }

    const filters = {
      internName: this.reportInternName || undefined,
      department: this.reportDepartment || undefined,
      field: this.reportField || undefined,
      fromDate: this.reportFromDate || undefined,
      toDate: this.reportToDate || undefined
    };

    // Show loading
    Swal.fire({
      title: 'Generating PDF...',
      text: 'Please wait while we generate your report.',
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      }
    });

    // Use the Observable method and handle subscription manually for better error handling
    this.reportService.downloadPDFReport(filters).subscribe({
      next: (blob) => {
        Swal.close();
        const fileName = `attendance-report-${new Date().toISOString().split('T')[0]}.pdf`;
        saveAs(blob, fileName);
        Swal.fire({
          icon: 'success',
          title: 'Download Started',
          text: 'Your PDF report is being downloaded.',
          timer: 2000,
          showConfirmButton: false
        });
      },
      error: (error: any) => {
        Swal.close();
        console.error('Error downloading PDF:', error);
        Swal.fire({
          icon: 'error',
          title: 'Download Failed',
          text: error.error?.error || 'Failed to generate PDF report. Please try again.',
          confirmButtonColor: '#dc3545'
        });
      }
    });
  }

  downloadReportExcel() {
    if (this.filteredReportData.length === 0) {
      Swal.fire({
        icon: 'warning',
        title: 'No Data',
        text: 'Please generate a report first before downloading.',
        confirmButtonColor: '#1e3a5f'
      });
      return;
    }

    const filters = {
      internName: this.reportInternName || undefined,
      department: this.reportDepartment || undefined,
      field: this.reportField || undefined,
      fromDate: this.reportFromDate || undefined,
      toDate: this.reportToDate || undefined
    };

    // Show loading
    Swal.fire({
      title: 'Generating Excel...',
      text: 'Please wait while we generate your report.',
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      }
    });

    // Use the Observable method and handle subscription manually for better error handling
    this.reportService.downloadExcelReport(filters).subscribe({
      next: (blob) => {
        Swal.close();
        const fileName = `attendance-report-${new Date().toISOString().split('T')[0]}.xlsx`;
        saveAs(blob, fileName);
        Swal.fire({
          icon: 'success',
          title: 'Download Started',
          text: 'Your Excel report is being downloaded.',
          timer: 2000,
          showConfirmButton: false
        });
      },
      error: (error: any) => {
        Swal.close();
        console.error('Error downloading Excel:', error);
        Swal.fire({
          icon: 'error',
          title: 'Download Failed',
          text: error.error?.error || 'Failed to generate Excel report. Please try again.',
          confirmButtonColor: '#dc3545'
        });
      }
    });
  }

  // ===== Summary helpers =====
  get leaveSummaryStats() {
    const pending = this.leaveRequests.filter((l) => l.status === 'Pending').length;
    const approved = this.leaveRequests.filter((l) => l.status === 'Approved').length;
    const declined = this.leaveRequests.filter((l) => l.status === 'Declined').length;

    return [
      { label: 'Pending', value: pending, icon: 'bi bi-clock-history', color: 'warning' },
      { label: 'Approved', value: approved, icon: 'bi bi-check-circle', color: 'success' },
      { label: 'Declined', value: declined, icon: 'bi bi-x-circle', color: 'danger' }
    ];
  }

  get historySummary() {
    const totalLogs = this.logs.length;
    const signedIn = this.logs.filter((l) => l.action === 'Signed In').length;
    const signedOut = this.logs.filter((l) => l.action === 'Signed Out').length;
    const absentCount = this.filteredLogs.filter((r) => r.action === 'Absent').length;

    return [
      { label: 'Total Records', value: totalLogs, icon: 'bi bi-list-check', color: 'primary' },
      { label: 'Signed In', value: signedIn, icon: 'bi bi-person-check', color: 'success' },
      { label: 'Signed Out', value: signedOut, icon: 'bi bi-person-dash', color: 'secondary' },
      { label: 'Absent (filtered)', value: absentCount, icon: 'bi bi-person-x', color: 'danger' }
    ];
  }

  // ===== Update current date =====
  updateCurrentDate() {
    const now = new Date();
    const options: Intl.DateTimeFormatOptions = {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    };
    this.currentDate = now.toLocaleDateString('en-US', options);
  }

  // ===== Update overview summary =====
  updateSummaries() {
    const total = this.interns.length;
    const present = this.interns.filter(i => i.status === 'Present').length;
    const onLeave = this.interns.filter(i => i.status === 'On Leave').length;
    const absent = this.interns.filter(i => i.status === 'Absent').length;

    this.overviewStats = [
      { label: 'Total Interns', value: total, icon: 'bi bi-people-fill', color: 'primary' },
      { label: 'Present Today', value: present, icon: 'bi bi-person-check-fill', color: 'success' },
      { label: 'On Leave', value: onLeave, icon: 'bi bi-calendar-event', color: 'warning' },
      { label: 'Absent', value: absent, icon: 'bi bi-person-x-fill', color: 'danger' }
    ];
    this.lastUpdated = new Date();
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

    const checkLeaflet = (attempts: number = 0) => {
      if (typeof L !== 'undefined') {
        this.initializeMapInstance(mapElement);
        return;
      }

      if (attempts < 10) {
        setTimeout(() => checkLeaflet(attempts + 1), 200);
      } else {
        console.error('Leaflet library is not loaded.');
        Swal.fire({
          icon: 'error',
          title: 'Map Library Not Available',
          text: 'Please check your internet connection and try refreshing the page.',
          confirmButtonText: 'OK',
          confirmButtonColor: '#1e3a5f'
        });
      }
    };

    checkLeaflet();
  }

  initializeMapInstance(mapElement: HTMLElement) {
    if (this.map) return;
    if (typeof L === 'undefined') return;

    try {
      this.map = L.map(mapElement).setView([-22.9756, 30.4414], 16);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '',
        maxZoom: 19
      }).addTo(this.map);

      this.map.on('click', (event: any) => {
        this.onMapClick(event);
      });

      this.isMapReady = true;
      this.loadLocationsOnMap();
    } catch (error) {
      console.error('Error initializing map:', error);
    }
  }

  onMapClick(event: any) {
    this.selectedLat = event.latlng.lat;
    this.selectedLng = event.latlng.lng;

    if (this.interns.length === 0) {
      this.loadInterns();
    }

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
    const locationData = {
      name,
      latitude: this.selectedLat,
      longitude: this.selectedLng,
      radius,
      description: description || undefined
    };

    this.locationService.createLocation(locationData).subscribe({
      next: (savedLocation: Location) => {
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

        if (assignToInternId) {
          const locationId = newLocation.locationId || newLocation.id;
          if (locationId !== undefined) {
            this.assignLocationToIntern(assignToInternId, locationId);
          }
        } else {
          Swal.fire({
            icon: 'success',
            title: 'Location Added!',
            text: `"${name}" has been added successfully.`,
            timer: 2000,
            showConfirmButton: false
          });
        }
        this.cdr.detectChanges();
      },
      error: (error: any) => {
        const errorMessage = error?.error?.message || error?.message || 'Failed to add location.';
        Swal.fire({ icon: 'error', title: 'Error', text: errorMessage });
      }
    });
  }

  assignLocationToIntern(internId: number, locationId: number): void {
    this.internService.assignLocationToIntern(internId, locationId).subscribe({
      next: () => {
        const intern = this.interns.find(i => i.id === internId);
        const location = this.locations.find(l => (l.locationId || l.id) === locationId);
        Swal.fire({
          icon: 'success',
          title: 'Location Assigned!',
          html: `<p><strong>"${location?.name || 'Location'}"</strong> has been assigned to <strong>${intern?.name || 'Intern'}</strong>.</p>`,
          timer: 3000,
          showConfirmButton: false
        });
      },
      error: (error: any) => {
        const errorMessage = error?.error?.message || error?.message || 'Failed to assign location.';
        Swal.fire({ icon: 'error', title: 'Assignment Failed', text: errorMessage });
      }
    });
  }

  refreshMap(): void {
    if (!this.map || !this.isMapReady || typeof L === 'undefined') {
      Swal.fire({ icon: 'warning', title: 'Map Not Ready', text: 'Please wait for the map to finish loading.', timer: 2000, showConfirmButton: false });
      return;
    }
    this.map.invalidateSize();
    this.loadLocationsOnMap();
    Swal.fire({ icon: 'success', title: 'Map Refreshed!', timer: 1500, showConfirmButton: false });
  }

  loadLocationsOnMap() {
    if (!this.map || !this.isMapReady || typeof L === 'undefined') return;

    this.mapMarkers.forEach(marker => {
      if (marker) {
        if (this.map && marker.remove) this.map.removeLayer(marker);
        if ((marker as any).circle && (marker as any).circle.remove) this.map.removeLayer((marker as any).circle);
      }
    });
    this.mapMarkers = [];

    if (this.userLocationMarker) {
      this.map.removeLayer(this.userLocationMarker);
      this.userLocationMarker = null;
    }

    this.locations.forEach(location => {
      const customIcon = L.divIcon({
        className: 'custom-marker',
        html: `<div class="leaflet-custom-marker-icon"></div>`,
        iconSize: [20, 20],
        iconAnchor: [10, 10]
      });

      const marker = L.marker([location.latitude, location.longitude], {
        icon: customIcon,
        title: location.name
      }).addTo(this.map);

      const circle = L.circle([location.latitude, location.longitude], {
        radius: location.radius,
        fillColor: '#1e3a5f',
        fillOpacity: 0.2,
        color: '#1e3a5f',
        weight: 2,
        opacity: 0.5
      }).addTo(this.map);

      const popupContent = `
        <div class="p-2">
          <h6 class="fw-bold mb-1">${location.name}</h6>
          <p class="mb-1 small">${location.description || 'No description'}</p>
          <p class="mb-0 small text-muted">Radius: ${location.radius}m</p>
        </div>
      `;

      marker.bindPopup(popupContent);
      (marker as any).circle = circle;
      marker.on('click', () => marker.openPopup());
      this.mapMarkers.push(marker);
    });

    if (this.locations.length > 0) {
      const boundsPoints: [number, number][] = this.locations.map(loc => [loc.latitude, loc.longitude]);
      const bounds = L.latLngBounds(boundsPoints);
      this.map.fitBounds(bounds, { padding: [20, 20] });
    }
  }

  deleteLocation(location: Location) {
    Swal.fire({
      title: `Delete "${location.name}"?`,
      text: 'This location will be removed permanently.',
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
            Swal.fire({ icon: 'success', title: 'Deleted!', text: `"${location.name}" has been removed.`, timer: 2000, showConfirmButton: false });
          },
          error: (error: any) => {
            const errorMessage = error?.error?.message || error?.message || 'Failed to delete location.';
            Swal.fire({ icon: 'error', title: 'Error', text: errorMessage });
          }
        });
      }
    });
  }

  editLocation(location: Location) {
    if (this.interns.length === 0) this.loadInterns();

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
          </div>
          <div class="mb-3">
            <label for="editLocationDescription" class="form-label fw-semibold">Description</label>
            <textarea id="editLocationDescription" class="form-control" rows="2">${location.description || ''}</textarea>
          </div>
          <div class="mb-3">
            <label for="editAssignToIntern" class="form-label fw-semibold">Assign to Intern (Optional)</label>
            <select id="editAssignToIntern" class="form-select">
              <option value="">No assignment (all interns can use this location)</option>
              ${internOptions}
            </select>
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
        return { name: name.trim(), radius, description: description.trim(), assignToIntern: assignToIntern ? parseInt(assignToIntern) : null };
      }
    }).then((result: SweetAlertResult) => {
      if (result.isConfirmed && result.value && location.id) {
        const locationId = location.locationId || location.id;
        const updateData = { name: result.value.name, radius: result.value.radius, description: result.value.description };

        this.locationService.updateLocation(locationId, updateData).subscribe({
          next: (updatedLocation: Location) => {
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
            this.cdr.detectChanges();

            if (result.value.assignToIntern) {
              this.assignLocationToIntern(result.value.assignToIntern, locationId);
            } else {
              Swal.fire({ icon: 'success', title: 'Location Updated!', timer: 2000, showConfirmButton: false });
            }
          },
          error: (error: any) => {
            const errorMessage = error?.error?.message || error?.message || 'Failed to update location.';
            Swal.fire({ icon: 'error', title: 'Error', text: errorMessage });
          }
        });
      }
    });
  }
}
