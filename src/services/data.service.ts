import { Injectable, signal, computed, inject } from '@angular/core';
import { Employee } from '../models/user.model';
import { Coupon } from '../models/coupon.model';
import { AppNotification } from '../models/notification.model';
import { EmailService } from './email.service';
import { Contractor } from '../models/contractor.model';
import { DailyMenu } from '../models/menu.model';
import { GuestCouponRequest } from '../models/guest-coupon-request.model';
import { onSnapshot, orderBy, limit } from 'firebase/firestore';

import {
  Firestore,
  doc,
  setDoc,
  collection,
  getDocs,
  deleteDoc,
  query,
  where,
} from '@angular/fire/firestore';

// 🔁 Device bridge → Firestore मधून येणाऱ्या punchEvents साठी type
export interface PunchEvent {
  id: string;
  employeeId: number;
  resultType: 'redeemed' | 'already_redeemed' | 'not_available' | 'error';
  message: string;
  createdAt: string; // ISO string
}

@Injectable({
  providedIn: 'root',
})
export class DataService {
  // Local state (signals)
  private _employees = signal<Employee[]>([]);
  private _coupons = signal<Coupon[]>([]);
  private _notifications = signal<AppNotification[]>([]);
  private _contractors = signal<Contractor[]>([]);
  private _menus = signal<DailyMenu[]>([]);
  private _guestCouponRequests = signal<GuestCouponRequest[]>([]);

  // 🔁 Device punchEvents साठी latest event
  private _lastPunchEvent = signal<PunchEvent | null>(null);
  // 🔁 Punch history (recent events list)
  private _punchEventsHistory = signal<PunchEvent[]>([]);

  // Dependencies
  private emailService = inject(EmailService);
  private firestore = inject(Firestore);

  // Firestore collections
  private readonly employeesCol = collection(this.firestore, 'employees');
  private readonly couponsCol = collection(this.firestore, 'coupons');
  private readonly contractorsCol = collection(this.firestore, 'contractors');
  private readonly menusCol = collection(this.firestore, 'menus');
  private readonly notificationsCol = collection(this.firestore, 'notifications');
  private readonly guestCouponRequestsCol = collection(
    this.firestore,
    'guestCouponRequests'
  );
  // 🔁 New: punchEvents collection
  private readonly punchEventsCol = collection(this.firestore, 'punchEvents');

  // Public readonly signals
  employees = this._employees.asReadonly();
  coupons = this._coupons.asReadonly();
  notifications = this._notifications.asReadonly();
  contractors = this._contractors.asReadonly();
  menus = this._menus.asReadonly();
  guestCouponRequests = this._guestCouponRequests.asReadonly();

  // 🔁 Latest device punch event (Canteen Manager dashboard वापरेल)
  lastPunchEvent = this._lastPunchEvent.asReadonly();
   // 🔁 Full recent punch history
   punchEventsHistory = this._punchEventsHistory.asReadonly();

  contractorBusinessNames = computed(() =>
    this._contractors()
      .map((c) => c.businessName)
      .sort()
  );

  // Computed totals
  totalIssuedCoupons = computed(() => this._coupons().length);
  totalRedeemedCoupons = computed(
    () => this._coupons().filter((c) => c.status === 'redeemed').length
  );

  todaysIssuedCoupons = computed(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    return this._coupons().filter((c) => c.dateIssued.startsWith(todayStr))
      .length;
  });

  todaysRedeemedCoupons = computed(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    return this._coupons().filter(
      (c) => c.status === 'redeemed' && c.redeemDate?.startsWith(todayStr)
    ).length;
  });

  constructor() {
    // App सुरू झाल्यावर Firestore मधून data load कर
    this.loadFromFirestore();

    // 👉 Coupons साठी real-time listener
    this.setupRealtimeCouponsListener();

    // 👉 Device कडून येणार्‍या punchEvents साठी real-time listener
    this.setupRealtimePunchEventsListener();
  }

  // =========================
  // 🔧 Helper: remove undefined
  // =========================

  private removeUndefined(obj: any): any {
    if (Array.isArray(obj)) {
      return obj.map((item) => this.removeUndefined(item));
    }
    if (obj !== null && typeof obj === 'object') {
      const cleaned: any = {};
      for (const key of Object.keys(obj)) {
        const value = obj[key];
        if (value === undefined) continue;
        cleaned[key] = this.removeUndefined(value);
      }
      return cleaned;
    }
    return obj;
  }

  // =========================
  // 🔥 Firestore helpers
  // =========================

  private async loadFromFirestore() {
    try {
      // Browser offline असेल तर Firestore ला callच करू नको
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        console.warn(
          'Firestore: browser offline आहे, local seed data वापरत आहे'
        );
        this.seedData();
        return;
      }

      // सगळ्या collections एकत्र fetch
      const [
        empSnap,
        couponSnap,
        contractorSnap,
        menuSnap,
        notificationSnap,
        guestReqSnap,
      ] = await Promise.all([
        getDocs(this.employeesCol),
        getDocs(this.couponsCol),
        getDocs(this.contractorsCol),
        getDocs(this.menusCol),
        getDocs(this.notificationsCol),
        getDocs(this.guestCouponRequestsCol),
      ]);

      const employees: Employee[] = empSnap.docs.map(
        (d) => d.data() as Employee
      );

      // ⚠️ Coupons मध्ये काही fields Timestamp असू शकतात (device bridge मुळे)
      const coupons: Coupon[] = couponSnap.docs.map((d) => {
        const data: any = d.data();
        const dateIssued =
          data.dateIssued && data.dateIssued.toDate
            ? data.dateIssued.toDate().toISOString()
            : data.dateIssued;

        const redeemDate =
          data.redeemDate && data.redeemDate.toDate
            ? data.redeemDate.toDate().toISOString()
            : data.redeemDate ?? null;

        return {
          ...data,
          dateIssued,
          redeemDate,
        } as Coupon;
      });

      const contractors: Contractor[] = contractorSnap.docs.map(
        (d) => d.data() as Contractor
      );
      const menus: DailyMenu[] = menuSnap.docs.map(
        (d) => d.data() as DailyMenu
      );
      const notifications: AppNotification[] = notificationSnap.docs.map(
        (d) => d.data() as AppNotification
      );
      const guestRequests: GuestCouponRequest[] = guestReqSnap.docs.map(
        (d) => d.data() as GuestCouponRequest
      );

      const isFirstTime =
        employees.length === 0 &&
        coupons.length === 0 &&
        contractors.length === 0 &&
        menus.length === 0 &&
        notifications.length === 0 &&
        guestRequests.length === 0;

      if (isFirstTime) {
        // First time: local seed + Firestore sync
        this.seedData();
        await Promise.all([
          this.syncAllEmployeesToFirestore(),
          this.syncAllCouponsToFirestore(),
          this.syncAllContractorsToFirestore(),
          this.syncAllMenusToFirestore(),
          this.syncAllNotificationsToFirestore(),
          this.syncAllGuestCouponRequestsToFirestore(),
        ]);
      } else {
        // Firestore मधून डेटा load
        this._employees.set(employees);
        this._coupons.set(coupons);
        this._contractors.set(contractors);
        this._menus.set(menus);
        this._notifications.set(notifications);
        this._guestCouponRequests.set(guestRequests);
      }
    } catch (err: any) {
      const msg = String(err?.message ?? '');
      const code = err?.code ?? '';

      if (code === 'unavailable' || msg.includes('offline')) {
        console.warn(
          'Firestore offline/unavailable, local seed data वापरत आहे'
        );
        this.seedData();
        return;
      }

      console.error('Error loading data from Firestore:', err);
      this.seedData();
    }
  }

  // संपूर्ण employees collection sync करणे
  private async syncAllEmployeesToFirestore() {
    try {
      const snap = await getDocs(this.employeesCol);
      const existingIds = new Set(snap.docs.map((d) => d.id));

      const employees = this._employees();
      const ops: Promise<any>[] = [];

      for (const emp of employees) {
        const id = String(emp.id);
        existingIds.delete(id);
        const ref = doc(this.employeesCol, id);
        ops.push(setDoc(ref, this.removeUndefined(emp)));
      }

      existingIds.forEach((id) => {
        const ref = doc(this.employeesCol, id);
        ops.push(deleteDoc(ref));
      });

      await Promise.all(ops);
    } catch (err) {
      console.error('Error syncing employees collection:', err);
    }
  }

  // संपूर्ण coupons collection sync करणे
  private async syncAllCouponsToFirestore() {
    try {
      const snap = await getDocs(this.couponsCol);
      const existingIds = new Set(snap.docs.map((d) => d.id));

      const coupons = this._coupons();
      const ops: Promise<any>[] = [];

      for (const c of coupons) {
        const id = c.couponId;
        existingIds.delete(id);
        const ref = doc(this.couponsCol, id);
        ops.push(setDoc(ref, this.removeUndefined(c)));
      }

      existingIds.forEach((id) => {
        const ref = doc(this.couponsCol, id);
        ops.push(deleteDoc(ref));
      });

      await Promise.all(ops);
    } catch (err) {
      console.error('Error syncing coupons collection:', err);
    }
  }

  private setupRealtimeCouponsListener() {
    // Firestore coupons collection वर real-time listener
    onSnapshot(this.couponsCol, (snapshot) => {
      const coupons: Coupon[] = snapshot.docs.map((d) => {
        const data: any = d.data();

        const dateIssued =
          data.dateIssued && data.dateIssued.toDate
            ? data.dateIssued.toDate().toISOString()
            : data.dateIssued;

        const redeemDate =
          data.redeemDate && data.redeemDate.toDate
            ? data.redeemDate.toDate().toISOString()
            : data.redeemDate ?? null;

        return {
          ...data,
          dateIssued,
          redeemDate,
        } as Coupon;
      });

      // 👉 Firestore मध्ये जे आहे तेच "सत्य" मानून local state update
      this._coupons.set(coupons);
    });
  }

    // 🔁 NEW: punchEvents वर real-time listener – device bridge साठी
    private setupRealtimePunchEventsListener() {
      // createdAt desc, latest 30 events
      const q = query(
        this.punchEventsCol,
        orderBy('createdAt', 'desc'),
        limit(30)
      );
  
      onSnapshot(q, (snapshot) => {
        if (snapshot.empty) {
          this._lastPunchEvent.set(null);
          this._punchEventsHistory.set([]);
          return;
        }
  
        const events: PunchEvent[] = snapshot.docs.map((docSnap) => {
          const data: any = docSnap.data();
  
          let createdAtIso: string;
          if (data.createdAt && data.createdAt.toDate) {
            createdAtIso = data.createdAt.toDate().toISOString();
          } else {
            createdAtIso = data.createdAt ?? new Date().toISOString();
          }
  
          return {
            id: docSnap.id,
            employeeId: Number(data.employeeId ?? 0),
            resultType: (data.resultType ?? 'error') as PunchEvent['resultType'],
            message: data.message ?? '',
            createdAt: createdAtIso,
          };
        });
  
        // संपूर्ण history (max 30) local मध्ये ठेव
        this._punchEventsHistory.set(events);
  
        // सर्वात वरचं = latest event → banner साठी
        this._lastPunchEvent.set(events[0]);
      });
    }
  
  // createdAt field मधून proper Date काढण्यासाठी helper
  private extractTimestamp(data: any): Date {
    if (data?.createdAt && typeof data.createdAt.toDate === 'function') {
      // Firestore Timestamp
      return data.createdAt.toDate();
    }
    if (typeof data?.createdAt === 'string') {
      const d = new Date(data.createdAt);
      if (!isNaN(d.getTime())) {
        return d;
      }
    }
    // काहीच नसेल तर फार जुनी date देतो
    return new Date(0);
  }

  // संपूर्ण contractors collection sync करणे
  private async syncAllContractorsToFirestore() {
    try {
      const snap = await getDocs(this.contractorsCol);
      const existingIds = new Set(snap.docs.map((d) => d.id));

      const contractors = this._contractors();
      const ops: Promise<any>[] = [];

      for (const c of contractors) {
        const id = String(c.id);
        existingIds.delete(id);
        const ref = doc(this.contractorsCol, id);
        ops.push(setDoc(ref, this.removeUndefined(c)));
      }

      existingIds.forEach((id) => {
        const ref = doc(this.contractorsCol, id);
        ops.push(deleteDoc(ref));
      });

      await Promise.all(ops);
    } catch (err) {
      console.error('Error syncing contractors collection:', err);
    }
  }

  // संपूर्ण menus collection sync करणे
  private async syncAllMenusToFirestore() {
    try {
      const snap = await getDocs(this.menusCol);
      const existingIds = new Set(snap.docs.map((d) => d.id));

      const menus = this._menus();
      const ops: Promise<any>[] = [];

      for (const m of menus) {
        const id = m.id;
        existingIds.delete(id);
        const ref = doc(this.menusCol, id);
        ops.push(setDoc(ref, this.removeUndefined(m)));
      }

      existingIds.forEach((id) => {
        const ref = doc(this.menusCol, id);
        ops.push(deleteDoc(ref));
      });

      await Promise.all(ops);
    } catch (err) {
      console.error('Error syncing menus collection:', err);
    }
  }

  // संपूर्ण notifications collection sync करणे
  private async syncAllNotificationsToFirestore() {
    try {
      const snap = await getDocs(this.notificationsCol);
      const existingIds = new Set(snap.docs.map((d) => d.id));

      const notifs = this._notifications();
      const ops: Promise<any>[] = [];

      for (const n of notifs) {
        const id = n.id!;
        existingIds.delete(id);
        const ref = doc(this.notificationsCol, id);
        ops.push(setDoc(ref, this.removeUndefined(n)));
      }

      existingIds.forEach((id) => {
        const ref = doc(this.notificationsCol, id);
        ops.push(deleteDoc(ref));
      });

      await Promise.all(ops);
    } catch (err) {
      console.error('Error syncing notifications collection:', err);
    }
  }

  // संपूर्ण guestCouponRequests collection sync करणे
  private async syncAllGuestCouponRequestsToFirestore() {
    try {
      const snap = await getDocs(this.guestCouponRequestsCol);
      const existingIds = new Set(snap.docs.map((d) => d.id));

      const reqs = this._guestCouponRequests();
      const ops: Promise<any>[] = [];

      for (const r of reqs) {
        const id = r.id!;
        existingIds.delete(id);
        const ref = doc(this.guestCouponRequestsCol, id);
        ops.push(setDoc(ref, this.removeUndefined(r)));
      }

      existingIds.forEach((id) => {
        const ref = doc(this.guestCouponRequestsCol, id);
        ops.push(deleteDoc(ref));
      });

      await Promise.all(ops);
    } catch (err) {
      console.error('Error syncing guest coupon requests collection:', err);
    }
  }

  // =========================
  // Initial seed data
  // =========================

  private seedData() {
    const initialEmployees: Employee[] = [
      {
        id: 1,
        name: 'Super Admin',
        employeeId: 'admin01',
        email: 'superadmin@canteen.com',
        password: 'superadmin',
        role: 'admin',
        department: 'System',
        status: 'active',
      },
    ];
    this._employees.set(initialEmployees);

    const initialContractors: Contractor[] = [];
    this._contractors.set(initialContractors);

    this._coupons.set([]); // Start with no coupons
    this._notifications.set([]); // Start with no notifications
    this._menus.set([]); // Start with no menus
    this._guestCouponRequests.set([]); // Start with no guest requests
  }

  // =========================
  // Utility methods
  // =========================
  // couponType वरून time-slot number ठरवणे
  // 0 = Breakfast (8–10)
  // 1 = Lunch/Dinner (11:30–14)
  private getSlotFromCouponType(couponType: Coupon['couponType']): number {
    switch (couponType) {
      case 'Breakfast': // 8–10
        return 0;
      case 'Lunch/Dinner': // 11:30–14
        return 1;
      default:
        return 0; // default Breakfast ला
    }
  }

  private generateRedemptionCode(): string {
    // Generate a 4-digit numeric code as a string
    return Math.floor(1000 + Math.random() * 9000).toString();
  }

  private createCouponsForEmployee(
    employeeId: number,
    count: number,
    couponType: Coupon['couponType']
  ): Coupon[] {
    const coupons: Coupon[] = [];
    const existingCodes = new Set(
      this._coupons()
        .filter((c) => c.status === 'issued')
        .map((c) => c.redemptionCode)
    );
    const slot = this.getSlotFromCouponType(couponType);
    for (let i = 0; i < count; i++) {
      let newCode: string;
      do {
        newCode = this.generateRedemptionCode();
      } while (existingCodes.has(newCode)); // Ensure code is unique among active coupons
      existingCodes.add(newCode);

      coupons.push({
        couponId: this.generateCouponId(),
        employeeId: employeeId,
        dateIssued: new Date().toISOString(),
        status: 'issued',
        redeemDate: null,
        redemptionCode: newCode,
        couponType: couponType,
        slot,
      });
    }
    return coupons;
  }

  private generateCouponId(): string {
    return (
      'CPN-' +
      Date.now().toString(36).slice(-4).toUpperCase() +
      Math.random().toString(36).substring(2, 6).toUpperCase()
    );
  }

  private generateGuestRequestId(): string {
    return (
      'GREQ-' +
      Date.now().toString(36).slice(-4).toUpperCase() +
      Math.random().toString(36).substring(2, 6).toUpperCase()
    );
  }

  private generateNotificationId(): string {
    return `NTF-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  }

  // =========================
  // Employee methods
  // =========================

  getEmployees(): Employee[] {
    return this._employees();
  }

  addEmployee(employeeData: Omit<Employee, 'id' | 'status'>): Employee {
    const existing = this._employees();
  
    // 1️⃣ default: जुना logic (max + 1)
    let newId =
      existing.reduce((maxId, employee) => Math.max(employee.id, maxId), 0) + 1;
  
    // 2️⃣ जर employeeId पूर्णपणे numeric असेल (उदा. "850010")
    const rawEmpCode = (employeeData.employeeId || '').toString().trim();
  
    if (/^[0-9]+$/.test(rawEmpCode)) {
      const numericFromCode = Number(rawEmpCode);
  
      // जर हा ID आधीपासून वापरलेला नसेल तर तोच वापर
      const alreadyUsed = existing.some((e) => e.id === numericFromCode);
      if (!alreadyUsed) {
        newId = numericFromCode;
      }
      // जर आधीच वापरलेला असेल तर आपोआप max+1 वापरू (conflict टाळायला)
    }
  
    const newEmployee: Employee = {
      ...employeeData,
      id: newId,
      status: 'active',
    };
  
    this._employees.update((employees) => [...employees, newEmployee]);
    this.syncAllEmployeesToFirestore();
    return newEmployee;
  }
  
    // 🔹 Canteen Manager add helper method
    addCanteenManager(
      data: Omit<Employee, 'id' | 'status' | 'role'>
    ): Employee {
      const newId =
        this._employees().reduce(
          (maxId, e) => Math.max(e.id, maxId),
          0
        ) + 1;
    
      const newManager: Employee = {
        ...data,
        id: newId,
        status: 'active',
        role: 'canteen manager',
      };
    
      // local update
      this._employees.update(list => [...list, newManager]);
    
      // 🔥 direct Firestore save
      const ref = doc(this.employeesCol, String(newManager.id));
      setDoc(ref, this.removeUndefined(newManager));
    
      return newManager;
    }
 

  updateEmployee(updatedEmployeeData: Employee): void {
    this._employees.update((employees) =>
      employees.map((emp) =>
        emp.id === updatedEmployeeData.id ? updatedEmployeeData : emp
      )
    );
    this.syncAllEmployeesToFirestore();
  }

  changePassword(employeeId: number, newPassword: string): void {
    this._employees.update((employees) =>
      employees.map((emp) =>
        emp.id === employeeId ? { ...emp, password: newPassword } : emp
      )
    );
    this.syncAllEmployeesToFirestore();
  }

  deleteEmployee(employeeId: number): void {
    // Remove employee
    this._employees.update((employees) =>
      employees.filter((emp) => emp.id !== employeeId)
    );
    // Remove associated coupons
    this._coupons.update((coupons) =>
      coupons.filter((c) => c.employeeId !== employeeId)
    );
    // Remove associated notifications
    this._notifications.update((notifications) =>
      notifications.filter((n) => n.employeeId !== employeeId)
    );

    this.syncAllEmployeesToFirestore();
    this.syncAllCouponsToFirestore();
    this.syncAllNotificationsToFirestore();
  }

  toggleEmployeeStatus(employeeId: number): void {
    this._employees.update((employees) =>
      employees.map((emp) => {
        if (emp.id === employeeId) {
          const newStatus = emp.status === 'active' ? 'deactivated' : 'active';
          return { ...emp, status: newStatus };
        }
        return emp;
      })
    );
    this.syncAllEmployeesToFirestore();
  }

  // =========================
  // Contractor methods
  // =========================

  getContractors(): Contractor[] {
    return this._contractors();
  }

  addContractor(contractorData: Omit<Contractor, 'id'>): Contractor {
    const newId =
      this._contractors().reduce(
        (maxId, contractor) => Math.max(contractor.id, maxId),
        0
      ) + 1;
    const newContractor: Contractor = {
      ...contractorData,
      id: newId,
    };
    this._contractors.update((contractors) => [...contractors, newContractor]);
    this.syncAllContractorsToFirestore();
    return newContractor;
  }

  updateContractor(updatedContractorData: Contractor): void {
    this._contractors.update((contractors) =>
      contractors.map((c) =>
        c.id === updatedContractorData.id ? updatedContractorData : c
      )
    );
    this.syncAllContractorsToFirestore();
  }

  changeContractorPassword(contractorId: number, newPassword: string): void {
    this._contractors.update((contractors) =>
      contractors.map((c) =>
        c.id === contractorId ? { ...c, password: newPassword } : c
      )
    );
    this.syncAllContractorsToFirestore();
  }

  deleteContractor(contractorId: number): void {
    const contractorToDelete = this._contractors().find(
      (c) => c.id === contractorId
    );
    if (!contractorToDelete) return;

    // Un-assign contractor from employees
    this._employees.update((employees) =>
      employees.map((emp) => {
        if (emp.contractor === contractorToDelete.businessName) {
          return { ...emp, contractor: undefined };
        }
        return emp;
      })
    );

    // Delete any coupons associated with this contractor (pool or assigned)
    this._coupons.update((coupons) =>
      coupons.filter((c) => c.contractorId !== contractorId)
    );

    // Delete contractor
    this._contractors.update((contractors) =>
      contractors.filter((c) => c.id !== contractorId)
    );

    this.syncAllEmployeesToFirestore();
    this.syncAllCouponsToFirestore();
    this.syncAllContractorsToFirestore();
  }

  // =========================
  // Coupon & Guest Pass methods
  // =========================

  getCouponsForEmployee(employeeId: number): Coupon[] {
    return this._coupons().filter((c) => c.employeeId === employeeId);
  }

  removeCoupon(couponId: string): { success: boolean; message: string } {
    const couponToRemove = this._coupons().find((c) => c.couponId === couponId);

    if (!couponToRemove) {
      return { success: false, message: 'Coupon not found.' };
    }
    if (couponToRemove.status === 'redeemed') {
      return { success: false, message: 'Cannot remove a redeemed coupon.' };
    }
    this._coupons.update((coupons) =>
      coupons.filter((c) => c.couponId !== couponId)
    );
    this.syncAllCouponsToFirestore();
    return {
      success: true,
      message: `Coupon ${couponId} removed successfully.`,
    };
  }

  generateCouponsForEmployee(
    employeeId: number,
    couponType: Coupon['couponType']
  ): { success: boolean; message: string } {
    const employee = this._employees().find((e) => e.id === employeeId);
    if (!employee) {
      return { success: false, message: 'Employee not found.' };
    }

    if (employee.role !== 'employee') {
      return {
        success: false,
        message:
          'This function is only for permanent employees. Use the Contractors tab for contractual staff.',
      };
    }

    // Determine the monthly limit based on role and coupon type
    let limit = 0;
    if (couponType === 'Lunch/Dinner') {
      if (employee.role === 'employee') limit = 24;
    } else if (couponType === 'Breakfast') {
      if (employee.role === 'employee') {
        limit = 26;
      }
    }

    if (limit === 0) {
      return {
        success: false,
        message: `No monthly limit defined for ${couponType} coupons for this employee role.`,
      };
    }

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    const monthlyCoupons = this._coupons().filter((c) => {
      if (c.employeeId === employeeId && c.couponType === couponType) {
        const issueDate = new Date(c.dateIssued);
        return (
          issueDate.getFullYear() === currentYear &&
          issueDate.getMonth() === currentMonth
        );
      }
      return false;
    });

    const hasUnredeemedCoupons = monthlyCoupons.some(
      (c) => c.status === 'issued'
    );

    // If there are any unredeemed coupons for the current month, block generation.
    if (hasUnredeemedCoupons) {
      return {
        success: false,
        message: `Employee must redeem all existing ${couponType} coupons for this month before new ones can be generated.`,
      };
    }

    // If all coupons are redeemed (or none exist for the month), generate a new full batch.
    const countToGenerate = limit;

    const newCoupons = this.createCouponsForEmployee(
      employeeId,
      countToGenerate,
      couponType
    );
    this._coupons.update((coupons) => [...coupons, ...newCoupons]);

    this.syncAllCouponsToFirestore();

    this.emailService.sendCouponNotification(
      employee,
      countToGenerate,
      couponType
    );

    const newNotification: AppNotification = {
      id: this.generateNotificationId(),
      employeeId: employeeId,
      message: `You have received ${countToGenerate} new ${couponType} coupon(s).`,
      type: 'new_coupon',
      isRead: false,
      createdAt: new Date().toISOString(),
    };
    this._notifications.update((notifications) => [
      newNotification,
      ...notifications,
    ]);
    this.syncAllNotificationsToFirestore();

    return {
      success: true,
      message: `${countToGenerate} ${couponType} coupons generated successfully for ${employee.name}.`,
    };
  }

  generateCouponsForContractor(
    contractorId: number,
    couponType: Coupon['couponType'],
    quantity: number
  ): { success: boolean; message: string } {
    const contractor = this._contractors().find((c) => c.id === contractorId);
    if (!contractor) {
      return { success: false, message: 'Contractor not found.' };
    }

    const newCoupons: Coupon[] = [];
    const existingCodes = new Set(
      this._coupons()
        .filter((c) => c.status === 'issued')
        .map((c) => c.redemptionCode)
    );
    const slot = this.getSlotFromCouponType(couponType);
    for (let i = 0; i < quantity; i++) {
      let newCode: string;
      do {
        newCode = this.generateRedemptionCode();
      } while (existingCodes.has(newCode));
      existingCodes.add(newCode);

      newCoupons.push({
        couponId: this.generateCouponId(),
        contractorId: contractorId,
        dateIssued: new Date().toISOString(),
        status: 'issued',
        redeemDate: null,
        redemptionCode: newCode,
        couponType: couponType,
        slot,
      });
    }

    this._coupons.update((coupons) => [...coupons, ...newCoupons]);
    this.syncAllCouponsToFirestore();

    return {
      success: true,
      message: `${quantity} ${couponType} coupons generated for ${contractor.businessName}.`,
    };
  }

  assignCouponsToEmployee(
    contractorId: number,
    employeeId: number,
    couponType: Coupon['couponType'],
    quantity: number
  ): { success: boolean; message: string } {
    const availableCoupons = this._coupons().filter(
      (c) =>
        c.contractorId === contractorId &&
        c.couponType === couponType &&
        c.status === 'issued' &&
        !c.employeeId
    );

    if (availableCoupons.length < quantity) {
      return {
        success: false,
        message: `Not enough available ${couponType} coupons. You have ${availableCoupons.length}, but tried to assign ${quantity}.`,
      };
    }

    const employee = this._employees().find((e) => e.id === employeeId);
    if (!employee) {
      return { success: false, message: 'Employee not found.' };
    }

    const couponsToAssign = availableCoupons.slice(0, quantity);
    const couponIdsToAssign = new Set(
      couponsToAssign.map((c) => c.couponId)
    );

    this._coupons.update((coupons) =>
      coupons.map((c) => {
        if (couponIdsToAssign.has(c.couponId)) {
          return { ...c, employeeId: employeeId };
        }
        return c;
      })
    );

    const newNotification: AppNotification = {
      id: this.generateNotificationId(),
      employeeId: employeeId,
      message: `You have received ${quantity} new ${couponType} coupon(s) from your contractor.`,
      type: 'new_coupon',
      isRead: false,
      createdAt: new Date().toISOString(),
    };
    this._notifications.update((notifications) => [
      newNotification,
      ...notifications,
    ]);

    this.syncAllCouponsToFirestore();
    this.syncAllNotificationsToFirestore();

    return {
      success: true,
      message: `${quantity} ${couponType} coupons assigned successfully to ${employee.name}.`,
    };
  }

  redeemCoupon(couponId: string) {
    this._coupons.update((coupons) =>
      coupons.map((c) =>
        c.couponId === couponId && c.status === 'issued'
          ? {
              ...c,
              status: 'redeemed',
              redeemDate: new Date().toISOString(),
            }
          : c
      )
    );
    this.syncAllCouponsToFirestore();
  }

  // ⭐ UPDATED: Firestore check + existing logic
  async redeemCouponByCode(
    code: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      // 1️⃣ Firestore मध्ये actual status check – device ने redeem केलं असेल तर इथे दिसेल
      const qFs = query(this.couponsCol, where('redemptionCode', '==', code));
      const snapFs = await getDocs(qFs);

      if (!snapFs.empty) {
        const fsData: any = snapFs.docs[0].data();
        const fsStatus = fsData.status as Coupon['status'];
        const fsCouponId = fsData.couponId as string;

        let redeemDateIso: string | null = null;
        if (fsData.redeemDate && fsData.redeemDate.toDate) {
          redeemDateIso = fsData.redeemDate.toDate().toISOString();
        } else if (fsData.redeemDate) {
          redeemDateIso = fsData.redeemDate;
        }

        if (fsStatus === 'redeemed') {
          // local state update करा
          this._coupons.update((coupons) =>
            coupons.map((c) =>
              c.couponId === fsCouponId
                ? {
                    ...c,
                    status: 'redeemed',
                    redeemDate: redeemDateIso || c.redeemDate,
                  }
                : c
            )
          );

          if (redeemDateIso) {
            const when = new Date(redeemDateIso);
            return {
              success: false,
              message: `This coupon has already been redeemed on ${when.toLocaleString()}.`,
            };
          }
          return {
            success: false,
            message: 'This coupon has already been redeemed.',
          };
        }
      }
    } catch (err) {
      console.error(
        'Firestore status check failed, falling back to local logic:',
        err
      );
      // खाली local logic तरी चालेल
    }

    // 2️⃣ Original local logic
    const couponToRedeem = this._coupons().find(
      (c) => c.redemptionCode === code && c.status === 'issued'
    );

    if (!couponToRedeem) {
      const alreadyRedeemed = this._coupons().find(
        (c) => c.redemptionCode === code && c.status === 'redeemed'
      );
      if (alreadyRedeemed) {
        return {
          success: false,
          message: 'This coupon has already been redeemed.',
        };
      }
      return { success: false, message: 'Invalid coupon code.' };
    }

    if (couponToRedeem.isGuestCoupon) {
      const sharingEmployee = this._employees().find(
        (u) => u.id === couponToRedeem.sharedByEmployeeId
      );

      const guestInfo = couponToRedeem.guestName
        ? ` for ${couponToRedeem.guestName}${
            couponToRedeem.guestCompany
              ? ` (${couponToRedeem.guestCompany})`
              : ''
          }`
        : '';

      const successMessage = `Guest coupon redeemed successfully${guestInfo} (requested by ${
        sharingEmployee?.name || 'Unknown'
      }).`;

      this._coupons.update((coupons) =>
        coupons.map((c) =>
          c.couponId === couponToRedeem.couponId
            ? {
                ...c,
                status: 'redeemed',
                redeemDate: new Date().toISOString(),
              }
            : c
        )
      );
      this.syncAllCouponsToFirestore();

      return { success: true, message: successMessage };
    }

    if (!couponToRedeem.employeeId) {
      return {
        success: false,
        message: 'This coupon has not been assigned to an employee yet.',
      };
    }

    const employee = this._employees().find(
      (u) => u.id === couponToRedeem.employeeId
    );

    if (employee && employee.status === 'deactivated') {
      return {
        success: false,
        message: 'Cannot redeem coupon. Employee account is deactivated.',
      };
    }

    // Redeem normal employee coupon
    this._coupons.update((coupons) =>
      coupons.map((c) =>
        c.couponId === couponToRedeem.couponId
          ? {
              ...c,
              status: 'redeemed',
              redeemDate: new Date().toISOString(),
            }
          : c
      )
    );
    this.syncAllCouponsToFirestore();

    return {
      success: true,
      message: `Coupon redeemed successfully for ${employee?.name}.`,
    };
  }

  removeLastCouponBatch(
    employeeId: number
  ): { success: boolean; message: string; removedCount: number } {
    const allCoupons = this._coupons();

    const employeeUnredeemedCoupons = allCoupons.filter(
      (c) => c.employeeId === employeeId && c.status === 'issued'
    );

    if (employeeUnredeemedCoupons.length === 0) {
      return {
        success: false,
        message: 'No unredeemed coupons found for this employee.',
        removedCount: 0,
      };
    }

    let mostRecentDate = '';
    employeeUnredeemedCoupons.forEach((coupon) => {
      if (coupon.dateIssued > mostRecentDate) {
        mostRecentDate = coupon.dateIssued;
      }
    });

    if (!mostRecentDate) {
      return {
        success: false,
        message: 'Could not determine the most recent coupon batch.',
        removedCount: 0,
      };
    }

    const couponsBeforeLength = allCoupons.length;

    const couponsAfter = allCoupons.filter((coupon) => {
      const isFromLastBatch =
        coupon.employeeId === employeeId &&
        coupon.status === 'issued' &&
        coupon.dateIssued === mostRecentDate;
      return !isFromLastBatch;
    });

    const removedCount = couponsBeforeLength - couponsAfter.length;

    if (removedCount > 0) {
      this._coupons.set(couponsAfter);
      this.syncAllCouponsToFirestore();
      return {
        success: true,
        message: `Successfully removed the last batch of ${removedCount} coupon(s).`,
        removedCount,
      };
    } else {
      return {
        success: false,
        message: 'No coupons were removed. An unexpected error occurred.',
        removedCount: 0,
      };
    }
  }

  // ✅ NEW FLOW:
  // Employee → Guest Pass Request (with guestName & guestCompany)
  generateGuestPassFromEmployeeCoupon(
    employeeId: number,
    employeeName: string,
    guestName: string,
    guestCompany: string,
    couponType: Coupon['couponType']
  ): { success: boolean; message: string } {
    const trimmedGuestName = guestName.trim();
    const trimmedGuestCompany = guestCompany.trim();

    if (!trimmedGuestName || !trimmedGuestCompany) {
      return {
        success: false,
        message: 'Please enter guest full name and company.',
      };
    }

    const GUEST_PASS_DAILY_LIMIT = 5;
    const todayStr = new Date().toISOString().split('T')[0];

    const todaysRequests = this._guestCouponRequests().filter(
      (r) =>
        r.employeeId === employeeId &&
        r.couponType === couponType &&
        r.requestDate.startsWith(todayStr)
    ).length;

    if (todaysRequests >= GUEST_PASS_DAILY_LIMIT) {
      return {
        success: false,
        message: `You have reached your daily limit of ${GUEST_PASS_DAILY_LIMIT} ${couponType} guest pass requests.`,
      };
    }

    const requestId = this.generateGuestRequestId();
    const newRequest: GuestCouponRequest = {
      id: requestId,
      employeeId,
      employeeName,
      guestName: trimmedGuestName,
      guestCompany: trimmedGuestCompany,
      couponType,
      status: 'pending',
      requestDate: new Date().toISOString(),
    };

    // Add to local state
    this._guestCouponRequests.update((reqs) => [newRequest, ...reqs]);

    // Notify all admins
    const admins = this._employees().filter((e) => e.role === 'admin');
    const nowIso = new Date().toISOString();

    const newNotifications: AppNotification[] = admins.map((admin) => ({
      id: this.generateNotificationId(),
      employeeId: admin.id,
      message: `${employeeName} requested a ${couponType} guest pass for ${trimmedGuestName} (${trimmedGuestCompany}).`,
      type: 'guest_pass_request',
      isRead: false,
      createdAt: nowIso,
      relatedRequestId: requestId,
      requesterEmployeeId: employeeId,
    }));

    this._notifications.update((list) => [...newNotifications, ...list]);

    // Sync to Firestore
    this.syncAllGuestCouponRequestsToFirestore();
    this.syncAllNotificationsToFirestore();

    return {
      success: true,
      message:
        'Guest pass request has been sent to admin for approval. You will be notified once it is processed.',
    };
  }

  // Admin helper: get pending & processed guest requests
  getPendingGuestCouponRequests(): GuestCouponRequest[] {
    return this._guestCouponRequests().filter((r) => r.status === 'pending');
  }

  getProcessedGuestCouponRequests(): GuestCouponRequest[] {
    return this._guestCouponRequests().filter((r) => r.status !== 'pending');
  }

  // Admin: Approve guest pass → generate actual guest coupon
  approveGuestCouponRequest(
    requestId: string,
    adminId: number
  ): { success: boolean; message: string } {
    const request = this._guestCouponRequests().find((r) => r.id === requestId);
    if (!request) {
      return { success: false, message: 'Guest pass request not found.' };
    }
    if (request.status !== 'pending') {
      return { success: false, message: 'This request is already processed.' };
    }

    // Generate unique coupon code
    const existingCodes = new Set(
      this._coupons()
        .filter((c) => c.status === 'issued')
        .map((c) => c.redemptionCode)
    );
    let newCode: string;
    do {
      newCode = this.generateRedemptionCode();
    } while (existingCodes.has(newCode));
    const slot = this.getSlotFromCouponType(request.couponType);
    const guestCoupon: Coupon = {
      couponId: this.generateCouponId(),
      dateIssued: new Date().toISOString(),
      status: 'issued',
      redeemDate: null,
      redemptionCode: newCode,
      couponType: request.couponType,
      slot,
      isGuestCoupon: true,
      sharedByEmployeeId: request.employeeId,
      guestName: request.guestName,
      guestCompany: request.guestCompany,
    };

    // Update coupons list
    this._coupons.update((coupons) => [guestCoupon, ...coupons]);

    // Update request
    this._guestCouponRequests.update((reqs) =>
      reqs.map((r) =>
        r.id === requestId
          ? {
              ...r,
              status: 'approved',
              decisionDate: new Date().toISOString(),
              adminId,
              generatedCouponId: guestCoupon.couponId,
            }
          : r
      )
    );

    // Notify requesting employee
    const approvalNotif: AppNotification = {
      id: this.generateNotificationId(),
      employeeId: request.employeeId,
      message: `Your guest pass request for ${request.guestName} (${request.guestCompany}) for ${request.couponType} has been approved. Coupon code: ${guestCoupon.redemptionCode}.`,
      type: 'system',
      isRead: false,
      createdAt: new Date().toISOString(),
      relatedRequestId: requestId,
      relatedCouponId: guestCoupon.couponId,
      requesterEmployeeId: request.employeeId,
    };

    this._notifications.update((list) => [approvalNotif, ...list]);

    this.syncAllCouponsToFirestore();
    this.syncAllGuestCouponRequestsToFirestore();
    this.syncAllNotificationsToFirestore();

    return {
      success: true,
      message: 'Guest pass request approved and guest coupon generated.',
    };
  }

  // Admin: Reject guest pass request
  rejectGuestCouponRequest(
    requestId: string,
    adminId: number,
    reason?: string
  ): { success: boolean; message: string } {
    const request = this._guestCouponRequests().find((r) => r.id === requestId);
    if (!request) {
      return { success: false, message: 'Guest pass request not found.' };
    }
    if (request.status !== 'pending') {
      return { success: false, message: 'This request is already processed.' };
    }

    this._guestCouponRequests.update((reqs) =>
      reqs.map((r) =>
        r.id === requestId
          ? {
              ...r,
              status: 'rejected',
              decisionDate: new Date().toISOString(),
              adminId,
              rejectionReason: reason,
            }
          : r
      )
    );

    const rejectionNotif: AppNotification = {
      id: this.generateNotificationId(),
      employeeId: request.employeeId,
      message:
        `Your guest pass request for ${request.guestName} (${request.guestCompany}) for ${request.couponType} was rejected.` +
        (reason ? ` Reason: ${reason}` : ''),
      type: 'system',
      isRead: false,
      createdAt: new Date().toISOString(),
      relatedRequestId: requestId,
      requesterEmployeeId: request.employeeId,
    };

    this._notifications.update((list) => [rejectionNotif, ...list]);

    this.syncAllGuestCouponRequestsToFirestore();
    this.syncAllNotificationsToFirestore();

    return {
      success: true,
      message: 'Guest pass request rejected.',
    };
  }

  // =========================
  // Notification methods
  // =========================

  markNotificationAsRead(notificationId: string) {
    this._notifications.update((notifications) =>
      notifications.map((n) =>
        n.id === notificationId ? { ...n, isRead: true } : n
      )
    );
    this.syncAllNotificationsToFirestore();
  }

  markAllNotificationsAsRead(employeeId: number) {
    this._notifications.update((notifications) =>
      notifications.map((n) =>
        n.employeeId === employeeId ? { ...n, isRead: true } : n
      )
    );
    this.syncAllNotificationsToFirestore();
  }

  // =========================
  // Menu methods
  // =========================

  getMenuForDate(dateId: string): DailyMenu | undefined {
    return this._menus().find((m) => m.id === dateId);
  }

  upsertMenu(menuData: Omit<DailyMenu, 'date'>) {
    const existingMenu = this._menus().find((m) => m.id === menuData.id);
    const date = new Date(`${menuData.id}T12:00:00Z`); // Use noon to avoid timezone issues
    if (existingMenu) {
      this._menus.update((menus) =>
        menus.map((m) =>
          m.id === menuData.id ? { ...menuData, date: date.toISOString() } : m
        )
      );
    } else {
      const newMenu: DailyMenu = {
        ...menuData,
        date: date.toISOString(),
      };
      this._menus.update((menus) => [...menus, newMenu]);
    }
    this.syncAllMenusToFirestore();
  }
}
