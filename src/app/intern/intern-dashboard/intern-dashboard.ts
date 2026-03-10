import { AfterViewInit, Component, ElementRef, ViewChild, ChangeDetectorRef, OnInit, OnDestroy } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import SignaturePad from 'signature_pad';
import { CommonModule, NgIf, NgFor, DatePipe, NgClass, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import Swal from 'sweetalert2';
import { Profile } from '../../profile/profile';
import { LoadingComponent } from '../../shared/components/loading/loading.component';
import { AuthService } from '../../services/auth.service';
import { InternService } from '../../services/intern.service';
import { AttendanceService } from '../../services/attendance.service';
import { LeaveRequestService } from '../../services/leave-request.service';
import { StorageService } from '../../services/storage.service';
import { LocationService, Location } from '../../services/location.service';
import { ApiService } from '../../services/api.service';
import { DataPreloadService } from '../../services/data-preload.service';
import { WebSocketService } from '../../services/websocket.service';
import { SidebarService } from '../../services/sidebar.service';
import { LogHistoryComponent } from '../../shared/components/log-history/log-history.component';
import { ProfileTabService } from '../../services/profile-tab.service';
import { Subscription } from 'rxjs';

// Leaflet type declarations
declare var L: any;

type Section = 'overview' | 'signature' | 'leave' | 'history' | 'profile' | 'logs';

interface LogEntry {
  id?: number; // Attendance record ID from backend
  date: Date;
  timeIn?: Date | null;
  timeOut?: Date | null;
  action: string;
  image: string | null;
  location?: string;
  status?: string;
}

interface LeaveRequest {
  id: number;
  type: string;
  startDate: string;
  endDate: string;
  status: 'Pending' | 'Approved' | 'Declined';
  attachment?: string;
  supervisorEmail?: string;
  email?: string;
  name?: string;

  reason?: string; // Intern's reason when submitted, admin/supervisor's decline message when rejected
}

interface OverviewStat {
  label: string;
  value: string | number;
  icon: string;
  color: string;
  description?: string;
  progress?: number;
  action?: string;
  subtitle?: string;
  trend?: string;
}

// Location interface is now imported from LocationService

@Component({
  selector: 'app-intern-dashboard',
  standalone: true,
  templateUrl: './intern-dashboard.html',
  styleUrls: ['./intern-dashboard.css'],
  imports: [NgIf, NgFor, NgClass, DatePipe, FormsModule, DecimalPipe, Profile, LoadingComponent, LogHistoryComponent]
})
export class InternDashboard implements OnInit, AfterViewInit, OnDestroy {
  private subscriptions = new Subscription();

  // ======== LOADING STATE ========
  isLoading: boolean = true;

  // ======== SIDEBAR ========
  isSidebarExpanded: boolean = true;

  // ======== NAVIGATION ========
  navItems: { key: Section; label: string; icon: string }[] = [
    { key: 'overview', label: 'Overview', icon: 'bi-speedometer2' },
    { key: 'signature', label: 'Signature', icon: 'bi-pencil-square' },
    { key: 'leave', label: 'Leave Request', icon: 'bi-calendar2-check' },
    { key: 'history', label: 'Attendance History', icon: 'bi-clock-history' },
    { key: 'logs', label: 'Log History', icon: 'bi-journal-text' }
  ];
  activeSection: Section = 'overview';

  // ======== OVERVIEW STATISTICS ========
  currentTime: string = '';
  currentDate: string = '';
  private clockTimer: any;
  overviewStats: OverviewStat[] = [];
  recentAttendanceLogs: LogEntry[] = [];
  recentLeaveRequests: LeaveRequest[] = [];

  // ======== SIGNATURE PAD ========
  @ViewChild('signaturePad') signaturePadElement!: ElementRef<HTMLCanvasElement>;
  signaturePad!: SignaturePad;
  savedSignature: string | null = null;
  isPadVisible = false;
  showPlaceholder: boolean = true; // Track if placeholder should be shown
  signatureCheckAnimationFrame: number | null = null; // Track animation frame for cleanup

  // ======== USER & LOCATION ========
  intern = {
    id: 0,
    name: '',
    email: '',
    role: 'Intern',
    Department: '',
    field: '',
    supervisorEmail: '',
    supervisorId: 0,
    assignedLocationId: null as number | null
  };

  // ======== LOCATIONS ========
  locations: Location[] = [];
  currentLocation: { lat: number; lng: number } | null = null;
  nearestLocationName: string = '';
  locationAlertShown: boolean = false;
  locationMap: any = null;
  locationMapMarkers: any[] = [];
  userLocationMarker: any = null;
  isLocationMapReady: boolean = false;
  locationWatchId: number | null = null; // Store watch ID to clear it later

  // ======== ATTENDANCE ========
  logs: LogEntry[] = [];
  filteredLogs: LogEntry[] = [];
  signedInToday = false;
  signedOutToday = false;
  onLeaveToday = false;
  currentAttendanceRecordId: number | null = null; // Track current attendance record ID
  currentAttendanceRecord: LogEntry | null = null; // Track current attendance record
  filterStartDate: string = '';
  filterEndDate: string = '';
  attendanceStatusFilter: string = '';
  attendanceSearchQuery: string = '';
  locationValidated: boolean = false; // Track if location was already validated

  // ======== ALERT VISIBILITY ========
  showLocationRequiredAlert: boolean = true;
  showLocationValidAlert: boolean = true;
  showLocationDetectionAlert: boolean = true;
  alertTimeouts: Map<string, any> = new Map();
  alertFading: Map<string, boolean> = new Map(); // Track if alert is fading out

  // ======== LEAVE REQUEST ========
  leaveType: string = '';
  startDate: string = '';
  endDate: string = '';
  leaveReason: string = '';
  attachment: File | null = null;
  leaveRequests: LeaveRequest[] = [];
  filteredLeaveRequests: LeaveRequest[] = [];
  leaveFilterStatus: string = '';
  leaveSearchQuery: string = '';
  editingLeaveId: number | null = null;
  editLeaveData: {
    leaveType: string;
    fromDate: string;
    toDate: string;
    reason: string;
  } = {
      leaveType: '',
      fromDate: '',
      toDate: '',
      reason: ''
    };

  // ======== REPORT ========
  reportStartDate: string = '';
  reportEndDate: string = '';
  reportLogs: LogEntry[] = [];
  reportIncludeWeekends: boolean = false;
  reportIncludeSignatures: boolean = true;

  // ======== ALERT MESSAGE ========
  message: string = '';

  isProfileActive: boolean = false;

  constructor(
    private cdr: ChangeDetectorRef,
    private router: Router,
    private route: ActivatedRoute,
    private authService: AuthService,
    private internService: InternService,
    private attendanceService: AttendanceService,
    private leaveRequestService: LeaveRequestService,
    private storageService: StorageService,
    private locationService: LocationService,
    private apiService: ApiService,
    private dataPreloadService: DataPreloadService,
    private webSocketService: WebSocketService,
    private sidebarService: SidebarService,
    private profileTabService: ProfileTabService
  ) { }

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
          const section = params['section'] as Section;
          // Validate section
          const validSections: Section[] = ['overview', 'signature', 'leave', 'history', 'profile'];
          if (validSections.includes(section)) {
            this.activeSection = section;
          }
        }
      })
    );

    // Load user info
    const currentUser = this.authService.getCurrentUserSync();
    const internEmail = this.authService.getUserEmail();

    // Initialize intern with basic info from auth
    if (currentUser) {
      this.intern = {
        id: currentUser.id || 0,
        name: this.authService.getUserName(),
        email: internEmail,
        role: 'Intern',
        Department: currentUser.department || '',
        field: currentUser.field || '',
        supervisorEmail: currentUser.supervisorEmail || '',
        supervisorId: currentUser.supervisorId || 0,
        assignedLocationId: null
      };
    }

    // Load intern data from backend to get department and field
    // Attendance logs will be loaded after intern ID is available
    this.loadInternData();

    // ✅ Fetch field from /auth/me endpoint if not already available
    if (!this.intern.field || this.intern.field.trim() === '') {
      this.fetchInternFieldFromDatabase();
    }

    // Subscribe to real-time updates
    setTimeout(() => {
      this.loadLeaveRequests();
      this.subscribeToRealTimeUpdates();
    }, 100);

    // Subscribe to sidebar state
    this.subscriptions.add(
      this.sidebarService.isSidebarExpanded$.subscribe(expanded => {
        this.isSidebarExpanded = expanded;
        this.cdr.detectChanges();
      })
    );

    // Subscribe to profile active state
    this.subscriptions.add(
      this.profileTabService.isProfileActive$.subscribe(active => {
        this.isProfileActive = active;
        this.cdr.detectChanges();
      })
    );

    // Initialize clock
    this.updateClock();
    this.updateClock();
    this.clockTimer = setInterval(() => this.updateClock(), 1000);

    // Disable loading screen after 1.5 seconds or when core data is loaded
    setTimeout(() => {
      this.isLoading = false;
      this.cdr.detectChanges();
    }, 1500);
  }

  private updateClock(): void {
    const now = new Date();
    this.currentTime = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    // Format date: Thursday, 19 December 2025
    this.currentDate = now.toLocaleDateString([], {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
    this.cdr.detectChanges();
  }



  /**
   * Subscribe to real-time updates via WebSocket
   */
  private subscribeToRealTimeUpdates(): void {
    // Subscribe to leave request updates
    this.subscriptions.add(
      this.dataPreloadService.getUpdateObservable('leaveRequests').subscribe(updatedRequests => {
        if (updatedRequests && Array.isArray(updatedRequests)) {
          // Use mapLeaveRequests to ensure consistent data format
          this.leaveRequests = this.mapLeaveRequests(updatedRequests);
          this.filteredLeaveRequests = [...this.leaveRequests];
          this.calculateOverviewStats(); // Recalculate stats when leave changes
          this.loadRecentData(); // Refresh recent data as well
          this.cdr.detectChanges();
          console.log('🔄 Leave requests updated in real-time');
        }
      })
    );

    // Subscribe to attendance updates
    this.subscriptions.add(
      this.dataPreloadService.getUpdateObservable('attendance').subscribe(updatedAttendance => {
        if (updatedAttendance && Array.isArray(updatedAttendance)) {
          // Convert to LogEntry format
          this.logs = updatedAttendance.map((att: any) => ({
            id: att.attendanceId || att.id,
            date: new Date(att.signInTime || att.date),
            timeIn: att.signInTime ? new Date(att.signInTime) : null,
            timeOut: att.signOutTime ? new Date(att.signOutTime) : null,
            action: att.status || 'Present',
            image: att.signature || null,
            location: att.location || '',
            status: att.status || ''
          }));
          this.filteredLogs = this.logs;
          this.calculateOverviewStats(); // Recalculate stats when attendance changes
          this.loadRecentData();
          this.cdr.detectChanges();
          console.log('🔄 Attendance updated in real-time');
        }
      })
    );

    // Subscribe to leave request status changes for notifications
    this.subscriptions.add(
      this.webSocketService.leaveRequestUpdates$.subscribe(message => {
        if (message.type.includes('APPROVED') || message.type.includes('REJECTED')) {
          const status = message.type.includes('APPROVED') ? 'approved' : 'rejected';
          Swal.fire({
            icon: status === 'approved' ? 'success' : 'error',
            title: `Leave Request ${status.charAt(0).toUpperCase() + status.slice(1)}`,
            text: `Your leave request has been ${status}!`,
            timer: 5000,
            showConfirmButton: true
          });
        }
      })
    );
  }

  ngOnDestroy(): void {
    // Unsubscribe from all real-time updates
    this.subscriptions.unsubscribe();

    // Clear clock timer
    if (this.clockTimer) {
      clearInterval(this.clockTimer);
    }

    // Clear location watch if active
    if (this.locationWatchId !== null) {
      navigator.geolocation.clearWatch(this.locationWatchId);
      this.locationWatchId = null;
    }

    // Clear signature check animation frame if active
    if (this.signatureCheckAnimationFrame !== null) {
      cancelAnimationFrame(this.signatureCheckAnimationFrame);
      this.signatureCheckAnimationFrame = null;
    }
  }

  /**
   * Load intern data from backend to get department and field
   */
  loadInternData(): void {
    const internEmail = this.authService.getUserEmail();
    if (!internEmail) {
      console.warn('Intern email not found');
      return;
    }

    // Get intern by email from backend
    this.internService.getAllInterns().subscribe({
      next: (interns: any[]) => {
        // Find the intern with matching email
        const internData = interns.find((i: any) =>
          (i.email || '').toLowerCase() === internEmail.toLowerCase()
        );

        if (internData) {
          // Extract department name
          let departmentName = '';
          if (typeof internData.department === 'string') {
            departmentName = internData.department;
          } else if (internData.departmentName) {
            departmentName = internData.departmentName;
          } else if (internData.department && typeof internData.department === 'object') {
            departmentName = internData.department.name || internData.department.departmentName || '';
          }

          // ✅ Extract field name (handle multiple formats)
          let fieldName = '';
          if (typeof internData.field === 'string' && internData.field.trim().length > 0) {
            fieldName = internData.field.trim();
          } else if (internData.field && typeof internData.field === 'object') {
            fieldName = (internData.field.name || internData.field.fieldName || '').trim();
          } else if (internData.fieldName) {
            fieldName = internData.fieldName.trim();
          }

          // Update intern object with backend data
          this.intern.Department = departmentName || this.intern.Department;
          // ✅ Only update field if we got a valid value from backend
          if (fieldName) {
            this.intern.field = fieldName;
            console.log('✅ Field loaded from intern data:', fieldName);
          }
          this.intern.id = internData.internId || internData.id || this.intern.id;
          this.intern.supervisorId = internData.supervisorId || this.intern.supervisorId;
          // Load assigned location ID if available
          this.intern.assignedLocationId = internData.assignedLocationId || internData.assignedLocation?.locationId || null;

          console.log('Intern data loaded:', {
            name: this.intern.name,
            department: this.intern.Department,
            field: this.intern.field,
            assignedLocationId: this.intern.assignedLocationId
          });

          // Load saved signature from MySQL after intern ID is available
          this.loadSavedSignature();

          // ✅ Load attendance logs AFTER intern ID is set
          // This ensures we always fetch from the backend database
          this.loadAttendanceLogs();

          this.cdr.detectChanges();
        } else {
          console.warn('Intern not found in backend for email:', internEmail);
          // Even if intern not found, try to load attendance with current ID (might be 0)
          // This will fail gracefully in loadAttendanceLogs()
          setTimeout(() => {
            this.loadAttendanceLogs();
          }, 500);
        }
      },
      error: (error) => {
        console.error('Error loading intern data:', error);
        // Continue with default values if API call fails
        // Try fetching from /auth/me as fallback
        this.fetchInternFieldFromDatabase();
        // Still try to load attendance logs even if intern data load failed
        // The loadAttendanceLogs() method will check if intern.id is valid
        setTimeout(() => {
          if (this.intern.id && this.intern.id > 0) {
            this.loadAttendanceLogs();
          }
        }, 500);
      }
    });
  }

  /**
   * ✅ Fetch intern field from backend database using /auth/me endpoint
   */
  fetchInternFieldFromDatabase(): void {
    const internEmail = this.authService.getUserEmail();
    if (!internEmail) {
      console.error('❌ Cannot fetch field: Intern email not available');
      return;
    }

    console.log('🔄 Fetching intern field from backend database for:', internEmail);

    // Use auth/me endpoint to get current user with field
    this.authService.getCurrentUser().subscribe({
      next: (user) => {
        console.log('✅ Fetched user from backend:', user);
        if (user.field) {
          this.intern.field = user.field;
          console.log('✅ Field fetched from backend database:', {
            field: user.field
          });
          this.cdr.detectChanges();
        } else {
          console.warn('⚠️ Backend /auth/me endpoint does not return field');
        }
      },
      error: (error) => {
        console.error('❌ Error fetching user from backend:', error);
        // Field will remain empty or use value from loadInternData()
      }
    });
  }

  ngAfterViewInit(): void {
    // Set currentDate after change detection to avoid ExpressionChangedAfterItHasBeenCheckedError
    setTimeout(() => {
      this.updateCurrentDate();
    }, 0);
    this.loadLocations(); // Load locations from localStorage
    this.checkTodayStatus();
    this.filteredLogs = [...this.logs].sort((a, b) => {
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    });
    this.reportLogs = [...this.logs];
    this.filterLeaveRequests();
    // Delay calculateOverviewStats to avoid ExpressionChangedAfterItHasBeenCheckedError
    setTimeout(() => {
      this.calculateOverviewStats();
      this.loadRecentData();
      this.checkTodayStatus(); // ✅ Update today's status including leave

      this.cdr.detectChanges();
    }, 0);

    // Always detect user location on component load to enable sign-in button
    this.detectUserLocation();

    // Set up auto-dismiss for alerts after a short delay to ensure they're rendered
    setTimeout(() => {
      if (this.showLocationRequiredAlert) {
        this.setupAutoDismiss('locationRequired');
      }
      if (this.showLocationDetectionAlert && !this.currentLocation) {
        this.setupAutoDismiss('locationDetection');
      }
      if (this.showLocationValidAlert && this.currentLocation && this.isWithinAllowedLocation() && !this.locationValidated) {
        this.setupAutoDismiss('locationValid');
      }
    }, 100);

    // Load locations and detect user location when signature section is active
    if (this.activeSection === 'signature') {
      this.loadLocations();
      // Detect user location when signature section is shown
      this.detectUserLocation();
      setTimeout(() => {
        this.initLocationMap();
      }, 500);
    }
  }

  /**
   * ✅ Retry location detection with fallback options (less strict)
   * Called when initial location request times out
   */
  retryLocationWithFallback(): void {
    console.log('🔄 Retrying location detection with fallback options...');

    if (!navigator.geolocation) {
      this.showMessage('Geolocation is not supported by your browser.', 'danger');
      return;
    }

    // ✅ Use less strict options: no high accuracy, longer timeout, allow cached location
    navigator.geolocation.getCurrentPosition(
      (position) => {
        this.currentLocation = {
          lat: position.coords.latitude,
          lng: position.coords.longitude
        };
        console.log('✓ Location detected (fallback):', this.currentLocation);
        this.updateNearestLocation();
        this.checkLocationValidity();
        this.updateLocationMap();
        this.cdr.detectChanges();
      },
      (error) => {
        console.error('Error getting location (fallback):', error);
        let errorMessage = 'Unable to retrieve your location. ';

        switch (error.code) {
          case error.PERMISSION_DENIED:
            errorMessage += 'Please enable location access in your browser settings.';
            break;
          case error.POSITION_UNAVAILABLE:
            errorMessage += 'Location information is unavailable.';
            break;
          case error.TIMEOUT:
            errorMessage += 'Location request timed out. Please check your internet connection and try again.';
            break;
          default:
            errorMessage += 'An unknown error occurred.';
            break;
        }

        this.showMessage(errorMessage, 'warning');
        this.showLocationDetectionAlert = true;
        this.locationValidated = false;
        this.cdr.detectChanges();
      },
      {
        enableHighAccuracy: false, // ✅ Less accurate but faster
        timeout: 20000, // ✅ 20 seconds timeout
        maximumAge: 300000 // ✅ Allow cached location up to 5 minutes old
      }
    );
  }

  // ======== SIDEBAR ========
  public toggleSidebar(): void {
    if (this.sidebarService) {
      this.sidebarService.toggleSidebar();
    }
  }

  logout(): void {
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

  // ======== NAVIGATION ========
  showSection(section: Section): void {
    this.activeSection = section;

    // ✅ Refresh recent data when overview section is shown
    if (section === 'overview') {
      this.loadRecentData();
      this.calculateOverviewStats();
    }

    // Detect user location and initialize map when signature section is shown
    if (section === 'signature') {
      this.loadLocations();
      // Always detect location when signature section is shown
      if (!this.currentLocation) {
        console.log('📍 Signature section shown - detecting user location...');
        this.detectUserLocation();
      } else {
        console.log('📍 Location already detected, refreshing...');
        // Refresh location even if already detected
        this.detectUserLocation();
      }
      // Initialize map after ensuring DOM is ready and location is detected
      setTimeout(() => {
        if (this.currentLocation && this.locations.length > 0) {
          this.initLocationMap();
        } else if (this.currentLocation) {
          // If location detected but no locations configured, still try to init map
          setTimeout(() => this.initLocationMap(), 500);
        } else {
          // If no location yet, wait a bit more and try again
          setTimeout(() => {
            if (this.currentLocation) {
              this.initLocationMap();
            }
          }, 2000);
        }
      }, 500);
    }
  }

  isSectionActive(section: Section): boolean {
    return this.activeSection === section;
  }

  // ======== SIGNATURE PAD FUNCTIONS ========
  toggleSignaturePad(): void {
    this.isPadVisible = !this.isPadVisible;
    if (this.isPadVisible) {
      this.showPlaceholder = true; // Reset placeholder when opening pad
      setTimeout(() => this.initializeSignaturePad(), 50);
    } else {
      // Clean up animation frame when closing pad
      if (this.signatureCheckAnimationFrame !== null) {
        cancelAnimationFrame(this.signatureCheckAnimationFrame);
        this.signatureCheckAnimationFrame = null;
      }
    }
  }

  initializeSignaturePad(): void {
    const canvas = this.signaturePadElement.nativeElement;
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    canvas.width = canvas.offsetWidth * ratio;
    canvas.height = 200 * ratio;
    const context = canvas.getContext('2d')!;
    context.scale(ratio, ratio);
    this.signaturePad = new SignaturePad(canvas, {
      backgroundColor: 'rgba(255,255,255,0)',
      penColor: '#000000',
      minWidth: 1.2,
      maxWidth: 1.8
    });

    // Monitor signature pad for changes using requestAnimationFrame
    let lastEmptyState = this.signaturePad.isEmpty();
    const checkSignatureState = () => {
      if (!this.isPadVisible) {
        this.signatureCheckAnimationFrame = null;
        return; // Stop checking if pad is closed
      }

      const isEmpty = this.signaturePad.isEmpty();

      // If state changed from empty to not empty, hide placeholder
      if (lastEmptyState && !isEmpty && this.showPlaceholder) {
        this.showPlaceholder = false;
        this.cdr.detectChanges();
      }

      // If state changed from not empty to empty, show placeholder (only if cleared)
      if (!lastEmptyState && isEmpty && !this.showPlaceholder) {
        // Don't auto-show on initial load, only when actually cleared
        // This is handled by clearSignature() method
      }

      lastEmptyState = isEmpty;
      this.signatureCheckAnimationFrame = requestAnimationFrame(checkSignatureState);
    };

    // Start monitoring
    this.signatureCheckAnimationFrame = requestAnimationFrame(checkSignatureState);

    // Also add immediate event listeners as backup
    const hidePlaceholderOnInteraction = () => {
      if (this.showPlaceholder) {
        this.showPlaceholder = false;
        this.cdr.detectChanges();
      }
    };

    canvas.addEventListener('pointerdown', hidePlaceholderOnInteraction, { passive: true, capture: true });
    canvas.addEventListener('mousedown', hidePlaceholderOnInteraction, { passive: true, capture: true });
    canvas.addEventListener('touchstart', hidePlaceholderOnInteraction, { passive: true, capture: true });
  }

  clearSignature(): void {
    if (this.signaturePad) {
      this.signaturePad.clear();
      this.showPlaceholder = true;
      this.cdr.detectChanges();
    }
  }

  saveSignature(): void {
    if (!this.signaturePad || this.signaturePad.isEmpty()) {
      this.showMessage('Please draw your signature first.', 'warning');
      return;
    }

    if (!this.intern.id) {
      this.showMessage('Intern ID not found. Cannot save signature.', 'danger');
      return;
    }

    const signatureData = this.signaturePad.toDataURL('image/png');

    // Save to MySQL database via API
    this.apiService.saveInternSignature(this.intern.id, signatureData).subscribe({
      next: (response) => {
        this.savedSignature = signatureData;
        this.isPadVisible = false;
        this.showMessage('Signature saved successfully to database! It will be used for all future sign-ins.', 'success');
        console.log('✓ Signature saved to MySQL database for intern ID:', this.intern.id);
      },
      error: (err) => {
        console.error('Error saving signature to database:', err);
        this.isPadVisible = false;
        Swal.fire({
          icon: 'error',
          title: 'Failed to Save Signature',
          html: `<p>Your signature could not be saved to the database.</p><p><strong>Error:</strong> ${err.error?.error || err.error?.message || 'Connection error'}</p><p>Please check your internet connection and try again.</p>`,
          confirmButtonText: 'OK',
          confirmButtonColor: '#dc3545'
        });
      }
    });
  }

  // ======== LOCATIONS & MAP ========
  loadLocations(): void {
    // ✅ Load locations from backend API instead of localStorage
    this.locationService.getAllLocations().subscribe({
      next: (locations: Location[]) => {
        // Filter only active locations
        this.locations = locations.filter(loc => loc.active !== false);
        console.log('✓ Loaded ' + this.locations.length + ' location(s) from backend API');

        // If intern has an assigned location, ensure it's in the list
        if (this.intern.assignedLocationId) {
          const assignedLocation = this.locations.find(loc =>
            (loc.locationId || loc.id) === this.intern.assignedLocationId
          );
          if (!assignedLocation) {
            // Try to load the assigned location specifically
            this.locationService.getLocationById(this.intern.assignedLocationId).subscribe({
              next: (location: Location) => {
                if (location.active !== false) {
                  this.locations.push(location);
                  console.log('✓ Added assigned location to list:', location.name);
                }
                this.initializeMapIfReady();
                this.cdr.detectChanges();
              },
              error: (err) => {
                console.warn('Could not load assigned location:', err);
                this.initializeMapIfReady();
                this.cdr.detectChanges();
              }
            });
            return;
          }
        }

        this.initializeMapIfReady();
        this.cdr.detectChanges();
      },
      error: (error) => {
        console.error('❌ Error loading locations from backend:', error);
        // Fallback to localStorage if API fails
        const saved = localStorage.getItem('adminLocations');
        if (saved) {
          try {
            this.locations = JSON.parse(saved);
            console.log('✓ Loaded ' + this.locations.length + ' location(s) from localStorage (fallback)');
          } catch (e) {
            console.error('Error parsing locations from localStorage:', e);
            this.locations = [];
          }
        } else {
          console.log('No locations configured - sign-in will be allowed');
          this.locations = [];
        }
        this.initializeMapIfReady();
        this.cdr.detectChanges();
      }
    });
  }

  /**
   * Initialize map if locations are available.
   * currentLocation is optional — the map can show location markers without it.
   */
  initializeMapIfReady(): void {
    if (this.locations.length > 0) {
      setTimeout(() => {
        this.initLocationMap();
      }, 300);
    }
  }

  detectUserLocation(): void {
    // Browsers block geolocation on HTTP pages (except localhost).
    // On other LAN devices, show the map with location markers only (no live GPS dot).
    const isSecureOrigin =
      window.location.protocol === 'https:' ||
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1';

    if (!isSecureOrigin) {
      console.warn('⚠️ Geolocation unavailable on HTTP — showing map without live location.');
      this.initializeMapIfReady();
      this.cdr.detectChanges();
      return;
    }

    if (!navigator.geolocation) {
      this.showMessage('Geolocation is not supported by your browser.', 'danger');
      console.error('❌ Geolocation API not available in this browser');
      return;
    }

    console.log('🔍 Requesting location access...');

    // Request location with improved options - try high accuracy first
    navigator.geolocation.getCurrentPosition(
      (position) => {
        this.currentLocation = {
          lat: position.coords.latitude,
          lng: position.coords.longitude
        };
        console.log('✅ Location detected:', this.currentLocation);
        console.log('  Accuracy: ±' + position.coords.accuracy + ' meters');
        console.log('  isWithinAllowedLocation:', this.isWithinAllowedLocation());
        console.log('  canSignInNow:', this.canSignInNow());
        console.log('  signedInToday:', this.signedInToday);

        this.updateNearestLocation();

        // Mark location as validated if within allowed location
        if (this.isWithinAllowedLocation()) {
          this.locationValidated = true;
        }

        this.checkLocationValidity();
        this.updateLocationMap();

        // Clear any location detection alerts since we got the location
        this.showLocationDetectionAlert = false;

        // Set up auto-dismiss for location valid alert if it should be shown
        setTimeout(() => {
          if (this.showLocationValidAlert && this.currentLocation && this.isWithinAllowedLocation() && !this.locationValidated) {
            this.setupAutoDismiss('locationValid');
          }
        }, 100);

        // Force multiple change detection cycles to ensure button updates
        this.cdr.detectChanges();
        setTimeout(() => {
          this.cdr.detectChanges();
        }, 100);
        setTimeout(() => {
          this.cdr.detectChanges();
        }, 500);
      },
      (error) => {
        console.error('❌ Error getting location:', error);
        console.error('  Error code:', error.code);
        console.error('  Error message:', error.message);

        // ✅ Better error handling with specific messages
        let errorMessage = 'Unable to retrieve your location. ';

        switch (error.code) {
          case error.PERMISSION_DENIED:
            errorMessage = 'Location permission denied. Please enable location access in your browser settings and refresh the page.';
            this.showMessage(errorMessage, 'warning');
            // Show a more helpful message
            Swal.fire({
              icon: 'warning',
              title: 'Location Access Required',
              html: `
                <p>To use the sign-in feature, please enable location access:</p>
                <ol class="text-start">
                  <li>Click the lock/info icon in your browser's address bar</li>
                  <li>Set Location permission to "Allow"</li>
                  <li>Refresh this page</li>
                </ol>
                <p class="text-muted small mt-3">Your location is only used to verify you're at an allowed sign-in location.</p>
              `,
              confirmButtonText: 'OK',
              confirmButtonColor: '#1e3a5f'
            });
            break;
          case error.POSITION_UNAVAILABLE:
            errorMessage = 'Location information is unavailable. Please check your device location settings and ensure GPS/location services are enabled.';
            this.showMessage(errorMessage, 'warning');
            break;
          case error.TIMEOUT:
            errorMessage = 'Location request timed out. Trying again with less accurate settings...';
            console.log('⏱️ Retrying with fallback options...');
            // ✅ Retry with less strict options
            this.retryLocationWithFallback();
            return; // Don't show error message yet, let retry happen
          default:
            errorMessage = 'An unknown error occurred while getting your location.';
            this.showMessage(errorMessage, 'warning');
            break;
        }

        this.showLocationDetectionAlert = true;
        this.locationValidated = false;
        this.cdr.detectChanges();
      },
      {
        enableHighAccuracy: true, // Try high accuracy first
        timeout: 10000, // 10 seconds timeout
        maximumAge: 0 // Don't use cached location
      }
    );

    // Watch position for updates
    if (navigator.geolocation.watchPosition) {
      // Clear any existing watch before starting a new one
      if (this.locationWatchId !== null) {
        navigator.geolocation.clearWatch(this.locationWatchId);
        this.locationWatchId = null;
      }

      // ✅ Use less strict options for watchPosition to avoid timeouts
      this.locationWatchId = navigator.geolocation.watchPosition(
        (position) => {
          this.currentLocation = {
            lat: position.coords.latitude,
            lng: position.coords.longitude
          };
          console.log('✓ Location updated:', this.currentLocation);
          console.log('  isWithinAllowedLocation:', this.isWithinAllowedLocation());
          this.updateNearestLocation();
          this.checkLocationValidity();
          this.updateLocationMap();
          // Force change detection to update button state
          this.cdr.detectChanges();
          setTimeout(() => {
            this.cdr.detectChanges();
          }, 100);
        },
        (error) => {
          console.error('Error watching location:', error);
        },
        { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 } // ✅ Less strict to avoid timeouts
      );
    }
  }

  initLocationMap(): void {
    // Don't reinitialize if map already exists
    if (this.locationMap) {
      this.updateLocationMap();
      return;
    }

    // Allow map initialization even if currentLocation is not yet available
    // The map will update once location is detected
    if (this.locations.length === 0) {
      console.log('Cannot initialize map: no locations configured');
      return;
    }

    const mapElement = document.getElementById('intern-location-map');
    if (!mapElement) {
      console.log('Map element not found, retrying...');
      // Retry if element not ready yet
      setTimeout(() => this.initLocationMap(), 300);
      return;
    }

    if (typeof L === 'undefined') {
      console.log('Leaflet not loaded, retrying...');
      // Retry if Leaflet not loaded yet
      setTimeout(() => this.initLocationMap(), 300);
      return;
    }

    try {
      // Clear any existing content
      mapElement.innerHTML = '';

      // Determine initial center - use first location if currentLocation not available yet
      let initialLat = -22.9756; // Default: University of Venda
      let initialLng = 30.4475;
      let initialZoom = 15;

      if (this.currentLocation) {
        initialLat = this.currentLocation.lat;
        initialLng = this.currentLocation.lng;
      } else if (this.locations.length > 0) {
        initialLat = this.locations[0].latitude;
        initialLng = this.locations[0].longitude;
        initialZoom = 14;
      }

      // Initialize map
      this.locationMap = L.map(mapElement, {
        zoomControl: true,
        scrollWheelZoom: true
      }).setView([initialLat, initialLng], initialZoom);

      // Add OpenStreetMap tile layer
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '', // Remove attribution message
        maxZoom: 19
      }).addTo(this.locationMap);

      this.isLocationMapReady = true;

      // Small delay to ensure map is rendered before adding markers
      setTimeout(() => {
        this.updateLocationMap();
        this.cdr.detectChanges();
      }, 100);

      console.log('✓ Location map initialized successfully');
    } catch (error) {
      console.error('Error initializing location map:', error);
    }
  }

  /**
   * Refresh the location map - reload tiles, markers, and restart location tracking
   */
  refreshLocationMap(): void {
    if (!this.locationMap || !this.isLocationMapReady || typeof L === 'undefined') {
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

      // Step 1: Stop location tracking
      if (this.locationWatchId !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(this.locationWatchId);
        this.locationWatchId = null;
        console.log('✓ Location tracking stopped');
      }

      // Step 2: Clear current location temporarily
      this.currentLocation = null;

      // Step 3: Reload map tiles by invalidating the current view
      this.locationMap.invalidateSize();

      // Step 4: Restart location detection after a brief delay
      setTimeout(() => {
        console.log('✓ Restarting location detection...');
        this.detectUserLocation();

        // Step 5: Wait for location to be detected, then update map
        setTimeout(() => {
          if (this.currentLocation) {
            this.updateLocationMap();
          }

          // Reset button after location is detected
          refreshButton.disabled = false;
          refreshButton.innerHTML = originalHTML;

          Swal.fire({
            icon: 'success',
            title: 'Map & Location Refreshed!',
            text: 'The map and location tracking have been refreshed successfully.',
            timer: 1500,
            showConfirmButton: false
          });
        }, 2000); // Wait 2 seconds for location to be detected
      }, 500); // Brief delay before restarting location
    } else {
      // Fallback if button not found
      // Stop location tracking
      if (this.locationWatchId !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(this.locationWatchId);
        this.locationWatchId = null;
      }

      // Restart location detection
      setTimeout(() => {
        this.detectUserLocation();
        setTimeout(() => {
          if (this.currentLocation) {
            this.updateLocationMap();
          }
        }, 2000);
      }, 500);

      this.locationMap.invalidateSize();

      Swal.fire({
        icon: 'success',
        title: 'Map & Location Refreshed!',
        text: 'The map and location tracking have been refreshed successfully.',
        timer: 1500,
        showConfirmButton: false
      });
    }
  }

  updateLocationMap(): void {
    if (!this.locationMap || !this.isLocationMapReady || typeof L === 'undefined') {
      return;
    }

    // Clear existing markers
    this.locationMapMarkers.forEach(marker => {
      if (marker && marker.remove) {
        this.locationMap.removeLayer(marker);
      }
      if ((marker as any).circle && (marker as any).circle.remove) {
        this.locationMap.removeLayer((marker as any).circle);
      }
    });
    this.locationMapMarkers = [];

    // Remove user marker if exists
    if (this.userLocationMarker) {
      this.locationMap.removeLayer(this.userLocationMarker);
      this.userLocationMarker = null;
    }

    // Add user location marker if available
    if (this.currentLocation) {
      const userIcon = L.divIcon({
        className: 'user-location-marker',
        html: `<div style="width: 20px; height: 20px; border-radius: 50%; background: #28a745; border: 3px solid white; box-shadow: 0 2px 5px rgba(0,0,0,0.3);"></div>`,
        iconSize: [20, 20],
        iconAnchor: [10, 10]
      });

      this.userLocationMarker = L.marker([this.currentLocation.lat, this.currentLocation.lng], {
        icon: userIcon,
        title: 'Your Location'
      }).addTo(this.locationMap);

      // Add popup with distance info
      let popupContent = '<strong>Your Location</strong><br>';
      this.locations.forEach(loc => {
        const distance = this.getDistanceToLocation(loc);
        popupContent += `${loc.name}: ${Math.round(distance)}m<br>`;
      });
      this.userLocationMarker.bindPopup(popupContent);
    }

    // Add markers and circles for each allowed location
    this.locations.forEach(location => {
      const distance = this.currentLocation ? this.getDistanceToLocation(location) : Infinity;
      const isWithin = this.currentLocation && distance <= location.radius;

      // Create marker icon based on whether user is within range
      const markerColor = isWithin ? '#28a745' : '#dc3545';
      const customIcon = L.divIcon({
        className: 'custom-marker',
        html: `<div style="width: 18px; height: 18px; border-radius: 50%; background: ${markerColor}; border: 3px solid white; box-shadow: 0 2px 5px rgba(0,0,0,0.3);"></div>`,
        iconSize: [18, 18],
        iconAnchor: [9, 9]
      });

      const marker = L.marker([location.latitude, location.longitude], {
        icon: customIcon,
        title: location.name
      }).addTo(this.locationMap);

      // Create circle for radius
      const circleColor = isWithin ? '#28a745' : '#dc3545';
      const circle = L.circle([location.latitude, location.longitude], {
        radius: location.radius,
        fillColor: circleColor,
        fillOpacity: 0.2,
        color: circleColor,
        weight: 2,
        opacity: 0.6
      }).addTo(this.locationMap);

      // Create popup with distance
      const popupContent = `
        <div class="p-2">
          <h6 class="fw-bold mb-1">${location.name}</h6>
          <p class="mb-1 small">${location.description || 'No description'}</p>
          <p class="mb-1 small"><strong>Radius:</strong> ${location.radius}m</p>
          <p class="mb-0 small ${isWithin ? 'text-success' : 'text-danger'}">
            <strong>Distance:</strong> ${Math.round(distance)}m ${isWithin ? '(Within range)' : '(Out of range)'}
          </p>
        </div>
      `;

      marker.bindPopup(popupContent);
      (marker as any).circle = circle;
      this.locationMapMarkers.push(marker);
    });

    // Fit map to show all locations and user (if available)
    if (this.locations.length > 0) {
      const boundsPoints: [number, number][] = this.locations.map(loc => [loc.latitude, loc.longitude]);
      if (this.currentLocation) {
        boundsPoints.push([this.currentLocation.lat, this.currentLocation.lng]);
      }
      const bounds = L.latLngBounds(boundsPoints);
      this.locationMap.fitBounds(bounds, { padding: [20, 20] });
    }
  }

  getDistanceToLocation(location: Location): number {
    if (!this.currentLocation) {
      return 0;
    }
    return this.getDistance(
      this.currentLocation.lat,
      this.currentLocation.lng,
      location.latitude,
      location.longitude
    );
  }

  checkLocationValidity(): void {
    if (!this.currentLocation || this.locations.length === 0) {
      return;
    }

    // If location is valid and already validated, don't show popup again
    if (this.isWithinAllowedLocation() && this.locationValidated) {
      return;
    }

    // Only show alert if location is invalid, we haven't shown it recently, and we're in the signature section
    if (!this.isWithinAllowedLocation() && !this.locationAlertShown && !this.locationValidated && this.activeSection === 'signature') {
      this.showLocationInvalidAlert();
      this.locationAlertShown = true;

      // Reset flag after 30 seconds to allow showing again if user moves
      setTimeout(() => {
        this.locationAlertShown = false;
      }, 30000);
    } else if (this.isWithinAllowedLocation()) {
      // Mark location as validated when user enters valid location
      this.locationValidated = true;
      this.locationAlertShown = false;
    }
  }

  showLocationInvalidAlert(): void {
    Swal.fire({
      icon: 'error',
      title: 'Location Invalid',
      html: `
        <div class="text-start">
          <p class="mb-3"><strong>You are not within any allowed sign-in location.</strong></p>
          <p class="mb-3">Please move to one of the allowed locations listed below to sign in.</p>
          <div class="alert alert-info mb-0">
            <i class="bi bi-info-circle me-2"></i>
            <strong>Tip:</strong> Make sure your device's location services are enabled and accurate.
          </div>
        </div>
      `,
      confirmButtonText: 'OK',
      confirmButtonColor: '#dc3545',
      width: '600px',
      allowOutsideClick: true,
      allowEscapeKey: true,
      customClass: {
        popup: 'location-alert-popup',
        title: 'location-alert-title',
        htmlContainer: 'location-alert-content'
      }
    });
  }

  updateNearestLocation(): void {
    if (!this.currentLocation || this.locations.length === 0) {
      this.nearestLocationName = '';
      return;
    }

    let nearest = this.locations[0];
    let minDistance = this.getDistance(
      this.currentLocation.lat,
      this.currentLocation.lng,
      nearest.latitude,
      nearest.longitude
    );

    for (const loc of this.locations.slice(1)) {
      const d = this.getDistance(
        this.currentLocation.lat,
        this.currentLocation.lng,
        loc.latitude,
        loc.longitude
      );
      if (d < minDistance) {
        minDistance = d;
        nearest = loc;
      }
    }

    this.nearestLocationName = nearest.name;
  }

  private getDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371000;
    const toRad = (v: number) => (v * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);

    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) ** 2;

    return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  isWithinAllowedLocation(): boolean {
    // If no locations configured, allow sign-in (admin hasn't set up locations yet)
    if (this.locations.length === 0) {
      return true;
    }

    // If no current location detected, return false
    if (!this.currentLocation) {
      return false;
    }

    // If intern has an assigned location, only check that specific location
    if (this.intern.assignedLocationId) {
      const assignedLocation = this.locations.find(loc =>
        (loc.locationId || loc.id) === this.intern.assignedLocationId
      );

      if (assignedLocation) {
        const distance = this.getDistance(
          this.currentLocation.lat,
          this.currentLocation.lng,
          assignedLocation.latitude,
          assignedLocation.longitude
        );
        const isWithin = distance <= assignedLocation.radius;

        if (isWithin) {
          console.log(`✓ Location is valid - within assigned location: ${assignedLocation.name}`);
        } else {
          console.log(`✗ Location is invalid - outside assigned location: ${assignedLocation.name} (distance: ${distance.toFixed(0)}m, required: ${assignedLocation.radius}m)`);
        }

        return isWithin;
      } else {
        // Assigned location not found in active locations
        console.warn('⚠️ Assigned location not found in active locations');
        return false;
      }
    }

    // If no assigned location, check all locations (backward compatibility)
    const isWithin = this.locations.some(location => {
      const distance = this.getDistance(
        this.currentLocation!.lat,
        this.currentLocation!.lng,
        location.latitude,
        location.longitude
      );
      return distance <= location.radius;
    });

    // Log for debugging
    if (isWithin) {
      console.log('✓ Location is valid - within allowed location');
    } else {
      console.log('✗ Location is invalid - outside allowed locations');
    }

    return isWithin;
  }

  isWithinLocation(location: Location): boolean {
    if (!this.currentLocation) {
      return false;
    }

    const distance = this.getDistance(
      this.currentLocation.lat,
      this.currentLocation.lng,
      location.latitude,
      location.longitude
    );
    return distance <= location.radius;
  }

  // ======== ALERT DISMISS METHODS ========
  dismissAlert(alertType: string): void {
    // Clear timeout if exists
    const timeout = this.alertTimeouts.get(alertType);
    if (timeout) {
      clearTimeout(timeout);
      this.alertTimeouts.delete(alertType);
    }

    // Mark as fading
    this.alertFading.set(alertType, true);
    this.cdr.detectChanges();

    // After fade animation completes, hide the alert
    setTimeout(() => {
      switch (alertType) {
        case 'locationRequired':
          this.showLocationRequiredAlert = false;
          break;
        case 'locationValid':
          this.showLocationValidAlert = false;
          break;
        case 'locationDetection':
          this.showLocationDetectionAlert = false;
          break;
      }
      this.alertFading.delete(alertType);
      this.cdr.detectChanges();
    }, 500); // Match the CSS transition duration
  }

  isAlertFading(alertType: string): boolean {
    return this.alertFading.get(alertType) || false;
  }

  setupAutoDismiss(alertType: string): void {
    // Clear existing timeout if any
    const existingTimeout = this.alertTimeouts.get(alertType);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    // Set new timeout for 5 seconds
    const timeout = setTimeout(() => {
      this.dismissAlert(alertType);
      this.cdr.detectChanges();
    }, 5000);

    this.alertTimeouts.set(alertType, timeout);
  }

  getProgressBarLabel(stat: OverviewStat): string {
    return (stat.label || 'Progress') + ' progress: ' + (stat.progress || 0) + '%';
  }

  // ======== SIGN IN / SIGN OUT ========

  canSignInNow(): boolean {
    const now = new Date();
    const hour = now.getHours();
    const minute = now.getMinutes();
    // Allowed between 08:00 and 13:00 (exclusive)
    return hour >= 8 && (hour < 13 || (hour === 13 && minute === 0));
  }

  isBeforeSignInTime(): boolean {
    const now = new Date();
    const hour = now.getHours();
    const minute = now.getMinutes();
    // Check if time is before 08:00
    return hour < 8;
  }

  canSignOutNow(): boolean {
    const now = new Date();
    const hour = now.getHours();
    const minute = now.getMinutes();
    // Allowed between 16:30 and 17:00
    const afterStart = hour > 16 || (hour === 16 && minute >= 30);
    const beforeEnd = hour < 17;
    return afterStart && beforeEnd;
  }

  signIn(): void {
    if (!this.savedSignature) {
      this.showMessage('Please save your signature before signing in.', 'warning');
      return;
    }
    if (!this.currentLocation || !this.isWithinAllowedLocation()) {
      this.showLocationInvalidAlert();
      return;
    }
    // Time restriction removed - allow sign-in at any time if location is valid
    // if (!this.canSignInNow()) {
    //   this.showMessage('Sign in allowed only between 08:00 and 13:00.', 'warning');
    //   return;
    // }
    if (!this.intern.id) {
      this.showMessage('Intern ID not found. Please refresh the page.', 'danger');
      return;
    }

    if (!this.currentLocation) {
      Swal.fire({
        icon: 'error',
        title: 'Location Error',
        text: 'Unable to get your location. Please enable location services.'
      });
      return;
    }

    const now = new Date();
    // Use signIn endpoint with correct format
    const signInRequest = {
      internId: this.intern.id!,
      location: this.nearestLocationName,
      latitude: this.currentLocation.lat,
      longitude: this.currentLocation.lng
    };

    this.attendanceService.signIn(signInRequest).subscribe({
      next: (record: any) => {
        // Store current attendance record ID and record
        this.currentAttendanceRecordId = record.id || record.attendanceId || null;

        // Create log entry with ID from backend
        const logEntry: LogEntry = {
          id: this.currentAttendanceRecordId || undefined,
          date: new Date(record.date || now),
          timeIn: record.timeIn ? new Date(record.timeIn) : now,
          timeOut: record.timeOut ? new Date(record.timeOut) : null,
          action: 'Signed In',
          image: this.savedSignature,
          location: record.location || this.nearestLocationName,
          status: record.status || 'PRESENT'
        };

        // Update or add to logs
        const existingIndex = this.logs.findIndex(log =>
          log.date.toISOString().split('T')[0] === logEntry.date.toISOString().split('T')[0]
        );

        if (existingIndex !== -1) {
          this.logs[existingIndex] = logEntry;
        } else {
          this.logs.push(logEntry);
        }

        // Store current attendance record
        this.currentAttendanceRecord = logEntry;
        this.signedInToday = true;
        this.signedOutToday = false;
        this.locationValidated = true; // Mark location as validated after successful sign in

        this.filteredLogs = [...this.logs].sort((a, b) => {
          return new Date(b.date).getTime() - new Date(a.date).getTime();
        });
        this.calculateOverviewStats();
        this.loadRecentData();
        this.cdr.detectChanges();
        this.showMessage(`Signed in successfully at ${this.nearestLocationName}`, 'success');

        // ✅ Reload attendance logs from backend to ensure data consistency
        // This ensures the data persists even after server restart
        setTimeout(() => {
          this.loadAttendanceLogs();
        }, 500);
      },
      error: (error) => {
        console.error('Error signing in:', error);
        this.showMessage(error.error?.error || error.message || 'Failed to sign in. Please try again.', 'danger');
      }
    });
  }

  signOut(): void {
    // Check if we have a current attendance record
    if (!this.currentAttendanceRecordId || !this.currentAttendanceRecord) {
      // Try to find today's record from logs
      const now = new Date();
      const todayStr = now.toISOString().split('T')[0];
      const todayRecord = this.logs.find(log =>
        log.date.toISOString().split('T')[0] === todayStr && log.timeIn && !log.timeOut
      );

      if (todayRecord && todayRecord.id) {
        this.currentAttendanceRecordId = todayRecord.id;
        this.currentAttendanceRecord = todayRecord;
      } else {
        this.showMessage('You need to sign in first.', 'warning');
        return;
      }
    }

    if (!this.currentLocation || !this.isWithinAllowedLocation()) {
      this.showLocationInvalidAlert();
      return;
    }
    if (!this.intern.id) {
      this.showMessage('Intern ID not found. Please refresh the page.', 'danger');
      return;
    }

    // Determine status based on time (backend will set status, but we show preview)
    const now = new Date();
    const hour = now.getHours();
    const minute = now.getMinutes();
    const isOnTime = hour > 16 || (hour === 16 && minute >= 45); // 16:45 or later
    const statusText = isOnTime ? 'On Time' : 'Left Early';

    // Show confirmation alert before signing out
    Swal.fire({
      title: 'Confirm Sign Out',
      text: `Are you sure you want to sign out? Your status will be marked as "${statusText}".`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Yes, Sign Out',
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#dc3545',
      cancelButtonColor: '#6c757d'
    }).then((result) => {
      if (result.isConfirmed && this.currentAttendanceRecordId) {
        this.attendanceService.signOut(
          this.currentAttendanceRecordId,
          this.nearestLocationName,
          this.currentLocation?.lat || 0,
          this.currentLocation?.lng || 0
        ).subscribe({
          next: (updatedRecord: any) => {
            // Backend sets status: PRESENT (on time) or ABSENT (early)
            const backendStatus = updatedRecord.status || 'SIGNED_OUT';
            const finalStatusText = backendStatus === 'PRESENT' ? 'On Time' : 'Left Early';

            // Update local log with backend response
            const logIndex = this.logs.findIndex(log => log.id === this.currentAttendanceRecordId);
            if (logIndex !== -1) {
              this.logs[logIndex] = {
                ...this.logs[logIndex],
                id: updatedRecord.attendanceId || updatedRecord.id || this.currentAttendanceRecordId,
                timeOut: updatedRecord.timeOut ? new Date(updatedRecord.timeOut) : now,
                action: 'Signed Out',
                status: backendStatus
              };
            }

            // Clear current attendance record
            this.currentAttendanceRecordId = null;
            this.currentAttendanceRecord = null;
            this.signedOutToday = true;
            this.signedInToday = false;

            this.filteredLogs = [...this.logs].sort((a, b) => {
              return new Date(b.date).getTime() - new Date(a.date).getTime();
            });
            this.calculateOverviewStats();
            this.loadRecentData();
            this.cdr.detectChanges();
            this.showMessage(`Signed out successfully at ${this.nearestLocationName}. Status: ${finalStatusText}`, 'success');

            // ✅ Reload attendance logs from backend to ensure data consistency
            // This ensures the data persists even after server restart
            setTimeout(() => {
              this.loadAttendanceLogs();
            }, 500);
          },
          error: (error) => {
            console.error('Error signing out:', error);
            this.showMessage(error.error?.error || error.message || 'Failed to sign out. Please try again.', 'danger');
          }
        });
      }
    });
  }

  clearTodayRegister(): void {
    const todayStr = new Date().toDateString();
    this.logs = this.logs.filter(log => log.date.toDateString() !== todayStr);
    this.signedInToday = false;
    this.signedOutToday = false;
    this.saveData();
    this.showMessage("Today's register cleared.", 'success');
  }

  checkTodayStatus(): void {
    const todayStr = new Date().toDateString();
    this.signedInToday = this.logs.some(log => {
      const logDate = new Date(log.date);
      return logDate.toDateString() === todayStr && log.action === 'Signed In';
    });
    this.signedOutToday = this.logs.some(log => {
      const logDate = new Date(log.date);
      return logDate.toDateString() === todayStr && log.action === 'Signed Out';
    });

    // Update onLeaveToday status
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    this.onLeaveToday = this.leaveRequests.some(req => {
      if (req.status === 'Approved') {
        const start = new Date(req.startDate);
        const end = new Date(req.endDate);
        start.setHours(0, 0, 0, 0);
        end.setHours(0, 0, 0, 0);
        return today >= start && today <= end;
      }
      return false;
    });
  }

  // ======== WEEKDAY FILTER FOR REGISTER TABLE ========
  get weekFilteredLogs(): LogEntry[] {
    return this.logs.filter(log => {
      const day = log.date.getDay();
      return day >= 1 && day <= 5;
    });
  }

  // ======== CHECK IF DATE IS TODAY ========
  isToday(date: Date): boolean {
    const today = new Date();
    const checkDate = new Date(date);
    return checkDate.toDateString() === today.toDateString();
  }

  getAttendanceStatus(date: Date): string {
    const logsForDate = this.logs.filter(
      log => new Date(log.date).toDateString() === new Date(date).toDateString()
    );

    // Check for on leave first
    const onLeave = this.leaveRequests.some(req => {
      if (req.status === 'Approved') {
        const start = new Date(req.startDate);
        const end = new Date(req.endDate);
        return new Date(date) >= start && new Date(date) <= end;
      }
      return false;
    });

    if (onLeave) return 'On Leave';

    // Find the log entry for this date
    const logEntry = logsForDate[0];
    if (!logEntry) return 'Absent';

    // Check if intern signed in
    const signedIn = logEntry.action === 'Signed In' || logEntry.timeIn;
    const signedOut = logEntry.action === 'Signed Out' || logEntry.timeOut;

    // If didn't sign in at all
    if (!signedIn) return 'Absent';

    // If signed in but not signed out
    if (signedIn && !signedOut) {
      const now = new Date();
      const isToday = new Date(date).toDateString() === now.toDateString();

      // If it's today and after 16:45, show "Not Signed Out"
      if (isToday) {
        const currentHour = now.getHours();
        const currentMinute = now.getMinutes();
        const currentTimeInMinutes = currentHour * 60 + currentMinute;
        const signOutTime = 16 * 60 + 45; // 16:45 in minutes

        if (currentTimeInMinutes >= signOutTime) {
          return 'Not Signed Out';
        }
      }

      return 'Signed In';
    }

    // If signed in and signed out, check if they left early
    if (signedIn && signedOut && logEntry.timeOut) {
      const timeOut = new Date(logEntry.timeOut);
      const timeOutHour = timeOut.getHours();
      const timeOutMinute = timeOut.getMinutes();
      const timeOutInMinutes = timeOutHour * 60 + timeOutMinute;
      const correctSignOutTime = 16 * 60 + 45; // 16:45 in minutes

      // If signed out before 16:45, mark as "Left Early"
      if (timeOutInMinutes < correctSignOutTime) {
        return 'Left Early';
      }

      // Signed out at or after 16:45 - Present
      return 'Present';
    }

    // Fallback: if both signed in and out but no timeOut data
    if (signedIn && signedOut) {
      return 'Present';
    }

    return 'Absent';
  }


  // ✅ Generate weekdays (Mon–Fri) between two dates
  generateWeekdays(startDate: Date, endDate: Date): Date[] {
    const dates: Date[] = [];
    let current = new Date(startDate);
    while (current <= endDate) {
      const day = current.getDay();
      // Skip weekends (0 = Sunday, 6 = Saturday)
      if (day !== 0 && day !== 6) {
        dates.push(new Date(current));
      }
      current.setDate(current.getDate() + 1);
    }
    return dates;
  }

  // ✅ Create combined list including Absent / On Leave days
  getFullWeekLogs(): any[] {
    if (!this.logs || this.logs.length === 0) return [];

    const allDates = this.generateWeekdays(
      this.getMondayOfCurrentWeek(),
      this.getFridayOfCurrentWeek()
    );

    return allDates.map(date => {
      const existingLogs = this.logs.filter(
        log => new Date(log.date).toDateString() === date.toDateString()
      );

      if (existingLogs.length > 0) {
        return existingLogs[0]; // existing attendance entry
      } else {
        // No log found → create placeholder record
        return {
          date: date,
          image: null,
          location: '-',
          timeIn: null,
          timeOut: null,
          action: this.getAttendanceStatus(date),
        };
      }
    });
  }

  // ✅ Helper to get Monday and Friday of current week
  getMondayOfCurrentWeek(): Date {
    const now = new Date();
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is Sunday
    return new Date(now.setDate(diff));
  }

  getFridayOfCurrentWeek(): Date {
    const monday = this.getMondayOfCurrentWeek();
    const friday = new Date(monday);
    friday.setDate(monday.getDate() + 4);
    return friday;
  }

  /**
   * Process signature data - handle base64 strings and byte arrays
   */
  processSignature(signature: any): string | null {
    if (!signature) return null;

    if (typeof signature === 'string') {
      // If it's already a base64 data URL
      if (signature.startsWith('data:image')) {
        return signature;
      }
      // If it's a base64 string without prefix, add it
      return `data:image/png;base64,${signature}`;
    } else if (signature instanceof Array || (signature instanceof Uint8Array)) {
      // If it's a byte array, convert to base64
      try {
        const bytes = Array.from(signature);
        const base64 = btoa(String.fromCharCode(...bytes));
        return `data:image/png;base64,${base64}`;
      } catch (e) {
        console.error('Error converting signature bytes to base64:', e);
        return null;
      }
    }

    return null;
  }

  // ======== BACKEND DATA LOADING ========
  /**
   * Load attendance logs from backend
   */
  loadAttendanceLogs(): void {
    // ✅ Always check if intern ID is valid before loading
    if (!this.intern.id || this.intern.id === 0) {
      console.warn('⚠️ Cannot load attendance logs: Intern ID not available yet. Will retry...');
      // Retry after a delay if intern ID is not yet available
      setTimeout(() => {
        if (this.intern.id && this.intern.id > 0) {
          console.log('🔄 Retrying to load attendance logs with intern ID:', this.intern.id);
          this.loadAttendanceLogs();
        }
      }, 1000);
      return;
    }

    console.log('📊 Loading attendance logs from backend for intern ID:', this.intern.id);
    this.attendanceService.getAttendanceByIntern(this.intern.id).subscribe({
      next: (records) => {
        console.log(`✅ Loaded ${records.length} attendance record(s) from backend database`);
        // ✅ Always load from backend - never use localStorage for attendance data
        this.logs = records.map((record: any) => ({
          id: record.id || record.attendanceId || undefined,
          date: new Date(record.date),
          timeIn: record.timeIn ? new Date(record.timeIn) : null,
          timeOut: record.timeOut ? new Date(record.timeOut) : null,
          action: record.timeOut ? 'Signed Out' : (record.timeIn ? 'Signed In' : 'Absent'),
          image: this.processSignature(record.signature || record.image), // Support both signature and image fields from backend
          location: record.location || undefined,
          status: record.status || 'PRESENT'
        }));

        // Find and set current attendance record (signed in today but not signed out)
        const now = new Date();
        const todayStr = now.toISOString().split('T')[0];
        const todayRecord = this.logs.find(log => {
          const logDateStr = log.date.toISOString().split('T')[0];
          return logDateStr === todayStr && log.timeIn && !log.timeOut;
        });

        if (todayRecord) {
          this.currentAttendanceRecordId = todayRecord.id || null;
          this.currentAttendanceRecord = todayRecord;
          this.signedInToday = true;
          this.signedOutToday = false;
        } else {
          this.currentAttendanceRecordId = null;
          this.currentAttendanceRecord = null;
          this.checkTodayStatus();
        }

        this.filteredLogs = [...this.logs].sort((a, b) => {
          return new Date(b.date).getTime() - new Date(a.date).getTime();
        });
        this.reportLogs = [...this.logs];
        // Use setTimeout to avoid ExpressionChangedAfterItHasBeenCheckedError
        setTimeout(() => {
          this.calculateOverviewStats();
          this.loadRecentData();
          this.cdr.detectChanges();
        }, 0);
      },
      error: (error) => {
        console.error('❌ Error loading attendance logs from backend:', error);
        // ✅ Don't clear logs on error - keep existing data if available
        // Only clear if we have no logs at all (first load)
        if (this.logs.length === 0) {
          this.logs = [];
          this.filteredLogs = [];
          this.reportLogs = [];
        }
        // Still check today's status even if load failed
        this.checkTodayStatus();
        this.currentAttendanceRecordId = null;
        this.currentAttendanceRecord = null;
      }
    });
  }

  // ======== LOAD SAVED SIGNATURE FROM MYSQL ========
  loadSavedSignature(): void {
    if (!this.intern.id) {
      console.warn('Intern ID not available yet for loading signature.');
      return;
    }

    this.apiService.getInternSignature(this.intern.id).subscribe({
      next: (response) => {
        if (response.hasSignature && response.signature) {
          this.savedSignature = response.signature;
          console.log('✓ Loaded saved signature from MySQL database for intern ID:', this.intern.id);
        } else {
          console.log('No signature found in database for intern ID:', this.intern.id);
          this.savedSignature = null;
        }
      },
      error: (err) => {
        console.error('Error loading signature from database for intern ID:', this.intern.id, err);
        this.savedSignature = null;
        if (err.status !== 404) {
          console.warn('Could not load signature from database. Please ensure you are connected.');
        }
      }
    });
  }

  // ======== LOCAL STORAGE (for logs only, NOT signature) ========
  saveData(): void {
    // Do NOT save signature to localStorage - it's in MySQL now
    // Only save logs to localStorage (for UI state)
    this.calculateOverviewStats();
    this.loadRecentData();
  }

  loadData(): void {
    // Do NOT load signature from localStorage - it's loaded from MySQL via loadSavedSignature()
    // This method is kept for backward compatibility but doesn't load signature anymore
  }

  // ======== LEAVE REQUEST ========
  submitLeaveRequest(): void {
    if (!this.isLeaveFormValid()) {
      this.showMessage('Please fill in all required fields correctly.', 'danger');
      return;
    }

    // Validate dates
    if (new Date(this.endDate) < new Date(this.startDate)) {
      this.showMessage('End date must be after start date.', 'danger');
      return;
    }

    // Show confirmation
    Swal.fire({
      title: 'Confirm Leave Request',
      html: `
        <div class="text-start">
          <p><strong>Type:</strong> ${this.leaveType}</p>
          <p><strong>Start Date:</strong> ${new Date(this.startDate).toLocaleDateString()}</p>
          <p><strong>End Date:</strong> ${new Date(this.endDate).toLocaleDateString()}</p>
          <p><strong>Duration:</strong> ${this.getLeaveDuration()} day(s)</p>
        </div>
      `,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Submit Request',
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#1e3a5f',
      cancelButtonColor: '#6c757d'
    }).then((result) => {
      if (result.isConfirmed && this.intern.id) {
        // Map frontend leave type to backend format
        const leaveTypeMap: { [key: string]: 'ANNUAL' | 'SICK' | 'PERSONAL' | 'EMERGENCY' } = {
          'Annual Leave': 'ANNUAL',
          'Sick Leave': 'SICK',
          'Family Responsibility': 'PERSONAL',
          'Study Leave': 'PERSONAL',
          'Emergency Leave': 'EMERGENCY'
        };

        const backendLeaveType = leaveTypeMap[this.leaveType] || 'PERSONAL';

        const leaveRequestData = {
          internId: this.intern.id,
          fromDate: this.startDate,
          toDate: this.endDate,
          reason: this.leaveReason || '',
          leaveType: backendLeaveType
        };

        // Submit leave request
        this.leaveRequestService.submitLeaveRequest(leaveRequestData).subscribe({
          next: (createdRequest: any) => {
            // Upload attachment if provided (optional)
            const requestId = createdRequest.requestId || createdRequest.id;
            if (!requestId) {
              Swal.fire({
                title: 'Error',
                text: 'Failed to create leave request. Please try again.',
                icon: 'error',
                confirmButtonColor: '#dc3545'
              });
              return;
            }

            // Upload attachment if provided (optional)
            if (this.attachment && requestId) {
              this.leaveRequestService.uploadAttachment(requestId, this.attachment).subscribe({
                next: () => {
                  console.log('Attachment uploaded successfully');
                },
                error: (error) => {
                  console.error('Error uploading attachment:', error);
                  // Don't fail the whole request if attachment upload fails
                  // The leave request was already created successfully
                }
              });
            }

            // Reset form and reload data regardless of attachment status
            this.resetLeaveForm();
            // Reload leave requests after a short delay to ensure backend has saved the request
            setTimeout(() => {
              this.loadLeaveRequests();
            }, 500);
            this.calculateOverviewStats();
            this.loadRecentData();

            Swal.fire({
              title: 'Success!',
              text: 'Your leave request has been submitted successfully.',
              icon: 'success',
              confirmButtonColor: '#1e3a5f'
            });
          },
          error: (error) => {
            console.error('Error submitting leave request:', error);
            Swal.fire({
              title: 'Error',
              text: error.message || 'Failed to submit leave request. Please try again.',
              icon: 'error',
              confirmButtonColor: '#dc3545'
            });
          }
        });
      } else if (!this.intern.id) {
        Swal.fire({
          title: 'Error',
          text: 'Intern ID not found. Please refresh the page.',
          icon: 'error',
          confirmButtonColor: '#dc3545'
        });
      }
    });
  }

  isLeaveFormValid(): boolean {
    // Attachment is optional, so we don't check for it
    return !!(this.leaveType && this.startDate && this.endDate);
  }

  resetLeaveForm(): void {
    this.leaveType = '';
    this.startDate = '';
    this.endDate = '';
    this.leaveReason = '';
    this.attachment = null;
    const fileInput = document.getElementById('leaveAttachment') as HTMLInputElement;
    if (fileInput) {
      fileInput.value = '';
    }
  }

  getLeaveMinDate(): string {
    const today = new Date();
    return today.toISOString().split('T')[0];
  }

  getLeaveMinEndDate(): string {
    return this.startDate || this.getLeaveMinDate();
  }

  onStartDateChange(): void {
    if (this.startDate && this.endDate && new Date(this.endDate) < new Date(this.startDate)) {
      this.endDate = this.startDate;
    }
  }

  onEndDateChange(): void {
    if (this.startDate && this.endDate && new Date(this.endDate) < new Date(this.startDate)) {
      this.showMessage('End date cannot be before start date.', 'warning');
      this.endDate = this.startDate;
    }
  }

  getLeaveDuration(): number {
    if (!this.startDate || !this.endDate) {
      return 0;
    }
    const start = new Date(this.startDate);
    const end = new Date(this.endDate);
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    return diffDays;
  }

  getRequestDuration(leave: LeaveRequest): number {
    const start = new Date(leave.startDate);
    const end = new Date(leave.endDate);
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    return diffDays;
  }

  getFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }

  removeAttachment(): void {
    this.attachment = null;
    const fileInput = document.getElementById('leaveAttachment') as HTMLInputElement;
    if (fileInput) {
      fileInput.value = '';
    }
  }

  getStatusIcon(status: string): string {
    switch (status) {
      case 'Approved':
      case 'Present':
        return 'bi bi-check-circle-fill';
      case 'Pending':
        return 'bi bi-clock-fill';
      case 'Declined':
      case 'Absent':
        return 'bi bi-x-circle-fill';
      case 'On Leave':
        return 'bi bi-calendar-check-fill';
      case 'Signed In':
        return 'bi bi-person-check-fill';
      case 'Not Signed Out':
        return 'bi bi-exclamation-circle-fill';
      case 'Left Early':
        return 'bi bi-arrow-left-circle-fill';
      default:
        return 'bi bi-circle';
    }
  }

  getLeaveStatusIcon(status: string): string {
    switch (status) {
      case 'Approved':
        return 'bi bi-check-circle-fill';
      case 'Pending':
        return 'bi bi-clock-fill';
      case 'Declined':
        return 'bi bi-x-circle-fill';
      default:
        return 'bi bi-circle';
    }
  }

  getLeaveTypeIcon(type: string): string {
    switch (type) {
      case 'Annual Leave':
        return 'bi bi-sun-fill';
      case 'Sick Leave':
        return 'bi bi-heart-pulse-fill';
      case 'Family Responsibility':
        return 'bi bi-people-fill';
      case 'Study Leave':
        return 'bi bi-book-fill';
      case 'Emergency Leave':
        return 'bi bi-exclamation-triangle-fill';
      default:
        return 'bi bi-calendar-event-fill';
    }
  }

  filterLeaveRequests(): void {
    this.filteredLeaveRequests = this.leaveRequests.filter(leave => {
      const matchesStatus = !this.leaveFilterStatus || leave.status === this.leaveFilterStatus;
      const matchesSearch = !this.leaveSearchQuery ||
        leave.type.toLowerCase().includes(this.leaveSearchQuery.toLowerCase()) ||
        leave.id.toString().includes(this.leaveSearchQuery) ||
        (leave.reason && leave.reason.toLowerCase().includes(this.leaveSearchQuery.toLowerCase()));
      return matchesStatus && matchesSearch;
    });
  }

  /**
   * Helper method to map backend leave requests to frontend model
   */
  private mapLeaveRequests(requests: any[]): LeaveRequest[] {
    return requests.map(req => {
      // Map backend fields to frontend format
      // Backend returns: requestId, id, fromDate, toDate, startDate, endDate, leaveType, status, attachmentPath, document, reason, name, email
      const backendReq = req as any;

      // Normalize status to handle mixed cases and different terms
      let status: 'Pending' | 'Approved' | 'Declined' = 'Pending';
      if (backendReq.status) {
        const s = backendReq.status.toString().toUpperCase();
        if (s === 'APPROVED') {
          status = 'Approved';
        } else if (s === 'DECLINED' || s === 'REJECTED') {
          status = 'Declined';
        } else if (s === 'PENDING') {
          status = 'Pending';
        }
      }

      const mapped: LeaveRequest = {
        id: backendReq.requestId || backendReq.id || 0,
        type: backendReq.leaveType || backendReq.type || '',
        startDate: backendReq.startDate || backendReq.fromDate || '',
        endDate: backendReq.endDate || backendReq.toDate || '',
        status: status,
        attachment: backendReq.document || backendReq.attachmentPath || '',
        supervisorEmail: this.intern.supervisorEmail || '',
        email: backendReq.email || this.intern.email,
        name: backendReq.name || this.intern.name,
        reason: backendReq.reason || ''
      };
      return mapped;
    }).sort((a, b) => {
      const dateA = a.startDate ? new Date(a.startDate).getTime() : 0;
      const dateB = b.startDate ? new Date(b.startDate).getTime() : 0;
      return dateB - dateA;
    });
  }

  loadLeaveRequests(): void {
    // Use getMyLeaveRequests() instead of getLeaveRequestsByIntern() 
    // This endpoint automatically gets the authenticated intern's leave requests
    console.log('Loading leave requests...');
    this.leaveRequestService.getMyLeaveRequests().subscribe({
      next: (requests) => {
        console.log('Leave requests received from backend:', requests);
        console.log('Number of requests:', requests.length);

        // Use helper method for consistent mapping
        this.leaveRequests = this.mapLeaveRequests(requests);

        console.log('Final leave requests array:', this.leaveRequests);
        this.filteredLeaveRequests = [...this.leaveRequests];
        console.log('Filtered leave requests:', this.filteredLeaveRequests);

        // ✅ Update recent leave requests and overview stats
        this.calculateOverviewStats();
        this.loadRecentData();

        this.cdr.detectChanges();
      },
      error: (error) => {
        console.error('Error loading leave requests:', error);
        console.error('Error details:', JSON.stringify(error, null, 2));
        this.leaveRequests = [];
        this.filteredLeaveRequests = [];
        this.recentLeaveRequests = []; // ✅ Clear recent leave requests on error
        this.cdr.detectChanges();
      }
    });
  }

  /**
   * Convert display leave type to backend enum value
   */
  private convertLeaveTypeToEnum(displayType: string): string {
    const typeMap: { [key: string]: string } = {
      'Annual Leave': 'ANNUAL',
      'Sick Leave': 'SICK',
      'Personal Leave': 'PERSONAL',
      'Family Responsibility': 'PERSONAL',
      'Study Leave': 'PERSONAL',
      'Emergency Leave': 'EMERGENCY',
      'Casual Leave': 'CASUAL'
    };
    return typeMap[displayType] || displayType;
  }

  /**
   * Start editing a leave request
   */
  editLeaveRequest(leave: LeaveRequest): void {
    if (leave.status !== 'Pending') {
      this.showMessage('Only pending leave requests can be edited', 'warning');
      return;
    }

    this.editingLeaveId = leave.id;
    this.editLeaveData = {
      leaveType: this.convertLeaveTypeToEnum(leave.type),
      fromDate: leave.startDate,
      toDate: leave.endDate,
      reason: leave.reason || ''
    };
    this.cdr.detectChanges();
  }

  /**
   * Save edited leave request
   */
  saveLeaveEdit(): void {
    if (!this.editingLeaveId) return;

    // Verify status is still Pending (prevent race conditions)
    const leave = this.leaveRequests.find(l => l.id === this.editingLeaveId);
    if (!leave || leave.status !== 'Pending') {
      this.showMessage('Cannot save changes: Request is no longer Pending', 'danger');
      this.cancelLeaveEdit();
      return;
    }

    // Validate dates
    if (new Date(this.editLeaveData.fromDate) > new Date(this.editLeaveData.toDate)) {
      this.showMessage('End date must be after start date', 'danger');
      return;
    }

    const updateData = {
      leaveType: this.editLeaveData.leaveType as 'ANNUAL' | 'SICK' | 'PERSONAL' | 'EMERGENCY',
      fromDate: this.editLeaveData.fromDate,
      toDate: this.editLeaveData.toDate,
      reason: this.editLeaveData.reason
    };

    this.leaveRequestService.updateLeaveRequest(this.editingLeaveId, updateData).subscribe({
      next: (updated) => {
        this.showMessage('Leave request updated successfully', 'success');
        this.editingLeaveId = null;
        this.loadLeaveRequests(); // Reload to get updated data
      },
      error: (error) => {
        console.error('Error updating leave request:', error);
        this.showMessage(error.error?.error || 'Failed to update leave request', 'danger');
      }
    });
  }

  /**
   * Cancel editing leave request
   */
  cancelLeaveEdit(): void {
    this.editingLeaveId = null;
    this.editLeaveData = {
      leaveType: '',
      fromDate: '',
      toDate: '',
      reason: ''
    };
    this.cdr.detectChanges();
  }

  onFileSelect(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.attachment = input.files?.[0] || null;
  }

  // ======== ALERT MESSAGE (SweetAlert2) ========
  showMessage(msg: string, type: 'success' | 'danger' | 'warning'): void {
    let icon: 'success' | 'error' | 'warning' = 'success';
    if (type === 'danger') icon = 'error';
    if (type === 'warning') icon = 'warning';

    Swal.fire({
      icon: icon,
      title: msg,
      showConfirmButton: false,
      timer: 2500,
      toast: true,
      position: 'center',
    });
  }


  filterHistory(): void {
    const start = this.filterStartDate ? new Date(this.filterStartDate) : null;
    const end = this.filterEndDate ? new Date(this.filterEndDate) : null;

    let filtered = this.logs.filter(log => {
      const logDate = new Date(log.date);

      // Date range filter
      if (start && logDate < start) return false;
      if (end) {
        const endDate = new Date(end);
        endDate.setHours(23, 59, 59, 999);
        if (logDate > endDate) return false;
      }

      // Status filter
      if (this.attendanceStatusFilter) {
        const status = this.getAttendanceStatus(log.date);
        if (status !== this.attendanceStatusFilter) return false;
      }

      // Search filter
      if (this.attendanceSearchQuery) {
        const searchLower = this.attendanceSearchQuery.toLowerCase();
        const location = log.location?.toLowerCase() || '';
        if (!location.includes(searchLower)) return false;
      }

      return true;
    });

    // Sort by date descending
    this.filteredLogs = filtered.sort((a, b) => {
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    });
  }

  resetFilter(): void {
    this.filteredLogs = [...this.logs];
    this.filterStartDate = '';
    this.filterEndDate = '';
    this.attendanceStatusFilter = '';
    this.attendanceSearchQuery = '';
    this.filterHistory();
  }

  onFilterDateChange(): void {
    this.filterHistory();
  }

  setDateRange(range: 'today' | 'week' | 'month'): void {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    switch (range) {
      case 'today':
        this.filterStartDate = today.toISOString().split('T')[0];
        this.filterEndDate = today.toISOString().split('T')[0];
        break;
      case 'week':
        const weekStart = new Date(today);
        weekStart.setDate(today.getDate() - today.getDay() + 1); // Monday
        this.filterStartDate = weekStart.toISOString().split('T')[0];
        this.filterEndDate = today.toISOString().split('T')[0];
        break;
      case 'month':
        const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
        this.filterStartDate = monthStart.toISOString().split('T')[0];
        this.filterEndDate = today.toISOString().split('T')[0];
        break;
    }
    this.filterHistory();
  }

  getFilterDateRange(): string {
    if (!this.filterStartDate && !this.filterEndDate) {
      return 'all time';
    }
    if (this.filterStartDate && this.filterEndDate) {
      if (this.filterStartDate === this.filterEndDate) {
        return new Date(this.filterStartDate).toLocaleDateString();
      }
      return `${new Date(this.filterStartDate).toLocaleDateString()} - ${new Date(this.filterEndDate).toLocaleDateString()}`;
    }
    if (this.filterStartDate) {
      return `from ${new Date(this.filterStartDate).toLocaleDateString()}`;
    }
    if (this.filterEndDate) {
      return `until ${new Date(this.filterEndDate).toLocaleDateString()}`;
    }
    return 'all time';
  }

  getAttendanceStats(): { present: number; absent: number; onLeave: number; leftEarly: number } {
    const stats = { present: 0, absent: 0, onLeave: 0, leftEarly: 0 };
    const processedDates = new Set<string>();

    this.filteredLogs.forEach(log => {
      const dateStr = new Date(log.date).toDateString();

      // Only count each date once
      if (!processedDates.has(dateStr)) {
        processedDates.add(dateStr);
        const status = this.getAttendanceStatus(log.date);
        if (status === 'Present') stats.present++;
        else if (status === 'Absent') stats.absent++;
        else if (status === 'On Leave') stats.onLeave++;
        else if (status === 'Left Early') stats.leftEarly++;
      }
    });

    return stats;
  }

  getAttendanceRecords(): any[] {
    // Group logs by date and create records
    const recordsMap = new Map<string, any>();

    this.filteredLogs.forEach(log => {
      const dateStr = new Date(log.date).toDateString();

      if (!recordsMap.has(dateStr)) {
        recordsMap.set(dateStr, {
          date: new Date(log.date),
          timeIn: null,
          timeOut: null,
          image: null,
          location: null,
          status: this.getAttendanceStatus(log.date),
          duration: null
        });
      }

      const record = recordsMap.get(dateStr)!;

      if (log.action === 'Signed In' && log.timeIn) {
        record.timeIn = log.timeIn;
        record.image = log.image;
        record.location = log.location;
      }

      if (log.action === 'Signed Out' && log.timeOut) {
        record.timeOut = log.timeOut;
        if (log.location) record.location = log.location;
        // Preserve signature from sign-in if sign-out doesn't have one
        if (!record.image && log.image) {
          record.image = log.image;
        }
      }
    });

    // Calculate duration for each record
    recordsMap.forEach(record => {
      if (record.timeIn && record.timeOut) {
        const diff = new Date(record.timeOut).getTime() - new Date(record.timeIn).getTime();
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        record.duration = `${hours}h ${minutes}m`;
      }
    });

    return Array.from(recordsMap.values()).sort((a, b) => {
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    });
  }

  viewSignature(image: string): void {
    Swal.fire({
      imageUrl: image,
      imageAlt: 'Signature',
      showCloseButton: true,
      showConfirmButton: false,
      width: '600px',
      padding: '2rem'
    });
  }

  checkWeekend(dateString: string): boolean {
    const date = new Date(dateString);
    const day = date.getDay();
    return day === 0 || day === 6;
  }

  generateReport(): void {
    if (!this.reportStartDate || !this.reportEndDate) {
      this.showMessage('Please select both start and end dates.', 'warning');
      return;
    }

    const start = new Date(this.reportStartDate);
    const end = new Date(this.reportEndDate);

    if (start > end) {
      this.showMessage('Start date cannot be after end date.', 'danger');
      return;
    }

    // Generate dates based on include weekends option
    const allDates = this.reportIncludeWeekends
      ? this.generateAllDates(start, end)
      : this.generateWeekdays(start, end);

    this.reportLogs = allDates.map(date => {
      const existingLog = this.logs.find(log => {
        const logDate = new Date(log.date);
        return logDate.toDateString() === date.toDateString();
      });

      if (existingLog) {
        return {
          ...existingLog,
          status: this.getAttendanceStatus(date)
        };
      }

      // No log found → create placeholder
      return {
        date: date,
        image: null,
        location: undefined,
        timeIn: null,
        timeOut: null,
        action: this.getAttendanceStatus(date),
        status: this.getAttendanceStatus(date)
      };
    });

    this.showMessage(`Report generated successfully! Found ${this.reportLogs.length} record(s).`, 'success');
  }

  generateAllDates(start: Date, end: Date): Date[] {
    const dates: Date[] = [];
    let current = new Date(start);
    while (current <= end) {
      dates.push(new Date(current));
      current.setDate(current.getDate() + 1);
    }
    return dates;
  }

  getReportRecords(): any[] {
    const recordsMap = new Map<string, any>();

    this.reportLogs.forEach(log => {
      const dateStr = new Date(log.date).toDateString();

      if (!recordsMap.has(dateStr)) {
        recordsMap.set(dateStr, {
          date: new Date(log.date),
          timeIn: null,
          timeOut: null,
          image: null,
          location: null,
          status: log.status || this.getAttendanceStatus(log.date),
          duration: null
        });
      }

      const record = recordsMap.get(dateStr)!;

      if (log.action === 'Signed In' && log.timeIn) {
        record.timeIn = log.timeIn;
        record.image = log.image; // Signature from sign-in
        record.location = log.location;
      }

      if (log.action === 'Signed Out' && log.timeOut) {
        record.timeOut = log.timeOut;
        if (log.location) record.location = log.location;
        // Use signature from sign-out if available (prefer sign-out signature)
        if (log.image) {
          record.image = log.image;
        }
      }
    });

    // Calculate duration
    recordsMap.forEach(record => {
      if (record.timeIn && record.timeOut) {
        const diff = new Date(record.timeOut).getTime() - new Date(record.timeIn).getTime();
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        record.duration = `${hours}h ${minutes}m`;
      }
    });

    return Array.from(recordsMap.values()).sort((a, b) => {
      return new Date(a.date).getTime() - new Date(b.date).getTime();
    });
  }

  getReportStats(): { totalDays: number; present: number; absent: number; onLeave: number; leftEarly: number; workingDays: number; attendanceRate: number } {
    const stats = { totalDays: 0, present: 0, absent: 0, onLeave: 0, leftEarly: 0, workingDays: 0, attendanceRate: 0 };
    const processedDates = new Set<string>();

    this.reportLogs.forEach(log => {
      const dateStr = new Date(log.date).toDateString();

      if (!processedDates.has(dateStr)) {
        processedDates.add(dateStr);
        stats.totalDays++;

        const day = new Date(log.date).getDay();
        if (day !== 0 && day !== 6) {
          stats.workingDays++;
        }

        const status = log.status || this.getAttendanceStatus(log.date);
        if (status === 'Present') stats.present++;
        else if (status === 'Absent') stats.absent++;
        else if (status === 'On Leave') stats.onLeave++;
        else if (status === 'Left Early') stats.leftEarly++;
      }
    });

    if (stats.workingDays > 0) {
      stats.attendanceRate = Math.round(((stats.present + stats.leftEarly) / stats.workingDays) * 100);
    }

    return stats;
  }

  setReportDateRange(range: 'today' | 'week' | 'month' | 'quarter' | 'year'): void {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    switch (range) {
      case 'today':
        this.reportStartDate = today.toISOString().split('T')[0];
        this.reportEndDate = today.toISOString().split('T')[0];
        break;
      case 'week':
        const weekStart = new Date(today);
        weekStart.setDate(today.getDate() - today.getDay() + 1); // Monday
        this.reportStartDate = weekStart.toISOString().split('T')[0];
        this.reportEndDate = today.toISOString().split('T')[0];
        break;
      case 'month':
        const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
        this.reportStartDate = monthStart.toISOString().split('T')[0];
        this.reportEndDate = today.toISOString().split('T')[0];
        break;
      case 'quarter':
        const quarterStart = new Date(today.getFullYear(), Math.floor(today.getMonth() / 3) * 3, 1);
        this.reportStartDate = quarterStart.toISOString().split('T')[0];
        this.reportEndDate = today.toISOString().split('T')[0];
        break;
      case 'year':
        const yearStart = new Date(today.getFullYear(), 0, 1);
        this.reportStartDate = yearStart.toISOString().split('T')[0];
        this.reportEndDate = today.toISOString().split('T')[0];
        break;
    }
    this.onReportDateChange();
  }

  onReportDateChange(): void {
    // Auto-generate report when dates change
    if (this.reportStartDate && this.reportEndDate) {
      // Don't auto-generate, let user click button
    }
  }

  getReportMinDate(): string {
    // Get the earliest date from logs, or today
    if (this.logs.length > 0) {
      const earliestLog = this.logs.reduce((earliest, log) => {
        return new Date(log.date) < new Date(earliest.date) ? log : earliest;
      });
      return new Date(earliestLog.date).toISOString().split('T')[0];
    }
    const today = new Date();
    return today.toISOString().split('T')[0];
  }

  getReportMaxDate(): string {
    const today = new Date();
    return today.toISOString().split('T')[0];
  }

  resetReportFilter(): void {
    this.reportLogs = [];
    this.reportStartDate = '';
    this.reportEndDate = '';
    this.reportIncludeWeekends = false;
    this.reportIncludeSignatures = true;
  }

  /**
   * Helper function to extract and validate base64 image data from data URI
   * @param imageData - The image data (can be data URI or base64 string)
   * @returns Object with imageData (base64) and imageFormat (PNG/JPEG)
   */
  private extractImageData(imageData: string): { imageData: string; imageFormat: string } | null {
    if (!imageData) {
      return null;
    }

    // If it's already a base64 string without data URI prefix
    if (!imageData.startsWith('data:image')) {
      // Assume PNG if no prefix
      return { imageData: imageData, imageFormat: 'PNG' };
    }

    // Extract from data URI
    const base64Match = imageData.match(/data:image\/(\w+);base64,(.+)/);
    if (base64Match && base64Match.length >= 3) {
      const format = base64Match[1].toUpperCase();
      const base64Data = base64Match[2];

      // Validate format (jsPDF supports PNG and JPEG)
      if (format === 'PNG' || format === 'JPEG' || format === 'JPG') {
        return {
          imageData: base64Data,
          imageFormat: format === 'JPG' ? 'JPEG' : format
        };
      }
    }

    // Try to extract just the base64 part if format detection fails
    const base64Only = imageData.split(',')[1];
    if (base64Only) {
      return { imageData: base64Only, imageFormat: 'PNG' };
    }

    return null;
  }

  downloadReportPDF(): void {
    if (this.reportLogs.length === 0) {
      this.showMessage('Please generate a report first before downloading.', 'warning');
      return;
    }

    const doc = new jsPDF('landscape', 'mm', 'a4');
    const records = this.getReportRecords();
    const stats = this.getReportStats();

    // Header Section
    doc.setFontSize(20);
    doc.setTextColor(0, 102, 204);
    doc.text('Attendance Report', 14, 15);

    doc.setFontSize(12);
    doc.setTextColor(0, 0, 0);
    doc.text(`Intern: ${this.intern.name}`, 14, 22);
    doc.text(`Department: ${this.intern.Department}`, 14, 27);
    doc.text(`Field: ${this.intern.field}`, 14, 32);
    doc.text(`Date Range: ${new Date(this.reportStartDate).toLocaleDateString()} - ${new Date(this.reportEndDate).toLocaleDateString()}`, 14, 37);
    doc.text(`Generated: ${new Date().toLocaleDateString()}`, 14, 42);

    // Statistics Section
    doc.setFontSize(14);
    doc.setTextColor(0, 102, 204);
    doc.text('Summary Statistics', 14, 50);

    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
    doc.text(`Total Days: ${stats.totalDays}`, 14, 56);
    doc.text(`Working Days: ${stats.workingDays}`, 14, 61);
    doc.text(`Present: ${stats.present}`, 80, 56);
    doc.text(`Absent: ${stats.absent}`, 80, 61);
    doc.text(`On Leave: ${stats.onLeave}`, 140, 56);
    doc.text(`Left Early: ${stats.leftEarly}`, 140, 61);
    doc.text(`Attendance Rate: ${stats.attendanceRate}%`, 200, 56);

    // Store signature images with record indices
    const signatureMap = new Map<number, string>();
    records.forEach((record, index) => {
      if (record.image) {
        signatureMap.set(index, record.image);
        console.log(`Stored signature for record ${index}:`, record.image.substring(0, 50) + '...');
      }
    });

    console.log(`Total signatures stored: ${signatureMap.size} out of ${records.length} records`);

    // Store cell positions for signature column
    const signatureCellPositions: Array<{ x: number; y: number; width: number; height: number; recordIndex: number; page: number }> = [];

    // Prepare table data - conditionally include Status and Signature columns
    const body = records.map(record => {
      const date = new Date(record.date);
      const duration = record.duration || '-';

      const row = [
        date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        date.toLocaleDateString('en-US', { weekday: 'short' }),
        record.timeIn ? new Date(record.timeIn).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '-',
        record.timeOut ? new Date(record.timeOut).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '-',
        duration,
        record.location || '-'
      ];

      // Add Status column only if "Include Status" is selected
      if (this.reportIncludeWeekends) {
        row.push(record.status);
      }

      // Add empty string for Signature column if "Include Signatures" is selected
      if (this.reportIncludeSignatures) {
        row.push(''); // Empty string - image will be added via didDrawCell
      }

      return row;
    });

    // Table headers - conditionally include Status and Signature columns
    const headers = ['Date', 'Day', 'Time In', 'Time Out', 'Duration', 'Location'];
    if (this.reportIncludeWeekends) {
      headers.push('Status');
    }
    if (this.reportIncludeSignatures) {
      headers.push('Signature');
    }

    // Calculate signature column index (it's always the last column if included)
    const signatureColumnIndex = this.reportIncludeSignatures ? headers.length - 1 : -1;

    // Table with hooks to capture cell positions for signature column
    autoTable(doc, {
      head: [headers],
      body: body,
      startY: 68,
      margin: { left: 14, right: 14 },
      styles: {
        fontSize: 8,
        cellPadding: 2
      },
      headStyles: {
        fillColor: [13, 110, 253],
        textColor: 255,
        fontStyle: 'bold'
      },
      alternateRowStyles: {
        fillColor: [245, 247, 250]
      },
      didParseCell: (data: any) => {
        // Clear text content for signature column to prevent text from showing
        if (this.reportIncludeSignatures && data.column.index === signatureColumnIndex && data.row.index > 0) {
          data.cell.text = [''];
        }
      },
      didDrawCell: (data: any) => {
        // Capture cell positions for signature column
        // Check if this is the signature column by comparing with the calculated index
        if (this.reportIncludeSignatures && data.column.index === signatureColumnIndex && data.row.index > 0) {
          const recordIndex = data.row.index - 1;

          // Get current page number
          let currentPage = 1;
          try {
            const pageInfo = (doc as any).internal.getCurrentPageInfo();
            if (pageInfo && pageInfo.pageNumber) {
              currentPage = pageInfo.pageNumber;
            } else {
              currentPage = doc.getNumberOfPages() || 1;
            }
          } catch (e) {
            currentPage = doc.getNumberOfPages() || 1;
          }

          signatureCellPositions.push({
            x: data.cell.x,
            y: data.cell.y,
            width: data.cell.width,
            height: data.cell.height,
            recordIndex: recordIndex,
            page: currentPage
          });

          console.log(`Captured signature cell for record ${recordIndex} on page ${currentPage}, column index: ${data.column.index}`);
        }
      }
    });

    // Add signature images after table is drawn using captured positions
    console.log(`Adding signatures: includeSignatures=${this.reportIncludeSignatures}, cellPositions=${signatureCellPositions.length}, signatureMap=${signatureMap.size}`);

    if (this.reportIncludeSignatures && signatureCellPositions.length > 0) {
      signatureCellPositions.forEach((cellPos) => {
        const signatureImage = signatureMap.get(cellPos.recordIndex);

        console.log(`Processing cell for record ${cellPos.recordIndex}: hasImage=${!!signatureImage}`);

        if (signatureImage) {
          try {
            // Extract and validate image data
            const extractedImage = this.extractImageData(signatureImage);

            if (!extractedImage) {
              throw new Error('Failed to extract image data from signature');
            }

            // Switch to the correct page
            const totalPages = doc.getNumberOfPages();
            const targetPage = Math.min(cellPos.page, totalPages);
            doc.setPage(targetPage);

            // Image size to fit in cell
            const imgWidth = 20;
            const imgHeight = 10;

            // Calculate centered position in cell
            const x = cellPos.x + (cellPos.width / 2) - (imgWidth / 2);
            const y = cellPos.y + 2;

            // Validate base64 data is not empty
            if (!extractedImage.imageData || extractedImage.imageData.trim().length === 0) {
              throw new Error('Empty base64 image data');
            }

            // Add image to PDF with proper format
            doc.addImage(
              extractedImage.imageData,
              extractedImage.imageFormat,
              x,
              y,
              imgWidth,
              imgHeight,
              undefined, // alias
              'FAST' // compression
            );

            console.log(`✓ Successfully added signature for record ${cellPos.recordIndex} on page ${targetPage} (format: ${extractedImage.imageFormat})`);
          } catch (error) {
            console.error(`✗ Error adding signature image for record ${cellPos.recordIndex}:`, error);
            // Draw dash if image fails
            try {
              doc.setPage(cellPos.page);
              doc.setFontSize(8);
              doc.setTextColor(128, 128, 128);
              doc.text('-', cellPos.x + cellPos.width / 2, cellPos.y + cellPos.height / 2 + 2, { align: 'center' });
            } catch (e) {
              // Ignore errors
            }
          }
        } else {
          // No signature - draw a dash
          try {
            doc.setPage(cellPos.page);
            doc.setFontSize(8);
            doc.setTextColor(128, 128, 128);
            doc.text('-', cellPos.x + cellPos.width / 2, cellPos.y + cellPos.height / 2 + 2, { align: 'center' });
          } catch (e) {
            // Ignore errors
          }
        }
      });
    }

    // Footer
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(128, 128, 128);
      doc.text(
        `Page ${i} of ${pageCount}`,
        doc.internal.pageSize.getWidth() / 2,
        doc.internal.pageSize.getHeight() - 10,
        { align: 'center' }
      );
      doc.text(
        `Generated on ${new Date().toLocaleString()}`,
        doc.internal.pageSize.getWidth() / 2,
        doc.internal.pageSize.getHeight() - 5,
        { align: 'center' }
      );
    }

    // Generate filename
    const filename = `attendance_report_${this.reportStartDate}_to_${this.reportEndDate}.pdf`;
    doc.save(filename);

    this.showMessage('PDF report downloaded successfully!', 'success');
  }



  // Helper function to get ISO week number
  getWeekNumber(date: Date): number {
    const tempDate = new Date(date.getTime());
    tempDate.setHours(0, 0, 0, 0);
    tempDate.setDate(tempDate.getDate() + 4 - (tempDate.getDay() || 7));
    const yearStart = new Date(tempDate.getFullYear(), 0, 1);
    return Math.ceil((((tempDate.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  }




  downloadReportExcel(): void {
    if (this.reportLogs.length === 0) {
      this.showMessage('Please generate a report first before downloading.', 'warning');
      return;
    }

    const records = this.getReportRecords();
    const stats = this.getReportStats();

    // Create workbook
    const wb = XLSX.utils.book_new();

    // Summary Sheet
    const summaryData = [
      ['Attendance Report Summary'],
      [''],
      ['Intern Name', this.intern.name],
      ['Department', this.intern.Department],
      ['Field', this.intern.field],
      ['Email', this.intern.email],
      [''],
      ['Report Period'],
      ['Start Date', new Date(this.reportStartDate).toLocaleDateString()],
      ['End Date', new Date(this.reportEndDate).toLocaleDateString()],
      ['Generated', new Date().toLocaleString()],
      [''],
      ['Statistics'],
      ['Total Days', stats.totalDays],
      ['Working Days', stats.workingDays],
      ['Present', stats.present],
      ['Absent', stats.absent],
      ['On Leave', stats.onLeave],
      ['Left Early', stats.leftEarly],
      ['Attendance Rate', `${stats.attendanceRate}%`],
    ];

    const summaryWs = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, summaryWs, 'Summary');

    // Attendance Data Sheet - conditionally include Status column
    const attendanceData = records.map(record => {
      const date = new Date(record.date);
      const row: any = {
        'Date': date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        'Day': date.toLocaleDateString('en-US', { weekday: 'long' }),
        'Time In': record.timeIn ? new Date(record.timeIn).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '-',
        'Time Out': record.timeOut ? new Date(record.timeOut).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '-',
        'Duration': record.duration || '-',
        'Location': record.location || '-'
      };

      // Add Status column only if "Include Status" is selected
      if (this.reportIncludeWeekends) {
        row['Status'] = record.status;
      }

      return row;
    });

    const attendanceWs = XLSX.utils.json_to_sheet(attendanceData);

    // Set column widths - conditionally include Status column width
    const columnWidths = [
      { wch: 12 }, // Date
      { wch: 12 }, // Day
      { wch: 10 }, // Time In
      { wch: 10 }, // Time Out
      { wch: 10 }, // Duration
      { wch: 20 }  // Location
    ];

    if (this.reportIncludeWeekends) {
      columnWidths.push({ wch: 12 }); // Status
    }

    attendanceWs['!cols'] = columnWidths;

    XLSX.utils.book_append_sheet(wb, attendanceWs, 'Attendance Data');

    // Generate filename
    const filename = `attendance_report_${this.reportStartDate}_to_${this.reportEndDate}.xlsx`;
    XLSX.writeFile(wb, filename);

    this.showMessage('Excel report downloaded successfully!', 'success');
  }

  // ======== OVERVIEW STATISTICS ========
  updateCurrentDate(): void {
    const now = new Date();
    this.currentDate = now.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

  calculateOverviewStats(): void {
    // Get all weekday dates from the start of the current month to today
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const weekdays = this.generateWeekdays(startOfMonth, now);

    let present = 0;
    let absent = 0;
    let onLeave = 0;
    let leftEarly = 0;

    weekdays.forEach(date => {
      const status = this.getAttendanceStatus(date);
      if (status === 'Present' || status === 'Signed In' || status === 'Not Signed Out') present++;
      else if (status === 'Absent') absent++;
      else if (status === 'On Leave') onLeave++;
      else if (status === 'Left Early') leftEarly++;
    });

    const totalDays = weekdays.length;
    const attendanceRate = totalDays > 0 ? Math.round(((present + leftEarly) / totalDays) * 100) : 0;

    // Get today's status
    const todayStatus = this.getTodayStatus();

    // Calculate progress for attendance (target is 80%)
    const attendanceProgress = Math.min((attendanceRate / 80) * 100, 100);

    this.overviewStats = [
      {
        label: 'Days Present',
        value: present,
        icon: 'bi-check-circle-fill',
        color: 'success',
        description: `Out of ${totalDays} working days this month`,
        subtitle: `${totalDays} total days`,
        action: 'history',
        trend: present > 0 ? 'up' : 'neutral'
      },
      {
        label: 'Days Absent',
        value: absent,
        icon: 'bi-x-circle-fill',
        color: 'danger',
        description: `Missed ${absent} day${absent !== 1 ? 's' : ''} this month`,
        subtitle: `${totalDays} total days`,
        action: 'history',
        trend: absent > 0 ? 'down' : 'neutral'
      },
      {
        label: 'On Leave',
        value: onLeave,
        icon: 'bi-calendar-check-fill',
        color: 'warning',
        description: `${onLeave} approved leave day${onLeave !== 1 ? 's' : ''}`,
        subtitle: 'Approved requests',
        action: 'leave',
        trend: 'neutral'
      },
      {
        label: 'Attendance Rate',
        value: `${attendanceRate}%`,
        icon: 'bi-graph-up-arrow',
        color: 'primary',
        description: attendanceRate >= 80 ? 'Excellent attendance!' : attendanceRate >= 60 ? 'Good attendance' : 'Needs improvement',
        progress: attendanceProgress,
        subtitle: `Target: 80%`,
        action: 'history',
        trend: attendanceRate >= 80 ? 'up' : attendanceRate >= 60 ? 'neutral' : 'down'
      },
      {
        label: 'Current Status',
        value: todayStatus,
        icon: this.getStatusIcon(todayStatus),
        color: this.getStatusColor(todayStatus),
        description: this.getStatusDescription(todayStatus),
        subtitle: 'Today\'s status',
        action: todayStatus === 'Absent' || todayStatus === 'Left Early' ? 'signature' : 'history',
        trend: 'neutral'
      }
    ];
  }

  getStatusDescription(status: string): string {
    switch (status) {
      case 'Present': return 'You have signed in and out today';
      case 'Signed In': return 'You are currently signed in';
      case 'Not Signed Out': return 'You forgot to sign out yesterday';
      case 'Absent': return 'You haven\'t signed in today';
      case 'On Leave': return 'You are on approved leave';
      case 'Left Early': return 'You signed in but checked out before 16:45';
      default: return 'Status unknown';
    }
  }

  handleStatCardClick(stat: OverviewStat): void {
    if (stat.action) {
      this.showSection(stat.action as Section);
    }
  }

  getTodayStatus(): string {
    if (this.onLeaveToday) return 'On Leave';
    if (this.signedInToday && this.signedOutToday) return 'Present';
    if (this.signedInToday && !this.signedOutToday) {
      const now = new Date();
      if (now.getHours() >= 17) return 'Not Signed Out';
      return 'Signed In';
    }
    return 'Absent';
  }

  getStatusColor(status: string): string {
    switch (status) {
      case 'Present': return 'success';
      case 'Signed In': return 'info';
      case 'Absent': return 'danger';
      case 'On Leave': return 'warning';
      case 'Not Signed Out': return 'warning';
      default: return 'secondary';
    }
  }

  loadRecentData(): void {
    // Get recent attendance logs (last 5 weekdays)
    const weekdays = this.generateWeekdays(
      this.getMondayOfCurrentWeek(),
      this.getFridayOfCurrentWeek()
    );
    this.recentAttendanceLogs = this.getFullWeekLogs().slice(0, 5);

    // Get recent leave requests (last 5) - sorted by start date (most recent first)
    if (this.leaveRequests && this.leaveRequests.length > 0) {
      this.recentLeaveRequests = [...this.leaveRequests]
        .sort((a, b) => {
          const dateA = a.startDate ? new Date(a.startDate).getTime() : 0;
          const dateB = b.startDate ? new Date(b.startDate).getTime() : 0;
          return dateB - dateA; // Most recent first
        })
        .slice(0, 5);
      console.log('✓ Updated recent leave requests for overview:', this.recentLeaveRequests.length, 'request(s)');
    } else {
      this.recentLeaveRequests = [];
      console.log('ℹ️ No leave requests available for recent list');
    }
  }

}
