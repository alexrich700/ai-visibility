import test from "node:test";
import assert from "node:assert/strict";

import {
  NOTIFICATION_RECIPIENTS,
  buildSoftLeadEmail,
  buildAuditNotificationEmail,
  type SoftLeadNotificationData,
  type AuditNotificationData,
} from "./email";

test("NOTIFICATION_RECIPIENTS is exactly the three sales aliases", () => {
  assert.deepEqual(
    [...NOTIFICATION_RECIPIENTS],
    [
      "sales@motiventmarketing.com",
      "robert@motiventmarketing.com",
      "alex@motiventmarketing.com",
    ],
  );
});

const localSoftLead: SoftLeadNotificationData = {
  businessName: "Acme Services",
  url: "acme.com",
  keyword: "plumber",
  scope: "local",
  city: "Austin, TX",
  auditId: 12,
};

test("buildSoftLeadEmail includes required local fields including city", () => {
  const { subject, html } = buildSoftLeadEmail(localSoftLead);
  assert.equal(subject.includes("Acme Services"), true);
  assert.equal(html.includes("Acme Services"), true);
  assert.equal(html.includes("plumber"), true);
  assert.equal(html.includes("Local"), true);
  assert.equal(html.includes("Target City"), true);
  assert.equal(html.includes("Austin, TX"), true);
  assert.equal(html.includes("/admin/audit/12"), true);
});

test("buildSoftLeadEmail omits city for national scope", () => {
  const { html } = buildSoftLeadEmail({
    ...localSoftLead,
    scope: "national",
    city: null,
  });
  assert.equal(html.includes("National"), true);
  assert.equal(html.includes("Target City"), false);
});

test("buildSoftLeadEmail HTML-escapes user input", () => {
  const { subject, html } = buildSoftLeadEmail({
    businessName: '<script>alert("x")</script>',
    url: null,
    keyword: "plumber & drains",
    scope: "local",
    city: "<b>Austin</b>",
  });
  // Raw HTML/injection must not survive in the body.
  assert.equal(html.includes("<script>"), false);
  assert.equal(html.includes("&lt;script&gt;"), true);
  assert.equal(html.includes("plumber &amp; drains"), true);
  assert.equal(html.includes("&lt;b&gt;Austin&lt;/b&gt;"), true);
  // Subject is a plain-text field and interpolates the raw business name.
  assert.equal(subject.includes('<script>alert("x")</script>'), true);
});

test("buildSoftLeadEmail strips CR/LF from the subject (header injection defense)", () => {
  const { subject } = buildSoftLeadEmail({
    ...localSoftLead,
    businessName: "Acme\r\nBcc: attacker@evil.com\nSubject: hijacked",
  });
  assert.equal(subject.includes("\r"), false);
  assert.equal(subject.includes("\n"), false);
  // The literal text remains (collapsed), only the line breaks are removed.
  assert.equal(subject.includes("Acme"), true);
  assert.equal(subject.includes("attacker@evil.com"), true);
});

const localAuditData: AuditNotificationData = {
  businessName: "Acme Services",
  url: "acme.com",
  keyword: "plumber",
  scope: "local",
  city: "Austin, TX",
  overallScore: 65,
  chatgptScore: 70,
  googleAIScore: 60,
  leadName: "Jane Doe",
  leadEmail: "jane@example.com",
  leadPhone: "555-1234",
  auditId: 99,
};

test("buildAuditNotificationEmail includes required local fields and contact info", () => {
  const { subject, html } = buildAuditNotificationEmail(localAuditData);
  assert.equal(subject.includes("Acme Services"), true);
  assert.equal(subject.includes("65%"), true);
  assert.equal(html.includes("Local"), true);
  assert.equal(html.includes("Target City"), true);
  assert.equal(html.includes("Austin, TX"), true);
  assert.equal(html.includes("plumber"), true);
  assert.equal(html.includes("65%"), true);
  assert.equal(html.includes("70%"), true);
  assert.equal(html.includes("60%"), true);
  // Contact fields.
  assert.equal(html.includes("Jane Doe"), true);
  assert.equal(html.includes("jane@example.com"), true);
  assert.equal(html.includes("555-1234"), true);
  assert.equal(html.includes("/admin/audit/99"), true);
});

test("buildAuditNotificationEmail omits city for national scope", () => {
  const { html } = buildAuditNotificationEmail({
    ...localAuditData,
    scope: "national",
    city: "Austin, TX",
  });
  assert.equal(html.includes("National"), true);
  assert.equal(html.includes("Target City"), false);
});

test("buildAuditNotificationEmail HTML-escapes user inputs", () => {
  const { html } = buildAuditNotificationEmail({
    ...localAuditData,
    businessName: '<img src=x onerror=alert(1)>',
    leadName: '<script>evil()</script>',
    leadEmail: 'a"b@example.com',
  });
  assert.equal(html.includes("<img src=x"), false);
  assert.equal(html.includes("&lt;img src=x"), true);
  assert.equal(html.includes("<script>evil()</script>"), false);
  assert.equal(html.includes("&lt;script&gt;evil()&lt;/script&gt;"), true);
  assert.equal(html.includes('a"b@example.com'), false);
  assert.equal(html.includes("a&quot;b@example.com"), true);
});

test("buildAuditNotificationEmail strips CR/LF from the subject (header injection defense)", () => {
  const { subject } = buildAuditNotificationEmail({
    ...localAuditData,
    businessName: "Acme\r\nBcc: attacker@evil.com",
  });
  assert.equal(subject.includes("\r"), false);
  assert.equal(subject.includes("\n"), false);
  assert.equal(subject.includes("Acme"), true);
  assert.equal(subject.includes("65%"), true);
});
