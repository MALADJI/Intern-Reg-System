import { Component, signal } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { Navbar } from './shared/navbar/navbar';
import { HelpModalComponent } from './shared/components/help-modal/help-modal.component';
import { NgIf } from '@angular/common';
import { WebSocketService } from './services/websocket.service';
import { HelpService } from './services/help.service';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Navbar, HelpModalComponent, NgIf],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  constructor(
    private router: Router,
    private webSocketService: WebSocketService,
    private helpService: HelpService
  ) {
    console.log('✅ App component constructed');
    console.log('Initial route:', this.router.url);

    // Connect to WebSocket
    this.webSocketService.connect();
  }
  protected readonly title = signal('Intern-Register-System');

  // Hide on login & register routes
  isAuthPage(): boolean {
    const currentRoute = this.router.url;
    return currentRoute.includes('login') || currentRoute.includes('sign-up');
  }

  toggleHelp(): void {
    this.helpService.toggleHelp();
  }

  openAboutSystem(): void {
    this.helpService.showHelp();
  }

  contactSupport(): void {
    Swal.fire({
      title: 'Contact Support',
      html: `
        <div class="text-start">
          <p class="mb-2"><strong>IT Support Desk:</strong></p>
          <ul class="list-unstyled mb-3">
            <li><i class="bi bi-envelope me-2"></i> support@univen.ac.za</li>
            <li><i class="bi bi-telephone me-2"></i> +27 15 962 8000</li>
          </ul>
          <p class="mb-0 small text-muted">Available Mon-Fri: 08:00 - 16:30</p>
        </div>
      `,
      icon: 'info',
      confirmButtonText: 'Close',
      confirmButtonColor: '#1e3a5f'
    });
  }
}
