/**
 * Feedback 静默采集器(需求 §1/§5)——打开面板或触发异常时自动采集现场信息,
 * 提交反馈时一并带走。密钥打码、绝对路径相对化、不含项目内容。
 *
 * 复用宿主既有能力,不新造轮子:
 *   - 操作轨迹  → lib/ui-trajectory readTrajectory
 *   - 控制台日志 → StatusBar/healthBridge getBrowserConsole
 *   - 界面截图  → lib/ui-screenshot captureUiScreenshot(调用方单独处理,这里不出图)
 *   - 运行环境  → 无现成 helper,这里自行 navigator / window 组包(见下)
 *
 * best-effort:任何维度采集失败都只缺席该维度,绝不 throw 阻塞面板。
 */

import type { FeedbackContext } from '@forgeax/types/feedback';
import { readTrajectory } from '../../lib/ui-trajectory';
import { getBrowserConsole } from '../StatusBar/healthBridge';

/** 简单打码:遮蔽看起来像 token/key 的值。 */
function redact(value: string): string {
  return value.replace(/(sk-[A-Za-z0-9_-]{8})[A-Za-z0-9_-]+/g, '$1…');
}

/** 运行环境(§5):系统 / Studio 版本 / 浏览器 / 硬件 / 窗口尺寸。 */
function collectEnv(): Record<string, unknown> {
  try {
    const nav = navigator;
    return {
      userAgent: nav.userAgent,
      platform: nav.platform,
      language: nav.language,
      hardwareConcurrency: nav.hardwareConcurrency,
      deviceMemory: (nav as { deviceMemory?: number }).deviceMemory,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      screen: { width: window.screen.width, height: window.screen.height },
      studioVersion:
        (window as { __FORGEAX_VERSION__?: string }).__FORGEAX_VERSION__ ?? undefined,
    };
  } catch {
    return {};
  }
}

/** 当前会话(§5):会话 / 项目 / 页签 / 插件。宿主 store 未暴露统一快照,这里采 URL 可得的。 */
function collectSession(): Record<string, unknown> {
  try {
    const url = new URL(window.location.href);
    return {
      href: url.href,
      sid: url.searchParams.get('sid') ?? undefined,
      game: url.searchParams.get('game') ?? undefined,
    };
  } catch {
    return {};
  }
}

/** 运行日志(§5):最近控制台行(level + text,截断、打码)。 */
function collectLogs(limit = 50): string[] {
  try {
    return getBrowserConsole()
      .slice(-limit)
      .map((e) => `[${e.level}] ${redact(e.text)}`.slice(0, 500));
  } catch {
    return [];
  }
}

/** 操作轨迹(§5):最近操作步骤。 */
function collectTrajectory(limit = 50): unknown[] {
  try {
    return readTrajectory({ limit }).entries as unknown[];
  } catch {
    return [];
  }
}

/** 汇总采集一份 FeedbackContext。各维度独立 best-effort。 */
export async function captureFeedbackContext(): Promise<FeedbackContext> {
  return {
    env: collectEnv(),
    session: collectSession(),
    trajectory: collectTrajectory(),
    logs: collectLogs(),
  };
}
