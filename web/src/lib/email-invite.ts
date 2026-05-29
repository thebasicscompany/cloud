import "server-only";

import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";

/**
 * Sends a workspace invitation email through the production-verified SES
 * identity (trybasics.ai). The SES config set wires bounce/complaint tracking.
 */
let _ses: SESv2Client | null = null;
function ses(): SESv2Client {
  if (!_ses) _ses = new SESv2Client({ region: process.env.AWS_REGION ?? "us-east-1" });
  return _ses;
}

export async function sendInviteEmail(input: {
  to: string;
  workspaceName: string;
  acceptUrl: string;
  role: string;
}): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  const from = process.env.SES_FROM_EMAIL;
  if (!from) return { ok: false, error: "SES_FROM_EMAIL not configured." };

  const subject = `You're invited to ${input.workspaceName} on basichome`;
  const text = [
    `You've been invited to join "${input.workspaceName}" on basichome as ${input.role}.`,
    ``,
    `Accept your invite:`,
    input.acceptUrl,
    ``,
    `This link expires in 7 days. If you didn't expect this, you can ignore it.`,
  ].join("\n");
  const html = `<!doctype html><html><body style="font-family:ui-sans-serif,system-ui,sans-serif;color:#050505;background:#f3f3f3;padding:24px">
    <div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #e5e5e5;border-radius:10px;padding:28px">
      <h1 style="font-size:18px;margin:0 0 8px">You're invited to ${input.workspaceName}</h1>
      <p style="font-size:14px;color:#444;margin:0 0 20px">You've been invited to join <b>${input.workspaceName}</b> on basichome as <b>${input.role}</b>.</p>
      <a href="${input.acceptUrl}" style="display:inline-block;background:#0a0a0a;color:#fff;text-decoration:none;font-size:14px;padding:10px 18px;border-radius:8px">Accept invite</a>
      <p style="font-size:12px;color:#888;margin:20px 0 0">This link expires in 7 days. If you didn't expect this, you can ignore it.</p>
    </div></body></html>`;

  try {
    const res = await ses().send(
      new SendEmailCommand({
        FromEmailAddress: from,
        Destination: { ToAddresses: [input.to] },
        ConfigurationSetName: "basics-runtime-outbound",
        Content: {
          Simple: {
            Subject: { Data: subject },
            Body: { Text: { Data: text }, Html: { Data: html } },
          },
        },
      }),
    );
    return { ok: true, messageId: res.MessageId };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
