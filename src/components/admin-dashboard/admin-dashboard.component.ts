import { Component, ChangeDetectionStrategy, inject, signal, computed, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, Validators, FormGroup, FormControl } from '@angular/forms';
import { DataService } from '../../services/data.service';
import { AuthService } from '../../services/auth.service';
import { GeminiService } from '../../services/gemini.service';
import { Employee } from '../../models/user.model';
import { Coupon } from '../../models/coupon.model';

// Declare jsPDF global to use the library from the script tag
declare var jspdf: any;
// Declare Html5Qrcode global
declare var Html5Qrcode: any;

@Component({
  selector: 'app-admin-dashboard',
  templateUrl: './admin-dashboard.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule],
  host: {
    '(document:click)': 'onDocumentClick($event)',
  }
})
export class AdminDashboardComponent {
  private dataService = inject(DataService);
  private authService = inject(AuthService);
  private geminiService = inject(GeminiService);
  private elementRef = inject(ElementRef);
  private html5QrCode: any;
  
  // Filter out the super admin and canteen managers from the employee count
  employees = computed(() => this.dataService.employees().filter(e => e.employeeId !== 'admin01' && e.role !== 'canteen manager'));
  allEmployees = this.dataService.employees; // For AI context
  allCoupons = this.dataService.coupons; // For AI context

  lifetimeIssued = this.dataService.totalIssuedCoupons;
  lifetimeRedeemed = this.dataService.totalRedeemedCoupons;
  todaysIssued = this.dataService.todaysIssuedCoupons;
  todaysRedeemed = this.dataService.todaysRedeemedCoupons;

  isScannerModalOpen = signal(false);
  redeemStatusMessage = signal<{ type: 'success' | 'error', text: string } | null>(null);

  redeemCouponForm = new FormGroup({
    code: new FormControl('', [Validators.required, Validators.minLength(4), Validators.maxLength(4), Validators.pattern('^[0-9]*$')])
  });

  // --- AI Analytics State ---
  aiQueryForm = new FormGroup({
    query: new FormControl('', [Validators.required])
  });
  aiInsight = signal<string | null>(null);
  isAiLoading = signal(false);
  aiError = signal<string | null>(null);

  onDocumentClick(event: MouseEvent) {
    // This can be used for closing dropdowns if any are added in the future.
  }

  openScannerModal() {
    this.isScannerModalOpen.set(true);
    // Use timeout to ensure the DOM element for the scanner is rendered
    setTimeout(() => this.startScanner(), 100);
  }

  closeScannerModal() {
    this.isScannerModalOpen.set(false);
    if (this.html5QrCode && this.html5QrCode.isScanning) {
      this.html5QrCode.stop().catch((err: any) => console.error("Error stopping the scanner.", err));
    }
  }

  private startScanner() {
    if (!document.getElementById('qr-reader')) {
      console.error('QR Reader element not found in DOM.');
      return;
    }

    this.html5QrCode = new Html5Qrcode('qr-reader');
    const config = { fps: 10, qrbox: { width: 250, height: 250 } };

    const onScanSuccess = (decodedText: string) => {
      this.redeemCouponForm.patchValue({ code: decodedText });
      this.handleRedeemCoupon();
      this.closeScannerModal();
    };

    const onScanFailure = (error: string) => {
      // This callback is called frequently, so keep it minimal.
      // console.warn(`QR scan error: ${error}`);
    };

    this.html5QrCode.start({ facingMode: "environment" }, config, onScanSuccess, onScanFailure)
      .catch((err: any) => console.error('Unable to start QR scanner', err));
  }
  
  async handleRedeemCoupon() {
    if (this.redeemCouponForm.valid) {
      const code = this.redeemCouponForm.value.code!;
  
      const result = await this.dataService.redeemCouponByCode(code);
  
      if (result.success) {
        this.redeemStatusMessage.set({ type: 'success', text: result.message });
      } else {
        this.redeemStatusMessage.set({ type: 'error', text: result.message });
      }
  
      this.redeemCouponForm.reset();
  
      setTimeout(() => this.redeemStatusMessage.set(null), 3000);
    }
  }  

  async handleGetAiInsights() {
    if (this.aiQueryForm.invalid) return;

    this.isAiLoading.set(true);
    this.aiInsight.set(null);
    this.aiError.set(null);

    const question = this.aiQueryForm.value.query!;
    
    try {
      const result = await this.geminiService.generateInsights(question, this.allEmployees(), this.allCoupons());
      this.aiInsight.set(result);
    } catch (error: any) {
      this.aiError.set(error.message || 'An unexpected error occurred.');
    } finally {
      this.isAiLoading.set(false);
    }
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

  exportSummaryCsv() {
    const headers = ['Metric', 'Value'];
    const rows = [
        ['Total Employees', this.employees().length],
        ['Today\'s Coupons Issued', this.todaysIssued()],
        ['Today\'s Coupons Redeemed', this.todaysRedeemed()],
        ['Lifetime Coupons Issued', this.lifetimeIssued()],
        ['Lifetime Coupons Redeemed', this.lifetimeRedeemed()]
    ];
    let csvContent = headers.join(',') + '\n';
    rows.forEach(row => {
        csvContent += row.join(',') + '\n';
    });
    this.downloadFile(csvContent, 'hyva_pune_canteen_summary_report.csv', 'text/csv;charset=utf-8;');
  }
}