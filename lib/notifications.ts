import nodemailer from "nodemailer";

import type { Hotspot, Monitor, NotificationRecord } from "@/lib/schema";

function canSendEmail() {
  return Boolean(
    process.env.SMTP_HOST &&
      process.env.SMTP_PORT &&
      process.env.SMTP_USER &&
      process.env.SMTP_PASS &&
      process.env.SMTP_FROM,
  );
}

function createTransport() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

export async function sendEmailNotification(
  record: NotificationRecord,
  monitor: Monitor,
  hotspot: Hotspot,
) {
  if (!record.recipient) {
    return {
      ...record,
      status: "skipped" as const,
      detail: "未配置接收邮箱，已跳过邮件发送。",
    };
  }

  if (!canSendEmail()) {
    return {
      ...record,
      status: "skipped" as const,
      detail: "SMTP 未配置，已保留站内通知。",
    };
  }

  try {
    const transport = createTransport();

    await transport.sendMail({
      from: process.env.SMTP_FROM,
      to: record.recipient,
      subject: `【热点雷达】${monitor.name} 捕获到新信号`,
      text: [
        `监控名称：${monitor.name}`,
        `标题：${hotspot.title}`,
        `来源：${hotspot.sourceLabel}`,
        `AI 摘要：${hotspot.ai.summary}`,
        `可信度：${hotspot.ai.confidence}`,
        `风险分：${hotspot.ai.fakeRiskScore}`,
        `链接：${hotspot.url}`,
      ].join("\n"),
    });

    return {
      ...record,
      status: "sent" as const,
      detail: `邮件已发送到 ${record.recipient}`,
    };
  } catch (error) {
    return {
      ...record,
      status: "failed" as const,
      detail: error instanceof Error ? error.message : "邮件发送失败",
    };
  }
}