import { Component, signal } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { Navbar } from './shared/navbar/navbar';
import { HelpModalComponent } from './shared/components/help-modal/help-modal.component';
import { NgIf, AsyncPipe } from '@angular/common';
import { WebSocketService } from './services/websocket.service';
import { HelpService } from './services/help.service';
import { LoadingStateService } from './services/loading-state.service';
import { Observable } from 'rxjs';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Navbar, HelpModalComponent, NgIf, AsyncPipe],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  isLoading$: Observable<boolean>;

  constructor(
    private router: Router,
    private webSocketService: WebSocketService,
    private helpService: HelpService,
    private loadingStateService: LoadingStateService
  ) {
    this.isLoading$ = this.loadingStateService.isLoading$;
    // Connect to WebSocket
    this.webSocketService.connect();
  }
  protected readonly title = signal('Intern-Register-System');

  isAuthPage(): boolean {
    const currentRoute = this.router.url;
    return currentRoute.includes('login') ||
      currentRoute.includes('sign-up') ||
      currentRoute.includes('force-password-change') ||
      currentRoute.includes('face-registration') ||
      currentRoute.includes('face-verification') ||
      currentRoute.includes('select-department');
  }

  toggleHelp(): void {
    this.helpService.toggleHelp();
  }
}
