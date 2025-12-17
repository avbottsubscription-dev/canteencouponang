import {
  Component,
  ChangeDetectionStrategy,
  inject,
  signal,
  computed,
  effect,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';
import { DataService } from '../../services/data.service';
import { Coupon } from '../../models/coupon.model';
import { RouterLink } from '@angular/router';

type AlertType = 'none' | 'redeemed' | 'not_available' | 'already_redeemed';

@Component({
  selector: 'app-canteen-manager-dashboard',
  templateUrl: './canteen-manager-dashboard.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
})
export class CanteenManagerDashboardComponent {
  private dataService = inject(DataService);

  // ========= Existing state =========
  selectedDate = signal(new Date().toISOString().split('T')[0]);

  couponTypes: Coupon['couponType'][] = [
    'Breakfast',
    'Lunch/Dinner',
    'Snacks',
    'Beverage',
  ];

  employeesMap = computed(() => {
    const map = new Map<number, string>();
    for (const emp of this.dataService.employees()) {
      map.set(emp.id, emp.name);
    }
    return map;
  });

  // 🔁 live punch history (जर UI मध्ये वापरायचा असेल तर)
  punchHistory = computed(() => this.dataService.punchEventsHistory());

  private allRedeemedCoupons = computed(() => {
    return this.dataService
      .coupons()
      .filter((c) => c.status === 'redeemed' && c.redeemDate);
  });

  todaysMenu = computed(() => {
    const today = new Date();
    const todayId = `${today.getFullYear()}-${(today.getMonth() + 1)
      .toString()
      .padStart(2, '0')}-${today
      .getDate()
      .toString()
      .padStart(2, '0')}`;
    return this.dataService.getMenuForDate(todayId);
  });

  todayRedeemedBreakfast = computed(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    return this.allRedeemedCoupons().filter(
      (c) => c.couponType === 'Breakfast' && c.redeemDate!.startsWith(todayStr)
    ).length;
  });

  todayRedeemedLunchDinner = computed(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    return this.allRedeemedCoupons().filter(
      (c) =>
        c.couponType === 'Lunch/Dinner' &&
        c.redeemDate!.startsWith(todayStr)
    ).length;
  });

  monthlyRedeemedBreakfast = computed(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    return this.allRedeemedCoupons().filter((c) => {
      if (c.couponType === 'Breakfast') {
        const redeemDate = new Date(c.redeemDate!);
        return (
          redeemDate.getFullYear() === currentYear &&
          redeemDate.getMonth() === currentMonth
        );
      }
      return false;
    }).length;
  });

  monthlyRedeemedLunchDinner = computed(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    return this.allRedeemedCoupons().filter((c) => {
      if (c.couponType === 'Lunch/Dinner') {
        const redeemDate = new Date(c.redeemDate!);
        return (
          redeemDate.getFullYear() === currentYear &&
          redeemDate.getMonth() === currentMonth
        );
      }
      return false;
    }).length;
  });

  redeemedCouponsForDay = computed(() => {
    const selected = this.selectedDate();
    return this.allRedeemedCoupons().filter((c) =>
      c.redeemDate?.startsWith(selected)
    );
  });

  groupedCoupons = computed(() => {
    const groups: { [key in Coupon['couponType']]?: Coupon[] } = {};
    for (const coupon of this.redeemedCouponsForDay()) {
      if (!groups[coupon.couponType]) {
        groups[coupon.couponType] = [];
      }
      groups[coupon.couponType]!.push(coupon);
    }
    return groups;
  });

  onDateChange(event: Event) {
    this.selectedDate.set((event.target as HTMLInputElement).value);
  }

  formatTime(isoString: string | null): string {
    if (!isoString) return '';
    const date = new Date(isoString);
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  // ========= Alert + Sounds =========

  alertVisible = signal(false);
  alertType = signal<AlertType>('none');
  alertMessage = signal('');
  alertEmployeeName = signal('');

  // शेवटचा कोणता punchEvent highlight झालेला आहे
  private lastAlertedEventId = signal<string | null>(null);

  // sounds
  private audioRedeemed = new Audio('assets/sounds/redeemed.mp3');
  private audioNotAvailable = new Audio('assets/sounds/not-available.mp3');
  private audioAlreadyRedeemed = new Audio(
    'assets/sounds/already-redeemed.mp3'
  );

  constructor() {
    // 🔹 1) component load होताना आधीच Firestore मध्ये असलेला शेवटचा event
    // baseline म्हणून फक्त store करायचा, highlight नाही
    const current = this.dataService.lastPunchEvent();
    if (current) {
      this.lastAlertedEventId.set(current.id);
    }

    // 🔹 2) आता पासून येणारे *नवीन* punchEvents साठीच effect चालेल
    effect(() => {
      const ev = this.dataService.lastPunchEvent();
      if (!ev) return;

      const lastId = this.lastAlertedEventId();

      // हा event आधीच highlight केलेला / baseline असेल तर काही करू नको
      if (lastId === ev.id) {
        return;
      }

      // हा खरा नवीन punch event आहे → आता mark + highlight
      this.lastAlertedEventId.set(ev.id);

      const name =
        this.employeesMap().get(ev.employeeId) ??
        (ev.employeeId ? `Emp #${ev.employeeId}` : 'this employee');

      if (ev.resultType === 'redeemed') {
        this.showRedeemedAlert(ev.employeeId);
      } else if (ev.resultType === 'already_redeemed') {
        this.showAlreadyRedeemedAlert(ev.employeeId);
      } else if (ev.resultType === 'not_available') {
        this.showNotAvailableAlert(ev.employeeId);
      } else {
        this.showNotAvailableAlert(
          ev.employeeId,
          `Error while redeeming coupon for ${name}.`
        );
      }
    });
  }

  // Helper: employeeId → name
  getEmployeeName(employeeId: number | null | undefined): string {
    if (!employeeId) return '';
    return this.employeesMap().get(employeeId) ?? `Emp #${employeeId}`;
  }

  /** Coupon successfully redeemed */
  showRedeemedAlert(employeeId: number | null | undefined, message?: string) {
    const name = this.getEmployeeName(employeeId);
    const finalMsg =
      message ?? (name ? `Coupon redeemed for ${name}.` : 'Coupon redeemed.');
    this.showAlert('redeemed', finalMsg, name);
  }

  /** Coupon नाही / No active coupon */
  showNotAvailableAlert(
    employeeId: number | null | undefined,
    message?: string
  ) {
    const name = this.getEmployeeName(employeeId);
    const finalMsg =
      message ??
      (name
        ? `Coupon not available for ${name}.`
        : 'Coupon not available for this employee.');

    this.showAlert('not_available', finalMsg, name);
  }

  /** Coupon already redeemed झालेला */
  showAlreadyRedeemedAlert(
    employeeId: number | null | undefined,
    message?: string
  ) {
    const name = this.getEmployeeName(employeeId);
    const finalMsg =
      message ??
      (name
        ? `Coupon already redeemed for ${name} today.`
        : 'Coupon already redeemed for this employee today.');

    this.showAlert('already_redeemed', finalMsg, name);
  }

  // Main internal alert handler
  private showAlert(type: AlertType, msg: string, empName?: string) {
    this.alertType.set(type);
    this.alertMessage.set(msg);
    this.alertEmployeeName.set(empName ?? '');
    this.alertVisible.set(true);

    this.stopAllSounds();

    try {
      if (type === 'redeemed') {
        this.audioRedeemed.currentTime = 0;
        this.audioRedeemed.play();
      } else if (type === 'not_available') {
        this.audioNotAvailable.currentTime = 0;
        this.audioNotAvailable.play();
      } else if (type === 'already_redeemed') {
        this.audioAlreadyRedeemed.currentTime = 0;
        this.audioAlreadyRedeemed.play();
      }
    } catch {
      // ignore autoplay error
    }

    // ⏱ highlight किती वेळ दिसावा → इथे 3 सेकंद
    setTimeout(() => {
      this.alertVisible.set(false);
      this.alertType.set('none');
    }, 3000);
  }

  hideAlert() {
    this.alertVisible.set(false);
    this.alertType.set('none');
    this.stopAllSounds();
  }

  private stopAllSounds() {
    this.audioRedeemed.pause();
    this.audioNotAvailable.pause();
    this.audioAlreadyRedeemed.pause();
  }
}
