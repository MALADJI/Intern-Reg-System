import { Component } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { RouterLink, Router } from '@angular/router';
import { ApiService } from '../../services/api.service';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-forgot-password',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './forgot-password.html',
  styleUrls: ['./forgot-password.css']
})
export class ForgotPassword {
  forgotPasswordForm: FormGroup;
  isCodeSent = false;
  verificationCode: string = ''; // Store verification code to display on screen

  constructor(
    private fb: FormBuilder,
    private api: ApiService,
    private router: Router
  ) {
    this.forgotPasswordForm = this.fb.group({
      email: ['', [Validators.required, Validators.email, Validators.pattern(/^[a-zA-Z0-9._%+-]+@univen\.ac\.za$/)]]
    });
  }

  sendCode(): void {
    if (this.forgotPasswordForm.invalid) {
      this.forgotPasswordForm.markAllAsTouched();
      return;
    }

    const email = this.forgotPasswordForm.get('email')?.value;

    this.api.post('auth/forgot-password', { email }).subscribe({
      next: (response: any) => {
        this.isCodeSent = true;

        // Store verification code to display on screen
        if (response.code) {
          this.verificationCode = response.code;
        }

        Swal.fire({
          icon: 'success',
          title: 'Verification Code Sent!',
          html: response.code
            ? `<p>A verification code has been sent to your email.</p>
               <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 15px 0; text-align: center;">
                 <strong style="font-size: 24px; color: #26406e; letter-spacing: 3px;">${response.code}</strong>
                 <p style="margin-top: 10px; color: #6c757d; font-size: 12px;">Please copy this code. It will expire in 1 minute.</p>
               </div>
               <p class="text-muted small mt-3"><strong>Note:</strong> The code is also displayed below on this page.</p>`
            : 'A verification code has been sent to your email. Please check your inbox. The code will expire in 1 minute.',
          showConfirmButton: true,
          confirmButtonText: 'Got it',
          confirmButtonColor: '#26406e'
        });
      },
      error: (error) => {
        Swal.fire({
          icon: 'error',
          title: 'Error',
          text: error.error?.error || 'Failed to send verification code. Please try again.'
        });
      }
    });
  }

  isFieldInvalid(fieldName: string): boolean {
    const field = this.forgotPasswordForm.get(fieldName);
    return !!(field && field.invalid && field.touched);
  }

  getFieldError(fieldName: string): string {
    const field = this.forgotPasswordForm.get(fieldName);
    if (!field || !field.errors || !field.touched) return '';

    if (field.errors['required']) {
      return 'Email is required';
    }
    if (field.errors['email'] || field.errors['pattern']) {
      return 'Must be a valid @univen.ac.za email address';
    }
    return 'Invalid input';
  }

  copyCode(): void {
    if (this.verificationCode) {
      navigator.clipboard.writeText(this.verificationCode).then(() => {
        Swal.fire({
          icon: 'success',
          title: 'Copied!',
          text: 'Verification code copied to clipboard',
          timer: 2000,
          showConfirmButton: false,
          toast: true,
          position: 'top-end'
        });
      });
    }
  }

}

