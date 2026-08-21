import test from "node:test";
import assert from "node:assert/strict";

import {
  RESEND_FROM_EMAIL,
  sendResendEmail,
  type ResendProxy,
} from "./resend-email-provider";

test("sendResendEmail sends from the verified Motivent domain with idempotency", async () => {
  let capturedPath = "";
  let capturedOptions: Parameters<ResendProxy>[1] | undefined;
  const proxy: ResendProxy = async (path, options) => {
    capturedPath = path;
    capturedOptions = options;
    return new Response(JSON.stringify({ id: "resend-message-123" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  const result = await sendResendEmail(
    {
      to: ["alex@motiventmarketing.com"],
      subject: "Delivery verification",
      html: "<p>Test</p>",
      idempotencyKey: "notification:key:123",
    },
    proxy,
  );

  assert.equal(capturedPath, "/emails");
  assert.equal(capturedOptions?.method, "POST");
  assert.equal(
    capturedOptions?.headers?.["Idempotency-Key"],
    "notification:key:123",
  );
  assert.deepEqual(capturedOptions?.body, {
    from: RESEND_FROM_EMAIL,
    to: ["alex@motiventmarketing.com"],
    subject: "Delivery verification",
    html: "<p>Test</p>",
  });
  assert.deepEqual(result, {
    provider: "resend",
    statusCode: 200,
    providerMessageId: "resend-message-123",
  });
});

test("sendResendEmail preserves provider status without exposing raw error bodies", async () => {
  const proxy: ResendProxy = async () =>
    new Response(
      JSON.stringify({
        name: "validation_error",
        message: "The from address is not verified",
        sensitive_debug_data: "must not appear",
      }),
      {
        status: 422,
        headers: { "content-type": "application/json" },
      },
    );

  await assert.rejects(
    () =>
      sendResendEmail(
        {
          to: ["alex@motiventmarketing.com"],
          subject: "Test",
          html: "<p>Test</p>",
        },
        proxy,
      ),
    (error: any) => {
      assert.equal(error.code, 422);
      assert.equal(error.message.includes("from address is not verified"), true);
      assert.equal(error.message.includes("sensitive_debug_data"), false);
      return true;
    },
  );
});

test("sendResendEmail rejects an ambiguous success response without an email id", async () => {
  const proxy: ResendProxy = async () =>
    new Response("{}", {
      status: 200,
      headers: { "content-type": "application/json" },
    });

  await assert.rejects(
    () =>
      sendResendEmail(
        {
          to: ["alex@motiventmarketing.com"],
          subject: "Test",
          html: "<p>Test</p>",
        },
        proxy,
      ),
    (error: any) => {
      assert.equal(error.code, 502);
      assert.equal(error.message.includes("without an email ID"), true);
      return true;
    },
  );
});