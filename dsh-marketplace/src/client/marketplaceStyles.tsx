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
.dshm-category-filter { min-width: 0; margin: 0; padding: 17px 0 15px; border: 0; border-bottom: 1px solid var(--dsw-alias-border-l1); }
.dshm-category-filter legend { margin-bottom: 9px; padding: 0; color: var(--dsw-alias-label-secondary); font-size: 12px; font-weight: 500; }
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
.dshm-filter-select-row {
  min-height: 52px;
  padding: 12px 0;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
}
.dshm-filter-select {
  box-sizing: border-box;
  min-width: 0;
  height: 32px;
  padding: 0 26px 0 9px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 9px;
  background: var(--dsw-alias-button-elevated-fill);
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 12px;
}
.dshm-more-filters { border-bottom: 1px solid var(--dsw-alias-border-l1); color: var(--dsw-alias-label-secondary); font-size: 12px; }
.dshm-more-filters summary {
  min-height: 44px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  cursor: pointer;
  list-style-position: inside;
}
.dshm-more-filters summary span { overflow: hidden; color: var(--dsw-alias-label-primary); text-overflow: ellipsis; white-space: nowrap; }
.dshm-more-filters-body { padding: 0 0 13px; display: grid; gap: 7px; }
.dshm-more-filters-body .dshm-filter-select { width: 100%; }
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
.dshm-installed-body { padding-top: 6px; }
.dshm-about-shell { max-width: 760px; margin: 0 auto; }
.dshm-about-grid { display: grid; gap: 14px; padding-top: 6px; }
.dshm-about-card {
  padding: 22px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 14px;
  background: var(--dsw-alias-bg-layer-1);
}
.dshm-about-card--boundary { border-color: var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-2); }
.dshm-about-card h2 { margin: 0; font-size: 16px; font-weight: 600; line-height: 24px; }
.dshm-about-card p { margin: 8px 0 0; color: var(--dsw-alias-label-secondary); font-size: 13px; line-height: 21px; }
.dshm-about-link {
  min-height: 34px;
  margin-top: 18px;
  padding: 6px 14px;
  border-radius: 10px;
  display: inline-flex;
  align-items: center;
  background: var(--dsw-static-blue-450);
  color: #fff;
  font-size: 13px;
  font-weight: 500;
  text-decoration: none;
}
.dshm-about-link:hover { filter: brightness(.96); }
.dshm-installed-intro {
  margin: 0 0 16px;
  display: flex;
  justify-content: space-between;
  gap: 24px;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  line-height: 18px;
}
.dshm-installed-intro p { margin: 0; }
.dshm-installed-intro p:last-child { max-width: 520px; text-align: right; }
.dshm-installed-notice { display: flex; align-items: center; gap: 8px; }
.dshm-installed-notice span { color: var(--dsw-alias-label-secondary); }
.dshm-installed-row { min-height: 112px; }
.dshm-installed-state {
  min-width: 118px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 7px;
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
  line-height: 17px;
  text-align: right;
}
.dshm-installed-status-dot { width: 7px; height: 7px; flex: none; border-radius: 50%; background: var(--dsw-alias-label-quaternary); }
.dshm-installed-state[data-status="available"] .dshm-installed-status-dot { background: var(--dsw-static-blue-450); }
.dshm-installed-state[data-status="current"] .dshm-installed-status-dot { background: var(--dsw-static-green-450); }
.dshm-installed-actions { min-width: 96px; }
.dshm-remove-button { color: var(--dsw-alias-label-error); }
.dshm-installed-details {
  min-width: 0;
  grid-column: 2 / -1;
  padding-top: 14px;
  border-top: 1px solid var(--dsw-alias-border-l1);
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 18px;
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
}
.dshm-installed-details dl { min-width: 0; margin: 0; display: grid; gap: 7px; }
.dshm-installed-details dl div { min-width: 0; display: grid; grid-template-columns: 54px minmax(0, 1fr); gap: 8px; }
.dshm-installed-details dt { color: var(--dsw-alias-label-tertiary); }
.dshm-installed-details dd { min-width: 0; margin: 0; }
.dshm-installed-details code { display: block; overflow: auto; color: var(--dsw-alias-label-primary); font: inherit; white-space: nowrap; }
.dshm-installed-details a { flex: none; color: var(--dsw-static-blue-450); text-decoration: none; }
.dshm-installed-details a:hover { text-decoration: underline; }
.dshm-installed-empty h3 { margin: 0; color: var(--dsw-alias-label-primary); font-size: 15px; font-weight: 500; }
.dshm-installed-empty p { margin: 6px 0 16px; }
.dshm-dialog-overlay {
  position: fixed;
  z-index: 20;
  inset: 0;
  padding: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgb(0 0 0 / 48%);
}
.dshm-dialog {
  box-sizing: border-box;
  width: min(420px, 100%);
  padding: 22px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 14px;
  background: var(--dsw-alias-bg-layer-2);
  box-shadow: var(--dsw-alias-elevation-shadow-l3);
}
.dshm-dialog h2 { margin: 0 0 10px; font-size: 18px; font-weight: 600; line-height: 26px; }
.dshm-dialog p { margin: 0; color: var(--dsw-alias-label-secondary); font-size: 13px; line-height: 20px; }
.dshm-dialog-plugin { margin-top: 16px !important; color: var(--dsw-alias-label-primary) !important; }
.dshm-dialog-meta { margin-top: 3px !important; color: var(--dsw-alias-label-tertiary) !important; font-size: 11px !important; }
.dshm-dialog-actions { margin-top: 22px; display: flex; justify-content: flex-end; gap: 8px; }
.dshm-button--danger { color: var(--dsw-alias-label-error); }
.dshm-visually-hidden { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
@media (max-width: 980px) {
  .dshm-page { padding: 24px 22px; }
  .dshm-layout { grid-template-columns: 1fr; }
  .dshm-filters { position: static; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; }
  .dshm-filter-heading { grid-column: 1 / -1; }
  .dshm-category-filter { grid-column: 1 / -1; padding: 0 0 14px; }
  .dshm-category-filter .dshm-filter-options { grid-template-columns: repeat(3, minmax(0, 1fr)); column-gap: 18px; }
  .dshm-filter-select-row,
  .dshm-more-filters { border: 0; }
  .dshm-plugin-row { grid-template-columns: 52px minmax(160px, 1fr) auto; }
  .dshm-plugin-state { display: none; }
  .dshm-installed-state { display: none; }
}
@media (max-width: 720px) {
  .dshm-page { padding: 18px 16px; }
  .dshm-title { font-size: 22px; line-height: 30px; }
  .dshm-subtitle { display: none; }
  .dshm-filters { grid-template-columns: 1fr; }
  .dshm-category-filter .dshm-filter-options { grid-template-columns: 1fr; }
  .dshm-plugin-row { grid-template-columns: 44px minmax(0, 1fr); gap: 10px; }
  .dshm-plugin-cover { width: 44px; height: 44px; }
  .dshm-plugin-actions { grid-column: 2; grid-template-columns: 1fr auto; }
  .dshm-installed-actions { grid-template-columns: repeat(3, auto); justify-content: start; }
  .dshm-installed-details { grid-column: 1 / -1; }
  .dshm-installed-intro { display: block; }
  .dshm-installed-intro p:last-child { margin-top: 5px; text-align: left; }
  .dshm-results-toolbar { align-items: flex-end; }
  .dshm-results-controls { flex-wrap: wrap; justify-content: flex-end; }
}
@media (prefers-reduced-motion: reduce) { .dshm-surface { transition: none; } }
`
