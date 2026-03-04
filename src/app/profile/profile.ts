import { Component, OnInit, OnDestroy, Input } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, AbstractControl, ValidationErrors } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { AuthService, CurrentUser } from '../services/auth.service';
import { ApiService } from '../services/api.service';
import { DepartmentService } from '../services/department.service';
import { ProfileTabService } from '../services/profile-tab.service';
import { Subscription } from 'rxjs';
import Swal from 'sweetalert2';
import type { SweetAlertResult } from 'sweetalert2';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './profile.html',
  styleUrls: ['./profile.css']
})
export class Profile implements OnInit {
  profileForm: FormGroup;
  passwordForm: FormGroup;
  currentUser: CurrentUser | null = null;
  isLoading = false;
  showPassword = false;
  showCurrentPassword = false;
  showNewPassword = false;
  showConfirmPassword = false;
  activeTab: 'profile' | 'password' = 'profile';
  private subscriptions = new Subscription();

  @Input() isEmbedded: boolean = false;

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private api: ApiService,
    private router: Router,
    public departmentService: DepartmentService,
    private profileTabService: ProfileTabService
  ) {
    this.profileForm = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(2)]],
      surname: ['', [Validators.minLength(2)]],
      email: ['', [Validators.required, Validators.email]],

      department: [''],
      field: [''],
      employer: [''],
      idNumber: [''],
      startDate: [''],
      endDate: ['']
    });

    this.passwordForm = this.fb.group({
      currentPassword: ['', [Validators.required]],
      newPassword: ['', [Validators.required, Validators.minLength(8), this.passwordStrengthValidator]],
      confirmPassword: ['', [Validators.required]]
    }, { validators: this.passwordMatchValidator });
  }

  ngOnInit(): void {
    if (!this.authService.isLoggedIn()) {
      this.router.navigate(['/login']);
      return;
    }

    // Auto-populate name and surname from current user before loading profile
    this.autoPopulateNameAndSurname();
    this.loadUserProfile();

    // Subscribe to tab changes from the service
    this.subscriptions.add(
      this.profileTabService.activeTab$.subscribe(tab => {
        this.activeTab = tab;
      })
    );

    // Mark profile as active for the navbar
    this.profileTabService.setProfileActive(true);
  }

  ngOnDestroy(): void {
    // Mark profile as inactive
    this.profileTabService.setProfileActive(false);
    this.subscriptions.unsubscribe();
  }

  private lastEmailValue: string = '';

  onEmailKeyDown(event: KeyboardEvent): void {
    const input = event.target as HTMLInputElement;
    this.lastEmailValue = input.value;
  }

  onEmailInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const emailControl = this.profileForm.get('email');
    const currentValue = emailControl?.value || input.value;

    // Check if the value just changed to end with "@" (user just typed "@")
    // and doesn't already contain "@univen.ac.za"
    if (currentValue &&
      currentValue.endsWith('@') &&
      !currentValue.includes('@univen.ac.za') &&
      this.lastEmailValue !== currentValue) {

      // Auto-complete to "@univen.ac.za"
      const newValue = currentValue + 'univen.ac.za';
      emailControl?.setValue(newValue);

      // Select the auto-completed part so user can easily accept or replace it
      setTimeout(() => {
        const startPosition = currentValue.length; // Position after "@"
        const endPosition = newValue.length;
        input.setSelectionRange(startPosition, endPosition);
      }, 0);
    }

    this.lastEmailValue = currentValue;
  }

  /**
   * Automatically populate name and surname from current user data
   */
  autoPopulateNameAndSurname(): void {
    const currentUser = this.authService.getCurrentUserSync();
    if (currentUser) {
      // If name and surname are already separate, use them
      if (currentUser.name && currentUser.surname) {
        this.profileForm.patchValue({
          name: currentUser.name,
          surname: currentUser.surname
        });
      } else if (currentUser.name) {
        // If only full name exists, split it
        const fullName = currentUser.name.trim();
        const nameParts = fullName.split(' ');
        const firstName = nameParts[0] || '';
        const surname = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';

        this.profileForm.patchValue({
          name: firstName,
          surname: surname
        });
      }
    }
  }

  loadUserProfile(): void {
    this.currentUser = this.authService.getCurrentUserSync();
    if (!this.currentUser) {
      console.error('No current user found');
      this.router.navigate(['/login']);
      return;
    }

    // Load full profile from backend
    this.isLoading = true;
    this.api.get<any>('settings/profile').subscribe({
      next: (profile) => {
        this.isLoading = false;
        console.log('Profile loaded:', profile);

        // Update current user with profile data
        if (this.currentUser) {
          this.currentUser.name = profile.name || this.currentUser.name;
          this.currentUser.surname = profile.surname || this.currentUser.surname;
          this.currentUser.department = profile.department || this.currentUser.department;

          this.currentUser.field = profile.field || this.currentUser.field;
          this.currentUser.employer = profile.employer || this.currentUser.employer;
          this.currentUser.idNumber = profile.idNumber || this.currentUser.idNumber;
          this.currentUser.startDate = profile.startDate || this.currentUser.startDate;
          this.currentUser.endDate = profile.endDate || this.currentUser.endDate;

          // Update stored user in auth service
          this.authService.updateCurrentUser(this.currentUser);
        }

        // Populate form with profile data (prioritize backend data, but keep auto-populated values if backend doesn't have them)
        const currentName = this.profileForm.get('name')?.value || '';
        const currentSurname = this.profileForm.get('surname')?.value || '';

        this.profileForm.patchValue({
          name: profile.name || currentName || '',
          surname: profile.surname || currentSurname || '',
          email: profile.email || profile.username || this.profileForm.get('email')?.value || '',
          department: profile.department || this.profileForm.get('department')?.value || '',
          field: profile.field || this.profileForm.get('field')?.value || '',
          employer: profile.employer || this.profileForm.get('employer')?.value || '',
          idNumber: profile.idNumber || this.profileForm.get('idNumber')?.value || '',
          startDate: profile.startDate || this.profileForm.get('startDate')?.value || '',
          endDate: profile.endDate || this.profileForm.get('endDate')?.value || ''
        });
      },
      error: (error) => {
        this.isLoading = false;
        console.error('Error loading profile:', error);

        // Use cached user data as fallback
        if (this.currentUser) {
          const fullName = this.currentUser.name || '';
          const nameParts = fullName.split(' ');

          this.profileForm.patchValue({
            name: nameParts[0] || '',
            surname: nameParts.length > 1 ? nameParts.slice(1).join(' ') : '',
            email: this.currentUser.email || this.currentUser.username || '',
            department: this.currentUser.department || '',

            field: this.currentUser.field || '',
            employer: this.currentUser.employer || '',
            idNumber: this.currentUser.idNumber || '',
            startDate: this.currentUser.startDate || '',
            endDate: this.currentUser.endDate || ''
          });
        }

        // Show warning but don't block the user
        if (error.status !== 401) {
          Swal.fire({
            icon: 'warning',
            title: 'Profile Load Warning',
            text: 'Could not load latest profile data. Showing cached information.',
            timer: 3000,
            showConfirmButton: false
          });
        }
      }
    });
  }

  passwordStrengthValidator(control: AbstractControl): ValidationErrors | null {
    const value = control.value;
    if (!value) return null;

    const hasUpperCase = /[A-Z]/.test(value);
    const hasLowerCase = /[a-z]/.test(value);
    const hasNumeric = /[0-9]/.test(value);
    const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(value);
    const minLength = value.length >= 8;

    const strength = [hasUpperCase, hasLowerCase, hasNumeric, hasSpecialChar, minLength].filter(Boolean).length;

    if (strength < 3) {
      return { weakPassword: true };
    }
    return null;
  }

  passwordMatchValidator(control: AbstractControl): ValidationErrors | null {
    const password = control.get('newPassword');
    const confirmPassword = control.get('confirmPassword');

    if (!password || !confirmPassword) return null;

    if (password.value !== confirmPassword.value) {
      confirmPassword.setErrors({ passwordMismatch: true });
      return { passwordMismatch: true };
    } else {
      if (confirmPassword.hasError('passwordMismatch')) {
        confirmPassword.setErrors(null);
      }
      return null;
    }
  }

  getPasswordStrength(): { level: number; label: string; color: string } {
    const password = this.passwordForm.get('newPassword')?.value || '';
    if (!password) return { level: 0, label: '', color: '' };

    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumeric = /[0-9]/.test(password);
    const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);
    const minLength = password.length >= 8;

    const strength = [hasUpperCase, hasLowerCase, hasNumeric, hasSpecialChar, minLength].filter(Boolean).length;

    if (strength <= 2) return { level: 1, label: 'Weak', color: 'danger' };
    if (strength === 3) return { level: 2, label: 'Fair', color: 'warning' };
    if (strength === 4) return { level: 3, label: 'Good', color: 'info' };
    return { level: 4, label: 'Strong', color: 'success' };
  }

  onUpdateProfile(): void {
    if (this.profileForm.invalid) {
      this.profileForm.markAllAsTouched();
      Swal.fire({
        icon: 'error',
        title: 'Validation Error',
        text: 'Please fill in all required fields correctly.'
      });
      return;
    }

    this.isLoading = true;
    const formData = this.profileForm.value;

    // Prepare data for backend (include name, surname, and email)
    const updateData: any = {
      name: formData.name || '',
      surname: formData.surname || '',
      email: formData.email || '',
      employer: formData.employer || '',
      idNumber: formData.idNumber || '',
      startDate: formData.startDate || '',
      endDate: formData.endDate || ''
    };

    // Note: Department and field updates may require separate API calls or admin privileges
    // For now, we only update name and surname as per backend implementation

    console.log('Updating profile with data:', updateData);

    this.api.put('settings/profile', updateData).subscribe({
      next: (response: any) => {
        this.isLoading = false;
        console.log('Profile update response:', response);

        // Update local user data
        if (this.currentUser) {
          this.currentUser.name = formData.name;
          this.currentUser.surname = formData.surname;
          this.currentUser.email = formData.email || this.currentUser.email;
          this.currentUser.employer = formData.employer;
          this.currentUser.idNumber = formData.idNumber;
          this.currentUser.startDate = formData.startDate;
          this.currentUser.endDate = formData.endDate;

          // Update stored user in auth service
          this.authService.updateCurrentUser(this.currentUser);
        }

        Swal.fire({
          icon: 'success',
          title: 'Profile Updated!',
          text: 'Your profile has been updated successfully.',
          timer: 2000,
          showConfirmButton: false
        });

        // Reload user profile to get latest data
        setTimeout(() => {
          this.loadUserProfile();
        }, 500);
      },
      error: (error) => {
        this.isLoading = false;
        console.error('Profile update error:', error);

        const errorMessage = error.error?.error || error.error?.message || 'Failed to update profile. Please try again.';

        Swal.fire({
          icon: 'error',
          title: 'Update Failed',
          text: errorMessage
        });
      }
    });
  }

  onChangePassword(): void {
    if (this.passwordForm.invalid) {
      this.passwordForm.markAllAsTouched();
      Swal.fire({
        icon: 'error',
        title: 'Validation Error',
        text: 'Please fill in all fields correctly.'
      });
      return;
    }

    const formData = this.passwordForm.value;

    if (formData.newPassword !== formData.confirmPassword) {
      Swal.fire({
        icon: 'error',
        title: 'Password Mismatch',
        text: 'New passwords do not match. Please try again.'
      });
      return;
    }

    this.isLoading = true;

    const passwordData = {
      currentPassword: formData.currentPassword,
      newPassword: formData.newPassword
    };

    console.log('Changing password...');

    this.api.put('settings/password', passwordData).subscribe({
      next: (response: any) => {
        this.isLoading = false;
        console.log('Password change response:', response);

        Swal.fire({
          icon: 'success',
          title: 'Password Changed!',
          text: 'Your password has been changed successfully. Please login again with your new password.',
          timer: 3000,
          showConfirmButton: true,
          confirmButtonText: 'OK'
        }).then(() => {
          // Reset password form
          this.passwordForm.reset();

          // Optionally logout user to force re-login with new password
          // Uncomment if you want to force logout after password change
          // this.authService.logout();
        });
      },
      error: (error) => {
        this.isLoading = false;
        console.error('Password change error:', error);

        const errorMessage = error.error?.error || error.error?.message || 'Failed to change password. Please check your current password and try again.';

        Swal.fire({
          icon: 'error',
          title: 'Password Change Failed',
          text: errorMessage
        });
      }
    });
  }

  isFieldInvalid(form: FormGroup, fieldName: string): boolean {
    const field = form.get(fieldName);
    return !!(field && field.invalid && field.touched);
  }

  getFieldError(form: FormGroup, fieldName: string): string {
    const field = form.get(fieldName);
    if (!field || !field.errors || !field.touched) return '';

    if (field.errors['required']) {
      return `${this.getFieldLabel(fieldName)} is required`;
    }
    if (field.errors['email']) {
      return 'Please enter a valid email address';
    }
    if (field.errors['minlength']) {
      return `Minimum ${field.errors['minlength'].requiredLength} characters required`;
    }
    if (field.errors['weakPassword']) {
      return 'Password is too weak';
    }
    if (field.errors['passwordMismatch']) {
      return 'Passwords do not match';
    }
    return 'Invalid input';
  }

  getFieldLabel(fieldName: string): string {
    const labels: Record<string, string> = {
      name: 'Name',
      surname: 'Surname',
      email: 'Email',
      department: 'Department',
      field: 'Field',
      currentPassword: 'Current Password',
      newPassword: 'New Password',

      confirmPassword: 'Confirm Password',
      employer: 'Employer Name',
      idNumber: 'ID Number',
      startDate: 'Start Date',
      endDate: 'End Date'
    };
    return labels[fieldName] || fieldName;
  }

  getUserRole(): string {
    return this.currentUser?.role || '';
  }

  getDashboardRoute(): string {
    const role = this.getUserRole();
    if (role === 'ADMIN') return '/admin/admin-dashboard';
    if (role === 'SUPERVISOR') return '/supervisor/supervisor-dashboard';
    if (role === 'INTERN') return '/intern/intern-dashboard';
    if (role === 'SUPER_ADMIN') return '/super-admin/super-admin-dashboard';
    return '/login';
  }

  navigateToDashboard(section?: string): void {
    const role = this.getUserRole();
    let route: string;
    let queryParams: any = {};

    if (role === 'ADMIN') {
      route = '/admin/admin-dashboard';
      if (section) {
        queryParams = { section };
      }
    } else if (role === 'SUPERVISOR') {
      route = '/supervisor/supervisor-dashboard';
      if (section) {
        queryParams = { section };
      }
    } else if (role === 'INTERN') {
      route = '/intern/intern-dashboard';
      if (section) {
        queryParams = { section };
      }
    } else if (role === 'SUPER_ADMIN') {
      route = '/super-admin/super-admin-dashboard';
      if (section) {
        queryParams = { section };
      }
    } else {
      route = '/login';
    }

    if (Object.keys(queryParams).length > 0) {
      this.router.navigate([route], { queryParams });
    } else {
      this.router.navigate([route]);
    }
  }

  togglePasswordVisibility(field: 'current' | 'new' | 'confirm'): void {
    if (field === 'current') this.showCurrentPassword = !this.showCurrentPassword;
    if (field === 'new') this.showNewPassword = !this.showNewPassword;
    if (field === 'confirm') this.showConfirmPassword = !this.showConfirmPassword;
  }

  get fieldMap(): { [dept: string]: string[] } {
    return this.departmentService.fieldMap;
  }

  get departmentList(): string[] {
    return this.departmentService.departmentList;
  }

  setActiveTab(tab: 'profile' | 'password'): void {
    this.profileTabService.setActiveTab(tab);
  }

}

