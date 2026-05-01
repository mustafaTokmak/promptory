import { startCaptureEngine } from '../lib/capture-engine';
import { copilotConfig } from '../lib/platforms-config';

export default defineContentScript({
  matches: copilotConfig.matches,
  runAt: 'document_idle',
  main: () => startCaptureEngine(copilotConfig),
});
