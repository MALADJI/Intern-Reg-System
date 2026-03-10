import { Injectable } from '@angular/core';
import { StorageService } from './storage.service';
import { ApiService } from './api.service';
import { WebSocketService } from './websocket.service';

/**
 * Service for managing departments and fields
 */
@Injectable({
  providedIn: 'root'
})
export class DepartmentService {
  private readonly STORAGE_KEY = 'adminDepartments';
  private readonly STORAGE_FIELDS_KEY = 'adminDepartmentFields';

  private _departmentList: string[] = ['ICT', 'Finance', 'Marketing', 'HR', 'Engineering'];
  private _fieldMap: { [dept: string]: string[] } = {
    ICT: ['Software Development', 'Networking', 'Support', 'Music', 'Business Analysis'],
    Finance: ['Accounting', 'Payroll'],
    Marketing: ['Digital Marketing', 'Advertising'],
    HR: ['Recruitment', 'Training', 'Payroll'],
    Engineering: ['Mechanical Design', 'Electrical', 'Civil']
  };

  constructor(
    private storage: StorageService,
    private api: ApiService,
    private webSocketService: WebSocketService
  ) {
    this.initialiseData();

    // Subscribe to real-time updates
    this.webSocketService.departmentUpdates$.subscribe(update => {
      this.handleRealTimeUpdate(update);
    });
  }

  private initialiseData(): void {
    // Load from storage first for immediate display
    this.loadFromStorage();

    // Then sync with backend
    this.api.get<any[]>('departments').subscribe({
      next: (departments) => {
        this.syncWithBackend(departments);
      },
      error: (err) => console.error('Failed to sync departments', err)
    });
  }

  private syncWithBackend(departments: any[]): void {
    const backendDepts: string[] = [];
    const backendFields: { [dept: string]: string[] } = {};

    departments.forEach(dept => {
      if (dept.active !== false) { // Only show active departments? Or all? Let's show all for now or match current logic.
        backendDepts.push(dept.name);
        backendFields[dept.name] = dept.fields ?
          dept.fields.filter((f: any) => f.active !== false).map((f: any) => f.name) :
          [];
      }
    });

    // Update local state if different (simple check)
    // For now, just overwrite to ensure consistency
    this._departmentList = backendDepts;
    this._fieldMap = backendFields;
    this.saveToStorage();
  }

  private handleRealTimeUpdate(update: any): void {
    const type = update.type;
    const data = update.data;

    console.log('🏢 Department Update:', type, data);

    if (type === 'CREATED' || type === 'ACTIVATED') {
      const name = data.name;
      if (name && !this._departmentList.includes(name)) {
        this._departmentList.push(name);
        this._fieldMap[name] = []; // Initialize active fields
      }
    } else if (type === 'UPDATED') {
      // We might need the OLD name to update it properly, but the event might not send it.
      // The 'UPDATED' event in backend sends the *updated* object.
      // If the name changed, we have a problem matching it to the old string in _departmentList without an ID map.
      // Since this service uses strings, we might have limitations.
      // However, simply reloading from API is a safe fallback for complex updates.
      this.initialiseData(); // Re-sync everything to be safe
      return;
    } else if (type === 'DELETED' || type === 'DEACTIVATED') {
      // Logic would be complex without ID mapping. 
      // Safest approach: re-sync.
      this.initialiseData();
      return;
    } else if (type === 'FIELD_ADDED' || type === 'FIELD_ACTIVATED') {
      // We need to find the department name by ID? 
      // The event data has { departmentId, fieldName, ... }
      // We don't have ID mapping here easily.
      this.initialiseData(); // Re-sync
      return;
    } else {
      this.initialiseData();
    }

    this.saveToStorage();
  }

  /**
   * Observable for real-time department updates (optional, if components want to listen directly)
   */
  get departmentUpdates$() {
    return this.webSocketService.departmentUpdates$;
  }

  /**
   * Get all departments
   */
  get departmentList(): string[] {
    return [...this._departmentList];
  }

  /**
   * Get field map
   */
  get fieldMap(): { [dept: string]: string[] } {
    return { ...this._fieldMap };
  }

  /**
   * Get fields for a specific department
   */
  getFieldsForDepartment(department: string): string[] {
    return [...(this._fieldMap[department] || [])];
  }

  /**
   * Add a new department
   */
  addDepartment(name: string): { success: boolean; message: string } {
    const trimmedName = name.trim();

    if (!trimmedName) {
      return { success: false, message: 'Department name cannot be empty' };
    }

    if (this._departmentList.includes(trimmedName)) {
      return { success: false, message: 'This department already exists' };
    }

    this._departmentList.push(trimmedName);
    this._fieldMap[trimmedName] = [];
    this.saveToStorage();

    return { success: true, message: `Department "${trimmedName}" has been added.` };
  }

  /**
   * Update a department name
   */
  updateDepartment(oldName: string, newName: string): { success: boolean; message: string } {
    const trimmedNewName = newName.trim();
    const index = this._departmentList.indexOf(oldName);

    if (index === -1) {
      return { success: false, message: 'Department not found' };
    }

    if (!trimmedNewName) {
      return { success: false, message: 'Department name cannot be empty' };
    }

    if (this._departmentList.includes(trimmedNewName) && trimmedNewName !== oldName) {
      return { success: false, message: 'This department already exists' };
    }

    // Update department list
    this._departmentList[index] = trimmedNewName;

    // Update fieldMap key
    if (this._fieldMap[oldName]) {
      this._fieldMap[trimmedNewName] = this._fieldMap[oldName];
      if (trimmedNewName !== oldName) {
        delete this._fieldMap[oldName];
      }
    }

    this.saveToStorage();

    return { success: true, message: `Department updated to "${trimmedNewName}".` };
  }

  /**
   * Delete a department
   */
  deleteDepartment(name: string, checkUsage: (dept: string) => number): {
    success: boolean;
    message: string;
    internCount?: number
  } {
    const internCount = checkUsage(name);

    if (internCount > 0) {
      return {
        success: false,
        message: `Cannot delete department. It is assigned to ${internCount} intern(s).`,
        internCount
      };
    }

    const index = this._departmentList.indexOf(name);
    if (index === -1) {
      return { success: false, message: 'Department not found' };
    }

    this._departmentList.splice(index, 1);
    delete this._fieldMap[name];
    this.saveToStorage();

    return { success: true, message: `Department "${name}" has been deleted.` };
  }

  /**
   * Add a field to a department
   */
  addField(department: string, fieldName: string): { success: boolean; message: string } {
    const trimmedField = fieldName.trim();

    if (!trimmedField) {
      return { success: false, message: 'Field name cannot be empty' };
    }

    if (!this._fieldMap[department]) {
      this._fieldMap[department] = [];
    }

    if (this._fieldMap[department].includes(trimmedField)) {
      return { success: false, message: 'This field already exists' };
    }

    this._fieldMap[department].push(trimmedField);
    this.saveToStorage();

    return { success: true, message: `Field added to "${department}".` };
  }

  /**
   * Update a field name
   */
  updateField(department: string, oldField: string, newField: string): {
    success: boolean;
    message: string
  } {
    const trimmedNewField = newField.trim();
    const fields = this._fieldMap[department];

    if (!fields) {
      return { success: false, message: 'Department not found' };
    }

    const index = fields.indexOf(oldField);
    if (index === -1) {
      return { success: false, message: 'Field not found' };
    }

    if (!trimmedNewField) {
      return { success: false, message: 'Field name cannot be empty' };
    }

    if (fields.includes(trimmedNewField) && trimmedNewField !== oldField) {
      return { success: false, message: 'This field already exists' };
    }

    fields[index] = trimmedNewField;
    this.saveToStorage();

    return { success: true, message: `Field updated to "${trimmedNewField}".` };
  }

  /**
   * Delete a field
   */
  deleteField(department: string, fieldName: string, checkUsage: (dept: string, field: string) => number): {
    success: boolean;
    message: string;
    internCount?: number
  } {
    const fields = this._fieldMap[department];
    if (!fields) {
      return { success: false, message: 'Department not found' };
    }

    const index = fields.indexOf(fieldName);
    if (index === -1) {
      return { success: false, message: 'Field not found' };
    }

    const internCount = checkUsage(department, fieldName);

    if (internCount > 0) {
      return {
        success: false,
        message: `Cannot delete field. It is assigned to ${internCount} intern(s).`,
        internCount
      };
    }

    fields.splice(index, 1);
    this.saveToStorage();

    return { success: true, message: 'Field has been deleted.' };
  }

  /**
   * Get total number of fields across all departments
   */
  getTotalFields(): number {
    return Object.values(this._fieldMap).reduce((total, fields) => total + (fields?.length || 0), 0);
  }

  /**
   * Get average fields per department
   */
  getAverageFieldsPerDepartment(): number {
    if (this._departmentList.length === 0) return 0;
    const total = this.getTotalFields();
    return Math.round((total / this._departmentList.length) * 10) / 10;
  }

  /**
   * Load data from localStorage
   */
  private loadFromStorage(): void {
    const savedDepts = this.storage.getItem<string[]>(this.STORAGE_KEY);
    const savedFields = this.storage.getItem<{ [dept: string]: string[] }>(this.STORAGE_FIELDS_KEY);

    if (savedDepts) {
      this._departmentList = savedDepts;
    }

    if (savedFields) {
      this._fieldMap = savedFields;
    }
  }

  /**
   * Save data to localStorage
   */
  private saveToStorage(): void {
    this.storage.setItem(this.STORAGE_KEY, this._departmentList);
    this.storage.setItem(this.STORAGE_FIELDS_KEY, this._fieldMap);
  }
}

