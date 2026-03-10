import { Component, OnInit, OnDestroy, AfterViewInit, ElementRef, ChangeDetectorRef } from '@angular/core';
import { RouterLink, Router, NavigationEnd } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../services/auth.service';
import { SidebarService } from '../../services/sidebar.service';
import { filter } from 'rxjs/operators';
import { Subscription } from 'rxjs';
import { ProfileTabService } from '../../services/profile-tab.service';
import { NotificationService, Notification } from '../../services/notification.service';
import { HelpService } from '../../services/help.service';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink
  ],
  templateUrl: './navbar.html',
  styleUrl: './navbar.css'
})
export class Navbar implements OnInit, OnDestroy, AfterViewInit {

  showProfile = false;
  showNotifications = false;
  private outsideClickHandler: (event: MouseEvent) => void;

  notifications: Notification[] = [];
  unreadCount: number = 0;

  user = {
    fullName: '',
    email: '',
    role: '',
    department: '',
    field: ''
  };

  activeProfileTab: 'profile' | 'password' = 'profile';
  isProfileActive: boolean = false;

  isSidebarExpanded: boolean = true;
  private subscriptions = new Subscription();

  constructor(
    private authService: AuthService,
    private router: Router,
    private elementRef: ElementRef,
    private sidebarService: SidebarService,
    private cdr: ChangeDetectorRef,
    private profileTabService: ProfileTabService,
    private notificationService: NotificationService,
    private helpService: HelpService
  ) {
    // Bind the outside click handler to maintain reference for removeEventListener
    this.outsideClickHandler = this.handleOutsideClick.bind(this);
  }

  ngOnInit(): void {
    // Subscribe to sidebar state
    this.subscriptions.add(
      this.sidebarService.isSidebarExpanded$.subscribe(expanded => {
        this.isSidebarExpanded = expanded;
        this.cdr.detectChanges();
      })
    );
    // Get current user from auth service
    const currentUser = this.authService.getCurrentUserSync();
    if (currentUser) {
      console.log('Navbar - API Response User:', currentUser);

      // Explicitly handle name and surname
      let displayName = currentUser.name || '';
      if (currentUser.surname && currentUser.surname !== 'undefined' && currentUser.surname !== 'null') {
        displayName += ' ' + currentUser.surname;
      }

      // Fallback to username if name is empty
      if (!displayName.trim()) {
        displayName = currentUser.username || 'User';
      }

      this.user = {
        fullName: displayName.trim(),
        email: currentUser.email,
        role: currentUser.role,
        department: currentUser.department || '',
        field: currentUser.field || ''
      };
    } else {
      // Fallback if no user is logged in
      this.user = {
        fullName: 'User',
        email: '',
        role: '',
        department: '',
        field: ''
      };
    }

    // Subscribe to profile tab changes
    this.subscriptions.add(
      this.profileTabService.activeTab$.subscribe(tab => {
        this.activeProfileTab = tab;
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

    // Subscribe to notifications
    this.subscriptions.add(
      this.notificationService.notifications$.subscribe(notifications => {
        this.notifications = notifications;
        this.cdr.detectChanges();
      })
    );

    this.subscriptions.add(
      this.notificationService.unreadCount$.subscribe(count => {
        this.unreadCount = count;
        this.cdr.detectChanges();
      })
    );

    // Close navbar on route change
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe(() => {
      this.closeNavbar();
    });
  }

  toggleSidebar(): void {
    this.sidebarService.toggleSidebar();
  }

  ngAfterViewInit(): void {
    // Add click listeners to mobile nav links to close navbar
    setTimeout(() => {
      const mobileNavLinks = this.elementRef.nativeElement.querySelectorAll('.mobile-nav-link');
      mobileNavLinks.forEach((link: HTMLElement) => {
        link.addEventListener('click', () => {
          this.closeNavbar();
        });
      });

      // Listen for Bootstrap collapse events
      const collapseElement = this.elementRef.nativeElement.querySelector('#navbarNav');
      if (collapseElement) {
        collapseElement.addEventListener('shown.bs.collapse', () => {
          this.showBackdrop();
        });
        collapseElement.addEventListener('hidden.bs.collapse', () => {
          this.hideBackdrop();
        });
      }
    }, 100);

    // Close navbar when clicking outside
    document.addEventListener('click', this.outsideClickHandler);
  }

  ngOnDestroy(): void {
    // Remove outside click listener
    document.removeEventListener('click', this.outsideClickHandler);

    // Unsubscribe
    this.subscriptions.unsubscribe();
  }

  setProfileTab(tab: 'profile' | 'password'): void {
    this.profileTabService.setActiveTab(tab);
  }

  toggleProfile(): void {
    this.showProfile = !this.showProfile;
    if (this.showProfile) {
      this.showNotifications = false; // Close notifications when profile opens
    }
  }

  toggleNotifications(event?: Event): void {
    if (event) {
      event.stopPropagation();
    }
    this.showNotifications = !this.showNotifications;
    if (this.showNotifications) {
      this.showProfile = false; // Close profile when notifications open
    }
  }

  markAsRead(id: string, event?: Event): void {
    if (event) {
      event.stopPropagation();
    }
    this.notificationService.markAsRead(id);
  }

  markAllAsRead(): void {
    this.notificationService.markAllAsRead();
  }

  clearAllNotifications(): void {
    this.notificationService.clearAll();
  }

  formatTime(date: Date): string {
    const now = new Date();
    const diff = now.getTime() - new Date(date).getTime();

    // Less than a minute
    if (diff < 60000) {
      return 'Just now';
    }

    // Less than an hour
    if (diff < 3600000) {
      const minutes = Math.floor(diff / 60000);
      return `${minutes}m ago`;
    }

    // Less than a day
    if (diff < 86400000) {
      const hours = Math.floor(diff / 3600000);
      return `${hours}h ago`;
    }

    // More than a day
    return new Date(date).toLocaleDateString();
  }

  getDashboardRoute(): string {
    const currentUser = this.authService.getCurrentUserSync();
    if (!currentUser) return '/login';

    const role = currentUser.role;
    if (role === 'ADMIN') return '/admin/admin-dashboard';
    if (role === 'SUPERVISOR') return '/supervisor/supervisor-dashboard';
    if (role === 'INTERN') return '/intern/intern-dashboard';
    if (role === 'SUPER_ADMIN') return '/super-admin/super-admin-dashboard';
    return '/login';
  }

  navigateToDashboard(event?: Event): void {
    if (event) {
      event.preventDefault();
    }
    const route = this.getDashboardRoute();
    if (route !== '/login') {
      const targetUrl = this.router.createUrlTree([route], { queryParams: { section: 'overview' } }).toString();
      if (this.router.url === targetUrl) {
        // Force refresh if already on the exact same page/section
        window.location.reload();
      } else {
        this.router.navigate([route], { queryParams: { section: 'overview' } });
      }
    } else {
      this.router.navigate([route]);
    }
  }

  navigateToProfile(): void {
    const currentUser = this.authService.getCurrentUserSync();
    if (!currentUser) {
      this.router.navigate(['/login']);
      return;
    }

    this.router.navigate(['/profile']);
  }

  getUserRole(): string {
    const role = this.authService.getUserRole();
    if (!role) return '';

    const roleMap: { [key: string]: string } = {
      'SUPER_ADMIN': 'Super Admin',
      'ADMIN': 'Administrator',
      'SUPERVISOR': 'Supervisor',
      'INTERN': 'Intern'
    };

    return roleMap[role] || role;
  }

  getUserSurname(): string {
    if (!this.user.fullName) return '';
    const nameParts = this.user.fullName.trim().split(' ');
    return nameParts.length > 0 ? nameParts[nameParts.length - 1] : '';
  }

  shouldShowSurname(): boolean {
    const role = this.authService.getUserRole();
    return role !== 'SUPER_ADMIN' && role !== null;
  }

  shouldShowSettings(): boolean {
    // Determine if settings icon should be shown based on role if necessary
    // Currently, let's show it for all logged-in users
    return !!this.authService.getCurrentUserSync();
  }

  toggleHelp(): void {
    this.helpService.toggleHelp();
    this.closeNavbar(); // Close mobile navbar if open
  }

  closeNavbar(): void {
    const collapseElement = this.elementRef.nativeElement.querySelector('#navbarNav');
    if (collapseElement && collapseElement.classList.contains('show')) {
      const bsCollapse = (window as any).bootstrap?.Collapse?.getInstance(collapseElement);
      if (bsCollapse) {
        bsCollapse.hide();
      } else {
        collapseElement.classList.remove('show');
        const toggler = this.elementRef.nativeElement.querySelector('.navbar-toggler');
        if (toggler) {
          toggler.setAttribute('aria-expanded', 'false');
        }
      }
    }
    this.hideBackdrop();
  }

  showBackdrop(): void {
    const backdrop = document.querySelector('#navbarNavBackdrop');
    if (backdrop) {
      backdrop.classList.add('show');
    }
  }

  hideBackdrop(): void {
    const backdrop = document.querySelector('#navbarNavBackdrop');
    if (backdrop) {
      backdrop.classList.remove('show');
    }
  }

  handleOutsideClick(event: MouseEvent): void {
    const navbarElement = this.elementRef.nativeElement;
    const collapseElement = navbarElement.querySelector('#navbarNav');
    const backdrop = document.querySelector('#navbarNavBackdrop');

    if (collapseElement && collapseElement.classList.contains('show')) {
      const clickedInsideNavbar = navbarElement.contains(event.target as Node);
      const clickedOnBackdrop = backdrop && backdrop.contains(event.target as Node);

      if (!clickedInsideNavbar || clickedOnBackdrop) {
        this.closeNavbar();
      }
    }

    // Handle outside click for notifications dropdown
    if (this.showNotifications) {
      const notificationDropdown = navbarElement.querySelector('.notification-dropdown');
      const notificationBtn = navbarElement.querySelector('.notification-btn');

      if (notificationDropdown && notificationBtn) {
        const clickedInsideDropdown = notificationDropdown.contains(event.target as Node);
        const clickedOnBtn = notificationBtn.contains(event.target as Node);

        if (!clickedInsideDropdown && !clickedOnBtn) {
          this.showNotifications = false;
          this.cdr.detectChanges();
        }
      }
    }
  }

  confirmLogout(): void {
    Swal.fire({
      title: 'Logout?',
      text: 'Are you sure you want to logout?',
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#3085d6',
      confirmButtonText: 'Yes, logout',
      cancelButtonText: 'Cancel',
      reverseButtons: true
    }).then((result) => {
      if (result.isConfirmed) {
        this.logout();
      }
    });
  }

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/login']);
    this.closeNavbar();
  }
}

