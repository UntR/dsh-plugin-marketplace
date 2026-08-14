export function MarketplaceStyles() {
  return <style>{styles}</style>
}

const styles = `
.dshm-footer-button {
  box-sizing: border-box;
  width: 100%;
  height: 34px;
  margin: 4px -4px 0;
  padding: 6px 10px;
  border: 0;
  border-radius: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
  background: transparent;
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 14px;
  line-height: 22px;
  cursor: pointer;
}
.dshm-footer-button:hover { background: var(--dsw-specific-sidebar-nav-item-hover); }
.dshm-footer-button[aria-pressed="true"] { background: var(--dsw-specific-sidebar-nav-item-active); }
.dshm-footer-button--rail {
  justify-content: center;
  width: 36px;
  height: 36px;
  margin: 4px 0;
  padding: 0;
  border-radius: 50%;
}
.dshm-surface {
  position: absolute;
  z-index: 4;
  top: 0;
  right: 0;
  bottom: 0;
  min-width: 0;
  overflow: hidden;
  pointer-events: auto;
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
  font-family: var(--dsw-font-family, inherit);
}
.dshm-page {
  box-sizing: border-box;
  height: 100%;
  padding: 32px 34px 24px;
  overflow: auto;
  scrollbar-color: var(--dsw-alias-scrollbar-bg-l2) transparent;
}
.dshm-page--embedded { height: auto; padding: 0; overflow: visible; }
.dshm-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  margin-bottom: 22px;
}
.dshm-title { margin: 0; font-size: 28px; font-weight: 600; line-height: 38px; letter-spacing: -.02em; }
.dshm-page--embedded .dshm-title { font-size: 20px; line-height: 28px; }
.dshm-subtitle { margin: 4px 0 0; color: var(--dsw-alias-label-secondary); font-size: 14px; line-height: 22px; }
.dshm-header-actions { display: flex; align-items: center; gap: 8px; }
.dshm-button,
.dshm-icon-button,
.dshm-install-button {
  box-sizing: border-box;
  min-height: 34px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 10px;
  background: var(--dsw-alias-button-elevated-fill);
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}
.dshm-button { padding: 6px 14px; }
.dshm-icon-button { width: 34px; padding: 0; display: inline-flex; align-items: center; justify-content: center; }
.dshm-button:hover,
.dshm-icon-button:hover,
.dshm-install-button:hover { background: var(--dsw-alias-button-floating-hover); }
.dshm-button:disabled,
.dshm-icon-button:disabled,
.dshm-install-button:disabled { opacity: .48; cursor: not-allowed; }
.dshm-search {
  box-sizing: border-box;
  min-height: 52px;
  margin-bottom: 24px;
  padding: 6px 8px 6px 16px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 14px;
  display: flex;
  align-items: center;
  gap: 10px;
  background: var(--dsw-alias-bg-layer-2);
}
.dshm-search:focus-within { border-color: var(--dsw-static-blue-450); }
.dshm-search svg { flex: none; color: var(--dsw-alias-label-tertiary); }
.dshm-search input {
  min-width: 0;
  flex: 1;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 14px;
}
.dshm-search input::placeholder { color: var(--dsw-alias-label-tertiary); }
.dshm-layout { display: grid; grid-template-columns: 190px minmax(0, 1fr); gap: 28px; align-items: start; }
.dshm-filters { position: sticky; top: 0; min-width: 0; }
.dshm-filter-heading { display: flex; align-items: center; justify-content: space-between; min-height: 36px; border-bottom: 1px solid var(--dsw-alias-border-l1); }
.dshm-filter-heading h2 { margin: 0; font-size: 14px; font-weight: 500; }
.dshm-clear { border: 0; background: transparent; color: var(--dsw-static-blue-450); font: inherit; font-size: 12px; cursor: pointer; }
.dshm-filter-group { padding: 17px 0 15px; border-bottom: 1px solid var(--dsw-alias-border-l1); }
.dshm-filter-group legend { margin-bottom: 9px; color: var(--dsw-alias-label-secondary); font-size: 12px; font-weight: 500; }
.dshm-filter-options { display: grid; gap: 3px; }
.dshm-filter-option {
  min-height: 30px;
  display: grid;
  grid-template-columns: 16px minmax(0, 1fr) auto;
  align-items: center;
  gap: 7px;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  cursor: pointer;
}
.dshm-filter-option input { margin: 0; accent-color: var(--dsw-static-blue-450); }
.dshm-filter-option:has(input:checked) { color: var(--dsw-alias-label-primary); }
.dshm-filter-count { color: var(--dsw-alias-label-quaternary); font-variant-numeric: tabular-nums; }
.dshm-results { min-width: 0; }
.dshm-results-toolbar { min-height: 40px; margin-bottom: 8px; display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.dshm-result-count { color: var(--dsw-alias-label-secondary); font-size: 13px; }
.dshm-results-controls { display: flex; align-items: center; gap: 8px; }
.dshm-select {
  height: 34px;
  padding: 0 30px 0 10px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 10px;
  background: var(--dsw-alias-button-elevated-fill);
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 12px;
}
.dshm-list { border: 1px solid var(--dsw-alias-border-l1); border-radius: 14px; overflow: hidden; background: var(--dsw-alias-bg-layer-1); }
.dshm-plugin-row {
  box-sizing: border-box;
  min-height: 108px;
  padding: 18px 16px;
  display: grid;
  grid-template-columns: 58px minmax(220px, 1fr) auto auto;
  align-items: center;
  gap: 16px;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
}
.dshm-plugin-row:last-child { border-bottom: 0; }
.dshm-plugin-row:hover { background: var(--dsw-alias-interactive-bg-hover); }
.dshm-plugin-cover {
  box-sizing: border-box;
  width: 58px;
  height: 58px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background: var(--dsw-alias-bg-layer-3);
  color: var(--dsw-alias-label-secondary);
}
.dshm-plugin-cover img { width: 100%; height: 100%; object-fit: cover; }
.dshm-plugin-main { min-width: 0; }
.dshm-plugin-title-line { display: flex; align-items: baseline; gap: 7px; min-width: 0; }
.dshm-plugin-title { margin: 0; overflow: hidden; color: var(--dsw-alias-label-primary); font-size: 15px; font-weight: 500; line-height: 22px; text-overflow: ellipsis; white-space: nowrap; }
.dshm-plugin-owner { color: var(--dsw-alias-label-tertiary); font-size: 11px; white-space: nowrap; }
.dshm-plugin-description { margin: 3px 0 7px; display: -webkit-box; overflow: hidden; color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 18px; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.dshm-plugin-meta { display: flex; flex-wrap: wrap; gap: 5px 12px; color: var(--dsw-alias-label-tertiary); font-size: 11px; }
.dshm-plugin-meta span { white-space: nowrap; }
.dshm-plugin-state { min-width: 100px; display: grid; gap: 5px; color: var(--dsw-alias-label-secondary); font-size: 11px; text-align: right; }
.dshm-plugin-actions { min-width: 86px; display: grid; justify-items: stretch; gap: 6px; }
.dshm-install-button { min-width: 84px; padding: 6px 12px; font-weight: 500; }
.dshm-details-button { border: 0; background: transparent; color: var(--dsw-alias-label-secondary); font: inherit; font-size: 11px; cursor: pointer; }
.dshm-details-button:hover { color: var(--dsw-alias-label-primary); }
.dshm-alert,
.dshm-notice { margin: 0 0 14px; padding: 10px 12px; border-radius: 10px; font-size: 12px; line-height: 18px; }
.dshm-alert { background: var(--dsw-alias-state-error-secondary); color: var(--dsw-alias-label-error); }
.dshm-notice { background: var(--dsw-alias-state-business-tertiary); color: var(--dsw-alias-label-primary); }
.dshm-empty { padding: 48px 20px; color: var(--dsw-alias-label-secondary); text-align: center; }
.dshm-pagination { min-height: 42px; margin-top: 14px; display: flex; justify-content: center; align-items: center; gap: 12px; color: var(--dsw-alias-label-secondary); font-size: 12px; }
.dshm-installed-shell { max-width: 980px; margin: 0 auto; }
.dshm-installed-shell > section > h2 { display: none; }
.dshm-installed-body { padding-top: 6px; }
.dshm-visually-hidden { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
@media (max-width: 980px) {
  .dshm-page { padding: 24px 22px; }
  .dshm-layout { grid-template-columns: 1fr; }
  .dshm-filters { position: static; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; }
  .dshm-filter-heading { grid-column: 1 / -1; }
  .dshm-filter-group { border: 0; padding: 0; }
  .dshm-plugin-row { grid-template-columns: 52px minmax(160px, 1fr) auto; }
  .dshm-plugin-state { display: none; }
}
@media (max-width: 720px) {
  .dshm-page { padding: 18px 16px; }
  .dshm-title { font-size: 22px; line-height: 30px; }
  .dshm-subtitle { display: none; }
  .dshm-filters { grid-template-columns: 1fr; }
  .dshm-plugin-row { grid-template-columns: 44px minmax(0, 1fr); gap: 10px; }
  .dshm-plugin-cover { width: 44px; height: 44px; }
  .dshm-plugin-actions { grid-column: 2; grid-template-columns: 1fr auto; }
  .dshm-results-toolbar { align-items: flex-end; }
  .dshm-results-controls { flex-wrap: wrap; justify-content: flex-end; }
}
@media (prefers-reduced-motion: reduce) { .dshm-surface { transition: none; } }
`
