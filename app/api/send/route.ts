import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { z } from "zod";

const emailRequestSchema = z.object({
  agents: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        recipients: z
          .array(
            z.object({
              to: z.string().email(),
              subject: z.string().min(1),
              body: z.string().min(1),
              variables: z.record(z.string()).optional(),
              name: z.string().optional()
            })
          )
          .min(1)
      })
    )
    .min(1),
  from: z
    .object({
      email: z.string().email().optional(),
      name: z.string().optional()
    })
    .partial()
    .optional()
});

function buildHtmlBody(plainText: string) {
  const escaped = plainText
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<div style="font-family: 'Segoe UI', Arial, sans-serif; font-size: 16px; line-height: 1.6; color: #0f172a;">
${escaped.replace(/\n/g, "<br/>")}
</div>`;
}

function resolveFromHeader(from: { email?: string; name?: string }) {
  const defaultEmail =
    process.env.MAIL_FROM ||
    process.env.SMTP_FROM ||
    process.env.SMTP_USER ||
    "";
  const defaultName =
    process.env.MAIL_FROM_NAME ||
    process.env.SMTP_FROM_NAME ||
    process.env.MAIL_FROM ||
    "";

  const email = from.email || defaultEmail;
  const name = from.name || defaultName;

  if (!email) {
    return null;
  }

  return name ? `${name} <${email}>` : email;
}

function createTransport() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = process.env.SMTP_SECURE === "true";
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host) {
    return {
      transport: nodemailer.createTransport({
        jsonTransport: true
      }),
      dryRun: true as const
    };
  }

  const transport = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: user && pass ? { user, pass } : undefined
  });

  return {
    transport,
    dryRun: false as const
  };
}

export async function POST(request: Request) {
  const json = await request.json().catch(() => null);
  if (!json) {
    return NextResponse.json(
      { ok: false, message: "Malformed JSON payload." },
      { status: 400 }
    );
  }

  const parsed = emailRequestSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        message: "Invalid payload.",
        issues: parsed.error.issues
      },
      { status: 422 }
    );
  }

  const fromHeader = resolveFromHeader(parsed.data.from ?? {});
  if (!fromHeader) {
    return NextResponse.json(
      {
        ok: false,
        message:
          "Missing sender identity. Supply from.email in the request or configure MAIL_FROM (and optional MAIL_FROM_NAME) environment variables."
      },
      { status: 400 }
    );
  }

  const { transport, dryRun } = createTransport();

  const summary: { agentId: string; sent: number }[] = [];

  for (const agent of parsed.data.agents) {
    let sent = 0;

    for (const recipient of agent.recipients) {
      const contextHeaders: Record<string, string> = {};
      if (agent.name) {
        contextHeaders["X-Agent-Name"] = agent.name;
      }

      try {
        const info = await transport.sendMail({
          from: fromHeader,
          to: recipient.name ? `${recipient.name} <${recipient.to}>` : recipient.to,
          subject: recipient.subject,
          text: recipient.body,
          html: buildHtmlBody(recipient.body),
          headers: contextHeaders
        });

        if (dryRun) {
          const rawMessage = (info as { message?: unknown }).message;
          const preview =
            typeof rawMessage === "string"
              ? rawMessage
              : typeof rawMessage === "object" && rawMessage !== null
              ? JSON.stringify(rawMessage)
              : info.messageId ?? "";
          console.info(
            "[mail:dry-run] agent=%s to=%s subject=%s preview=%s",
            agent.name,
            recipient.to,
            recipient.subject,
            preview
          );
        }
        sent += 1;
      } catch (error) {
        console.error("Failed to send email", {
          agent: agent.id,
          recipient: recipient.to,
          error
        });
        return NextResponse.json(
          {
            ok: false,
            message: `Failed to dispatch email to ${recipient.to}. Check server logs for details.`
          },
          { status: 500 }
        );
      }
    }

    summary.push({ agentId: agent.id, sent });
  }

  const total = summary.reduce((acc, item) => acc + item.sent, 0);

  if (dryRun) {
    return NextResponse.json({
      ok: true,
      message: `Dry run: generated ${total} email payloads across ${summary.length} agents. Configure SMTP_HOST to send live emails.`
    });
  }

  return NextResponse.json({
    ok: true,
    message: `Dispatched ${total} emails across ${summary.length} agents.`
  });
}
