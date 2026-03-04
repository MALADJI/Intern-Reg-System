import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiService } from './api.service';

export interface Department {
  id?: number; // Frontend uses 'id'
  departmentId?: number; // Backend uses 'departmentId' - map this to 'id'
  name: string;
  fields?: Field[];
  active?: boolean;
}

export interface Field {
  id: number;
  name: string;
  departmentId: number;
  active?: boolean;
}

// Helper interface for department with ID tracking
export interface DepartmentWithId {
  id: number;
  name: string;
}

@Injectable({
  providedIn: 'root'
})
export class DepartmentApiService {
  constructor(private api: ApiService) {}

  /**
   * Get all departments
   */
  getAllDepartments(): Observable<Department[]> {
    return this.api.get<any[]>('departments').pipe(
      map(departments => departments.map(dept => this.mapDepartment(dept)))
    );
  }

  /**
   * Get department by ID
   */
  getDepartmentById(id: number): Observable<Department> {
    return this.api.get<any>(`departments/${id}`).pipe(
      map(dept => this.mapDepartment(dept))
    );
  }

  /**
   * Get all fields for a specific department
   */
  getFieldsByDepartmentId(departmentId: number): Observable<Field[]> {
    return this.api.get<Field[]>(`departments/${departmentId}/fields`);
  }

  /**
   * Create department
   */
  createDepartment(name: string): Observable<Department> {
    return this.api.post<any>('departments', { name }).pipe(
      map(dept => this.mapDepartment(dept))
    );
  }

  /**
   * Update department
   */
  updateDepartment(id: number, name: string): Observable<Department> {
    return this.api.put<any>(`departments/${id}`, { name }).pipe(
      map(dept => this.mapDepartment(dept))
    );
  }

  /**
   * Delete department
   */
  deleteDepartment(id: number): Observable<void> {
    return this.api.delete<void>(`departments/${id}`);
  }

  /**
   * Deactivate department
   */
  deactivateDepartment(id: number): Observable<any> {
    return this.api.put<any>(`departments/${id}/deactivate`, {});
  }

  /**
   * Activate department
   */
  activateDepartment(id: number): Observable<any> {
    return this.api.put<any>(`departments/${id}/activate`, {});
  }

  /**
   * Add a field to a department
   */
  addFieldToDepartment(departmentId: number, fieldName: string): Observable<Department> {
    return this.api.post<any>(`departments/${departmentId}/fields`, { name: fieldName }).pipe(
      map(response => {
        // Backend returns the updated department with fields
        return this.mapDepartment(response);
      })
    );
  }

  /**
   * Update a field in a department
   */
  updateField(departmentId: number, fieldId: number, fieldName: string): Observable<Department> {
    return this.api.put<any>(`departments/${departmentId}/fields/${fieldId}`, { name: fieldName }).pipe(
      map(response => this.mapDepartment(response))
    );
  }

  /**
   * Delete a field from a department
   */
  deleteField(departmentId: number, fieldId: number): Observable<void> {
    return this.api.delete<void>(`departments/${departmentId}/fields/${fieldId}`);
  }

  /**
   * Deactivate a field in a department
   */
  deactivateField(departmentId: number, fieldId: number): Observable<Department> {
    return this.api.put<any>(`departments/${departmentId}/fields/${fieldId}/deactivate`, {}).pipe(
      map(response => this.mapDepartment(response))
    );
  }

  /**
   * Activate a field in a department
   */
  activateField(departmentId: number, fieldId: number): Observable<Department> {
    return this.api.put<any>(`departments/${departmentId}/fields/${fieldId}/activate`, {}).pipe(
      map(response => this.mapDepartment(response))
    );
  }

  /**
   * Map backend department format to frontend format
   * Backend uses 'departmentId', frontend uses 'id'
   */
  private mapDepartment(dept: any): Department {
    // Map fields array - fields can be objects with {fieldId, name, active} or just strings
    const mappedFields = (dept.fields || []).map((field: any) => {
      if (typeof field === 'string') {
        return field;
      }
      // If field is an object, return it as-is (it has fieldId, name, active properties)
      return field;
    });
    
    // Debug logging
    if (mappedFields.length > 0) {
      console.log(`Mapped department "${dept.name}" with ${mappedFields.length} fields:`, mappedFields);
    }
    
    return {
      id: dept.departmentId || dept.id,
      departmentId: dept.departmentId || dept.id,
      name: dept.name,
      active: dept.active !== false, // Default to true if not specified
      fields: mappedFields
    };
  }
}

