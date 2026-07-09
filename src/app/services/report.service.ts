import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';
import { saveAs } from 'file-saver';

export interface ReportFilters {
  internName?: string;
  department?: string;
  field?: string;
  fromDate?: string;
  toDate?: string;
}

@Injectable({
  providedIn: 'root'
})
export class ReportService {
  constructor(private api: ApiService) {}

  /**
   * Generate and download PDF report
   */
  downloadPDFReport(filters?: ReportFilters): Observable<Blob> {
    return this.api.downloadFile('reports/attendance/pdf', filters);
  }

  /**
   * Generate and download Excel report
   */
  downloadExcelReport(filters?: ReportFilters): Observable<Blob> {
    return this.api.downloadFile('reports/attendance/excel', filters);
  }

  /**
   * Download PDF report with file save
   */
  downloadPDF(filters?: ReportFilters, filename?: string): void {
    this.downloadPDFReport(filters).subscribe({
      next: (blob) => {
        const fileName = filename || `attendance-report-${new Date().toISOString().split('T')[0]}.pdf`;
        saveAs(blob, fileName);
      },
      error: (error) => {
        console.error('Error downloading PDF:', error);
      }
    });
  }

  /**
   * Download Excel report with file save
   */
  downloadExcel(filters?: ReportFilters, filename?: string): void {
    this.downloadExcelReport(filters).subscribe({
      next: (blob) => {
        const fileName = filename || `attendance-report-${new Date().toISOString().split('T')[0]}.xlsx`;
        saveAs(blob, fileName);
      },
      error: (error) => {
        console.error('Error downloading Excel:', error);
      }
    });
  }

  /**
   * Generate and download Leave PDF report
   */
  downloadLeavePDFReport(filters?: ReportFilters): Observable<Blob> {
    return this.api.downloadFile('reports/leave/pdf', filters);
  }

  /**
   * Generate and download Leave Excel report
   */
  downloadLeaveExcelReport(filters?: ReportFilters): Observable<Blob> {
    return this.api.downloadFile('reports/leave/excel', filters);
  }

  /**
   * Download Leave PDF report with file save
   */
  downloadLeavePDF(filters?: ReportFilters, filename?: string): void {
    this.downloadLeavePDFReport(filters).subscribe({
      next: (blob) => {
        const fileName = filename || `leave-report-${new Date().toISOString().split('T')[0]}.pdf`;
        saveAs(blob, fileName);
      },
      error: (error) => {
        console.error('Error downloading Leave PDF:', error);
      }
    });
  }

  /**
   * Download Leave Excel report with file save
   */
  downloadLeaveExcel(filters?: ReportFilters, filename?: string): void {
    this.downloadLeaveExcelReport(filters).subscribe({
      next: (blob) => {
        const fileName = filename || `leave-report-${new Date().toISOString().split('T')[0]}.xlsx`;
        saveAs(blob, fileName);
      },
      error: (error) => {
        console.error('Error downloading Leave Excel:', error);
      }
    });
  }
}

