import { Component, ChangeDetectionStrategy, computed, inject, signal, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-sidebar',
  templateUrl: './sidebar.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterLink, RouterLinkActive],
  host: {
    '[class.w-64]': '!isCollapsed()',
    '[class.w-20]': 'isCollapsed()',
    'class': 'bg-gray-800 text-gray-200 flex flex-col flex-shrink-0 transition-all duration-300 ease-in-out'
  }
})
export class SidebarComponent {
  private authService = inject(AuthService);
  currentUser = this.authService.currentUser;
  // FIX: Added a type guard to ensure the user is an Employee before accessing employeeId.
  isSuperAdmin = computed(() => {
    const user = this.currentUser();
    return user && 'employeeId' in user && user.employeeId === 'admin01';
  });

  logout = output<void>();
  isCollapsed = signal(false);

  toggleCollapse() {
    this.isCollapsed.update(collapsed => !collapsed);
  }
}
