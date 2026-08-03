# Local UI testing

Use the local visual fixtures when checking layouts without a database, OAuth
session, wallet, or other user identity:

```sh
LOCAL_UI_TEST_MODE=1 npm run dev
```

Start with `http://localhost:3000/ui-test` for the shared application shell,
navigation, connection cards, tool catalogue, and page-list states. Use
`http://localhost:3000/ui-test/account/wallet` for wallet-specific layouts.
Each fixture uses the real production components with fixed non-sensitive data.

The route returns 404 unless `LOCAL_UI_TEST_MODE=1` is set, and the gate always
returns 404 in production even if that value is accidentally configured. It is
therefore a visual test surface, not an authentication bypass. Do not add user
records, tokens, wallet capabilities, or server mutations to a fixture. Disable
any action control that a fixture needs to display.

For every style change, select the fixture covering the affected component,
then verify desktop and responsive breakpoints before committing. When a change
introduces a new visual state, add that state to the nearest fixture rather than
relying on a signed-in account. The `local-ui-test-mode` Vitest coverage protects
the production gate; use the local browser for layout checks.
