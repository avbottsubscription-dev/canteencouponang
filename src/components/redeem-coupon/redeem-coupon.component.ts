import {
  Component,
  ChangeDetectionStrategy,
  inject,
  signal,
  OnDestroy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  ReactiveFormsModule,
  Validators,
  FormGroup,
  FormControl,
} from '@angular/forms';
import { DataService } from '../../services/data.service';
import { RouterLink } from '@angular/router';

// Declare Html5Qrcode global
declare var Html5Qrcode: any;

type AlertType = 'redeemed' | 'not_available' | 'already_redeemed';

@Component({
  selector: 'app-redeem-coupon',
  standalone: true,
  templateUrl: './redeem-coupon.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
})
export class RedeemCouponComponent implements OnDestroy {
  private dataService = inject(DataService);
  private html5QrCode: any;

  // small status message
  redeemStatusMessage = signal<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

  // QR scanner state
  isScannerVisible = signal(false);
  scannerErrorMessage = signal<string | null>(null);

  // big alert banner
  alertVisible = signal(false);
  alertType = signal<AlertType | null>(null);
  alertMessage = signal('');

  redeemCouponForm = new FormGroup({
    code: new FormControl('', [
      Validators.required,
      Validators.minLength(4),
      Validators.maxLength(4),
      Validators.pattern('^[0-9]*$'),
    ]),
  });

  constructor() {}

  ngOnDestroy() {
    this.stopScanner();
    this.stopSpeaking();
  }

  showScanner() {
    this.isScannerVisible.set(true);
    this.scannerErrorMessage.set(null);
    setTimeout(() => this.startScanner(), 100);
  }

  hideScanner() {
    this.stopScanner();
    this.isScannerVisible.set(false);
  }

  private startScanner() {
    const readerElementId = 'qr-reader-redeem';
    if (!document.getElementById(readerElementId)) {
      this.scannerErrorMessage.set(
        'QR Reader element could not be initialized. Please refresh.'
      );
      console.error('QR Reader element not found in DOM.');
      return;
    }

    this.html5QrCode = new Html5Qrcode(readerElementId);
    const config = { fps: 10, qrbox: { width: 250, height: 250 } };

    const onScanSuccess = (decodedText: string) => {
      this.redeemCouponForm.patchValue({ code: decodedText });
      this.handleRedeemCoupon();
      this.hideScanner();
    };

    const onScanFailure = (_error: string) => {
      // ignore
    };

    this.html5QrCode
      .start({ facingMode: 'environment' }, config, onScanSuccess, onScanFailure)
      .catch((err: any) => {
        console.error('Unable to start QR scanner', err);
        this.scannerErrorMessage.set(
          'Could not start scanner. Please check camera permissions.'
        );
      });
  }

  private stopScanner() {
    if (this.html5QrCode && this.html5QrCode.isScanning) {
      this.html5QrCode
        .stop()
        .catch((err: any) => console.error('Error stopping the scanner.', err));
    }
  }

  async handleRedeemCoupon() {
    if (!this.redeemCouponForm.valid) return;

    const code = this.redeemCouponForm.value.code!;
    this.redeemStatusMessage.set(null);
    this.hideAlertManually();

    try {
      const result = await this.dataService.redeemCouponByCode(code);

      this.redeemStatusMessage.set({
        type: result.success ? 'success' : 'error',
        text: result.message,
      });

      const msg = result.message || '';
      let type: AlertType;

      if (result.success) {
        type = 'redeemed';
      } else if (
        msg.toLowerCase().includes('already been redeemed') ||
        msg.toLowerCase().includes('already redeemed')
      ) {
        type = 'already_redeemed';
      } else if (
        msg.includes('Invalid coupon code.') ||
        msg.includes('This coupon has not been assigned to an employee yet.') ||
        msg.includes('Cannot redeem coupon. Employee account is deactivated.')
      ) {
        type = 'not_available';
      } else {
        type = 'not_available';
      }

      this.showAlert(type, msg);
    } catch (err) {
      console.error('Error in redeemCouponByCode:', err);
      this.redeemStatusMessage.set({
        type: 'error',
        text: 'Something went wrong while redeeming the coupon.',
      });

      this.showAlert('not_available', 'Something went wrong while redeeming.');
    }

    this.redeemCouponForm.reset();
    setTimeout(() => this.redeemStatusMessage.set(null), 7000);
  }

  // ========== ALERT + VOICE HELPERS ==========

  private showAlert(type: AlertType, message: string) {
    this.alertType.set(type);
    this.alertMessage.set(message);
    this.alertVisible.set(true);

    this.speakForType(type);

    setTimeout(() => {
      this.alertVisible.set(false);
      this.alertType.set(null);
    }, 8000);
  }

  hideAlertManually() {
    this.alertVisible.set(false);
    this.alertType.set(null);
    this.stopSpeaking();
  }

  // 🔊 Browser Text-to-Speech
  private speakForType(type: AlertType) {
    this.stopSpeaking();

    if (!('speechSynthesis' in window)) {
      console.warn('Speech Synthesis not supported in this browser');
      return;
    }

    let text = '';

    if (type === 'redeemed') {
      text = 'Coupon redeemed successfully';
    } else if (type === 'not_available') {
      text = 'Coupon not available';
    } else if (type === 'already_redeemed') {
      text = 'Coupon already redeemed';
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-IN';      // Indian English accent
    utterance.rate = 0.95;
    utterance.pitch = 1.0;
    window.speechSynthesis.speak(utterance);
  }

  private stopSpeaking() {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }
}
