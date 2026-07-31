# UI foundation

MCPBuddy uses a token-first CSS foundation in `app/ui-system.css`. It provides semantic color, spacing, radius, shadow, motion, cursor, and focus tokens without adding a runtime component-library dependency.

Use the `--ui-*` tokens for new components. Use `.ui-card`, `.ui-kicker`, and `.ui-button` for lightweight shared primitives; add new primitives to this file only when at least two screens need the same pattern. This keeps UI evolution consistent while avoiding a large migration to a separate CSS framework.
