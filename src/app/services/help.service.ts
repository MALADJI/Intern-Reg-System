import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

@Injectable({
    providedIn: 'root'
})
export class HelpService {
    private isHelpVisibleSubject = new BehaviorSubject<boolean>(false);
    isHelpVisible$: Observable<boolean> = this.isHelpVisibleSubject.asObservable();

    constructor() { }

    showHelp(): void {
        this.isHelpVisibleSubject.next(true);
    }

    hideHelp(): void {
        this.isHelpVisibleSubject.next(false);
    }

    toggleHelp(): void {
        this.isHelpVisibleSubject.next(!this.isHelpVisibleSubject.value);
    }

    get isVisible(): boolean {
        return this.isHelpVisibleSubject.value;
    }
}
