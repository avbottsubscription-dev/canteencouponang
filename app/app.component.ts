import { Component, ChangeDetectionStrategy, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet } from '@angular/router';

import { AuthService } from '../src/services/auth.service';
import { HeaderComponent } from '../src/components/shared/header/header.component';
import { SidebarComponent } from '../src/components/shared/sidebar/sidebar.component';

@Component({
  selector: 'app-root',
  standalone: true,
  templateUrl: './app.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    HeaderComponent,
    RouterOutlet,
    SidebarComponent
  ]
})
export class AppComponent {
  private readonly authService = inject(AuthService);

  // Auth मधील current user (signal)
  readonly currentUser = this.authService.currentUser;

  // User admin आहे का ते check
  readonly isAdmin = computed(() => {
    const user = this.currentUser();
    return !!user && (user as any).role === 'admin';
  });

  // 👉 Mobile sidebar open/close साठी signal
  readonly isSidebarOpen = signal(false);

  // Header मधून / overlay मधून call होईल
  toggleSidebar(): void {
    this.isSidebarOpen.update(open => !open);
  }

  logout(): void {
    this.authService.logout();
    // Logout झाल्यावर sidebar बंद
    this.isSidebarOpen.set(false);
  }
}
