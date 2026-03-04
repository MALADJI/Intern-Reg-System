import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, Validators, AbstractControl, ValidationErrors, ReactiveFormsModule, FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { ApiService } from '../../services/api.service';
import { CommonModule } from '@angular/common';
import Swal from 'sweetalert2';

@Component({
    selector: 'app-login',
    templateUrl: './login.html',
    styleUrls: ['./login.css'],
    standalone: true,
    imports: [CommonModule, ReactiveFormsModule, FormsModule, RouterLink]
})
export class Login implements OnInit, OnDestroy {
    loginUsername: string = '';
    loginPassword: string = '';
    isLoginLoading: boolean = false;
    showLoginPassword: boolean = false;

    showResetModal: boolean = false;
    resetForm: FormGroup;
    isResetCodeSent: boolean = false;
    resetCountdown: number = 0;
    resetVerificationCode: string = '';
    private resetTimerSub?: any;

    constructor(
        private authService: AuthService,
        private router: Router,
        private fb: FormBuilder,
        private api: ApiService
    ) {
        this.resetForm = this.fb.group({
            email: ['', [Validators.required, Validators.email, Validators.pattern(/^[a-zA-Z0-9._%+-]+@univen\.ac\.za$/)]],
            verificationCode: ['', [Validators.required, Validators.pattern(/^\d{6}$/)]],
            password: ['', [Validators.required, Validators.minLength(8), this.passwordStrengthValidator]],
            confirmPassword: ['', [Validators.required]]
        }, { validators: this.passwordMatchValidator });
    }

    ngOnInit(): void { }

    ngOnDestroy(): void {
        if (this.resetTimerSub) {
            clearInterval(this.resetTimerSub);
        }
    }

    onLogin() {
        if (!this.loginUsername || !this.loginPassword) {
            Swal.fire({ icon: 'error', title: 'Error', text: 'Enter both email and password' });
            return;
        }
        this.isLoginLoading = true;
        this.authService.login({ username: this.loginUsername, password: this.loginPassword }).subscribe({
            next: () => {
                this.isLoginLoading = false;
            },
            error: (err) => {
                this.isLoginLoading = false;
                Swal.fire({ icon: 'error', title: 'Login Failed', text: err.error?.message || 'Invalid credentials' });
            }
        });
    }

    openResetModal(): void {
        this.showResetModal = true;
        this.resetForm.reset();
        this.isResetCodeSent = false;
    }

    closeResetModal(): void {
        this.showResetModal = false;
    }

    sendResetCode(): void {
        const email = this.resetForm.get('email')?.value;
        if (this.resetForm.get('email')?.invalid) return;
        this.api.post('auth/forgot-password', { email }).subscribe({
            next: (res: any) => {
                this.isResetCodeSent = true;
                this.resetVerificationCode = res.code || '';
                this.resetCountdown = 900;
                this.resetTimerSub = setInterval(() => {
                    this.resetCountdown--;
                    if (this.resetCountdown <= 0) clearInterval(this.resetTimerSub);
                }, 1000);
                Swal.fire({ icon: 'success', title: 'Code Sent', text: 'Check your email' });
            },
            error: () => Swal.fire({ icon: 'error', title: 'Error', text: 'Failed to send code' })
        });
    }

    resetPassword(): void {
        if (this.resetForm.invalid) return;
        const formData = this.resetForm.value;
        this.api.post('auth/reset-password', {
            email: formData.email,
            code: formData.verificationCode,
            newPassword: formData.password
        }).subscribe({
            next: () => {
                Swal.fire({ icon: 'success', title: 'Success', text: 'Password reset' });
                this.closeResetModal();
            },
            error: (err) => Swal.fire({ icon: 'error', title: 'Failed', text: err.error?.message || 'Reset failed' })
        });
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

    copyCode(code: string): void {
        navigator.clipboard.writeText(code);
        Swal.fire({ icon: 'success', title: 'Copied', toast: true, position: 'top-end', timer: 2000, showConfirmButton: false });
    }
}
