import { Injectable, signal, inject } from '@angular/core';
import { Router } from '@angular/router';

import { Employee } from '../models/user.model';
import { Contractor } from '../models/contractor.model';
import { DataService } from './data.service';

type StoredUser =
  | { type: 'employee'; user: Employee }
  | { type: 'contractor'; user: Contractor };

const STORAGE_KEY = 'canteen_current_user';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private dataService = inject(DataService);
  private router: Router = inject(Router);

  // 🔐 Logged-in user (Signal)
  private _currentUser = signal<Employee | Contractor | null>(null);

  // बाहेरून read-only access
  readonly currentUser = this._currentUser.asReadonly();

  constructor() {
    this.restoreFromStorage();
  }

  // ===========================
  // 📥 LOGIN
  // ===========================
  login(
    loginId: string,
    password: string
  ): { success: boolean; message?: string } {
    // 1️⃣ Employees check
    const employee = this.dataService
      .getEmployees()
      .find((e) => e.employeeId === loginId && e.password === password);

    if (employee) {
      if (employee.status === 'deactivated') {
        return {
          success: false,
          message:
            'Your account has been deactivated. Please contact an administrator.',
        };
      }

      this._currentUser.set(employee);

      const stored: StoredUser = { type: 'employee', user: employee };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));

      return { success: true };
    }

    // 2️⃣ Contractors check
    const contractor = this.dataService
      .getContractors()
      .find((c) => c.contractorId === loginId && c.password === password);

    if (contractor) {
      this._currentUser.set(contractor);

      const stored: StoredUser = { type: 'contractor', user: contractor };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));

      return { success: true };
    }

    return {
      success: false,
      message: 'Invalid Login ID or Password. Please try again.',
    };
  }

  // ===========================
  // 🚪 LOGOUT
  // ===========================
  logout() {
    this._currentUser.set(null);
    localStorage.removeItem(STORAGE_KEY);
    this.router.navigate(['/login']);
  }

  // ===========================
  // 🔑 CHANGE PASSWORD
  // ===========================
  changePassword(
    currentPassword: string,
    newPassword: string
  ): { success: boolean; message: string } {
    const user = this._currentUser();
    if (!user) {
      return { success: false, message: 'No user is logged in.' };
    }

    if (user.password !== currentPassword) {
      return {
        success: false,
        message: 'The current password you entered is incorrect.',
      };
    }

    // DataService मधून Firestore update
    if ('role' in user) {
      // Employee / Admin / Canteen Manager
      this.dataService.changePassword(user.id, newPassword);
    } else {
      // Contractor
      this.dataService.changeContractorPassword(user.id, newPassword);
    }

    // local currentUser update
    const updated = { ...user, password: newPassword } as Employee | Contractor;
    this._currentUser.set(updated);

    // localStorage मधला user देखील update कर
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as StoredUser;
        const newStored: StoredUser =
          parsed.type === 'employee'
            ? { type: 'employee', user: updated as Employee }
            : { type: 'contractor', user: updated as Contractor };

        localStorage.setItem(STORAGE_KEY, JSON.stringify(newStored));
      } catch {
        // काही error असेल तर साफ करून टाक
        localStorage.removeItem(STORAGE_KEY);
      }
    }

    return { success: true, message: 'Password changed successfully.' };
  }

  // ===========================
  // 📌 Helpers
  // ===========================
  /** Guard / Components मधून use करण्यासाठी helper */
  getCurrentUser(): Employee | Contractor | null {
    return this._currentUser();
  }

  isLoggedIn(): boolean {
    return this._currentUser() !== null;
  }

  isEmployee(): boolean {
    const u = this._currentUser();
    return !!u && 'role' in u;
  }

  isContractor(): boolean {
    const u = this._currentUser();
    return !!u && 'contractorId' in u;
  }

  // ===========================
  // 🔄 Restore on refresh
  // ===========================
  private restoreFromStorage() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;

    try {
      const parsed = JSON.parse(raw) as StoredUser;

      if (parsed.type === 'employee') {
        this._currentUser.set(parsed.user);
      } else if (parsed.type === 'contractor') {
        this._currentUser.set(parsed.user);
      }
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }
}
