import { Component, ChangeDetectionStrategy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormGroup, FormControl, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { EmailService } from '../../services/email.service';

@Component({
  selector: 'app-settings',
  templateUrl: './settings.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule]
})
export class SettingsComponent {
  private emailService = inject(EmailService);
  private router = inject(Router);

  settingsForm: FormGroup;
  testEmailForm: FormGroup;
  testEmailStatus = signal<{ type: 'success' | 'error', message: string } | null>(null);

  constructor() {
    const currentSettings = this.emailService.settings();
    this.settingsForm = new FormGroup({
      isEnabled: new FormControl(currentSettings.isEnabled, [Validators.required]),
      fromAddress: new FormControl(currentSettings.fromAddress, [Validators.required, Validators.email]),
      replyToAddress: new FormControl(currentSettings.replyToAddress, [Validators.required, Validators.email]),
      smtpHost: new FormControl(currentSettings.smtpHost, [Validators.required]),
      smtpPort: new FormControl(currentSettings.smtpPort, [Validators.required, Validators.min(1)]),
      smtpUser: new FormControl(currentSettings.smtpUser, [Validators.required]),
      smtpPassword: new FormControl(currentSettings.smtpPassword, []),
      smtpEncryption: new FormControl(currentSettings.smtpEncryption, [Validators.required]),
    });

    this.testEmailForm = new FormGroup({
        recipient: new FormControl('', [Validators.required, Validators.email])
    });
  }

  saveSettings() {
    if (this.settingsForm.valid) {
      this.emailService.updateSettings(this.settingsForm.value);
      this.router.navigate(['/admin']);
    }
  }

  handleSendTestEmail() {
    if (this.testEmailForm.valid) {
        const recipient = this.testEmailForm.value.recipient!;
        const message = this.emailService.sendTestEmail(recipient);
        this.testEmailStatus.set({ type: 'success', message });
        this.testEmailForm.reset();
        setTimeout(() => this.testEmailStatus.set(null), 7000);
    }
  }

  cancel() {
    this.router.navigate(['/admin']);
  }
}
