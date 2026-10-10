# Offline And Language Changes

10 October 2026

## Changelog

- The service worker owns the offline app shell. The old second cache writer and cache-deleting update path were removed.
- Installation downloads the whole shell with Cache.addAll. A failed request rejects installation; failed HTTP responses cannot overwrite good cached assets.
- Shell requests use the installed snapshot. Missing scripts return an explicit error instead of HTML or a script from another release.
- Website version checks still use the network. Non-GET requests are not intercepted.
- Update App waits for successful preparation and activation before reloading. Failure preserves existing caches.
- Readiness checks query the worker's actual shell rather than combining unrelated caches.
- Existing voice recordings retain their original English keys. New Te Reo recordings use separate voice-mi keys, with controls in the existing Te Reo phrase-editor section.
- Language-specific recordings participate in draft Save/Discard, backup export/import, storage totals, unused-media detection, and phrase/topic deletion.
- Te Reo speech uses a matching installed Maori voice when no recording exists. Without either, the phrase is displayed and a warning explains that a Te Reo recording is needed. English recordings are not silently substituted.
- Phrases without Te Reo wording retain their English display/audio fallback.

## Preserved

Existing phrase IDs, recordings, photos, backup schema, CSS, main-screen layout, touch timing, resize behaviour, and version labels are preserved. Only the expanded Te Reo editor section gains controls; the overall settings structure is unchanged. No external AI service or runtime dependency was added.

## Verification

`node --test tests/*.test.cjs`: 31 tests pass.

`node --check script.js` and `node --check sw.js`: pass.

Tests use isolated speech, storage, worker, and network doubles. Browser installation, mobile audio, and the additional editor controls have not been visually or physically tested on iPhone/iPad.

## Deployment And Remaining Risks

- Nothing has been published. The local files remain the assumed source of truth.
- Deploy the complete app together. Change CACHE_NAME in sw.js for every subsequent shell release. Increment and align the human-facing version labels when publishing; their existing v216/v217 mismatch has deliberately been preserved for now.
- Cache.addAll prevents a partial batch commit, but a server deployment serving mixed revisions with successful HTTP responses cannot be detected without a release manifest. Prefer atomic deployment.
- Prior caches are retained for older workers and rollback; storage usage can increase across releases.
- Browser storage eviction remains possible. Keep complete exported backups.
- Test first install, upgrade from the prior worker, offline restart, and another open app tab on the intended device.
- Existing recordings are assumed to be English. Recordings previously made in Maori under an old key are not automatically reclassified.
- Device voice availability and pronunciation require checking with the intended user and a fluent speaker. A browser exposing no Maori voice will show the message without generated audio.
- Older code does not recognise voice-mi keys as active phrase recordings. Avoid running an older version's unused-media cleanup after creating new Te Reo recordings.

## Rollback

Restore script.js and sw.js from `_offline_language_backup_20261010/` to return to the first reliability pass. A deployed rollback also needs a worker update and reload; restoring source alone does not replace an already installed worker. Export a complete backup before device testing. Code rollback does not undo saved browser data.

Copyright © Andrew Bethell. All rights reserved.
Developed by Andrew Bethell in his own time and at his own expense.

Educational simulation tool. Not for clinical decision-making.
