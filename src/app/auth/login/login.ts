import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { FormBuilder, FormGroup, Validators, AbstractControl, ValidationErrors, ReactiveFormsModule, FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { ApiService } from '../../services/api.service';
import { CommonModule } from '@angular/common';
import { HelpService, HelpSettings } from '../../services/help.service';
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
    isHelpVisible: boolean = false;
    showHelpInfoModal: boolean = false;
    emailDomains: string[] = ['univen.ac.za'];

    helpSettings: HelpSettings = {
        about: '',
        phone: '',
        email: '',
        location: '',
        website: '',
        triggerText: ''
    };

    get emailSuggestions(): string[] {
        if (!this.loginUsername || !this.loginUsername.includes('@')) {
            return [];
        }
        const [localPart, domainPart] = this.loginUsername.split('@');
        if (localPart && (domainPart === '' || 'univen.ac.za'.startsWith(domainPart))) {
            return [`${localPart}@univen.ac.za`];
        }
        return [];
    }

    onEmailInput(event: any, field: 'login' | 'reset'): void {
        const value = event.target.value;
        // If user typed '@' and it's the first '@' in the string
        if (value.endsWith('@') && (value.match(/@/g) || []).length === 1) {
            const completed = value + 'univen.ac.za';
            if (field === 'login') {
                this.loginUsername = completed;
            } else {
                this.resetForm.get('email')?.setValue(completed);
            }
        }
    }

    showResetModal: boolean = false;
    resetForm: FormGroup;
    isResetCodeSent: boolean = false;
    resetCountdown: number = 0;
    resetVerificationCode: string = '';
    showResetPassword = false;
    showResetConfirmPassword = false;
    private resetTimerSub?: any;

    constructor(
        private authService: AuthService,
        private router: Router,
        private fb: FormBuilder,
        private api: ApiService,
        private helpService: HelpService,
        private cdr: ChangeDetectorRef
    ) {
        this.resetForm = this.fb.group({
            email: ['', [Validators.required, Validators.email, Validators.pattern(/^[a-zA-Z0-9._%+-]+@univen\.ac\.za$/)]],
            verificationCode: ['', [Validators.required, Validators.pattern(/^\d{6}$/)]],
            password: ['', [Validators.required, Validators.minLength(8), this.passwordStrengthValidator]],
            confirmPassword: ['', [Validators.required]]
        }, { validators: this.passwordMatchValidator });
    }

    ngOnInit(): void {
        this.helpService.helpSettings$.subscribe(settings => {
            this.helpSettings = settings;
        });
    }

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

        // Attempt local login first
        this.authService.login({ username: this.loginUsername, password: this.loginPassword }).subscribe({
            next: () => {
                this.isLoginLoading = false;
                // Redirection is handled by the service
            },
            error: (err) => {
                const status = err.status || (err.error && err.error.status);
                // Broaden fallback to include 401 (Unauthorized), 404 (Not Found), and 0 (CORS/Network Issue)
                // Also check error message for compatibility
                if (status === 401 || status === 404 || status === 0 || 
                    err.message?.toLowerCase().includes('not found') || 
                    err.message?.toLowerCase().includes('unauthorized')) {
                    
                    console.warn(`Local login failed (Status: ${status}). Attempting Univen fallback...`);
                    
                    this.authService.checkUnivenAuth(this.loginUsername, this.loginPassword).subscribe({
                        next: () => {
                            this.isLoginLoading = false;
                            // Redirection is handled by the service
                        },
                        error: (univenErr) => {
                            this.isLoginLoading = false;
                            let errorMsg = univenErr.message || 'Invalid credentials';
                            
                            // Specific hint for CORS issues
                            if (univenErr.status === 0) {
                                errorMsg = 'Institutional authentication blocked by browser (CORS). Please contact administration or try another browser.';
                            }

                            Swal.fire({ 
                                icon: 'error', 
                                title: 'Login Failed', 
                                text: errorMsg 
                            });
                        }
                    });
                } else {
                    this.isLoginLoading = false;
                    Swal.fire({ 
                        icon: 'error', 
                        title: 'Login Failed', 
                        text: err.message || 'Invalid credentials' 
                    });
                }
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
                this.resetCountdown = 60;
                this.resetTimerSub = setInterval(() => {
                    this.resetCountdown--;
                    if (this.resetCountdown <= 0) {
                        clearInterval(this.resetTimerSub);
                    }
                    this.cdr.detectChanges();
                }, 1000);
                this.cdr.detectChanges();
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

    formatWebsite(url: string | undefined): string {
        if (!url) return '';
        return url.replace('https://', '').replace('http://', '').replace(/\/$/, '');
    }

    copyCode(code: string): void {
        navigator.clipboard.writeText(code);
        Swal.fire({ icon: 'success', title: 'Copied', toast: true, position: 'top-end', timer: 2000, showConfirmButton: false });
    }

    /**
     * Show the main help modal with step-by-step guides
     */
    toggleHelpModal(): void {
        this.helpService.showHelp();
    }

    /**
     * Open the specific help info modal (contacts, quick start)
     */
    openHelpInfoModal(): void {
        this.showHelpInfoModal = true;
    }

    /**
     * Close the help info modal
     */
    closeHelpInfoModal(): void {
        this.showHelpInfoModal = false;
    }
}
