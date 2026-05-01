import { startCaptureEngine } from '../lib/capture-engine';
import { perplexityConfig } from '../lib/platforms-config';

export default defineContentScript({
  matches: perplexityConfig.matches,
  runAt: 'document_idle',
  main: () => startCaptureEngine(perplexityConfig),
});
