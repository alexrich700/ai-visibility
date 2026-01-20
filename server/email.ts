// Email service using SendGrid integration
import sgMail from '@sendgrid/mail';

let connectionSettings: any;

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
  return {
    client: sgMail,
    fromEmail
  };
}

// Notification recipients
const NOTIFICATION_RECIPIENTS = [
  'Robert@buildingbrandsmarketing.com',
  'alex@buildingbrandsmarketing.com'
];

interface AuditNotificationData {
  businessName: string;
  keyword: string;
  city: string | null;
  overallScore: number;
  chatgptScore: number;
  googleAIScore: number;
  leadName?: string;
  leadEmail?: string;
  leadPhone?: string;
  auditId: number;
}

export async function sendAuditNotification(data: AuditNotificationData): Promise<boolean> {
  try {
    const { client, fromEmail } = await getSendGridClient();
    
    if (!fromEmail) {
      console.error('SendGrid fromEmail not configured - cannot send notification');
      return false;
    }
    
    const scoreColor = data.overallScore >= 70 ? '#22c55e' : data.overallScore >= 40 ? '#eab308' : '#ef4444';
    
    const baseUrl = 'https://ai.buildingbrandsmarketing.com';
    
    const auditUrl = `${baseUrl}/admin/audit/${data.auditId}`;
    
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1f2937; border-bottom: 2px solid #3b82f6; padding-bottom: 10px;">
          New AI Visibility Audit Submitted
        </h2>
        
        <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="margin-top: 0; color: #374151;">Business Details</h3>
          <p><strong>Business:</strong> ${data.businessName}</p>
          <p><strong>Industry:</strong> ${data.keyword}</p>
          ${data.city ? `<p><strong>City:</strong> ${data.city}</p>` : ''}
        </div>
        
        <div style="background: #f0f9ff; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="margin-top: 0; color: #374151;">Visibility Scores</h3>
          <p style="font-size: 24px; margin: 10px 0;">
            <strong style="color: ${scoreColor};">${data.overallScore}%</strong> Overall Score
          </p>
          <p><strong>ChatGPT:</strong> ${data.chatgptScore}%</p>
          <p><strong>Google AI:</strong> ${data.googleAIScore}%</p>
        </div>
        
        ${data.leadName || data.leadEmail ? `
        <div style="background: #fef3c7; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="margin-top: 0; color: #374151;">Lead Information</h3>
          ${data.leadName ? `<p><strong>Name:</strong> ${data.leadName}</p>` : ''}
          ${data.leadEmail ? `<p><strong>Email:</strong> ${data.leadEmail}</p>` : ''}
          ${data.leadPhone ? `<p><strong>Phone:</strong> ${data.leadPhone}</p>` : ''}
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

    await client.send({
      to: NOTIFICATION_RECIPIENTS,
      from: fromEmail,
      subject: `New AI Audit: ${data.businessName} (${data.overallScore}% visibility)`,
      html
    });

    console.log('Audit notification email sent via SendGrid');
    return true;
  } catch (error) {
    console.error('Failed to send audit notification email:', error);
    return false;
  }
}

export async function sendPasswordResetEmail(email: string, name: string, resetToken: string): Promise<boolean> {
  try {
    const { client, fromEmail } = await getSendGridClient();
    
    if (!fromEmail) {
      console.error('SendGrid fromEmail not configured - cannot send reset email');
      return false;
    }
    
    const baseUrl = 'https://ai.buildingbrandsmarketing.com';
    
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
