import {
  Component,
  ChangeDetectionStrategy,
  inject,
  signal,
  computed,
  ElementRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import {
  ReactiveFormsModule,
  Validators,
  FormGroup,
  FormControl,
} from '@angular/forms';
import { DataService } from '../../services/data.service';
import { Coupon } from '../../models/coupon.model';
import { Employee } from '../../models/user.model';
import { AuthService } from '../../services/auth.service';
import { Contractor } from '../../models/contractor.model';
import { GuestCouponRequest } from '../../models/guest-coupon-request.model';

// Declare jsPDF global to use the library from the script tag
declare var jspdf: any;

type UiGuestRequest = GuestCouponRequest & {
  employeeName: string;
};

@Component({
  selector: 'app-manage-coupons',
  templateUrl: './manage-coupons.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterLink, ReactiveFormsModule],
  host: {
    '(document:click)': 'onDocumentClick($event)',
  },
})
export class ManageCouponsComponent {
  private dataService = inject(DataService);
  private authService = inject(AuthService);
  private elementRef = inject(ElementRef);

  activeTab = signal<'employees' | 'contractors' | 'guest'>('employees');
  couponTypes: Coupon['couponType'][] = [
    'Breakfast',
    'Lunch/Dinner',
    'Snacks',
    'Beverage',
  ];

  isSuperAdmin = computed(() => {
    const user = this.authService.currentUser();
    return user && 'employeeId' in user && user.employeeId === 'admin01';
  });

  // --- Employee Tab State & Logic ---
  employees = computed(() =>
    this.dataService
      .employees()
      .filter((e) => e.role === 'employee' && e.status === 'active')
  );
  isGenerateCouponsModalOpen = signal(false);
  selectedEmployee = signal<Employee | null>(null);
  generateCouponError = signal<string | null>(null);
  isManageEmployeeCouponsModalOpen = signal(false);
  selectedEmployeeForCouponMgmt = signal<Employee | null>(null);
  isRemoveLastBatchModalOpen = signal(false);

  searchTerm = signal('');
  sortConfig = signal<{ key: keyof Employee; direction: 'asc' | 'desc' }>({
    key: 'name',
    direction: 'asc',
  });

  generateCouponsForm = new FormGroup({
    couponType: new FormControl<Coupon['couponType'] | null>(null, [
      Validators.required,
    ]),
  });

  // --- Contractor Tab State & Logic ---
  contractors = this.dataService.contractors;
  isGenerateContractorCouponsModalOpen = signal(false);
  selectedContractor = signal<Contractor | null>(null);
  generateContractorCouponError = signal<string | null>(null);

  generateContractorCouponsForm = new FormGroup({
    couponType: new FormControl<Coupon['couponType'] | null>(null, [
      Validators.required,
    ]),
    quantity: new FormControl(1, [
      Validators.required,
      Validators.min(1),
      Validators.max(500),
    ]),
  });

  // --- Guest Requests Tab State ---
  guestSearchTerm = signal('');

  // --- Shared State ---
  isExportMenuOpen = signal(false);
  statusMessage = signal<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

  employeesMap = computed(() => {
    const map = new Map<number, Employee>();
    this.dataService.employees().forEach((emp) => map.set(emp.id, emp));
    return map;
  });

  // --- Computed Values for Employees Tab ---
  filteredAndSortedEmployees = computed(() => {
    const term = this.searchTerm().toLowerCase();
    const { key, direction } = this.sortConfig();

    let filtered = this.employees().filter((employee) =>
      [
        employee.name,
        employee.email,
        employee.employeeId,
        employee.department,
      ]
        .filter(Boolean)
        .some((field) => field!.toLowerCase().includes(term))
    );

    return filtered.sort((a, b) => {
      const valA = (a[key] || '') as any;
      const valB = (b[key] || '') as any;
      if (valA < valB) return direction === 'asc' ? -1 : 1;
      if (valA > valB) return direction === 'asc' ? 1 : -1;
      return 0;
    });
  });

  employeeCouponStats = computed(() => {
    type CouponTypeStats = { issued: number; redeemed: number };
    type EmployeeCouponStats = {
      totalIssued: number;
      totalRedeemed: number;
      breakdown: Partial<Record<Coupon['couponType'], CouponTypeStats>>;
    };
    const statsMap = new Map<number, EmployeeCouponStats>();
    const allCoupons = this.dataService.coupons();
    for (const employee of this.employees()) {
      statsMap.set(employee.id, {
        totalIssued: 0,
        totalRedeemed: 0,
        breakdown: {},
      });
    }
    for (const coupon of allCoupons) {
      if (coupon.employeeId && statsMap.has(coupon.employeeId)) {
        const stats = statsMap.get(coupon.employeeId)!;
        stats.totalIssued += 1;
        if (coupon.status === 'redeemed') {
          stats.totalRedeemed += 1;
        }
        if (!stats.breakdown[coupon.couponType]) {
          stats.breakdown[coupon.couponType] = { issued: 0, redeemed: 0 };
        }
        const typeStats = stats.breakdown[coupon.couponType]!;
        typeStats.issued += 1;
        if (coupon.status === 'redeemed') {
          typeStats.redeemed += 1;
        }
      }
    }
    return statsMap;
  });

  employeeDateStats = computed(() => {
    const statsMap = new Map<
      number,
      { lastIssued: string | null; lastRedeemed: string | null }
    >();
    const allCoupons = this.dataService.coupons();
    for (const employee of this.employees()) {
      statsMap.set(employee.id, { lastIssued: null, lastRedeemed: null });
    }
    for (const coupon of allCoupons) {
      if (coupon.employeeId && statsMap.has(coupon.employeeId)) {
        const currentStats = statsMap.get(coupon.employeeId)!;
        if (
          !currentStats.lastIssued ||
          new Date(coupon.dateIssued) > new Date(currentStats.lastIssued)
        ) {
          currentStats.lastIssued = coupon.dateIssued;
        }
        if (coupon.status === 'redeemed' && coupon.redeemDate) {
          if (
            !currentStats.lastRedeemed ||
            new Date(coupon.redeemDate) > new Date(currentStats.lastRedeemed)
          ) {
            currentStats.lastRedeemed = coupon.redeemDate;
          }
        }
      }
    }
    return statsMap;
  });

  employeeUnredeemedCoupons = computed(() => {
    const employee = this.selectedEmployeeForCouponMgmt();
    if (!employee) return [];
    const allCoupons = this.dataService.coupons();
    return allCoupons
      .filter((c) => c.employeeId === employee.id && c.status === 'issued')
      .sort(
        (a, b) =>
          new Date(a.dateIssued).getTime() - new Date(b.dateIssued).getTime()
      );
  });

  lastBatchInfo = computed(() => {
    const coupons = this.employeeUnredeemedCoupons();
    if (coupons.length === 0) return null;

    let mostRecentDate = '';
    coupons.forEach((coupon) => {
      if (coupon.dateIssued > mostRecentDate) {
        mostRecentDate = coupon.dateIssued;
      }
    });

    const lastBatchCoupons = coupons.filter(
      (c) => c.dateIssued === mostRecentDate
    );
    if (lastBatchCoupons.length === 0) return null;

    return {
      count: lastBatchCoupons.length,
      dateIssued: mostRecentDate,
      couponType: lastBatchCoupons[0].couponType,
    };
  });

  // --- Computed Values for Contractors Tab ---
  contractorCouponStats = computed(() => {
    const statsMap = new Map<
      number,
      { breakdown: Partial<Record<Coupon['couponType'], number>> }
    >();
    const allCoupons = this.dataService.coupons();
    for (const contractor of this.contractors()) {
      statsMap.set(contractor.id, { breakdown: {} });
    }
    for (const coupon of allCoupons) {
      if (
        coupon.contractorId &&
        !coupon.employeeId &&
        statsMap.has(coupon.contractorId)
      ) {
        const stats = statsMap.get(coupon.contractorId)!;
        if (!stats.breakdown[coupon.couponType]) {
          stats.breakdown[coupon.couponType] = 0;
        }
        stats.breakdown[coupon.couponType]! += 1;
      }
    }
    return statsMap;
  });

  // --- Guest Pass Requests (NEW) ---

  /** Raw guest requests from DataService (assumes DataService exposes guestCouponRequests signal) */
  private guestRequestsRaw = computed(() => this.dataService.guestCouponRequests?.() ?? []);

  /** Decorated + filtered pending requests for UI */
  pendingGuestRequests = computed<UiGuestRequest[]>(() => {
    const term = this.guestSearchTerm().toLowerCase();
    const empMap = this.employeesMap();
    const all = this.guestRequestsRaw()
      .filter((r) => r.status === 'pending')
      .sort(
        (a, b) =>
          new Date(b.requestDate).getTime() - new Date(a.requestDate).getTime()
      );

    return all
      .map((r) => {
        const emp = empMap.get(r.employeeId);
        return {
          ...r,
          employeeName: emp?.name || 'Unknown',
        };
      })
      .filter((r) => {
        if (!term) return true;
        return (
          r.employeeName.toLowerCase().includes(term) ||
          String(r.employeeId).toLowerCase().includes(term) ||
          r.guestName.toLowerCase().includes(term) ||
          r.guestCompany.toLowerCase().includes(term) ||
          r.couponType.toLowerCase().includes(term)
        );
      });
  });

  /** Decorated + filtered processed requests for UI */
  processedGuestRequests = computed<UiGuestRequest[]>(() => {
    const term = this.guestSearchTerm().toLowerCase();
    const empMap = this.employeesMap();
    const all = this.guestRequestsRaw()
      .filter((r) => r.status !== 'pending')
      .sort(
        (a, b) =>
          new Date(b.requestDate).getTime() - new Date(a.requestDate).getTime()
      );

    return all
      .map((r) => {
        const emp = empMap.get(r.employeeId);
        return {
          ...r,
          employeeName: emp?.name || 'Unknown',
        };
      })
      .filter((r) => {
        if (!term) return true;
        return (
          r.employeeName.toLowerCase().includes(term) ||
          String(r.employeeId).toLowerCase().includes(term) ||
          r.guestName.toLowerCase().includes(term) ||
          r.guestCompany.toLowerCase().includes(term) ||
          r.couponType.toLowerCase().includes(term) ||
          r.status.toLowerCase().includes(term)
        );
      });
  });

  // --- Event Handlers & Methods ---
  onDocumentClick(event: MouseEvent) {
    const exportMenu =
      this.elementRef.nativeElement.querySelector('.export-menu-container');
    if (
      this.isExportMenuOpen() &&
      exportMenu &&
      !exportMenu.contains(event.target as Node)
    ) {
      this.isExportMenuOpen.set(false);
    }
  }

  openGenerateCouponsModal(employee: Employee) {
    this.selectedEmployee.set(employee);
    this.isGenerateCouponsModalOpen.set(true);
    this.generateCouponsForm.reset({ couponType: null });
    this.generateCouponError.set(null);
  }

  openManageEmployeeCouponsModal(employee: Employee) {
    this.selectedEmployeeForCouponMgmt.set(employee);
    this.isManageEmployeeCouponsModalOpen.set(true);
  }

  openGenerateContractorCouponsModal(contractor: Contractor) {
    this.selectedContractor.set(contractor);
    this.isGenerateContractorCouponsModalOpen.set(true);
    this.generateContractorCouponsForm.reset({
      couponType: null,
      quantity: 1,
    });
    this.generateContractorCouponError.set(null);
  }

  openRemoveLastBatchModal() {
    this.isRemoveLastBatchModalOpen.set(true);
  }

  closeModals() {
    this.isGenerateCouponsModalOpen.set(false);
    this.selectedEmployee.set(null);
    this.generateCouponError.set(null);

    this.isGenerateContractorCouponsModalOpen.set(false);
    this.selectedContractor.set(null);
    this.generateContractorCouponError.set(null);

    this.isManageEmployeeCouponsModalOpen.set(false);
    this.selectedEmployeeForCouponMgmt.set(null);

    this.isRemoveLastBatchModalOpen.set(false);
  }

  handleGenerateCoupons() {
    this.generateCouponError.set(null);
    if (this.generateCouponsForm.valid && this.selectedEmployee()) {
      const { couponType } = this.generateCouponsForm.value;
      const result = this.dataService.generateCouponsForEmployee(
        this.selectedEmployee()!.id,
        couponType!
      );
      if (result.success) {
        this.statusMessage.set({ type: 'success', text: result.message });
        this.closeModals();
        setTimeout(() => this.statusMessage.set(null), 5000);
      } else {
        this.generateCouponError.set(result.message);
      }
    }
  }

  handleGenerateContractorCoupons() {
    this.generateContractorCouponError.set(null);
    if (this.generateContractorCouponsForm.valid && this.selectedContractor()) {
      const { couponType, quantity } = this.generateContractorCouponsForm.value;
      const result = this.dataService.generateCouponsForContractor(
        this.selectedContractor()!.id,
        couponType!,
        quantity!
      );
      if (result.success) {
        this.statusMessage.set({ type: 'success', text: result.message });
        this.closeModals();
        setTimeout(() => this.statusMessage.set(null), 5000);
      } else {
        this.generateContractorCouponError.set(result.message);
      }
    }
  }

  handleRemoveCoupon(couponId: string) {
    if (
      confirm(
        'Are you sure you want to permanently remove this coupon? This action cannot be undone.'
      )
    ) {
      const result = this.dataService.removeCoupon(couponId);
      if (result.success) {
        this.statusMessage.set({ type: 'success', text: result.message });
      } else {
        this.statusMessage.set({ type: 'error', text: result.message });
      }
      setTimeout(() => this.statusMessage.set(null), 5000);
    }
  }

  handleRemoveLastBatch() {
    const employee = this.selectedEmployeeForCouponMgmt();
    if (!employee) return;

    const result = this.dataService.removeLastCouponBatch(employee.id);
    this.isRemoveLastBatchModalOpen.set(false);

    if (result.success) {
      this.statusMessage.set({ type: 'success', text: result.message });
      if (this.employeeUnredeemedCoupons().length === 0) {
        this.isManageEmployeeCouponsModalOpen.set(false);
        this.selectedEmployeeForCouponMgmt.set(null);
      }
    } else {
      this.statusMessage.set({ type: 'error', text: result.message });
    }

    setTimeout(() => this.statusMessage.set(null), 7000);
  }

  updateSearch(event: Event) {
    this.searchTerm.set((event.target as HTMLInputElement).value);
  }

  updateGuestSearch(event: Event) {
    this.guestSearchTerm.set((event.target as HTMLInputElement).value);
  }

  setSort(key: keyof Employee) {
    if (this.sortConfig().key === key) {
      this.sortConfig.update((config) => ({
        ...config,
        direction: config.direction === 'asc' ? 'desc' : 'asc',
      }));
    } else {
      this.sortConfig.set({ key, direction: 'asc' });
    }
  }

  toggleExportMenu() {
    this.isExportMenuOpen.update((v) => !v);
  }

  private downloadFile(data: string, filename: string, type: string) {
    const blob = new Blob([data], { type });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  }

  formatDateTime(isoString: string | null): string {
    if (!isoString) return 'N/A';
    const date = new Date(isoString);
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}`;
  }

  getCouponTypeClass(couponType: Coupon['couponType']): string {
    switch (couponType) {
      case 'Breakfast':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300';
      case 'Lunch/Dinner':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300';
      case 'Snacks':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300';
      case 'Beverage':
        return 'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-300';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
    }
  }

  // --- Guest Request Actions ---

  handleApproveGuestRequest(request: UiGuestRequest) {
    const admin = this.authService.currentUser() as Employee | null;
    if (!admin) {
      this.statusMessage.set({
        type: 'error',
        text: 'Could not verify admin user.',
      });
      setTimeout(() => this.statusMessage.set(null), 5000);
      return;
    }

    const result = this.dataService.approveGuestCouponRequest?.(
      request.id,
      admin.id
    );

    if (!result) {
      this.statusMessage.set({
        type: 'error',
        text: 'Guest request approve API not implemented in DataService.',
      });
    } else if (result.success) {
      this.statusMessage.set({ type: 'success', text: result.message });
    } else {
      this.statusMessage.set({ type: 'error', text: result.message });
    }

    setTimeout(() => this.statusMessage.set(null), 6000);
  }

  handleRejectGuestRequest(request: UiGuestRequest) {
    const admin = this.authService.currentUser() as Employee | null;
    if (!admin) {
      this.statusMessage.set({
        type: 'error',
        text: 'Could not verify admin user.',
      });
      setTimeout(() => this.statusMessage.set(null), 5000);
      return;
    }

    const reasonRaw = window.prompt(
      'Enter rejection reason (optional):',
      'Not eligible' // default text
    );
    const reason = reasonRaw?.trim() || undefined;

    const result = this.dataService.rejectGuestCouponRequest?.(
      request.id,
      admin.id,
      reason
    );

    if (!result) {
      this.statusMessage.set({
        type: 'error',
        text: 'Guest request reject API not implemented in DataService.',
      });
    } else if (result.success) {
      this.statusMessage.set({ type: 'success', text: result.message });
    } else {
      this.statusMessage.set({ type: 'error', text: result.message });
    }

    setTimeout(() => this.statusMessage.set(null), 6000);
  }

  // --- Export helpers ---

  exportCouponsCsv() {
    const breakdownHeaders = this.couponTypes.map((t) => `${t} (I/R)`);
    const headers = [
      'Name',
      'Employee ID',
      'Department',
      'Role',
      ...breakdownHeaders,
      'Total (I/R)',
      'Last Issued On',
      'Last Redeemed On',
    ];
    const employeesToExport = this.filteredAndSortedEmployees();
    const statsMap = this.employeeCouponStats();
    const dateStatsMap = this.employeeDateStats();
    let csvContent = headers.join(',') + '\n';
    employeesToExport.forEach((emp) => {
      const stats = statsMap.get(emp.id);
      const dateStats =
        dateStatsMap.get(emp.id) || { lastIssued: null, lastRedeemed: null };
      const breakdownValues = this.couponTypes.map((type) => {
        const typeStat = stats?.breakdown[type];
        return typeStat
          ? `"${typeStat.issued}/${typeStat.redeemed}"`
          : '"0/0"';
      });
      const totalValue = stats
        ? `"${stats.totalIssued}/${stats.totalRedeemed}"`
        : '"0/0"';
      const row = [
        `"${emp.name}"`,
        emp.employeeId,
        emp.department || 'N/A',
        emp.role,
        ...breakdownValues,
        totalValue,
        this.formatDateTime(dateStats.lastIssued),
        this.formatDateTime(dateStats.lastRedeemed),
      ].join(',');
      csvContent += row + '\n';
    });
    this.downloadFile(
      csvContent,
      'hyva_pune_canteen_coupon_report.csv',
      'text/csv;charset=utf-8;'
    );
  }

  exportCouponsPdf() {
    const doc = new jspdf.jsPDF({ orientation: 'landscape' });
    const employeesToExport = this.filteredAndSortedEmployees();
    const statsMap = this.employeeCouponStats();
    const dateStatsMap = this.employeeDateStats();
    const breakdownHeaders = this.couponTypes.map((t) => `${t.substring(0, 1)} (I/R)`);
    const head = [
      ['Name', 'ID', 'Dept', ...breakdownHeaders, 'Total', 'Last Issued', 'Last Redeemed'],
    ];
    const body = employeesToExport.map((emp) => {
      const stats = statsMap.get(emp.id);
      const dateStats =
        dateStatsMap.get(emp.id) || { lastIssued: null, lastRedeemed: null };
      const breakdownValues = this.couponTypes.map((type) => {
        const typeStat = stats?.breakdown[type];
        return typeStat ? `${typeStat.issued}/${typeStat.redeemed}` : '0/0';
      });
      const totalValue = stats
        ? `${stats.totalIssued}/${stats.totalRedeemed}`
        : '0/0';
      return [
        emp.name,
        emp.employeeId,
        emp.department || 'N/A',
        ...breakdownValues,
        totalValue,
        this.formatDateTime(dateStats.lastIssued),
        this.formatDateTime(dateStats.lastRedeemed),
      ];
    });
    doc.setFontSize(18);
    doc.text('Hyva India (Pune) - Employee Coupon Report', 14, 22);
    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 29);
    jspdf.autoTable(doc, {
      startY: 35,
      head: head,
      body: body,
      theme: 'striped',
      headStyles: { fillColor: [75, 85, 99] },
      styles: { fontSize: 7, cellPadding: 1.5 },
    });
    doc.save('hyva_pune_canteen_coupon_report.pdf');
  }
}
