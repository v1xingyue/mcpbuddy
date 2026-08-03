/**
 * Local-only visual fixtures must never become an authentication bypass in a
 * deployed environment. This helper keeps the gate explicit and testable.
 */
export function isLocalUiTestMode(nodeEnv = process.env.NODE_ENV, enabled = process.env.LOCAL_UI_TEST_MODE) {
  return nodeEnv !== 'production' && enabled === '1';
}
