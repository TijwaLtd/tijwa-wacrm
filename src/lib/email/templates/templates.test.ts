import { describe, it, expect } from 'vitest';
import welcome from './welcome';
import planChange from './plan-change';
import paymentFailed from './payment-failed';
import invitation from './invitation';
import aiCreditsLow from './ai-credits-low';

describe('email templates', () => {
  const data = {
    name: 'Sarah',
    workspaceName: 'Acme Corp',
    plan: 'pro',
    oldPlan: 'starter',
    action: 'upgraded',
    reason: 'Card declined',
    inviterName: 'John',
    inviteUrl: 'https://crm.example.com/invite/abc123',
    creditsLeft: '12',
  };

  it('welcome template renders', () => {
    const { html, text } = welcome.render(data);
    expect(html).toContain('Welcome to Tijwa');
    expect(html).toContain('Sarah');
    expect(html).toContain('Acme Corp');
    expect(html).toContain('Go to Dashboard');
    expect(text).toContain('Welcome to Tijwa');
  });

  it('plan-change template renders', () => {
    const { html } = planChange.render(data);
    expect(html).toContain('Plan updated');
    expect(html).toContain('upgraded');
    expect(html).toContain('Pro');
    expect(html).toContain('Starter');
  });

  it('payment-failed template renders', () => {
    const { html } = paymentFailed.render(data);
    expect(html).toContain('Payment failed');
    expect(html).toContain('Card declined');
    expect(html).toContain('Update Payment Method');
  });

  it('invitation template renders', () => {
    const { html } = invitation.render(data);
    expect(html).toContain("You're invited");
    expect(html).toContain('John');
    expect(html).toContain('Acme Corp');
    expect(html).toContain('Accept Invitation');
    expect(html).toContain('https://crm.example.com/invite/abc123');
  });

  it('ai-credits-low template renders', () => {
    const { html } = aiCreditsLow.render(data);
    expect(html).toContain('AI credits running low');
    expect(html).toContain('12');
    expect(html).toContain('Upgrade Plan');
  });

  it('all templates are responsive (max-width media query)', () => {
    const templates = [welcome, planChange, paymentFailed, invitation, aiCreditsLow];
    for (const tmpl of templates) {
      const { html } = tmpl.render(data);
      expect(html).toContain('max-width:640px');
      expect(html).toContain('viewport');
    }
  });

  it('all templates include unsubscribe/notification settings link', () => {
    const templates = [welcome, planChange, paymentFailed, invitation, aiCreditsLow];
    for (const tmpl of templates) {
      const { html } = tmpl.render(data);
      expect(html).toContain('Notification settings');
    }
  });
});
