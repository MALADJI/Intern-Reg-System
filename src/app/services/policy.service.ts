import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, tap } from 'rxjs';
import { ApiService } from './api.service';

export interface SystemPolicy {
    id?: number;
    title: string;
    description?: string;
    content: string;
    createdAt?: string;
    updatedAt?: string;
}

@Injectable({
    providedIn: 'root'
})
export class PolicyService {
    private policySubject = new BehaviorSubject<SystemPolicy>({ title: '', content: '' });
    policy$: Observable<SystemPolicy> = this.policySubject.asObservable();

    constructor(private api: ApiService) {
        this.loadPolicy();
    }

    loadPolicy(): void {
        this.api.get<SystemPolicy>('policies/by-title/PrivacyPolicy').subscribe({
            next: (policy) => {
                if (policy) {
                    this.policySubject.next(policy);
                }
            },
            error: (err) => {
                console.log('Using default policy settings (backend not available or no policy found)');
                this.policySubject.next({ title: 'PrivacyPolicy', content: '' });
            }
        });
    }

    updatePolicy(policy: SystemPolicy): Observable<any> {
        if (policy.id) {
            // Update existing policy
            return this.api.put<any>(`policies/${policy.id}`, policy).pipe(
                tap((res) => {
                    this.policySubject.next(res);
                })
            );
        } else {
            // Create new policy
            return this.api.post<any>('policies', policy).pipe(
                tap((res) => {
                    this.policySubject.next(res);
                })
            );
        }
    }

    get currentPolicy(): SystemPolicy {
        return this.policySubject.value;
    }
}
