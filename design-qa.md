# Marketplace theme and Agent-install design QA

## Evidence

- Source visual truth: `/var/folders/qn/g2v78j4n3zz65mt8p8kf7pbw0000gn/T/codex-clipboard-eea3e22e-69d6-4809-b1ce-08c8d5afee89.png`
- Dark-mode implementation: `/Users/rzhang15/.codex/visualizations/2026/08/14/01a00081-5af4-7aa1-af0c-e9637cc9e80e/theme-agent-dialog-dark.png`
- Light-mode implementation: `/Users/rzhang15/.codex/visualizations/2026/08/14/01a00081-5af4-7aa1-af0c-e9637cc9e80e/theme-agent-dialog-light.png`
- Full-view before/after comparison: `/Users/rzhang15/.codex/visualizations/2026/08/14/01a00081-5af4-7aa1-af0c-e9637cc9e80e/theme-dialog-before-after.png`
- Implementation viewport: 1280 x 720 CSS pixels at browser device scale 1; screenshots are 1280 x 720 pixels.
- Source dimensions: 480 x 318 pixels. The source is a macOS app-switcher thumbnail rather than a 1:1 browser capture, so its DSH window region was cropped to 344 x 182 and fitted into a 960 x 540 comparison cell. The implementation was fitted into an adjacent 960 x 540 cell. This normalization supports theme-surface comparison, not pixel-level layout claims.
- State: Marketplace full page, availability set to unavailable, first “使用 Agent 安装” confirmation open. Both explicit light and dark DSH appearance settings were captured; the user's setting was restored to “跟随系统” afterward.

## Findings

No actionable P0, P1, or P2 differences remain.

- Fonts and typography: the dialog continues to use the DSH host font stack and inherited type rendering. Heading, plugin name, explanation, link, and button labels remain legible in both themes without unexpected wrapping or truncation.
- Spacing and layout rhythm: the confirmation uses the existing dialog width, padding, radius, overlay, and action grouping. The new explanation and action label fit the 1280 x 720 viewport without clipping or shifting the Marketplace layout.
- Colors and visual tokens: the source showed a white dialog fallback over a dark page. All three Marketplace dialogs now use `--dsw-alias-bg-layer-2`; it resolves to the DSH dark surface in night mode and white in day mode. Inherited primary text and the overlay retain correct contrast in both captures.
- Image quality and asset fidelity: the change introduces no new image assets or custom icon approximations. Existing registry covers and DSH icons remain unchanged and sharp; the screenshot's Chrome app icon is operating-system chrome and is not part of the product surface.
- Copy and content: unavailable plugins now say “使用 Agent 安装”. The confirmation clearly states that direct installation is unavailable and that Marketplace will open a DSH session for the Agent to inspect the repository and attempt installation.
- Icons and affordances: close, cancel, GitHub, and primary confirmation actions remain visibly distinct. The formerly disabled unavailable action is now an enabled button with an explicit Agent label.
- Interaction and accessibility: verified unavailable filtering, Agent-install confirmation open/cancel, explicit light/dark switching, theme restoration, and keyboard-focusable native controls. The final confirmation was intentionally not accepted against an unknown repository; the callback and no-direct-POST boundary are covered by the client test. Browser logs contained no error-level entries; connection-retry warnings were expected during deliberate DSH restarts.

## Open Questions

None blocking. The Agent will still enforce DSH's normal permission prompts during the generated installation session; Marketplace confirmation does not bypass them.

## Implementation Checklist

- [x] Replace the nonexistent legacy dialog background variable in install, details, and removal dialogs.
- [x] Verify dark and light dialog surfaces in the installed DSH profile.
- [x] Make unavailable-plugin actions clickable and explicit.
- [x] Add confirmation before handing installation to an Agent.
- [x] Use DSH's official Workspace, Session, and Composer services rather than DOM automation.
- [x] Create/reuse a blank session in the current or recent Workspace, insert the repository-specific task, open it, and submit it.
- [x] Preserve DSH permission approval boundaries.
- [x] Restore the user's theme preference after QA and check browser errors.

## Follow-up Polish

No P3 visual change is required for this slice.

## Comparison History

- Pass 1 / source finding [P1]: the dark DSH page contained a bright white Marketplace dialog because `--dsh-background` was undefined and fell back to `#fff`.
- Fix applied: all three dialogs now consume the host's `--dsw-alias-bg-layer-2` token. The unavailable path was also changed from a dead disabled control to a labelled Agent handoff with confirmation.
- Pass 2 / post-fix evidence: the combined source/dark comparison shows the modal surface aligned with the dark theme; the separate light capture confirms the same token resolves correctly in day mode. No P0/P1/P2 issue remains.

Focused-region evidence is represented by the normalized app-window crop in the combined comparison. A tighter pixel comparison would be misleading because the source is a low-resolution app-switcher thumbnail, not a browser screenshot.

final result: passed
