import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

/** 🔁 Common helper – login स्क्रीनला पाठवतो */
const goToLogin = () => {
  const router = inject(Router);
  return router.parseUrl('/login');
};

/** Basic login check */
export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  if (auth.isLoggedIn()) return true;
  return goToLogin();
};

/** Admin only */
export const adminGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const user = auth.currentUser();
  if (user && 'role' in user && user.role === 'admin') return true;
  return goToLogin();
};

/** Canteen Manager only */
export const canteenManagerGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const user = auth.currentUser();
  if (user && 'role' in user && user.role === 'canteen manager') return true;
  return goToLogin();
};

/** Contractor only */
export const contractorGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const user = auth.currentUser();
  if (user && 'contractorId' in user) return true;
  return goToLogin();
};
