// src/lib/notifications.ts
// Telegram / Discord notifications for NEXORA MT5. No external dependencies.
// Fail-safe: no public function ever throws; each returns a NotifyResult.

/* ───────────── Types ───────────── */

export type NotificationChannel =
  | { type: "telegram"; botToken: string; chatId: string }
  | { type: "discord"; webhookUrl: string };

export interface NotifyResult {
  ok: boolean; // true if at least one channel received the message
  sent: number;
  failed: number;
  errors: string[];
  skipped?: boolean; // true when suppressed by cooldown
}

export type TradeDirection = "BUY" | "SELL";

export interface SignalAlert {
  symbol: string;
  direction: TradeDirection;
  entry: number;
  stopLoss: number;
  takeProfit: number;
  riskReward?: number; // computed from entry/SL/TP when omitted
  reason?: string;
}

export interface ExecutionStatus {
  status: "APPROVED" | "FILLED";
  symbol: string;
  direction: TradeDirection;
  lots: number;
  ticket?: number | string;
  price?: number;
}

export type MT5ConnectionStatus = "HEALTHY" | "DEGRADED" | "OFFLINE" | "UNKNOWN";

export interface ConnectionAlert {
  status: MT5ConnectionStatus;
  lastHeartbeatAt?: string | Date | null;
  detail?: string;
}

/* ───────────── Internals ───────────── */

type Level = "info" | "success" | "warning" | "danger";

interface Field {
  label: string;
  value: string;
  inline?: boolean;
}

interface NotificationMessage {
  level: Level;
  icon: string;
  title: string;
  fields: Field[];
  description?: string;
}

const REQUEST_TIMEOUT_MS = 8_000;
const DEFAULT_CONNECTION_COOLDOWN_MS = 5 * 60_000;

const DISCORD_COLORS: Record<Level, number> = {
  info: 0x3b82f6,
  success: 0x22c55e,
  warning: 0xf59e0b,
  danger: 0xef4444,
};

const DISCORD_WEBHOOK_RE =
  /^https:\/\/(?:(?:canary|ptb)\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[\w-]+(?:\?.*)?$/;

let activeChannels: NotificationChannel[] = [];
const lastSentAt = new Map<string, number>();

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function fmtNum(value: number): string {
  return Number.isFinite(value)
    ? value.toLocaleString("en-US", { maximumFractionDigits: 5, useGrouping: false })
    : "-";
}

function fmtTime(value: string | Date | null | undefined): string {
  if (!value) return "-";
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toISOString();
}

function computeRiskReward(s: SignalAlert): number | undefined {
  if (typeof s.riskReward === "number" && Number.isFinite(s.riskReward)) return s.riskReward;
  const risk = Math.abs(s.entry - s.stopLoss);
  const reward = Math.abs(s.takeProfit - s.entry);
  return risk > 0 ? reward / risk : undefined;
}

function redact(text: string, channel: NotificationChannel): string {
  const secrets =
    channel.type === "telegram" ? [channel.botToken] : [channel.webhookUrl];
  return secrets.reduce((acc, s) => (s ? acc.split(s).join("***") : acc), text);
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) {
    return err.name === "AbortError" ? "Request timed out" : err.message;
  }
  return String(err);
}

/* ───────────── Rendering ───────────── */

function renderTelegram(msg: NotificationMessage): string {
  const lines = [`${msg.icon} <b>${escapeHtml(msg.title)}</b>`, ""];
  for (const f of msg.fields) {
    lines.push(`<b>${escapeHtml(f.label)}:</b> ${escapeHtml(f.value)}`);
  }
  if (msg.description) lines.push("", escapeHtml(msg.description));
  return lines.join("\n");
}

function renderDiscord(msg: NotificationMessage) {
  return {
    embeds: [
      {
        title: truncate(`${msg.icon} ${msg.title}`, 256),
        description: msg.description ? truncate(msg.description, 2000) : undefined,
        color: DISCORD_COLORS[msg.level],
        fields: msg.fields.map((f) => ({
          name: truncate(f.label, 256),
          value: truncate(f.value || "-", 1024),
          inline: f.inline ?? true,
        })),
        timestamp: new Date().toISOString(),
      },
    ],
  };
}

/* ───────────── Transport ───────────── */

async function postJson(url: string, body: unknown): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status} ${detail.slice(0, 200)}`.trim());
    }
  } finally {
    clearTimeout(timer);
  }
}

async function sendToChannel(channel: NotificationChannel, msg: NotificationMessage): Promise<void> {
  if (channel.type === "telegram") {
    if (!channel.botToken || !channel.chatId) throw new Error("Telegram botToken/chatId missing");
    await postJson(`https://api.telegram.org/bot${channel.botToken}/sendMessage`, {
      chat_id: channel.chatId,
      text: renderTelegram(msg),
      parse_mode: "HTML",
      disable_web_page_preview: true,
    });
    return;
  }
  if (!DISCORD_WEBHOOK_RE.test(channel.webhookUrl)) throw new Error("Invalid Discord webhook URL");
  await postJson(channel.webhookUrl, renderDiscord(msg));
}

async function dispatch(
  msg: NotificationMessage,
  channels?: NotificationChannel[],
): Promise<NotifyResult> {
  const targets = channels ?? activeChannels;
  if (targets.length === 0) {
    return { ok: false, sent: 0, failed: 0, errors: ["No notification channels configured"] };
  }
  const settled = await Promise.allSettled(targets.map((c) => sendToChannel(c, msg)));
  const errors: string[] = [];
  let sent = 0;
  settled.forEach((r, i) => {
    if (r.status === "fulfilled") {
      sent++;
    } else {
      const channel = targets[i];
      errors.push(`${channel.type}: ${redact(errorMessage(r.reason), channel)}`);
    }
  });
  if (errors.length) console.warn("[notifications] delivery failed:", errors.join(" | "));
  return { ok: sent > 0, sent, failed: errors.length, errors };
}

async function run(
  build: () => NotificationMessage,
  channels?: NotificationChannel[],
): Promise<NotifyResult> {
  try {
    return await dispatch(build(), channels);
  } catch (err) {
    const error = errorMessage(err);
    console.warn("[notifications] unexpected error:", error);
    return { ok: false, sent: 0, failed: 1, errors: [error] };
  }
}

/* ───────────── Configuration ───────────── */

/** Set default channels used when a notify* call doesn't pass its own. */
export function setNotificationChannels(channels: NotificationChannel[]): void {
  activeChannels = channels;
}

/**
 * Build channels from env-like object, e.g. channelsFromEnv(process.env) on the server.
 * Vars: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, DISCORD_WEBHOOK_URL
 */
export function channelsFromEnv(env: Record<string, string | undefined>): NotificationChannel[] {
  const out: NotificationChannel[] = [];
  const botToken = env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = env.TELEGRAM_CHAT_ID?.trim();
  if (botToken && chatId) out.push({ type: "telegram", botToken, chatId });
  const webhookUrl = env.DISCORD_WEBHOOK_URL?.trim();
  if (webhookUrl) out.push({ type: "discord", webhookUrl });
  return out;
}

/* ───────────── Public notifiers ───────────── */

/** AI generated a new Trade Plan. */
export function notifySignalAlert(
  signal: SignalAlert,
  channels?: NotificationChannel[],
): Promise<NotifyResult> {
  return run(() => {
    const rr = computeRiskReward(signal);
    return {
      level: "info",
      icon: "📡",
      title: `New AI Signal: ${signal.direction} ${signal.symbol}`,
      fields: [
        { label: "Symbol", value: signal.symbol },
        { label: "Direction", value: signal.direction },
        { label: "Entry", value: fmtNum(signal.entry) },
        { label: "SL", value: fmtNum(signal.stopLoss) },
        { label: "TP", value: fmtNum(signal.takeProfit) },
        { label: "Risk/Reward", value: rr !== undefined ? `1:${rr.toFixed(2)}` : "-" },
      ],
      description: signal.reason ? `Reason: ${truncate(signal.reason, 800)}` : undefined,
    };
  }, channels);
}

/** Order approved or filled. */
export function notifyExecutionStatus(
  exec: ExecutionStatus,
  channels?: NotificationChannel[],
): Promise<NotifyResult> {
  return run(() => {
    const filled = exec.status === "FILLED";
    return {
      level: filled ? "success" : "info",
      icon: filled ? "✅" : "🟦",
      title: filled ? "Order Filled" : "Order Approved",
      fields: [
        { label: "Symbol", value: exec.symbol },
        { label: "Direction", value: exec.direction },
        { label: "Lots", value: fmtNum(exec.lots) },
        { label: "Ticket", value: exec.ticket !== undefined ? String(exec.ticket) : "-" },
        { label: "Price", value: exec.price !== undefined ? fmtNum(exec.price) : "-" },
      ],
    };
  }, channels);
}

/**
 * MT5 terminal status changed (mainly OFFLINE). Repeats of the same status are
 * suppressed for `cooldownMs` (default 5 min) so a flapping heartbeat doesn't spam.
 */
export function notifyConnectionAlert(
  alert: ConnectionAlert,
  channels?: NotificationChannel[],
  cooldownMs: number = DEFAULT_CONNECTION_COOLDOWN_MS,
): Promise<NotifyResult> {
  const key = `connection:${alert.status}`;
  const last = lastSentAt.get(key);
  if (last !== undefined && Date.now() - last < cooldownMs) {
    return Promise.resolve({ ok: true, sent: 0, failed: 0, errors: [], skipped: true });
  }

  return run(() => {
    const level: Level =
      alert.status === "OFFLINE"
        ? "danger"
        : alert.status === "DEGRADED"
          ? "warning"
          : alert.status === "HEALTHY"
            ? "success"
            : "info";
    const icon = { danger: "🚨", warning: "⚠️", success: "🟢", info: "ℹ️" }[level];
    return {
      level,
      icon,
      title: `MT5 Terminal ${alert.status}`,
      fields: [
        { label: "Status", value: alert.status },
        { label: "Last heartbeat", value: fmtTime(alert.lastHeartbeatAt), inline: false },
      ],
      description: alert.detail ? truncate(alert.detail, 500) : undefined,
    };
  }, channels).then((result) => {
    if (result.ok) lastSentAt.set(key, Date.now());
    return result;
  });
}
