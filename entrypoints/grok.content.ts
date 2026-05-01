import { startCaptureEngine } from '../lib/capture-engine';
import { grokConfig } from '../lib/platforms-config';

export default defineContentScript({
  matches: grokConfig.matches,
  runAt: 'document_idle',
  main: () => startCaptureEngine(grokConfig),
});
