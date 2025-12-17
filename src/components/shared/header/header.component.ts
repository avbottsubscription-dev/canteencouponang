import { Component, ChangeDetectionStrategy, output, inject, signal, computed, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../../services/auth.service';
import { DataService } from '../../../services/data.service';
import { AppNotification } from '../../../models/notification.model';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-header',
  templateUrl: './header.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterLink],
  host: {
    '(document:click)': 'onDocumentClick($event)',
  }
})
export class HeaderComponent {
  private authService = inject(AuthService);
  private dataService = inject(DataService);
  private elementRef = inject(ElementRef);
  
  // current user signal
  currentUser = this.authService.currentUser;

  // outputs
  logout = output<void>();
  menuToggle = output<void>();   // 👈 हे नवीन – mobile sidebar toggle साठी

  // state signals
  isNotificationPanelOpen = signal(false);
  isUserMenuOpen = signal(false);

  userNotifications = computed(() => {
    const user = this.currentUser();
    if (!user) return [];
    // Show latest 10 notifications
    return this.dataService.notifications()
      .filter(n => n.employeeId === user.id)
      .slice(0, 10);
  });
  
  unreadNotificationCount = computed(() => {
    return this.userNotifications().filter(n => !n.isRead).length;
  });

  onDocumentClick(event: MouseEvent) {
    if (
      this.isNotificationPanelOpen() &&
      !this.elementRef.nativeElement
        .querySelector('.notification-panel-container')
        ?.contains(event.target)
    ) {
      this.isNotificationPanelOpen.set(false);
    }

    if (
      this.isUserMenuOpen() &&
      !this.elementRef.nativeElement
        .querySelector('.user-menu-container')
        ?.contains(event.target)
    ) {
      this.isUserMenuOpen.set(false);
    }
  }

  toggleNotificationPanel() {
    this.isUserMenuOpen.set(false);
    this.isNotificationPanelOpen.update(v => !v);
  }
  
  toggleUserMenu() {
    this.isNotificationPanelOpen.set(false);
    this.isUserMenuOpen.update(v => !v);
  }

  markAsRead(notification: AppNotification) {
    if (!notification.isRead) {
      this.dataService.markNotificationAsRead(notification.id);
    }
  }

  markAllAsRead() {
    const user = this.currentUser();
    if (user) {
      this.dataService.markAllNotificationsAsRead(user.id);
    }
  }

  relativeTime(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.round((now.getTime() - date.getTime()) / 1000);
    const minutes = Math.round(seconds / 60);
    const hours = Math.round(minutes / 60);
    const days = Math.round(hours / 24);

    if (seconds < 60) return `${seconds}s ago`;
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  }
}
