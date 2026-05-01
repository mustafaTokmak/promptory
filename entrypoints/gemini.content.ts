import { startCaptureEngine } from '../lib/capture-engine';
import { geminiConfig } from '../lib/platforms-config';

export default defineContentScript({
  matches: geminiConfig.matches,
  runAt: 'document_idle',
  main: () => startCaptureEngine(geminiConfig),
});
