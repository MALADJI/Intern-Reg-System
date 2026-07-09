import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { FormBuilder, FormGroup, Validators, AbstractControl, ValidationErrors, ReactiveFormsModule, FormsModule } from '@angular/forms';
import { ApiService } from '../services/api.service';
import { DepartmentApiService, Department } from '../services/department-api.service';
import { PolicyService } from '../services/policy.service';
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
    systemPolicyContent: string = 'Loading policies...';

    contractFileBase64: string = '';
    contractFileName: string = '';
    contractFileError: string = '';

    selectedDepartment: string = '';
    departments: Department[] = [];
    availableFields: string[] = [];
    loadingDepartments = false;

    // Univen Integration
    isUnivenStudent = false;
    univenId = '';
    univenPassword = '';
    isFetchingUniven = false;

    // ID Verification State
    isVerifyingId: boolean = false;
    idVerified: boolean = false;
    idVerificationMessage: string = '';
    idVerificationError: string = '';
    idMetadata: { gender?: string; citizenship?: string; birthDate?: string } = {};

    // International Intern State
    isInternational: boolean = false;
    passportVerified: boolean = false;
    passportError: string = '';


    constructor(
        private fb: FormBuilder,
        private api: ApiService,
        private router: Router,
        private departmentApiService: DepartmentApiService,
        private policyService: PolicyService,
        private cdr: ChangeDetectorRef
    ) {
        this.signupForm = this.fb.group({
            name: ['', [Validators.required, Validators.minLength(2), Validators.pattern(/^[a-zA-Z\s]+$/)]],
            surname: ['', [Validators.required, Validators.minLength(2), Validators.pattern(/^[a-zA-Z\s]+$/)]],
            idNumber: ['', [Validators.required, Validators.pattern(/^\d{13}$/)]],
            passportNumber: [''],
            staffEmail: ['', [Validators.required, Validators.email, Validators.pattern(/^[a-zA-Z0-9._%+-]+@(?:mvula\.)?univen\.ac\.za$/)]],
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

        this.policyService.policy$.subscribe(policy => {
            if (policy && policy.content) {
                this.systemPolicyContent = policy.content;
            } else {
                this.systemPolicyContent = 'Terms and policies could not be loaded at this time. Please contact administration.';
            }
        });
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
        this.signupForm.get('department')?.disable();
        this.departmentApiService.getAllDepartments().subscribe({
            next: (depts) => {
                this.departments = depts.filter(d => d.active !== false);
                this.loadingDepartments = false;
                this.signupForm.get('department')?.enable();
            },
            error: () => {
                this.loadingDepartments = false;
                this.signupForm.get('department')?.enable();
            }
        });
    }

    getFieldsForDepartment(dept: Department): string[] {
        return dept.fields?.map((f: any) => typeof f === 'string' ? f : f.name).filter((n: string) => n) || [];
    }

    nextSignupStep(): void {
        const step1Fields = ['name', 'surname', 'role', 'employerName', 'startDate', 'endDate'];
        // Include the correct identification field
        if (this.isInternational) {
            step1Fields.push('passportNumber');
        } else {
            step1Fields.push('idNumber');
        }
        let isValid = true;
        step1Fields.forEach(f => {
            const c = this.signupForm.get(f);
            if (c && c.invalid) {
                c.markAsTouched();
                isValid = false;
            }
        });

        // For local interns, ID must be verified
        if (!this.isInternational && !this.idVerified) {
            const idVal = this.signupForm.get('idNumber')?.value;
            if (idVal && idVal.length === 13) {
                this.verifyIdNumber(idVal);
            }
            Swal.fire({
                icon: 'warning',
                title: 'ID Verification Required',
                text: this.idVerificationError || 'Please provide a valid 13-digit South African ID number.'
            });
            return;
        }

        // For international interns, validate passport number
        if (this.isInternational) {
            const passVal = this.signupForm.get('passportNumber')?.value || '';
            if (!this.validatePassport(passVal)) {
                this.passportError = 'Please enter a valid passport number (6–20 alphanumeric characters).';
                Swal.fire({
                    icon: 'warning',
                    title: 'Invalid Passport Number',
                    text: this.passportError
                });
                return;
            }
        }

        // Removed contract agreement mandatory validation as per user request
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

    fetchUnivenProfile() {
        if (!this.univenId || !this.univenPassword) {
            Swal.fire({ icon: 'warning', title: 'Missing Info', text: 'Please enter your Univen Student Number and Password.' });
            return;
        }

        this.isFetchingUniven = true;
        this.api.post<any>('auth/univen-data', { username: this.univenId, password: this.univenPassword }).subscribe({
            next: (data) => {
                this.isFetchingUniven = false;
                
                // Map data from Univen response
                let name = '', surname = '', email = '', deptName = '', idNum = '', field = '';
                
                if (data.student) {
                    name = data.student.firstNames;
                    surname = data.student.surname;
                    idNum = data.student.idNumber;
                    deptName = data.student.departmentName;
                    field = data.student.qualificationName;
                    email = data.communication?.communicationNumber || `${this.univenId}@univen.ac.za`;
                } else if (data.staff) {
                    name = data.staff.firstname;
                    surname = data.staff.surname;
                    idNum = data.staff.idNumber;
                    deptName = data.staff.departmentName;
                    field = data.staff.postName;
                    email = data.communication?.communicationNumber || `${this.univenId}@univen.ac.za`;
                }

                this.signupForm.patchValue({
                    name: name,
                    surname: surname,
                    idNumber: idNum,
                    staffEmail: email,
                    department: deptName,
                    employerName: 'University of Venda',
                    password: this.univenPassword,
                    confirmPassword: this.univenPassword
                });

                if (idNum && idNum.length === 13) {
                    this.verifyIdNumber(idNum);
                }

                // Auto-select field if possible
                setTimeout(() => {
                    this.signupForm.get('field')?.setValue(field);
                }, 500);

                Swal.fire({
                    icon: 'success',
                    title: 'Profile Found!',
                    text: 'Your information has been pre-filled. Please check the details and complete the remaining fields.',
                    timer: 3000,
                    showConfirmButton: false
                });
            },
            error: (err) => {
                this.isFetchingUniven = false;
                Swal.fire({
                    icon: 'error',
                    title: 'Fetch Failed',
                    text: err.error?.message || 'Could not verify your Univen credentials. Please check your Student Number and Password.'
                });
            }
        });
    }

    sendSignupCode() {
        const email = this.signupForm.get('staffEmail')?.value;
        if (!email || (!email.endsWith('@univen.ac.za') && !email.endsWith('@mvula.univen.ac.za'))) {
            Swal.fire({ icon: 'error', title: 'Invalid Email', text: 'Please use a valid @univen.ac.za or @mvula.univen.ac.za email address.' });
            return;
        }
        this.api.post('auth/send-verification-code', { email }).subscribe({
            next: (res: any) => {
                this.isSignupCodeSent = true;
                this.signupVerificationCode = res.code || '';
                this.signupCountdown = 60;
                this.signupTimerSub = interval(1000).pipe(take(60)).subscribe({
                    next: () => {
                        this.signupCountdown--;
                        this.cdr.detectChanges(); // Update UI in real-time
                        if (this.signupCountdown === 0) {
                            this.cdr.detectChanges(); // Ensure final state
                        }
                    },
                    complete: () => {
                        // Keep isSignupCodeSent true so the code stays visible but with a Resend button
                        console.log('Signup countdown completed');
                        this.signupCountdown = 0;
                        this.cdr.detectChanges(); // Final check
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
        // For Univen students, we use their Univen password
        if (this.isUnivenStudent) {
            if (!this.univenPassword) {
                Swal.fire({ 
                    icon: 'warning', 
                    title: 'Password Required', 
                    text: 'Please enter your Univen password in the "Univen Password" field at the top.' 
                });
                return;
            }
            // Patch values so the form becomes valid
            this.signupForm.patchValue({
                password: this.univenPassword,
                confirmPassword: this.univenPassword
            });
        }

        if (this.signupForm.invalid) {
            this.signupForm.markAllAsTouched();
            
            // Collect invalid fields
            const invalidFields: string[] = [];
            Object.keys(this.signupForm.controls).forEach(key => {
                const control = this.signupForm.get(key);
                // Skip password fields for Univen students if they are being flagged
                if (this.isUnivenStudent && (key === 'password' || key === 'confirmPassword')) {
                    return;
                }
                
                if (control?.errors) {
                    // Map key to human readable name
                    let name = key.charAt(0).toUpperCase() + key.slice(1);
                    if (key === 'staffEmail') name = 'Email';
                    if (key === 'idNumber') name = 'ID Number';
                    if (key === 'employerName') name = 'Employer';
                    if (key === 'startDate') name = 'Start Date';
                    if (key === 'endDate') name = 'End Date';
                    if (key === 'verificationCode') name = 'Verification Code';
                    if (key === 'confirmPassword') name = 'Confirm Password';
                    if (key === 'acceptTerms') name = 'Terms & Conditions';
                    invalidFields.push(name);
                }
            });

            if (invalidFields.length > 0) {
                Swal.fire({
                    icon: 'warning',
                    title: 'Form Incomplete',
                    html: `Please correct the following fields before proceeding:<br><ul class="text-start mt-3"><li>${invalidFields.join('</li><li>')}</li></ul>`,
                    confirmButtonColor: '#003366'
                });
                return;
            }
        }

        if (this.isSignupSubmitting) return;
        this.isSignupSubmitting = true;
        const formData = this.signupForm.getRawValue();
        const regData: any = {
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
            startDate: formData.startDate,
            endDate: formData.endDate
        };

        // Include the correct identification document
        if (this.isInternational) {
            regData.passportNumber = formData.passportNumber;
        } else {
            regData.idNumber = formData.idNumber;
        }

        if (this.contractFileBase64) {
            (regData as any).contractAgreement = this.contractFileBase64;
        }

        this.api.post('auth/register', regData).subscribe({
            next: () => {
                this.isSignupSubmitting = false;
                Swal.fire({
                    icon: 'success',
                    title: 'Registration Successful!',
                    text: 'Your account has been created. It is now pending approval from an administrator or supervisor. You will be able to log in once approved.'
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
        if (val.endsWith('@') && !val.includes('univen.ac.za')) {
            this.signupForm.get('staffEmail')?.setValue(val + 'univen.ac.za');
        }
    }

    onContractFileChange(event: any): void {
        const file = event.target.files[0];
        if (file) {
            // Validate file size (e.g. max 5MB)
            if (file.size > 5 * 1024 * 1024) {
                this.contractFileError = 'File size must be less than 5MB';
                this.contractFileName = '';
                this.contractFileBase64 = '';
                return;
            }
            this.contractFileError = '';
            this.contractFileName = file.name;

            const reader = new FileReader();
            reader.onload = (e: any) => {
                this.contractFileBase64 = e.target.result;
            };
            reader.readAsDataURL(file);
        } else {
            this.contractFileName = '';
            this.contractFileBase64 = '';
        }
    }

    onIdNumberInput(event: Event): void {
        const input = event.target as HTMLInputElement;
        const val = input.value.replace(/\D/g, '').substring(0, 13);
        this.signupForm.patchValue({ idNumber: val }, { emitEvent: false });

        if (val.length === 13) {
            this.verifyIdNumber(val);
        } else {
            this.idVerified = false;
            this.idVerificationMessage = '';
            this.idVerificationError = '';
            this.idMetadata = {};
        }
    }

    verifyIdNumber(idNum: string): void {
        this.isVerifyingId = true;
        this.idVerified = false;
        this.idVerificationMessage = '';
        this.idVerificationError = '';
        this.idMetadata = {};

        this.api.post('/auth/verify-id', { idNumber: idNum }).subscribe({
            next: (res: any) => {
                this.isVerifyingId = false;
                if (res.valid) {
                    this.idVerified = true;
                    this.idVerificationMessage = res.message || 'ID Verified Successfully!';
                    this.idMetadata = {
                        gender: res.gender,
                        citizenship: res.citizenship,
                        birthDate: res.birthDate
                    };
                } else {
                    this.idVerified = false;
                    this.idVerificationError = res.message || 'ID Verification Failed.';
                }
                this.cdr.detectChanges();
            },
            error: (err: any) => {
                this.isVerifyingId = false;
                this.idVerified = false;
                this.idVerificationError = err.error?.message || err.error?.error || 'Invalid ID number or server check failed.';
                this.cdr.detectChanges();
            }
        });
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
            title: 'Terms & Conditions / System Policy',
            html: `
        <div style="text-align: left; max-height: 400px; overflow-y: auto; font-size: 0.9rem; padding: 10px; white-space: pre-wrap;">${this.systemPolicyContent}</div>
      `,
            confirmButtonText: 'I Understand',
            confirmButtonColor: '#1e3a5f'
        });
    }

    updatePasswordValidity() {
        const passwordControl = this.signupForm.get('password');
        const confirmControl = this.signupForm.get('confirmPassword');

        if (this.isUnivenStudent) {
            // Remove validators if it's a Univen student
            passwordControl?.clearValidators();
            confirmControl?.clearValidators();
        } else {
            // Restore validators if not
            passwordControl?.setValidators([Validators.required, Validators.minLength(8), this.passwordStrengthValidator]);
            confirmControl?.setValidators([Validators.required]);
        }
        
        passwordControl?.updateValueAndValidity();
        confirmControl?.updateValueAndValidity();
    }

    toggleInternational(): void {
        const idCtrl = this.signupForm.get('idNumber');
        const passCtrl = this.signupForm.get('passportNumber');

        if (this.isInternational) {
            // International: passport required, ID not required
            idCtrl?.clearValidators();
            idCtrl?.setValue('');
            idCtrl?.updateValueAndValidity();

            passCtrl?.setValidators([
                Validators.required,
                Validators.pattern(/^[A-Za-z0-9]{6,20}$/)
            ]);
            passCtrl?.updateValueAndValidity();

            // Reset ID verification state
            this.idVerified = false;
            this.idVerificationMessage = '';
            this.idVerificationError = '';
            this.idMetadata = {};
            this.passportError = '';
        } else {
            // Local: SA ID required, passport not required
            passCtrl?.clearValidators();
            passCtrl?.setValue('');
            passCtrl?.updateValueAndValidity();

            idCtrl?.setValidators([Validators.required, Validators.pattern(/^\d{13}$/)]);
            idCtrl?.updateValueAndValidity();
            this.passportError = '';
            this.passportVerified = false;
        }
    }

    onPassportInput(event: Event): void {
        const input = event.target as HTMLInputElement;
        const val = input.value.toUpperCase().replace(/[^A-Z0-9]/g, '').substring(0, 20);
        this.signupForm.patchValue({ passportNumber: val }, { emitEvent: false });
        this.passportError = '';

        if (val.length >= 6) {
            this.passportVerified = true;
            this.passportError = '';
        } else {
            this.passportVerified = false;
        }
    }

    validatePassport(value: string): boolean {
        return /^[A-Za-z0-9]{6,20}$/.test(value);
    }
}
