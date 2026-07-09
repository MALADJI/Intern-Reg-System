import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService, CurrentUser } from '../../services/auth.service';
import { ApiService } from '../../services/api.service';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-select-department',
  templateUrl: './select-department.component.html',
  styleUrls: ['./select-department.component.css'],
  standalone: true,
  imports: [CommonModule, FormsModule]
})
export class SelectDepartmentComponent implements OnInit {
  user: CurrentUser | null = null;
  departments: any[] = [];
  selectedDepartmentId: number | null = null;
  isLoading: boolean = false;
  isSaving: boolean = false;

  constructor(
    private authService: AuthService,
    private api: ApiService,
    private router: Router
  ) { }

  ngOnInit(): void {
    this.user = this.authService.getCurrentUserSync();
    if (!this.user || (this.user.role !== 'ADMIN' && this.user.role !== 'SUPERVISOR')) {
      this.router.navigate(['/login']);
      return;
    }

    // If user already has a department saved, skip this page entirely
    if (this.user.departmentId) {
      console.log('✅ Department already set. Skipping selection page.');
      this.goToDashboard();
      return;
    }

    this.loadDepartments();
  }

  loadDepartments(): void {
    this.isLoading = true;
    this.api.get<any[]>('departments').subscribe({
      next: (data) => {
        this.departments = data;
        this.isLoading = false;
      },
      error: (err) => {
        console.error('Failed to load departments', err);
        this.isLoading = false;
        Swal.fire('Error', 'Failed to load departments. Please try again later.', 'error');
      }
    });
  }

  onProceed(): void {
    if (!this.selectedDepartmentId) {
      Swal.fire('Warning', 'Please select a department to continue.', 'warning');
      return;
    }

    this.isSaving = true;
    this.api.post<any>('auth/update-department', { departmentId: this.selectedDepartmentId }).subscribe({
      next: (response: any) => {
        this.isSaving = false;

        // ✅ Save new token and updated user data
        if (response.token && response.user) {
          this.authService.setAuthData(response.token, response.user);
          console.log('✅ Auth data updated with departmentId:', response.user.departmentId);
        } else if (this.user) {
          // Fallback if role-based user data not returned fully
          this.user.departmentId = this.selectedDepartmentId!;
          this.user.department = response.departmentName ||
            this.departments.find(d => d.departmentId == this.selectedDepartmentId)?.name;
          this.authService.updateCurrentUser(this.user);
        }

        this.goToDashboard();
      },
      error: (err) => {
        console.error('Failed to update department', err);
        this.isSaving = false;
        Swal.fire('Error', 'Failed to update department. Please try again.', 'error');
      }
    });
  }

  private goToDashboard(): void {
    if (this.user?.role === 'ADMIN') {
      this.router.navigate(['/admin/admin-dashboard']);
    } else {
      this.router.navigate(['/supervisor/supervisor-dashboard']);
    }
  }
}
