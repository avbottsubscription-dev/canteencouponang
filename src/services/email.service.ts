import { Injectable, signal } from '@angular/core';
import { Employee } from '../models/user.model';
import { Coupon } from '../models/coupon.model';

interface SmtpSettings {
    isEnabled: boolean;
    fromAddress: string;
    replyToAddress: string;
    smtpHost: string;
    smtpPort: number;
    smtpUser: string;
    smtpPassword?: string;
    smtpEncryption: 'none' | 'ssl_tls';
}

@Injectable({
  providedIn: 'root'
})
export class EmailService {
  
  settings = signal<SmtpSettings>({
    isEnabled: true,
    fromAddress: 'noreply@hyva-pune-canteen.com',
    replyToAddress: 'canteen-support@hyva.com',
    smtpHost: 'smtp.example.com',
    smtpPort: 587,
    smtpUser: 'user@example.com',
    smtpPassword: '',
    smtpEncryption: 'ssl_tls'
  });

  updateSettings(newSettings: Partial<SmtpSettings>) {
    this.settings.update(current => ({ ...current, ...newSettings }));
    console.log('Email settings updated:', this.settings());
  }

  private logEmail(email: { to: string; from: string; subject: string; body: string; }) {
    const settings = this.settings();
    console.log('--- SIMULATING EMAIL ---');
    console.log(`Connecting to SMTP server: ${settings.smtpHost}:${settings.smtpPort}`);
    console.log(`Authenticating with user: ${settings.smtpUser}`);
    console.log('----------------------');
    console.log(`To: ${email.to}`);
    console.log(`From: ${email.from}`);
    console.log(`Subject: ${email.subject}`);
    console.log('Body:', email.body.trim().replace(/^ +/gm, ''));
    console.log('--- EMAIL SENT (SIMULATED) ---');
  }
  
  sendCouponNotification(employee: Employee, count: number, couponType: Coupon['couponType']) {
    if (!this.settings().isEnabled || !employee.email) {
      return;
    }

    const email = {
      to: employee.email,
      from: this.settings().fromAddress,
      replyTo: this.settings().replyToAddress,
      subject: `New Canteen Coupons Issued`,
      body: `
        Dear ${employee.name},

        This is to inform you that ${count} new coupon(s) of type "${couponType}" have been issued to your account.
        
        You can view and redeem your coupons by logging into the Hyva India (Pune) Canteen Management portal.

        Thank you,
        Canteen Administration
      `
    };

    this.logEmail(email);
  }

  sendTestEmail(recipient: string): string {
    if (!this.settings().isEnabled) {
      const message = 'Email notifications are currently disabled.';
      console.warn(message);
      return message;
    }

    const email = {
      to: recipient,
      from: this.settings().fromAddress,
      replyTo: this.settings().replyToAddress,
      subject: `Test Email from Hyva Canteen Management`,
      body: `
        This is a test email to verify your SMTP settings.
        
        If you have received this, your configuration is working correctly.

        Current Settings:
        - Host: ${this.settings().smtpHost}
        - Port: ${this.settings().smtpPort}
        - User: ${this.settings().smtpUser}

        Thank you,
        Canteen Administration
      `
    };

    this.logEmail(email);
    return `Simulated test email sent to ${recipient}. Check the console for details.`;
  }
}
