import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, AbstractControl, ValidationErrors } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { RouterLink, Router, ActivatedRoute } from '@angular/router';
import { ApiService } from '../../services/api.service';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-reset-password',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './reset-password.html',
  styleUrls: ['./reset-password.css']
})
export class ResetPassword implements OnInit, OnDestroy {
  resetPasswordForm: FormGroup;
  email: string = '';
  showPassword = false;
  showConfirmPassword = false;
  verificationCode: string = ''; // Store verification code to display on screen
  isCodeSent = false; // Track if code has been sent
  countdown = 0;
  private timerSub?: ReturnType<typeof setInterval>;

  constructor(
    private fb: FormBuilder,
    private api: ApiService,
    private router: Router,
    private route: ActivatedRoute
  ) {
    this.resetPasswordForm = this.fb.group({
      email: ['', [Validators.required, Validators.email, Validators.pattern(/^[a-zA-Z0-9._%+-]+@univen\.ac\.za$/)]],
      verificationCode: ['', [Validators.required, Validators.pattern(/^\d{6}$/)]],
      password: ['', [Validators.required, Validators.minLength(8), this.passwordStrengthValidator]],
      confirmPassword: ['', [Validators.required]]
    }, { validators: this.passwordMatchValidator });
  }

  ngOnInit(): void {
    // Get email and code from query params
    this.route.queryParams.subscribe(params => {
      if (params['email']) {
        this.email = params['email'];
        this.resetPasswordForm.patchValue({ email: this.email });
      }
      // Get verification code from query params if available
      if (params['code']) {
        this.verificationCode = params['code'];
        this.isCodeSent = true; // Mark code as sent when received from query params
        this.resetPasswordForm.patchValue({ verificationCode: params['code'] });
        // Start countdown timer if code is present (1 minute = 60 seconds)
        this.startCountdown();
        console.log('✅ Verification code loaded from query params:', this.verificationCode);
      } else {
        console.log('ℹ️ No verification code in query params');
      }
    });
  }

  startCountdown(): void {
    // Clear any existing timer
    if (this.timerSub) {
      clearInterval(this.timerSub);
    }
    // Start countdown timer (1 minute = 60 seconds)
    this.countdown = 60;
    this.timerSub = setInterval(() => {
      this.countdown--;
      if (this.countdown <= 0) {
        clearInterval(this.timerSub);
        this.countdown = 0;
      }
    }, 1000);
  }

  ngOnDestroy(): void {
    if (this.timerSub) {
      clearInterval(this.timerSub);
    }
  }

  formatCountdown(seconds: number): string {
    if (seconds <= 0) return '0s';
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    }
    return `${secs}s`;
  }

  copyCodeToClipboard(): void {
    if (this.verificationCode) {
      navigator.clipboard.writeText(this.verificationCode).then(() => {
        Swal.fire({
          icon: 'success',
          title: 'Copied!',
          text: 'Verification code copied to clipboard',
          timer: 1500,
          showConfirmButton: false,
          toast: true,
          position: 'top-end'
        });
      }).catch(() => {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = this.verificationCode;
        textArea.style.position = 'fixed';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.select();
        try {
          document.execCommand('copy');
          Swal.fire({
            icon: 'success',
            title: 'Copied!',
            text: 'Verification code copied to clipboard',
            timer: 1500,
            showConfirmButton: false,
            toast: true,
            position: 'top-end'
          });
        } catch (err) {
          Swal.fire({
            icon: 'error',
            title: 'Copy Failed',
            text: 'Please manually copy the code',
            timer: 2000,
            showConfirmButton: false
          });
        }
        document.body.removeChild(textArea);
      });
    }
  }

  // ==== UPDATED resendCode() - shows code on page instead of a blocking modal ====
  resendCode(): void {
    const email = this.resetPasswordForm.get('email')?.value;
    if (!email) {
      Swal.fire({
        icon: 'warning',
        title: 'Email Required',
        text: 'Please enter your email address first.'
      });
      return;
    }

    // Show loading state
    Swal.fire({
      title: 'Sending Code...',
      text: 'Please wait while we generate your verification code.',
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      }
    });

    this.api.post('auth/forgot-password', { email }).subscribe({
      next: (response: any) => {
        // close the loading modal
        Swal.close();

        // mark that a code has been sent (UI shows code block)
        this.isCodeSent = true;

        // if backend returns a code (for dev/testing), store it and auto-fill the field
        if (response && response.code) {
          this.verificationCode = response.code;
          this.resetPasswordForm.patchValue({ verificationCode: response.code });
          console.log('✅ Verification code stored:', this.verificationCode);
          // show a small toast informing user the code is visible on page
          Swal.fire({
            icon: 'success',
            title: 'Code sent (visible)',
            text: 'The verification code is shown on this page for testing.',
            timer: 1800,
            showConfirmButton: false,
            toast: true,
            position: 'top-end'
          });
        } else {
          // backend didn't return code (still consider success)
          this.verificationCode = ''; // ensure cleared
          Swal.fire({
            icon: 'success',
            title: 'Verification Code Sent',
            text: 'A verification code has been sent to the provided email (check server logs if email is not configured).',
            timer: 1800,
            showConfirmButton: false,
            toast: true,
            position: 'top-end'
          });
          console.warn('⚠️ No code in API response. Response:', response);
          console.warn('⚠️ Check Spring Boot console for the actual code.');
        }

        // reset and start countdown timer (1 minute)
        this.startCountdown();
      },
      error: (error) => {
        console.error('Error sending verification code:', error);
        Swal.close();
        Swal.fire({
          icon: 'error',
          title: 'Error',
          text: error.error?.error || 'Failed to send verification code. Please try again.'
        });
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
    const password = control.get('password');
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
    const password = this.resetPasswordForm.get('password')?.value || '';
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

  onSubmit(): void {
    if (this.resetPasswordForm.invalid) {
      this.resetPasswordForm.markAllAsTouched();
      Swal.fire({
        icon: 'error',
        title: 'Validation Error',
        text: 'Please fill in all fields correctly.'
      });
      return;
    }

    const formData = this.resetPasswordForm.value;

    if (formData.password !== formData.confirmPassword) {
      Swal.fire({
        icon: 'error',
        title: 'Password Mismatch',
        text: 'Passwords do not match. Please try again.'
      });
      return;
    }

    // Submit password reset - ensure code is trimmed
    const resetData = {
      email: formData.email?.trim().toLowerCase(),
      code: formData.verificationCode?.trim(),
      newPassword: formData.password
    };

    console.log('Sending reset password request:', {
      email: resetData.email,
      code: resetData.code + ' (length: ' + resetData.code?.length + ')',
      newPassword: '***'
    });
    console.log('Endpoint: auth/reset-password');

    // show loading
    Swal.fire({
      title: 'Resetting password...',
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading()
    });

    this.api.post('auth/reset-password', resetData).subscribe({
      next: (response: any) => {
        Swal.close();
        Swal.fire({
          icon: 'success',
          title: 'Password Reset Successful!',
          text: 'Your password has been reset successfully. You can now login with your new password.',
          confirmButtonText: 'Go to Login'
        }).then(() => {
          this.router.navigate(['/login']);
        });
      },
      error: (error) => {
        Swal.close();
        console.error('Reset password error details:', {
          status: error.status,
          statusText: error.statusText,
          error: error.error,
          url: error.url
        });

        const errorMessage = error.error?.error || error.error?.message || 'Failed to reset password. Please try again.';

        if (error.status === 404) {
          Swal.fire({
            icon: 'error',
            title: 'Endpoint Not Found',
            html: `<p>The password reset endpoint was not found.</p>
                   <p class="text-muted small mt-2">Possible causes:</p>
                   <ul class="text-start small">
                     <li>Backend server might be down</li>
                     <li>Endpoint path might be incorrect</li>
                     <li>Please contact support</li>
                   </ul>
                   <p class="text-muted small mt-2">Requested: <code>${error.url || 'auth/reset-password'}</code></p>`,
            confirmButtonText: 'OK',
            confirmButtonColor: '#26406e'
          });
        } else if (error.status === 400 && (errorMessage.toLowerCase().includes('invalid') || errorMessage.toLowerCase().includes('expired'))) {
          Swal.fire({
            icon: 'warning',
            title: 'Code Invalid or Expired',
            html: `<p>${errorMessage}</p>
                   <p class="text-muted small mt-2">Verification codes expire after 1 minute. Please request a new code.</p>`,
            showCancelButton: true,
            confirmButtonText: 'Go to Forgot Password',
            cancelButtonText: 'Stay Here',
            confirmButtonColor: '#26406e'
          }).then((result) => {
            if (result.isConfirmed) {
              this.router.navigate(['/auth/forgot-password'], {
                queryParams: { email: formData.email }
              });
            }
          });
        } else {
          Swal.fire({
            icon: 'error',
            title: 'Reset Failed',
            text: errorMessage
          });
        }
      }
    });
  }

  isFieldInvalid(fieldName: string): boolean {
    const field = this.resetPasswordForm.get(fieldName);
    return !!(field && field.invalid && field.touched);
  }

  getFieldError(fieldName: string): string {
    const field = this.resetPasswordForm.get(fieldName);
    if (!field || !field.errors || !field.touched) return '';

    if (field.errors['required']) {
      return `${this.getFieldLabel(fieldName)} is required`;
    }
    if (field.errors['email'] || field.errors['pattern']) {
      if (fieldName === 'email') {
        return 'Must be a valid @univen.ac.za email address';
      }
    }
    if (field.errors['pattern'] && fieldName === 'verificationCode') {
      return 'Verification code must be 6 digits';
    }
    if (field.errors['minlength']) {
      return 'Minimum 8 characters required';
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
      email: 'Email',
      verificationCode: 'Verification Code',
      password: 'Password',
      confirmPassword: 'Confirm Password'
    };
    return labels[fieldName] || fieldName;
  }

  togglePasswordVisibility(): void {
    this.showPassword = !this.showPassword;
  }

  toggleConfirmPasswordVisibility(): void {
    this.showConfirmPassword = !this.showConfirmPassword;
  }
}
