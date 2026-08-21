---
name: Audit email provider
description: Why audit-funnel notifications use Resend and how delivery should be verified.
---

Audit-funnel and password-reset emails should use the verified Motivent Resend connection and sender domain. Do not revert them to SendGrid solely because SendGrid returns an accepted response.

**Why:** SendGrid accepted audit notifications but left them in processing for days before reporting continuous deferral. Resend reported both notification paths delivered, and the user confirmed both arrived in the inbox on August 21, 2026.

**How to apply:** Preserve the durable outbox, stable idempotency keys, and three-recipient list. For live verification, require both a provider delivery event and inbox confirmation rather than treating API acceptance as delivery.