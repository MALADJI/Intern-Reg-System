import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, tap } from 'rxjs';
import { ApiService } from './api.service';

export interface HelpSettings {
    about: string;
    phone: string;
    email: string;
    location: string;
    website: string;
    triggerText: string;
}

@Injectable({
    providedIn: 'root'
})
export class HelpService {
    private isHelpVisibleSubject = new BehaviorSubject<boolean>(false);
    isHelpVisible$: Observable<boolean> = this.isHelpVisibleSubject.asObservable();

    private helpSettingsSubject = new BehaviorSubject<HelpSettings>({
        about: 'The University of Venda Intern Online Register System is a modern platform designed to streamline intern management and performance monitoring.',
        phone: '+27 15 962 8000',
        email: 'support@univen.ac.za',
        location: 'Thohoyandou, Limpopo',
        website: 'https://www.univen.ac.za/',
        triggerText: 'Need Help?'
    });
    helpSettings$: Observable<HelpSettings> = this.helpSettingsSubject.asObservable();

    constructor(private api: ApiService) {
        this.loadSettings();
    }

    loadSettings(): void {
        this.api.get<HelpSettings>('system-settings/help-widget').subscribe({
            next: (settings) => {
                if (settings) {
                    this.helpSettingsSubject.next(settings);
                }
            },
            error: (err) => console.log('Using default help settings (backend not available or error)')
        });
    }

    updateSettings(settings: HelpSettings): Observable<any> {
        return this.api.put<any>('system-settings/help-widget', settings).pipe(
            tap((res) => {
                this.helpSettingsSubject.next(settings);
            })
        );
    }

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

    get currentSettings(): HelpSettings {
        return this.helpSettingsSubject.value;
    }
}
