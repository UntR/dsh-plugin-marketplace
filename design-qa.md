# Marketplace category-filter design QA

## Evidence

- Source visual truth: `/var/folders/qn/g2v78j4n3zz65mt8p8kf7pbw0000gn/T/codex-clipboard-b3fbbe35-c488-41e1-9cb8-10aa1eb91774.png`
- Browser-rendered implementation: `/Users/rzhang15/.codex/visualizations/2026/08/14/01a00081-5af4-7aa1-af0c-e9637cc9e80e/category-filter-implementation-final.png`
- Full-view comparison: `/Users/rzhang15/.codex/visualizations/2026/08/14/01a00081-5af4-7aa1-af0c-e9637cc9e80e/category-filter-comparison.png`
- Responsive evidence: `/Users/rzhang15/.codex/visualizations/2026/08/14/01a00081-5af4-7aa1-af0c-e9637cc9e80e/category-filter-responsive-900.png`
- Viewport: 1227 x 994 CSS px for the source comparison; 900 x 900 CSS px for the narrow-window check.
- Pixel dimensions and normalization: source 2453 x 1988 pixels, normalized with Lanczos to 1227 x 994 to match the implementation's 1227 x 994 capture at the same CSS viewport. Comparison was then performed at 1:1 pixels.
- State: DSH dark theme, full-page Marketplace open, page at top, live registry loaded, category set to all, availability set to directly installable, language set to all, and Stars sorting selected.

## Findings

No actionable P0, P1, or P2 differences remain.

- Fonts and typography: the implementation keeps DSH's host font stack, sizes, weights, line heights, wrapping, and truncation. The category labels and counts scan as one primary group, with technical filters visually subordinate.
- Spacing and layout rhythm: the fragmented bordered fieldsets from the source have been removed. Category is presented as a cohesive filter list; availability is a compact row; language is collapsed under “更多筛选”. At 900 px the category choices form a three-column grid and neither overlap nor clip the results.
- Colors and visual tokens: surfaces, borders, text levels, selected radio state, dropdowns, and disclosure use existing DSH theme variables. Contrast and disabled states remain consistent with the host.
- Image quality and asset fidelity: registry cover images and DSH's existing open-source icons are unchanged and remain sharp at their intended size. No handwritten SVG, CSS art, emoji substitute, or placeholder asset was introduced.
- Copy and content: capability-oriented categories replace implementation-language-first discovery. The full page now defaults to “可直接安装”, producing 821 actionable results in this verification run; counts remain live registry data.
- Icons and affordances: existing search, refresh, close, and Marketplace icons retain their original alignment and stroke family. Category radios, native selects, and the details disclosure clearly communicate state.
- Interaction and accessibility: category filtering, availability switching, expanding “更多筛选”, language filtering, clearing all filters, closing and reopening the Marketplace, labels, native controls, and focus states were exercised. The browser console contained no error-level entries.

## Open Questions

None blocking. Category assignment is deterministic at Registry build time and the Marketplace also classifies older v1 entries that do not yet contain `category`; this compatibility path can be removed after the published Registry is fully regenerated.

## Implementation Checklist

- [x] Make category the primary discovery filter.
- [x] Default the full-page Marketplace to directly installable plugins.
- [x] Compact availability into a dropdown.
- [x] Move language into a collapsed secondary-filter section.
- [x] Generate stable categories during Registry sync without runtime AI.
- [x] Preserve compatibility with older Registry v1 entries.
- [x] Verify default, combined-filter, clear, close/reopen, and responsive states.
- [x] Check the browser console for errors.

## Follow-up Polish

- [P3] The selected Marketplace footer action can show a transient browser focus outline after mouse interaction. It is an accessible host focus state and does not affect the filter redesign.

## Comparison History

- Earlier source state: “安装状态” and “开发语言” were separate boxed fieldsets; language occupied most of the primary discovery rail and visually split the filter area.
- Fix applied: replaced language-first discovery with deterministic capability categories, compacted availability, moved language into “更多筛选”, and removed fieldset borders.
- Post-fix evidence: the normalized side-by-side comparison shows a single coherent discovery group at 1227 x 994; the 900 x 900 capture confirms the category grid and result list remain usable without clipping. No P0/P1/P2 issue remained, so no additional visual-fix iteration was required.

Focused-region comparison was not needed because the combined 1227 x 994 comparison keeps all changed controls, labels, counts, spacing, and border treatments legible; imagery and result-card internals were unchanged.

final result: passed
