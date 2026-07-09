import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, AbstractControl, ValidationErrors } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { ApiService } from '../../services/api.service';
import { CommonModule } from '@angular/common';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-force-password-change',
  templateUrl: './force-password-change.html',
  styleUrls: ['./force-password-change.css'],
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule]
})
export class ForcePasswordChange implements OnInit {
  passwordForm: FormGroup;
  showPassword = false;
  showConfirmPassword = false;
  showCurrentPassword = false;
  isSubmitting = false;

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private api: ApiService,
    private router: Router
  ) {
    this.passwordForm = this.fb.group({
      currentPassword: ['', [Validators.required]],
      password: ['', [Validators.required, Validators.minLength(8), this.passwordStrengthValidator]],
      confirmPassword: ['', [Validators.required]]
    }, { validators: this.passwordMatchValidator });
  }

  ngOnInit(): void {
    const user = this.authService.getCurrentUserSync();
    if (!user || user.requiresPasswordChange === false) {
      // If user doesn't need to change password, redirect to login or dashboard
      if (user) {
        this.redirectAfterSuccess(user.role);
      } else {
        this.router.navigate(['/login']);
      }
    }
  }

  togglePasswordVisibility() {
    this.showPassword = !this.showPassword;
  }

  toggleConfirmPasswordVisibility() {
    this.showConfirmPassword = !this.showConfirmPassword;
  }

  passwordStrengthValidator(control: AbstractControl): ValidationErrors | null {
    const v = control.value;
    if (!v) return null;
    const ok = /[A-Z]/.test(v) && /[a-z]/.test(v) && /[0-9]/.test(v) && /[^A-Za-z0-9]/.test(v) && v.length >= 8;
    return ok ? null : { weakPassword: true };
  }

  passwordMatchValidator(control: AbstractControl): ValidationErrors | null {
    const p = control.get('password');
    const cp = control.get('confirmPassword');
    if (p && cp && p.value !== cp.value) {
      cp.setErrors({ passwordMismatch: true });
      return { passwordMismatch: true };
    }
    return null;
  }

  getPasswordStrength() {
    const p = this.passwordForm.get('password')?.value || '';
    let level = 0;
    if (p.length >= 8) level++;
    if (/[A-Z]/.test(p) && /[a-z]/.test(p)) level++;
    if (/[0-9]/.test(p)) level++;
    if (/[^A-Za-z0-9]/.test(p)) level++;

    switch (level) {
      case 0: case 1: return { label: 'Weak', color: 'danger', level };
      case 2: return { label: 'Fair', color: 'warning', level };
      case 3: return { label: 'Good', color: 'info', level };
      case 4: return { label: 'Strong', color: 'success', level };
      default: return { label: 'Weak', color: 'danger', level };
    }
  }

  onSubmit() {
    if (this.passwordForm.invalid) return;

    this.isSubmitting = true;

    this.api.put<any>('settings/password', {
      currentPassword: this.passwordForm.value.currentPassword,
      newPassword: this.passwordForm.value.password,
      confirmPassword: this.passwordForm.value.confirmPassword
    }).subscribe({
      next: () => {
        Swal.fire({
          icon: 'success',
          title: 'Success',
          text: 'Your password has been updated. You can now access your dashboard.',
          timer: 2000,
          showConfirmButton: false
        });
        
        // Refresh current user info (to clear the requiresPasswordChange flag)
        this.authService.getCurrentUserFromServer().subscribe({
          next: (user: any) => {
            this.isSubmitting = false;
            this.redirectAfterSuccess(user.role);
          },
          error: () => {
            this.isSubmitting = false;
            // Fallback manual redirect if fetch fails
            const user = this.authService.getCurrentUserSync();
            if (user) this.redirectAfterSuccess(user.role);
          }
        });
      },
      error: (err) => {
        this.isSubmitting = false;
        Swal.fire({
          icon: 'error',
          title: 'Update Failed',
          text: err.error?.message || 'Failed to update password. Please try again.'
        });
      }
    });
  }

  private redirectAfterSuccess(role: string) {
    switch (role) {
      case 'SUPER_ADMIN': this.router.navigate(['/super-admin/super-admin-dashboard']); break;
      case 'ADMIN': this.router.navigate(['/admin/admin-dashboard']); break;
      case 'SUPERVISOR': this.router.navigate(['/supervisor/supervisor-dashboard']); break;
      case 'INTERN': 
        // Interns must register their face upon first login
        this.router.navigate(['/auth/face-registration']); 
        break;
      default: this.router.navigate(['/login']);
    }
  }

  logout() {
    this.authService.logout();
  }
}
