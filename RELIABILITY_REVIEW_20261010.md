# MyNewVoice Reliability Changes

Date: 10 October 2026

## Changelog

- Complete backup import validates the menu structure, supported schema, media IDs, data URLs, MIME categories, and nonempty decoded blobs before changing saved data.
- Replacement media is written in one IndexedDB transaction. Failed media writes abort the replacement. localStorage values are restored on transaction or localStorage write failure.
- Legacy complete backups without a media list keep existing photos and recordings. An explicit empty media list replaces media with an empty set after confirmation.
- Complete backup export fails visibly when the media database cannot be read, instead of exporting a misleading empty media list.
- Recorded phrases, generated speech, introductions, and recording previews share playback cancellation. Stale database reads cannot restart an older phrase or its fallback speech.
- Content Editor changes to phrases, categories, photos, and recordings remain in a draft until Save. Discard restores the original content and drops staged media changes.
- Save failure keeps the editor and draft open. Escape follows the same unsaved-change flow as the buttons. Grid Add captures its snapshot before creating a phrase.
- Cancelled recordings detach their save callback before stopping. Pending microphone permission and recording completion prevent premature editor exit.
- A browser unload warning protects unsaved drafts where the browser supports it.

## Preserved Systems

HTML, CSS, layout, themes, assets, press-activation timing, resize behaviour, photo rendering/cropping, language selection, voice selection, backup format, and service worker are unchanged. Existing version labels and copyright notices remain intact. No framework, runtime dependency, or application file split was introduced.

## Verification

Run `node --test tests/reliability.test.cjs` from this directory: 18 tests pass.

Run `node --check script.js`: passes.

Tests execute the production functions with isolated storage, speech, and UI doubles. They cover successful commits, media-write failure, localStorage quota failure, late transaction abort, legacy backup handling, malformed media, draft persistence boundaries, cancellation, and synchronous generated speech entry. They do not touch the user's browser data.

## Remaining Risks And Assumptions

- This local source is assumed to be the active baseline. It was not published or deployed.
- Browser preview was blocked for the local file. Real iPhone/iPad speech, microphone access, touch interaction, and IndexedDB behaviour remain unverified.
- IndexedDB and localStorage cannot share an atomic transaction. Handled failures roll back, but abrupt browser/process termination during the cross-storage commit is not guaranteed recoverable.
- Drafts require Save. A forced browser termination can lose unsaved edits; unload prompts are not guaranteed on mobile.
- Media validation checks structure and decoding, not whether every image/audio codec will render or play on every device.
- Existing Te Reo/audio language mismatch, service-worker update risks, and broader dialog accessibility findings remain outside this three-part change.
- Existing version mismatch is preserved: runtime identifies v216 while app-version.json and the HTML identify v217. Release version alignment should be done when publishing.

## Rollback

The original source files are preserved in `_reliability_backup_20261010/`. Only `script.js` was changed among the application files. Restore that file from the backup to roll back the code. Source rollback does not undo changes a user subsequently saves in their browser.

Copyright © Andrew Bethell. All rights reserved.
Developed by Andrew Bethell in his own time and at his own expense.

Educational simulation tool. Not for clinical decision-making.
