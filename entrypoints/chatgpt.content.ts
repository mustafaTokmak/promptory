import { startCaptureEngine } from '../lib/capture-engine';
import { chatgptConfig } from '../lib/platforms-config';

export default defineContentScript({
  matches: chatgptConfig.matches,
  runAt: 'document_idle',
  main: () => startCaptureEngine(chatgptConfig),
});
