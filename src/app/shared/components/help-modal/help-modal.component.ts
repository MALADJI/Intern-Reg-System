import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HelpService } from '../../../services/help.service';
import { AuthService } from '../../../services/auth.service';
import { Subscription } from 'rxjs';

@Component({
    selector: 'app-help-modal',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './help-modal.component.html',
    styleUrl: './help-modal.component.css'
})
export class HelpModalComponent implements OnInit, OnDestroy {
    isVisible = false;
    userRole: string | null = null;
    activeTab: string = 'general';
    private subscription: Subscription = new Subscription();

    constructor(
        private helpService: HelpService,
        private authService: AuthService
    ) { }

    ngOnInit(): void {
        this.subscription.add(
            this.helpService.isHelpVisible$.subscribe(visible => {
                this.isVisible = visible;
                if (visible) {
                    this.userRole = this.authService.getUserRole();
                    this.setDefaultTab();
                }
            })
        );
    }

    ngOnDestroy(): void {
        this.subscription.unsubscribe();
    }

    close(): void {
        this.helpService.hideHelp();
    }

    setActiveTab(tab: string): void {
        this.activeTab = tab;
    }

    private setDefaultTab(): void {
        this.activeTab = 'general';
    }

    getRoleTitle(): string {
        switch (this.userRole) {
            case 'INTERN': return 'Intern Guide';
            case 'SUPERVISOR': return 'Supervisor Guide';
            case 'ADMIN': return 'Administrator Guide';
            case 'SUPER_ADMIN': return 'Super Admin Guide';
            default: return 'System Guide';
        }
    }
}
