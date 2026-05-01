import { startCaptureEngine } from '../lib/capture-engine';
import { claudeConfig } from '../lib/platforms-config';

export default defineContentScript({
  matches: claudeConfig.matches,
  runAt: 'document_idle',
  main: () => startCaptureEngine(claudeConfig),
});
