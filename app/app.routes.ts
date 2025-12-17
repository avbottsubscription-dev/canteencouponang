import { inject } from '@angular/core';
import { Routes, Router, CanActivateFn } from '@angular/router';
import { AuthService } from '../src/services/auth.service';

import { LoginComponent } from '../src/components/login/login.component';
import { AdminDashboardComponent } from '../src/components/admin-dashboard/admin-dashboard.component';
import { EmployeeDashboardComponent } from '../src/components/user-dashboard/user-dashboard.component';
import { CanteenManagerDashboardComponent } from '../src/components/canteen-manager-dashboard/canteen-manager-dashboard.component';
import { AddEmployeeComponent } from '../src/components/add-employee/add-employee.component';
import { SettingsComponent } from '../src/components/settings/settings.component';
import { ManageCouponsComponent } from '../src/components/manage-coupons/manage-coupons.component';
import { EmployeeManagementComponent } from '../src/components/employee-management/employee-management.component';
import { HistoryComponent } from '../src/components/history/history.component';
import { RedeemCouponComponent } from '../src/components/redeem-coupon/redeem-coupon.component';
import { ChangePasswordComponent } from '../src/components/change-password/change-password.component';
import { ManageContractorsComponent } from '../src/components/manage-contractors/manage-contractors.component';
import { ContractorDashboardComponent } from '../src/components/contractor-dashboard/contractor-dashboard.component';
import { EmployeeHistoryComponent } from '../src/components/employee-history/employee-history.component';
import { AnalyticsDashboardComponent } from '../src/components/analytics-dashboard/analytics-dashboard.component';
import { MenuManagementComponent } from '../src/components/menu-management/menu-management.component';

// =============================
// COMMON LOGIN CHECK
// =============================
const authGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router: Router = inject(Router);

  if (authService.isLoggedIn()) return true;
  return router.parseUrl('/login');
};

// =============================
// ADMIN ONLY
// =============================
const adminGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router: Router = inject(Router);

  const user = authService.currentUser();
  if (user && 'role' in user && user.role === 'admin') return true;

  return router.parseUrl('/login');
};

// =============================
// CONTRACTOR ONLY
// =============================
const contractorGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router: Router = inject(Router);

  const user = authService.currentUser();
  // contractor ID property uniquely exists
  if (user && 'contractorId' in user) return true;

  return router.parseUrl('/login');
};

// =============================
// ROUTES
// =============================
export const routes: Routes = [
  // ===== LOGIN =====
  {
    path: 'login',
    component: LoginComponent,
    canActivate: [
      // If user already logged in → prevent access to login page
      () => {
        const authService = inject(AuthService);
        const router: Router = inject(Router);

        const user = authService.currentUser();
        if (user) {
          // redirect based on role
          if ('role' in user) {
            if (user.role === 'admin') return router.parseUrl('/admin');
            if (user.role === 'canteen manager')
              return router.parseUrl('/canteen-manager');
            return router.parseUrl('/employee');
          }
          return router.parseUrl('/contractor');
        }
        return true;
      },
    ],
  },

  // ===== ADMIN AREA =====
  {
    path: 'admin',
    component: AdminDashboardComponent,
    canActivate: [authGuard, adminGuard],
  },

  // 🔹 Add Employee – regular employee
  {
    path: 'admin/add-employee',
    component: AddEmployeeComponent,
    canActivate: [authGuard, adminGuard],
    data: { type: 'employee' },
  },

  // 🔹 Add Contractual Employee – same component, वेगळं type
  {
    path: 'admin/add-contract-employee',
    component: AddEmployeeComponent,
    canActivate: [authGuard, adminGuard],
    data: { type: 'contractual' },
  },

  // 🔹 Add Admin / Canteen Manager – same component, वेगळं type
  {
    path: 'admin/add-admin-canteen',
    component: AddEmployeeComponent,
    canActivate: [authGuard, adminGuard],
    data: { type: 'admin-canteen' },
  },

  {
    path: 'admin/analytics',
    component: AnalyticsDashboardComponent,
    canActivate: [authGuard, adminGuard],
  },
  {
    path: 'admin/employees',
    component: EmployeeManagementComponent,
    canActivate: [authGuard, adminGuard],
  },
  {
    path: 'admin/contractors',
    component: ManageContractorsComponent,
    canActivate: [authGuard, adminGuard],
  },
  {
    path: 'admin/manage-coupons',
    component: ManageCouponsComponent,
    canActivate: [authGuard, adminGuard],
  },
  {
    path: 'admin/history',
    component: HistoryComponent,
    canActivate: [authGuard, adminGuard],
  },
  {
    path: 'admin/history/employee/:id',
    component: EmployeeHistoryComponent,
    canActivate: [authGuard, adminGuard],
  },
  {
    path: 'admin/settings',
    component: SettingsComponent,
    canActivate: [authGuard, adminGuard],
  },

  // ===== EMPLOYEE AREA =====
  {
    path: 'employee',
    component: EmployeeDashboardComponent,
    canActivate: [authGuard],
  },
  {
    path: 'contractual-employee',
    redirectTo: '/employee',
    pathMatch: 'full',
  },

  // ===== CANTEEN MANAGER AREA =====
  {
    path: 'canteen-manager',
    component: CanteenManagerDashboardComponent,
    canActivate: [authGuard],
  },
  {
    path: 'canteen-manager/redeem',
    component: RedeemCouponComponent,
    canActivate: [authGuard],
  },
  {
    path: 'canteen-manager/menu',
    component: MenuManagementComponent,
    canActivate: [authGuard],
  },

  // ===== CONTRACTOR AREA =====
  {
    path: 'contractor',
    component: ContractorDashboardComponent,
    canActivate: [authGuard, contractorGuard],
  },

  // ===== COMMON =====
  {
    path: 'change-password',
    component: ChangePasswordComponent,
    canActivate: [authGuard],
  },

  // ===== DEFAULT / FALLBACK =====
  { path: '', redirectTo: '/login', pathMatch: 'full' },
  { path: '**', redirectTo: '/login' },
];
