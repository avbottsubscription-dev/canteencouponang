import { Component, ChangeDetectionStrategy, inject, signal } from '@angular/core';
import { Validators, ReactiveFormsModule, FormGroup, FormControl } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../services/auth.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule]
})
export class LoginComponent {
  private authService = inject(AuthService);
  private router: Router = inject(Router);

  errorMessage = signal<string | null>(null);

  loginForm = new FormGroup({
    loginId: new FormControl('', [Validators.required]),
    password: new FormControl('', [Validators.required]),
    rememberMe: new FormControl(false)
  });

  constructor() {
    // 👉 जर user आधीच logged-in असेल (localStorage मधून restore झाला असेल)
    // आणि /login वर आला तर त्याला थेट योग्य dashboard ला पाठव
    const user = this.authService.currentUser();
    if (user) {
      this.redirectAfterLogin(user);
    }
  }
  
  async handleLogin() {
    if (!this.loginForm.valid) {
      return;
    }

    this.errorMessage.set(null);

    const loginId = this.loginForm.value.loginId || '';
    const password = this.loginForm.value.password || '';

    const result = this.authService.login(String(loginId), String(password));

    if (result.success) {
      const user = this.authService.currentUser();
      if (user) {
        await this.redirectAfterLogin(user);
      }
    } else {
      this.errorMessage.set(result.message || 'An unknown error occurred.');
      setTimeout(() => this.errorMessage.set(null), 5000);
    }
  }

  // ===========================
  // 🔁 role नुसार redirect
  // ===========================
  private async redirectAfterLogin(user: any) {
    // Employee (has 'role' property)
    if ('role' in user) {
      let route = '/employee'; // default

      if (user.role === 'admin') {
        route = '/admin';
      } else if (user.role === 'canteen manager') {
        route = '/canteen-manager';
      } else if (user.role === 'contractual employee') {
        route = '/contractual-employee';
      }

      await this.router.navigate([route]);
    } else {
      // Contractor
      await this.router.navigate(['/contractor']);
    }
  }
}
