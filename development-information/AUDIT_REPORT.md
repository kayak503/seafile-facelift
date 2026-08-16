# Grapple Drive product audit

> **Remediation update — August 15, 2026:** The workflow-breaking findings in this snapshot have been addressed in the current build. Search now has Pro and Community Edition fallbacks; previews use compatible inline/frame headers; list rows open on click while dedicated checkboxes select; Recent, Starred, Shared, and Trash load real Seafile data; Move includes a destination browser; read-only edit actions are hidden; profile management and sign-out are available from the avatar; dialogs, menus, controls, errors, theme contrast, setup guidance, and upload progress/cancellation received accessibility and UX repairs. Trash restore and permanent deletion intentionally hand off to Seafile’s native interface. The numbered findings below are retained as the original audit evidence, not the current-state result.

Audited live at `http://localhost:3000` on August 15, 2026 against the connected Seafile account and the current source tree.

## Executive result

The app can authenticate, enumerate the library, create/rename/move/delete a folder or file, upload a file, and download a file. It is not ready to replace Seafile or Google Drive yet. Four primary navigation destinations are placeholders, live search fails, iframe-based previews are blocked by the app's own response headers, list-view double-click does not open items, and several operations either lack a complete destination/workflow or present misleading success feedback.

This report records **118 distinct, defensible findings**. It does not manufacture 1,000 variations of the same issue.

Evidence labels:

- **Observed** — reproduced in the running app.
- **Code-confirmed** — directly established from the current implementation.
- **Design** — UX/UI defect visible in the running product or implied by an exposed control.

## P1 — Workflow-breaking defects

1. **[Observed] Search fails against the connected Seafile server.** Searching for an uploaded file returned “Search is unavailable right now.”
2. **[Observed] Search failure leaves the ordinary directory listing on screen.** The page therefore looks as if those files are search results.
3. **[Observed] Search failure is represented with a green checkmark.** The shared toast always renders `✓`, including for “Search is unavailable right now.”
4. **[Observed] Search failure has no persistent error state.** The only explanation disappears after roughly three seconds.
5. **[Observed] Search has no retry action.** The user must edit or re-enter the query and hope it works.
6. **[Code-confirmed] Search assumes one Seafile endpoint/response shape.** There is no capability detection or fallback for servers where `/api/v2.1/search-file/` is absent or incompatible.
7. **[Observed] The health indicator says “Seafile Web API connected” while a major API feature is broken.** It overstates system health.
8. **[Observed] PDF preview opens as a completely blank black panel.** This was reproduced with the existing 8 MB PDF.
9. **[Observed] Text preview also produced no readable content in its iframe.**
10. **[Code-confirmed] The app blocks its own iframe previews.** Global `X-Frame-Options: DENY` applies to `/api/preview`, while PDF/text/JSON/Markdown previews are rendered in an iframe.
11. **[Code-confirmed] `/api/preview` is only an alias of the download route.** It has no preview-specific headers, content transformation, error handling, or viewer.
12. **[Observed] Preview has no loading state.** A blank dark surface is shown without a spinner or progress indicator.
13. **[Observed] Preview has no failure state.** The blank surface never explains whether rendering, transfer, CSP, or file format failed.
14. **[Observed] List-view double-click does not open a folder.** It leaves the row selected; the explicit Open button is required.
15. **[Observed] Grid-view double-click does open the same folder.** The same core action behaves differently by view mode.
16. **[Observed] Recent is not implemented.** It replaces the file view with a library card and a temporary future-tense toast.
17. **[Observed] Starred is not implemented.** It behaves like Recent rather than showing starred items.
18. **[Observed] Shared is not implemented.** It behaves like Recent rather than showing shared items.
19. **[Observed] Trash is not implemented.** It only shows a toast and provides no recycle-bin contents.
20. **[Design] Placeholder destinations are styled as working primary navigation.** Nothing indicates “Unavailable” before the user clicks.
21. **[Observed] Placeholder destinations still show the heading “My files.”** The selected navigation concept and page content contradict each other.
22. **[Code-confirmed] Trash does not even update the active section state.** It is wired separately from the other navigation buttons.
23. **[Observed] Move cannot choose a destination folder.** It only provides a destination-drive dropdown.
24. **[Code-confirmed] Every move is hard-coded to `destinationPath: '/'`.** Files can only be moved to a library root.
25. **[Design] The move dialog does not disclose that it will move to the root.** “Destination drive” is insufficient confirmation.
26. **[Code-confirmed] A production deployment over plain HTTP can enter a login loop.** The session cookie is always `Secure` when `NODE_ENV=production`, even when configured `APP_URL` is `http://...`.
27. **[Code-confirmed] Sessions exist only in a process-local Map.** A restart, hot reload, or container replacement logs every user out.
28. **[Code-confirmed] Multiple app replicas cannot share sessions.** A request routed to another replica appears unauthenticated.

## P2 — Incomplete or misleading file workflows

29. **[Observed] Multi-select exposes no bulk action.** With two items selected, the toolbar contains only Clear selection.
30. **[Observed] Shift-click range selection is unsupported.** Shift-click replaces the selection with one item instead of selecting a range.
31. **[Code-confirmed] Selection only recognizes Command/Control as additive.** Shift is ignored.
32. **[Design] There is no Select all control.** The table header has no checkbox and there is no menu command.
33. **[Design] There is no bulk download.**
34. **[Design] There is no bulk move.**
35. **[Design] There is no bulk trash action.**
36. **[Design] There is no bulk details/metadata summary.**
37. **[Observed] Item menus remain rendered behind rename, move, and delete dialogs.** The underlying row menu is visible in the accessibility tree and can show through the backdrop.
38. **[Code-confirmed] Item-menu actions never clear `menu`.** Opening a modal or details panel does not close the menu state.
39. **[Observed] Creating `Test Folder` beside an existing `Test Folder` silently created `Test Folder (1)` instead.**
40. **[Observed] The toast only said “Changes saved.”** It did not tell the user the server changed the requested name.
41. **[Design] Mutation success messages are generic.** Create and rename both say “Changes saved” rather than naming the actual result.
42. **[Design] There is no undo action after moving an item to trash.**
43. **[Observed] The app claims a trashed item can be restored, but its Trash destination cannot be opened.** Restoration requires leaving the app.
44. **[Design] There is no conflict-resolution UI for uploads.** The user cannot choose replace, keep both, or cancel.
45. **[Code-confirmed] Upload always sends `replace=0`.** Conflict behavior is delegated to Seafile without user choice.
46. **[Design] There is no folder upload.** The file input does not accept directory selection.
47. **[Design] There is no drag-to-move for files or folders.**
48. **[Design] There is no inline rename.** Every rename requires a modal.
49. **[Design] Unsupported preview types download immediately on open.** This is surprising for an action labelled Open.
50. **[Design] Search-result clicks navigate to the parent directory rather than opening the result.**
51. **[Code-confirmed] Folder search results also navigate to the parent, not into the matched folder.**
52. **[Design] There is no reveal/highlight after navigating from a search result.** The user must find the file again.
53. **[Design] Column headings look like a file table but are not sortable.**
54. **[Design] There is no refresh control.** Users must navigate away/reload to force a refresh.
55. **[Design] There is no item-count summary.**
56. **[Design] There is no pagination or virtualization for large folders.** All returned entries are rendered at once.
57. **[Design] There is no share action anywhere in the item menu.**
58. **[Design] There is no star/unstar action even though Starred is primary navigation.**
59. **[Design] There is no version/history action despite Seafile supporting file history.**
60. **[Design] There is no permissions/share-details surface.** “Can edit” is the only permission detail.
61. **[Code-confirmed] Read-only library permission is not enforced in item menus.** Rename, Move, and Move to trash remain exposed.
62. **[Code-confirmed] Item permission defaults to read-write when an entry omits `permission`.** It does not inherit the library's read-only permission.
63. **[Design] A read-only user can be led through a destructive modal only to fail at the server.**
64. **[Code-confirmed] Details can remain open after navigating to another folder.** Navigation does not clear the details item.
65. **[Design] Stale details can therefore describe an item that is no longer in the visible location.**

## P2 — Upload queue and feedback gaps

66. **[Observed] Basic file upload succeeds and a completion panel appears.** This is a pass, but the surrounding gaps below remain.
67. **[Observed] Newly uploaded content can take several seconds to appear while the panel already says complete.** No “refreshing” state is shown.
68. **[Code-confirmed] Uploads all start in parallel.** There is no concurrency cap for large multi-file drops.
69. **[Design] “Queued” is effectively unobservable because there is no actual queue scheduler.**
70. **[Design] There is no pause/resume.**
71. **[Design] There is no aggregate bytes-transferred display.** Only an averaged percentage is shown.
72. **[Code-confirmed] Overall progress averages every task equally.** A 1 KB file and a 10 GB file have identical weight.
73. **[Code-confirmed] Failed and canceled tasks remain in the overall percentage calculation.** The number can be misleading.
74. **[Design] The panel does not show the upload destination.**
75. **[Design] The panel uses the same generic file icon for every type.**
76. **[Design] The Clear button is hidden while any upload is active.** Completed rows cannot be dismissed during a long transfer.
77. **[Design] Failed rows cannot be dismissed.** Clear only removes complete or canceled tasks.
78. **[Code-confirmed] Upload error feedback is only attached to the panel.** There is no centralized failure history after the panel is gone.
79. **[Code-confirmed] Cancel does not ask Seafile to remove a partially accepted server object.** It only aborts the browser request.
80. **[Design] The UI gives no warning about the possibility of a partial/temporary upstream object after cancellation.**
81. **[Design] No maximum file-size or server-limit guidance is shown before upload.**
82. **[Design] No available-space or quota check is shown.** Storage only says “Managed by Seafile.”
83. **[Code-confirmed] Upload rate limiting counts requests, not total bytes.** It does not protect the proxy from a few extremely large streams.
84. **[Design] Duplicate-file behavior is not described before upload.**

## P2 — Accessibility and keyboard defects

85. **[Observed] The Details close button has no accessible name.** It appears as an unnamed button.
86. **[Observed] Preview Download has no accessible name.**
87. **[Observed] Preview Close has no accessible name.**
88. **[Code-confirmed] The mobile-sidebar close button has no accessible name.**
89. **[Observed] The avatar/sign-out button is announced only as “AR.”** Its purpose is not exposed to assistive technology.
90. **[Code-confirmed] Regular dialogs have `role=dialog` but no `aria-label` or `aria-labelledby`.**
91. **[Observed] Rename, Move, and Delete appeared as unnamed dialogs in the accessibility snapshot.**
92. **[Code-confirmed] Background content is not inert or hidden from assistive technology while a modal is open.**
93. **[Code-confirmed] Dialogs do not trap focus.** Keyboard focus can escape into the obscured app.
94. **[Code-confirmed] Closing a modal does not restore focus to the triggering control.**
95. **[Code-confirmed] Grid cards are focusable generic divs, not buttons/options/grid cells.**
96. **[Observed] Grid cards have no useful role in the accessibility tree.** Only their action buttons and text are exposed.
97. **[Code-confirmed] Space does not select a focused row/card.** Only Enter is handled.
98. **[Code-confirmed] Arrow-key navigation is absent from both list and grid views.**
99. **[Code-confirmed] The custom item popover has no menu role or menu-item semantics.**
100.  **[Code-confirmed] The New popover declares `role=menu`, but its children are ordinary buttons rather than menuitems.**
101.  **[Code-confirmed] There is no arrow-key navigation within either menu.**
102.  **[Code-confirmed] Active navigation items do not expose `aria-current`.**
103.  **[Code-confirmed] List/Grid toggles do not expose `aria-pressed`.**
104.  **[Code-confirmed] The file table's ARIA grid is incomplete.** Rows contain generic spans rather than gridcell/columnheader roles.
105.  **[Code-confirmed] Selection indicators are decorative spans, not checkboxes.**
106.  **[Design] Right-click opens an item menu without first selecting that item.** Visual selection and action target can disagree.
107.  **[Code-confirmed] Toasts are all `role=status`, including failures.** Errors are not assertive alerts.
108.  **[Design] Toast timers can race.** An older toast's timeout can clear a newer message early.

## P2/P3 — Visual and product-design mistakes

109. **[Observed] Dark-mode brand text is nearly invisible.** `.top-brand strong` is hard-coded to dark gray over the dark header.
110. **[Observed] Dark-mode selected-row text has extremely poor contrast.** A pale-blue selection background is combined with light text.
111. **[Code-confirmed] Several late CSS overrides use hard-coded light-theme colors instead of theme variables.**
112. **[Design] The theme button always shows a sun icon.** It does not communicate the current theme or the result of clicking.
113. **[Code-confirmed] Login/setup do not initialize the saved theme.** Theme preference is applied only inside the authenticated drive shell.
114. **[Design] File-type visuals are almost entirely generic.** PDF, text, archive, image, spreadsheet, and document files share one file glyph.
115. **[Design] “Storage” looks like a quota widget but contains no quota, usage, or link.**
116. **[Design] The product naming is inconsistent.** The UI says Grapple Drive while setup and documentation repeatedly call it Cover/Seafile Cover.
117. **[Code-confirmed] Page metadata and the web-app manifest are hard-coded to Grapple Drive.** Configured `APP_NAME` does not update installed-app identity or browser metadata.
118. **[Code-confirmed] Setup contains a hard-coded private IP example (`192.168.1.115`).** It is not derived from configuration and is wrong/leaky on other installations.

## Additional engineering risks (not included in the 118 UI count)

- The saved-configuration UI cannot update an existing saved configuration: once configured, the primary action becomes Continue rather than Save.
- The setup test endpoint tests the current server whenever configuration already exists, ignoring a newly edited server value.
- The IP rate limiter trusts `X-Forwarded-For` directly and can be bypassed if the reverse proxy does not sanitize it.
- Rate-limit buckets and expired sessions have no periodic cleanup, allowing process memory to grow.
- Optional library-enumeration variants are not isolated: an unsupported variant can abort the full discovery sequence.
- Automated tests cover the adapter only. There are no component, route, accessibility, upload-queue, or browser workflow tests.
- The README claims search reports a clear unavailable state; the live UI provides only a transient success-styled toast.

## Verified passes

- Valid sign-in succeeded.
- Invalid credentials produced a clear inline error.
- Seafile health test succeeded.
- One library and its files loaded.
- New-folder creation succeeded.
- Rename succeeded.
- Move to the library root succeeded.
- File upload succeeded.
- Download emitted a browser download event.
- Details displayed size, type, modified time, and location.
- Delete confirmation succeeded for disposable audit items.
- Command/Control+K and `/` focus search when focus is outside an input.
- List/grid switching succeeded.
- Theme toggling succeeded and persisted within the authenticated shell.
- No JavaScript console errors or warnings were emitted during the audited workflows.

## Audit cleanup

The audit created a folder and a 78-byte text file, exercised create/upload/rename/move/delete, and moved both disposable items to Seafile's recycle bin. It also created a duplicate-name test folder which was moved to the recycle bin. No pre-existing user item was modified or deleted.
