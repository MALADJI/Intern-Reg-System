import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, Validators, AbstractControl, ValidationErrors, ReactiveFormsModule, FormsModule } from '@angular/forms';
import { ApiService } from '../services/api.service';
import { DepartmentApiService, Department } from '../services/department-api.service';
import { Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { Subscription, interval } from 'rxjs';
import { take } from 'rxjs/operators';
import Swal from 'sweetalert2';

@Component({
    selector: 'app-sign-up',
    templateUrl: './sign-up.html',
    styleUrls: ['./sign-up.css'],
    standalone: true,
    imports: [CommonModule, ReactiveFormsModule, FormsModule, RouterLink]
})
export class SignUp implements OnInit, OnDestroy {
    signupForm: FormGroup;
    isSignupCodeSent = false;
    signupCountdown = 0;
    private signupTimerSub?: Subscription;
    showSignupPassword = false;
    showSignupConfirmPassword = false;
    isSignupSubmitting = false;
    signupVerificationCode: string = '';
    showSignupVerification: boolean = false;
    currentSignupStep: number = 1;

    selectedDepartment: string = '';
    departments: Department[] = [];
    availableFields: string[] = [];
    loadingDepartments = false;

    constructor(
        private fb: FormBuilder,
        private api: ApiService,
        private router: Router,
        private departmentApiService: DepartmentApiService
    ) {
        this.signupForm = this.fb.group({
            name: ['', [Validators.required, Validators.minLength(2), Validators.pattern(/^[a-zA-Z\s]+$/)]],
            surname: ['', [Validators.required, Validators.minLength(2), Validators.pattern(/^[a-zA-Z\s]+$/)]],
            idNumber: ['', [Validators.required, Validators.pattern(/^\d{13}$/)]],
            staffEmail: ['', [Validators.required, Validators.email, Validators.pattern(/^[a-zA-Z0-9._%+-]+@univen\.ac\.za$/)]],
            verificationCode: ['', [Validators.required, Validators.pattern(/^\d{6}$/)]],
            role: ['intern', Validators.required],
            employerName: ['', [Validators.required, Validators.minLength(2)]],
            startDate: ['', [Validators.required]],
            endDate: ['', [Validators.required]],
            department: ['', Validators.required],
            field: this.fb.control({ value: '', disabled: true }, Validators.required),
            password: ['', [Validators.required, Validators.minLength(8), this.passwordStrengthValidator]],
            confirmPassword: ['', [Validators.required]],
            acceptTerms: [false, Validators.requiredTrue]
        }, { validators: [this.passwordMatchValidator, this.dateRangeValidator] });

        this.setupSignupWatchers();
    }

    ngOnInit(): void {
        this.loadDepartments();
    }

    ngOnDestroy(): void {
        if (this.signupTimerSub) {
            this.signupTimerSub.unsubscribe();
        }
    }

    private setupSignupWatchers() {
        this.signupForm.get('department')?.valueChanges.subscribe(deptName => {
            const fieldControl = this.signupForm.get('field');
            if (deptName) {
                this.selectedDepartment = deptName;
                const dept = this.departments.find(d => d.name === deptName);
                this.availableFields = dept ? this.getFieldsForDepartment(dept) : [];
                fieldControl?.setValue('');
                if (this.availableFields.length > 0) {
                    fieldControl?.enable();
                } else {
                    fieldControl?.disable();
                }
            } else {
                fieldControl?.disable();
            }
        });

        this.signupForm.get('startDate')?.valueChanges.subscribe(() => {
            this.signupForm.get('endDate')?.updateValueAndValidity();
        });
    }

    loadDepartments() {
        this.loadingDepartments = true;
        this.departmentApiService.getAllDepartments().subscribe({
            next: (depts) => {
                this.departments = depts.filter(d => d.active !== false);
                this.loadingDepartments = false;
            },
            error: () => {
                this.loadingDepartments = false;
            }
        });
    }

    getFieldsForDepartment(dept: Department): string[] {
        return dept.fields?.map((f: any) => typeof f === 'string' ? f : f.name).filter((n: string) => n) || [];
    }

    nextSignupStep(): void {
        const step1Fields = ['name', 'surname', 'idNumber', 'role', 'employerName', 'startDate', 'endDate'];
        let isValid = true;
        step1Fields.forEach(f => {
            const c = this.signupForm.get(f);
            if (c && c.invalid) {
                c.markAsTouched();
                isValid = false;
            }
        });
        if (isValid) {
            this.currentSignupStep = 2;
        } else {
            Swal.fire({
                icon: 'warning',
                title: 'Missing Information',
                text: 'Please fill in all fields in step 1 correctly.'
            });
        }
    }

    prevSignupStep(): void {
        this.currentSignupStep = 1;
    }

    sendSignupCode() {
        const email = this.signupForm.get('staffEmail')?.value;
        if (!email || !email.endsWith('@univen.ac.za')) {
            Swal.fire({ icon: 'error', title: 'Invalid Email', text: 'Please use a valid @univen.ac.za email address.' });
            return;
        }
        this.api.post('auth/send-verification-code', { email }).subscribe({
            next: (res: any) => {
                this.isSignupCodeSent = true;
                this.signupVerificationCode = res.code || '';
                this.signupCountdown = 60;
                this.signupTimerSub = interval(1000).pipe(take(60)).subscribe({
                    next: () => this.signupCountdown--,
                    complete: () => {
                        this.isSignupCodeSent = false;
                    }
                });
                Swal.fire({ icon: 'success', title: 'Code Sent!', text: 'Please check your email for the verification code.' });
            },
            error: () => {
                Swal.fire({ icon: 'error', title: 'Error', text: 'Failed to send verification code.' });
            }
        });
    }

    onSignup() {
        if (this.signupForm.invalid) {
            this.signupForm.markAllAsTouched();
            return;
        }
        this.isSignupSubmitting = true;
        const formData = this.signupForm.getRawValue();
        const regData = {
            username: formData.staffEmail,
            email: formData.staffEmail,
            password: formData.password,
            verificationCode: formData.verificationCode,
            role: 'INTERN',
            name: formData.name,
            surname: formData.surname,
            department: formData.department,
            field: formData.field,
            employerName: formData.employerName,
            idNumber: formData.idNumber,
            startDate: formData.startDate,
            endDate: formData.endDate
        };

        this.api.post('auth/register', regData).subscribe({
            next: () => {
                this.isSignupSubmitting = false;
                Swal.fire({
                    icon: 'success',
                    title: 'Registration Successful!',
                    text: 'Your account has been created. Please log in.'
                }).then(() => {
                    this.router.navigate(['/login']);
                });
            },
            error: (err) => {
                this.isSignupSubmitting = false;
                Swal.fire({
                    icon: 'error',
                    title: 'Registration Failed',
                    text: err.error?.message || 'There was an error creating your account.'
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
        const hasSpecialChar = /[!@#$%^&*()_+\-=\[\]{}|;:'",.<>?/~`]/.test(value);
        const minLength = value.length >= 8;
        if (!(minLength && hasUpperCase && hasLowerCase && hasNumeric && hasSpecialChar)) {
            return { weakPassword: true };
        }
        return null;
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

    dateRangeValidator(control: AbstractControl): ValidationErrors | null {
        const s = control.get('startDate');
        const e = control.get('endDate');
        if (s && e && s.value && e.value && new Date(e.value) <= new Date(s.value)) {
            e.setErrors({ endDateBeforeStart: true });
            return { endDateBeforeStart: true };
        }
        return null;
    }

    isFieldInvalid(field: string): boolean {
        const f = this.signupForm.get(field);
        return !!(f && f.invalid && f.touched);
    }

    onEmailInput(event: Event): void {
        const input = event.target as HTMLInputElement;
        const val = input.value;
        if (val.endsWith('@') && !val.includes('@univen.ac.za')) {
            this.signupForm.get('staffEmail')?.setValue(val + 'univen.ac.za');
        }
    }

    onIdNumberInput(event: Event): void {
        const input = event.target as HTMLInputElement;
        const val = input.value.replace(/\D/g, '').substring(0, 13);
        this.signupForm.patchValue({ idNumber: val }, { emitEvent: false });
    }

    getMinEndDate(): string {
        const s = this.signupForm.get('startDate')?.value;
        if (!s) return new Date().toISOString().split('T')[0];
        const d = new Date(s);
        d.setDate(d.getDate() + 1);
        return d.toISOString().split('T')[0];
    }

    copyCode(code: string): void {
        if (code) {
            navigator.clipboard.writeText(code);
            Swal.fire({
                icon: 'success',
                title: 'Copied!',
                toast: true,
                position: 'top-end',
                timer: 2000,
                showConfirmButton: false
            });
        }
    }

    openTermsModal(): void {
        // Note: Recreating original behavior where this might have been a simple Swal or a modal
        Swal.fire({
            title: 'Terms & Conditions',
            html: `
        <div style="text-align: left; max-height: 400px; overflow-y: auto; font-size: 0.9rem;">
          <h6>1. Introduction</h6>
          <p>By registering, you agree to comply with Univen's internship rules.</p>
          <h6>2. Data Privacy</h6>
          <p>Your data is used solely for internship registration and management.</p>
          <h6>3. Conduct</h6>
          <p>Professional conduct is expected at all times during the internship.</p>
        </div>
      `,
            confirmButtonText: 'I Understand',
            confirmButtonColor: '#1e3a5f'
        });
    }
}
