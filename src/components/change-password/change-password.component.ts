import { Component, ChangeDetectionStrategy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormGroup, FormControl, Validators, ValidatorFn, AbstractControl, ValidationErrors } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';

export const passwordMatchValidator: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
  const password = control.get('newPassword');
  const confirmPassword = control.get('confirmNewPassword');
  return password && confirmPassword && password.value !== confirmPassword.value ? { passwordMismatch: true } : null;
};

@Component({
  selector: 'app-change-password',
  templateUrl: './change-password.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule]
})
export class ChangePasswordComponent {
  private authService = inject(AuthService);
  private router = inject(Router);

  currentUser = this.authService.currentUser;
  statusMessage = signal<{ type: 'success' | 'error', text: string } | null>(null);

  changePasswordForm = new FormGroup({
    currentPassword: new FormControl('', [Validators.required]),
    newPassword: new FormControl('', [Validators.required, Validators.minLength(6)]),
    confirmNewPassword: new FormControl('', [Validators.required])
  }, { validators: passwordMatchValidator });

  handleChangePassword() {
    this.statusMessage.set(null);
    if (this.changePasswordForm.valid) {
      const { currentPassword, newPassword } = this.changePasswordForm.value;
      const result = this.authService.changePassword(currentPassword!, newPassword!);
      
      if (result.success) {
        this.statusMessage.set({ type: 'success', text: result.message! });
        this.changePasswordForm.reset();
        setTimeout(() => this.goBack(), 2000);
      } else {
        this.statusMessage.set({ type: 'error', text: result.message! });
      }
    }
  }

  goBack() {
    const user = this.currentUser();
    if (user) {
      if ('role' in user) { // Employee
        let route = '/employee'; // default
        if (user.role === 'admin') route = '/admin';
        if (user.role === 'canteen manager') route = '/canteen-manager';
        this.router.navigate([route]);
      } else { // Contractor
        this.router.navigate(['/contractor']);
      }
    } else {
      this.router.navigate(['/login']);
    }
  }
}
