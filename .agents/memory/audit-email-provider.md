---
name: Audit email provider
description: Why audit-funnel notifications use Resend and how delivery should be verified.
---

Audit-funnel and password-reset emails should use the verified Motivent Resend connection and sender domain. Do not revert them to SendGrid solely because SendGrid returns an accepted response.

**Why:** SendGrid accepted audit notifications but left them in processing for days before reporting continuous deferral. Resend reported both notification paths delivered, and the user confirmed both arrived in the inbox on August 21, 2026.

Provider acceptance and delivery webhooks are independent concurrent inputs. Any email-provider change must preserve guaranteed reconciliation by provider message ID and must not let delayed/lower-severity events overwrite a final bounce or complaint.

**Why:** A provider can emit a delivery event before the outbox commits the accepted message ID; ordinary transaction lookups can miss each other's uncommitted writes and silently leave a final failure unmatched.

**How to apply:** Preserve the durable outbox, stable idempotency keys, three-recipient list, cross-path serialization/reconciliation, and monotonic final delivery states. For live verification, require both a provider delivery event and inbox confirmation rather than treating API acceptance as delivery.

Development schema synchronization may stop without applying new email tables because Drizzle prompts about an unrelated audit uniqueness constraint when merge setup has no interactive input. Never bypass that prompt with `--force`, because it can approve truncating existing audits.

**Why:** The delivery-webhook merge completed while its additive development schema was still absent, and automated tests failed until the intended additive migration was applied separately.

**How to apply:** After email schema merges, verify the expected development tables exist before testing. Keep production schema changes in Replit's Publish flow, and avoid any blanket auto-approval that could accept data loss.