// Email service using SendGrid integration
import sgMail from '@sendgrid/mail';

let connectionSettings: any;
const SENDGRID_REQUEST_TIMEOUT_MS = 30_000;

async function getCredentials() {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=sendgrid',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  if (!connectionSettings || (!connectionSettings.settings.api_key || !connectionSettings.settings.from_email)) {
    throw new Error('SendGrid not connected');
  }
  return { apiKey: connectionSettings.settings.api_key, fromEmail: connectionSettings.settings.from_email };
}

async function getSendGridClient() {
  const { apiKey, fromEmail } = await getCredentials();
  sgMail.setApiKey(apiKey);
  sgMail.setTimeout(SENDGRID_REQUEST_TIMEOUT_MS);
  return {
    client: sgMail,
    fromEmail
  };
}

// Notification recipients
export const NOTIFICATION_RECIPIENTS = [
  'sales@motiventmarketing.com',
  'robert@motiventmarketing.com',
  'alex@motiventmarketing.com',
] as const;

export interface EmailSendResult {
  statusCode: number;
  providerMessageId: string | null;
}

function getAdminBaseUrl(): string {
  const configuredBaseUrl = process.env.APP_BASE_URL?.trim();
  if (configuredBaseUrl) {
    return configuredBaseUrl.replace(/\/+$/, '');
  }

  const replitDomains = process.env.REPLIT_DOMAINS || process.env.REPLIT_DEV_DOMAIN || 'localhost:5000';
  const primaryDomain = replitDomains.split(',')[0].trim();
  return `https://${primaryDomain}`;
}

function normalizeSendGridError(error: any): Error {
  const providerStatus = Number(
    error?.code ?? error?.response?.statusCode ?? error?.response?.status,
  );
  const providerMessages = Array.isArray(error?.response?.body?.errors)
    ? error.response.body.errors
        .map((item: any) => String(item?.message || "").trim())
        .filter(Boolean)
        .join("; ")
    : "";
  const message = [error?.message || "SendGrid request failed", providerMessages]
    .filter(Boolean)
    .join(": ")
    .replace(/\s+/g, " ")
    .slice(0, 500);
  const normalized = new Error(message);
  if (Number.isFinite(providerStatus)) {
    (normalized as any).code = providerStatus;
  }
  return normalized;
}

function logSendGridError(context: string, error: Error) {
  console.error(`[EMAIL] ${context} failed: ${error.message}`, {
    providerStatus: (error as any).code,
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function normalizeWebsiteUrl(value: string): string {
  const trimmed = value.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

function sanitizeSubjectText(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

function getProviderMessageId(response: any): string | null {
  const value = response?.headers?.['x-message-id'];
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

export interface SoftLeadNotificationData {
  businessName: string;
  url: string | null;
  keyword: string;
  scope: 'local' | 'national';
  city: string | null;
  auditId?: number;
  notificationKey?: string;
}

export function buildSoftLeadEmail(data: SoftLeadNotificationData) {
  const businessName = escapeHtml(data.businessName);
  const keyword = escapeHtml(data.keyword);
  const scope = data.scope === 'local' ? 'Local' : 'National';
  const city = data.scope === 'local' && data.city ? escapeHtml(data.city) : null;
  const website = data.url ? escapeHtml(data.url) : null;
  const websiteUrl = data.url ? escapeHtml(normalizeWebsiteUrl(data.url)) : null;
  const auditUrl = data.auditId
    ? `${getAdminBaseUrl()}/admin/audit/${data.auditId}`
    : `${getAdminBaseUrl()}/admin`;

  const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1f2937; border-bottom: 2px solid #f59e0b; padding-bottom: 10px;">
          New AI Visibility Audit Request
        </h2>

        <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="margin-top: 0; color: #374151;">Business Details</h3>
          <p><strong>Business:</strong> ${businessName}</p>
          ${website && websiteUrl ? `<p><strong>Website:</strong> <a href="${websiteUrl}">${website}</a></p>` : ''}
          <p><strong>Main Service:</strong> ${keyword}</p>
          <p><strong>Scope:</strong> ${scope}</p>
          ${city ? `<p><strong>Target City:</strong> ${city}</p>` : ''}
        </div>

        <p style="color: #6b7280; font-size: 14px;">
          Someone just requested a free AI visibility audit. The report is being generated now.
        </p>

        <div style="margin: 30px 0; text-align: center;">
          <a href="${auditUrl}"
             style="background: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">
            ${data.auditId ? 'View Audit in Admin Portal' : 'Open Admin Portal'}
          </a>
        </div>

        <p style="color: #9ca3af; font-size: 12px; margin-top: 30px;">
          Or copy this link: <a href="${auditUrl}" style="color: #3b82f6;">${auditUrl}</a>
        </p>
      </div>
    `;

  return {
    subject: `New AI Visibility Audit Request: ${sanitizeSubjectText(data.businessName)}`,
    html,
  };
}

export async function sendSoftLeadNotification(data: SoftLeadNotificationData): Promise<EmailSendResult> {
  try {
    const { client, fromEmail } = await getSendGridClient();
    const message = buildSoftLeadEmail(data);
    const [response] = await client.send({
      to: [...NOTIFICATION_RECIPIENTS],
      from: fromEmail,
      customArgs: data.notificationKey
        ? { notification_key: data.notificationKey.slice(0, 100) }
        : undefined,
      ...message,
    });

    const providerMessageId = getProviderMessageId(response);
    console.log(`[EMAIL] Initial audit notification accepted (status ${response.statusCode}, message ${providerMessageId ?? 'unavailable'})`);
    return { statusCode: response.statusCode, providerMessageId };
  } catch (error) {
    const normalizedError = normalizeSendGridError(error);
    logSendGridError('Initial audit notification', normalizedError);
    throw normalizedError;
  }
}

export interface AuditNotificationData {
  businessName: string;
  url: string | null;
  keyword: string;
  scope: 'local' | 'national';
  city: string | null;
  overallScore: number;
  chatgptScore: number;
  googleAIScore: number;
  leadName?: string;
  leadEmail?: string;
  leadPhone?: string;
  auditId: number;
  notificationKey?: string;
}

export function buildAuditNotificationEmail(data: AuditNotificationData) {
  const scoreColor = data.overallScore >= 70 ? '#22c55e' : data.overallScore >= 40 ? '#eab308' : '#ef4444';
  const businessName = escapeHtml(data.businessName);
  const keyword = escapeHtml(data.keyword);
  const scope = data.scope === 'local' ? 'Local' : 'National';
  const city = data.scope === 'local' && data.city ? escapeHtml(data.city) : null;
  const website = data.url ? escapeHtml(data.url) : null;
  const websiteUrl = data.url ? escapeHtml(normalizeWebsiteUrl(data.url)) : null;
  const leadName = data.leadName ? escapeHtml(data.leadName) : null;
  const leadEmail = data.leadEmail ? escapeHtml(data.leadEmail) : null;
  const leadPhone = data.leadPhone ? escapeHtml(data.leadPhone) : null;
  const auditUrl = `${getAdminBaseUrl()}/admin/audit/${data.auditId}`;

  const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1f2937; border-bottom: 2px solid #3b82f6; padding-bottom: 10px;">
          Full Audit Report Unlock Request - Hot Lead
        </h2>
        
        <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="margin-top: 0; color: #374151;">Business Details</h3>
          <p><strong>Business:</strong> ${businessName}</p>
          ${website && websiteUrl ? `<p><strong>Website:</strong> <a href="${websiteUrl}">${website}</a></p>` : ''}
          <p><strong>Main Service:</strong> ${keyword}</p>
          <p><strong>Scope:</strong> ${scope}</p>
          ${city ? `<p><strong>Target City:</strong> ${city}</p>` : ''}
        </div>
        
        <div style="background: #f0f9ff; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="margin-top: 0; color: #374151;">Visibility Scores</h3>
          <p style="font-size: 24px; margin: 10px 0;">
            <strong style="color: ${scoreColor};">${data.overallScore}%</strong> Overall Score
          </p>
          <p><strong>ChatGPT:</strong> ${data.chatgptScore}%</p>
          <p><strong>Google AI:</strong> ${data.googleAIScore}%</p>
        </div>
        
        ${leadName || leadEmail ? `
        <div style="background: #fef3c7; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="margin-top: 0; color: #374151;">Lead Information</h3>
          ${leadName ? `<p><strong>Name:</strong> ${leadName}</p>` : ''}
          ${leadEmail ? `<p><strong>Email:</strong> ${leadEmail}</p>` : ''}
          ${leadPhone ? `<p><strong>Phone:</strong> ${leadPhone}</p>` : ''}
        </div>
        ` : ''}
        
        <div style="margin: 30px 0; text-align: center;">
          <a href="${auditUrl}" 
             style="background: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">
            View Audit Report
          </a>
        </div>
        
        <p style="color: #9ca3af; font-size: 12px; margin-top: 30px;">
          Or copy this link: <a href="${auditUrl}" style="color: #3b82f6;">${auditUrl}</a>
        </p>
      </div>
    `;

  return {
    subject: `Full Audit Report Unlock Request - Hot Lead: ${sanitizeSubjectText(data.businessName)} (${data.overallScore}% visibility)`,
    html,
  };
}

export async function sendAuditNotification(data: AuditNotificationData): Promise<EmailSendResult> {
  try {
    const { client, fromEmail } = await getSendGridClient();
    const message = buildAuditNotificationEmail(data);
    const [response] = await client.send({
      to: [...NOTIFICATION_RECIPIENTS],
      from: fromEmail,
      customArgs: data.notificationKey
        ? { notification_key: data.notificationKey.slice(0, 100) }
        : undefined,
      ...message,
    });

    const providerMessageId = getProviderMessageId(response);
    console.log(`[EMAIL] Full-report unlock notification accepted (status ${response.statusCode}, message ${providerMessageId ?? 'unavailable'})`);
    return { statusCode: response.statusCode, providerMessageId };
  } catch (error) {
    const normalizedError = normalizeSendGridError(error);
    logSendGridError('Full-report unlock notification', normalizedError);
    throw normalizedError;
  }
}

export async function sendPasswordResetEmail(email: string, name: string, resetToken: string): Promise<boolean> {
  try {
    const { client, fromEmail } = await getSendGridClient();
    
    if (!fromEmail) {
      console.error('SendGrid fromEmail not configured - cannot send reset email');
      return false;
    }
    
    const baseUrl = getAdminBaseUrl();
    
    const resetUrl = `${baseUrl}/admin/reset-password?token=${resetToken}`;
    
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1f2937; border-bottom: 2px solid #3b82f6; padding-bottom: 10px;">
          Password Reset Request
        </h2>
        
        <p>Hi ${name},</p>
        
        <p>We received a request to reset your password for the AI Visibility Audit admin portal.</p>
        
        <div style="margin: 30px 0; text-align: center;">
          <a href="${resetUrl}" 
             style="background: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">
            Reset Your Password
          </a>
        </div>
        
        <p style="color: #6b7280; font-size: 14px;">
          This link will expire in 1 hour. If you didn't request this reset, you can safely ignore this email.
        </p>
        
        <p style="color: #9ca3af; font-size: 12px; margin-top: 30px;">
          If the button doesn't work, copy and paste this link into your browser:<br>
          <a href="${resetUrl}" style="color: #3b82f6;">${resetUrl}</a>
        </p>
      </div>
    `;

    await client.send({
      to: email,
      from: fromEmail,
      subject: 'Password Reset - AI Visibility Audit Portal',
      html
    });

    console.log('Password reset email sent via SendGrid to', email);
    return true;
  } catch (error) {
    console.error('Failed to send password reset email:', error);
    return false;
  }
}
