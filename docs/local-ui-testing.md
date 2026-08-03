# Local UI testing

Use the local visual fixture when checking authenticated layouts without a
database, OAuth session, wallet, or other user identity:

```sh
LOCAL_UI_TEST_MODE=1 npm run dev
```

Then open `http://localhost:3000/ui-test/account/wallet`. The fixture renders
the real application shell, expanded Account sidebar menu, Wallet header, and
wallet asset panel with fixed non-sensitive sample data.

The route returns 404 unless `LOCAL_UI_TEST_MODE=1` is set, and the gate always
returns 404 in production even if that value is accidentally configured. It is
therefore a visual test surface, not an authentication bypass. Do not add user
records, tokens, wallet capabilities, or server mutations to a fixture.

For style changes, verify both the desktop layout and the responsive breakpoints
in this fixture before committing. The `local-ui-test-mode` Vitest coverage
protects the production gate; use the local browser for layout and interaction
checks.
