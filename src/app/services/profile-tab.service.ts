import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({
    providedIn: 'root'
})
export class ProfileTabService {
    private activeTabSubject = new BehaviorSubject<'profile' | 'password'>('profile');
    activeTab$ = this.activeTabSubject.asObservable();

    private isProfileActiveSubject = new BehaviorSubject<boolean>(false);
    isProfileActive$ = this.isProfileActiveSubject.asObservable();

    setActiveTab(tab: 'profile' | 'password') {
        this.activeTabSubject.next(tab);
    }

    getActiveTab(): 'profile' | 'password' {
        return this.activeTabSubject.value;
    }

    setProfileActive(active: boolean) {
        this.isProfileActiveSubject.next(active);
    }
}
