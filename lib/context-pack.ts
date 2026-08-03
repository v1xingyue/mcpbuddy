export const CONTEXT_PACK_TEMPLATE = `# AI Context Pack

## Profile
- Role and background:
- Time zone / locale:

## Working preferences
- Preferred language and tone:
- How to present answers:
- Decision-making preferences:

## Hard limits
- Never:
- Ask before:
- Sensitive topics or data:

## Current goals
- 

## Project notes
### Project: Example project
- Objective:
- Audience:
- Constraints:

## Tool guidance
### publish_page
- Confirm before publishing publicly.

### publish_html
- Confirm before publishing. The returned Blob URL is public and HTML can run scripts in its isolated Blob origin.
- Use a clear title and concise slug.
`;

/**
 * Account-scoped context stays Markdown so existing user_info values remain valid
 * and users can export or edit it without a format migration.
 */
export function contextPackForMcp(content: string) {
  return content.trim() || 'Your AI Context Pack is empty. Ask the user to add their profile, working preferences, limits, and current goals in MCPBuddy Account settings.';
}
