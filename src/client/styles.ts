/**
 * Panel stylesheet, injected once by the client apply as a plain <style> tag
 * (the standalone bundle has no CSS-module pipeline). Token names follow the
 * shell's --dsw-* vocabulary where sensible; layout is self-contained.
 *
 * @module dsh-workgroup/src/client/styles
 */

/** One stylesheet string, keyed to the dsh-wg-* classes in WorkgroupPanel. */
export const WORKGROUP_CSS = `
.dsh-wg-root { position: relative; display: inline-flex; align-items: center; }
.dsh-wg-trigger {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 2px 8px; border-radius: 999px;
  border: 1px solid var(--dsw-border, rgba(128,128,128,.35));
  background: transparent; color: inherit; font-size: 12px; cursor: pointer;
}
.dsh-wg-trigger:hover { background: var(--dsw-hover, rgba(128,128,128,.12)); }
.dsh-wg-count { white-space: nowrap; }
.dsh-wg-open { transform: rotate(90deg); transition: transform .12s ease; }
.dsh-wg-menu {
  position: absolute; right: 0; top: calc(100% + 4px); z-index: 50;
  min-width: 280px; max-width: 380px; max-height: 420px; overflow: auto;
  padding: 6px; border-radius: 10px;
  background: var(--dsw-surface, #fff); color: var(--dsw-text, #1a1a1a);
  border: 1px solid var(--dsw-border, rgba(128,128,128,.35));
  box-shadow: 0 8px 28px rgba(0,0,0,.18);
}
.dsh-wg-notice, .dsh-wg-error { padding: 10px 12px; font-size: 12px; color: var(--dsw-text-muted, #666); }
.dsh-wg-error { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.dsh-wg-error button {
  display: inline-flex; align-items: center; gap: 4px;
  border: none; background: transparent; color: inherit; cursor: pointer; font-size: 12px;
}
.dsh-wg-group { display: flex; flex-direction: column; }
.dsh-wg-group-head {
  display: flex; align-items: center; gap: 6px; width: 100%;
  padding: 6px 8px; border: none; background: transparent; color: inherit;
  font-size: 13px; font-weight: 600; cursor: pointer; text-align: left; border-radius: 6px;
}
.dsh-wg-group-head:hover { background: var(--dsw-hover, rgba(128,128,128,.12)); }
.dsh-wg-group-title { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dsh-wg-group-meta { font-size: 11px; font-weight: 400; color: var(--dsw-text-muted, #666); }
.dsh-wg-members { display: flex; flex-direction: column; gap: 2px; padding-left: 18px; }
.dsh-wg-member {
  display: flex; align-items: center; gap: 6px; width: 100%;
  padding: 5px 8px; border: none; background: transparent; color: inherit;
  font-size: 12px; cursor: pointer; text-align: left; border-radius: 6px;
}
.dsh-wg-member:hover { background: var(--dsw-hover, rgba(128,128,128,.12)); }
.dsh-wg-member-title { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dsh-wg-member-role { font-size: 11px; color: var(--dsw-accent, #4a6ee0); }
.dsh-wg-member-status { font-size: 11px; color: var(--dsw-text-muted, #666); }
`
