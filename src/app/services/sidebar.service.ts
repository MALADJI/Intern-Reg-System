import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

@Injectable({
    providedIn: 'root'
})
export class SidebarService {
    // Initial state is expanded (true)
    private isSidebarExpandedSubject = new BehaviorSubject<boolean>(true);

    // Observable for components to subscribe to
    isSidebarExpanded$: Observable<boolean> = this.isSidebarExpandedSubject.asObservable();

    constructor() { }

    /**
     * Toggles the current state of the sidebar
     */
    toggleSidebar(): void {
        this.isSidebarExpandedSubject.next(!this.isSidebarExpandedSubject.value);
    }

    /**
     * Explicitly sets the sidebar state
     * @param expanded The desired state of the sidebar
     */
    setSidebarState(expanded: boolean): void {
        this.isSidebarExpandedSubject.next(expanded);
    }

    /**
     * Gets the current value of the sidebar state synchronously
     */
    get isExpanded(): boolean {
        return this.isSidebarExpandedSubject.value;
    }
}
