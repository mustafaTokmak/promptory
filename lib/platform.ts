import type { AIPlatform } from './types';

interface PlatformInfo {
  label: string;
  color: string;
  bgColor: string;
}

const platforms: Record<AIPlatform, PlatformInfo> = {
  chatgpt: { label: 'ChatGPT', color: '#10a37f', bgColor: '#e6f7f2' },
  gemini: { label: 'Gemini', color: '#4285f4', bgColor: '#e8f0fe' },
  claude: { label: 'Claude', color: '#d97706', bgColor: '#fef3c7' },
  perplexity: { label: 'Perplexity', color: '#20b2aa', bgColor: '#e0f7f5' },
  grok: { label: 'Grok', color: '#1a1a1a', bgColor: '#f3f4f6' },
  copilot: { label: 'Copilot', color: '#0078d4', bgColor: '#deecf9' },
};

export function getPlatformInfo(platform: AIPlatform): PlatformInfo {
  return platforms[platform];
}

export function formatTimestamp(ts: number): string {
  const date = new Date(ts);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}
