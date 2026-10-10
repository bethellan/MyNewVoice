/*
Copyright © Andrew Bethell. All rights reserved.
Developed by Andrew Bethell in his own time and at his own expense.
Educational simulation tool. Not for clinical decision-making.
*/
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'script.js'), 'utf8');

function load(names, overrides = {}) {
    const context = vm.createContext({
        console: { warn() {}, error() {}, log() {} }, Blob, Map, Set, Date, JSON,
        setTimeout, clearTimeout, URL, fetch,
        contentEditorMediaDraft: null, contentEditorLeaving: false,
        speechPlaybackRunId: 0, activeSpeechCleanup: null, activeSpeechUtterance: null,
        activePrivateVoiceAudio: null, activePrivateVoiceObjectUrl: '',
        privateVoiceKeySet: new Set(), privateMediaSizeIndex: new Map(),
        window: {}, playOptionalClickSound() {}, closePhrasePopupAfterMinimum() {},
        updateContentEditorSaveState() {}, revokePrivateMediaUrl() {},
        ...overrides
    });
    for (const name of names) {
        const match = source.match(new RegExp(`^(?:async )?function ${name}\\([^]*?^}`, 'm'));
        assert.ok(match, `Function exists: ${name}`);
        vm.runInContext(match[0], context);
    }
    return context;
}

function storageFixture({ failMedia = false, failLocal = false, failCommit = false } = {}) {
    const persisted = new Map([['old', { id: 'old', blob: new Blob(['old']) }]]);
    const local = new Map([['content', 'old-content'], ['settings', 'old-settings'], ['categories', 'old-categories']]);
    let injected = false;
    return {
        persisted, local,
        context: {
            STORAGE_KEY: 'content', APP_SETTINGS_KEY: 'settings', CATEGORY_CONFIG_KEY: 'categories', PRIVATE_MEDIA_STORE: 'media',
            LZString: { compressToUTF16: text => text },
            localStorage: {
                getItem: key => local.get(key) ?? null,
                removeItem: key => local.delete(key),
                setItem(key, value) {
                    if (failLocal && key === 'content' && !injected) {
                        injected = true;
                        throw new Error('QuotaExceededError');
                    }
                    local.set(key, value);
                }
            },
            openPrivateMediaDb: async () => ({
                transaction() {
                    const staged = new Map(persisted);
                    let aborted = false;
                    const tx = {
                        error: null,
                        abort() {
                            if (aborted) return;
                            aborted = true;
                            queueMicrotask(() => tx.onabort());
                        },
                        objectStore: () => ({
                            clear: () => staged.clear(),
                            put: record => staged.set(record.id, record),
                            delete: id => staged.delete(id),
                            count() {
                                const request = {};
                                queueMicrotask(() => {
                                    if (aborted) return;
                                    if (failMedia) {
                                        tx.error = new Error('IndexedDB write failed');
                                        tx.onerror();
                                        tx.abort();
                                        return;
                                    }
                                    request.onsuccess();
                                    if (aborted) return;
                                    if (failCommit) {
                                        tx.error = new Error('Late transaction abort');
                                        tx.abort();
                                        return;
                                    }
                                    persisted.clear();
                                    staged.forEach((value, key) => persisted.set(key, value));
                                    tx.oncomplete();
                                });
                                return request;
                            }
                        })
                    };
                    return tx;
                }
            })
        }
    };
}

const newState = { buttonData: { quick: [{ id: 'yes', text: 'Yes' }] }, categoryConfig: { order: ['quick'] }, appSettings: {} };
const newMedia = () => new Map([['new', { id: 'new', type: 'image', blob: new Blob(['new']) }]]);

test('successful restore replaces media and persists all content', async () => {
    const fixture = storageFixture();
    const c = load(['commitContentAndMedia'], fixture.context);
    await c.commitContentAndMedia(newState, newMedia(), true);
    assert.deepEqual([...fixture.persisted.keys()], ['new']);
    assert.deepEqual(JSON.parse(fixture.local.get('content')).buttonData, newState.buttonData);
});

for (const failure of ['failMedia', 'failLocal', 'failCommit']) {
    test(`${failure}: restore retains old media and all previous localStorage values`, async () => {
        const fixture = storageFixture({ [failure]: true });
        const before = [...fixture.local];
        const c = load(['commitContentAndMedia'], fixture.context);
        await assert.rejects(c.commitContentAndMedia(newState, newMedia(), true));
        assert.deepEqual([...fixture.persisted.keys()], ['old']);
        assert.deepEqual([...fixture.local], before);
    });
}

test('editor commit updates changed media without deleting unrelated records', async () => {
    const fixture = storageFixture();
    const c = load(['commitContentAndMedia'], fixture.context);
    await c.commitContentAndMedia(newState, newMedia());
    assert.deepEqual([...fixture.persisted.keys()], ['old', 'new']);
});

function validator() {
    return load(['validateCompleteBackup', 'dataUrlToBlob'], {
        FULL_APP_BACKUP_TYPE: 'backup', categoryConfig: {}, appSettings: {},
        normaliseCategoryConfig: value => value, normaliseAppSettings: value => value
    });
}

test('legacy backup without media preserves existing media', async () => {
    const c = validator();
    const validated = await c.validateCompleteBackup({ type: 'backup', buttonData: newState.buttonData });
    assert.equal(validated.replaceMedia, false);
});

test('malformed, duplicate and remote media are rejected before import', async () => {
    const c = validator();
    const base = { type: 'backup', version: 1, buttonData: newState.buttonData };
    const record = { id: 'phrase:yes', type: 'image', dataUrl: 'data:image/png;base64,YQ==' };
    for (const mediaRecords of [{}, [record, record], [{ ...record, dataUrl: 'https://example.com/photo.png' }], [{ ...record, dataUrl: 'data:image/png;base64,%%%' }]]) {
        await assert.rejects(c.validateCompleteBackup({ ...base, mediaRecords }));
    }
    await assert.rejects(c.validateCompleteBackup({ ...base, buttonData: { quick: 'broken' } }));
    await assert.rejects(c.validateCompleteBackup({ ...base, version: 999 }));
});

test('valid media is decoded before commit', async () => {
    const c = validator();
    const validated = await c.validateCompleteBackup({ type: 'backup', buttonData: newState.buttonData, mediaRecords: [
        { id: 'voice:yes', type: 'voice', dataUrl: 'data:audio/webm;base64,YQ==' }
    ] });
    assert.equal(validated.media.get('voice:yes').blob.size, 1);
});

test('late recording lookup cannot interrupt a newer selection', async () => {
    let resolveRecord;
    let plays = 0;
    const c = load(['stopSpokenOutput', 'playPrivateVoiceForPhrase'], {
        getPhraseVoiceKey: () => 'voice:old',
        getPrivateMediaRecord: () => new Promise(resolve => { resolveRecord = resolve; }),
        Audio: class { async play() { plays++; } }
    });
    const old = c.playPrivateVoiceForPhrase({ id: 'old' }, null, 1);
    c.stopSpokenOutput();
    const latest = c.speechPlaybackRunId;
    resolveRecord({ blob: new Blob(['voice']) });
    assert.equal(await old, true); // handled cancellation must not fall back to old text
    assert.equal(plays, 0);
    assert.equal(c.speechPlaybackRunId, latest);
});

test('generated speech stops recorded playback and removes its highlight', () => {
    let paused = false;
    let cleaned = false;
    const c = load(['stopSpokenOutput', 'speakText'], {
        activePrivateVoiceAudio: { pause() { paused = true; }, removeAttribute() {}, load() {} },
        activeSpeechCleanup: () => { cleaned = true; },
        normaliseTextForSpeech: text => text
    });
    c.speakText('New phrase', null, { showPopup: false });
    assert.equal(paused, true);
    assert.equal(cleaned, true);
    assert.equal(c.activePrivateVoiceAudio, null);
});

test('editor media writes and deletions stay in draft and are previewable', async () => {
    let writes = 0;
    const c = load(['putPrivateMediaRecord', 'deletePrivateMediaRecord', 'getPrivateMediaRecord', 'contentEditorHasUnsavedChanges'], {
        contentEditorMediaDraft: new Map(), contentEditorPendingInputDirty: false,
        contentEditorCleanSnapshot: '{}', serialiseContentEditorState: () => '{}',
        privateMediaTransaction: async () => { writes++; }
    });
    const blob = new Blob(['photo']);
    await c.putPrivateMediaRecord('phrase:yes', 'image', blob);
    assert.equal((await c.getPrivateMediaRecord('phrase:yes')).blob, blob);
    assert.equal(c.contentEditorHasUnsavedChanges(), true);
    await c.deletePrivateMediaRecord('phrase:yes');
    assert.equal(await c.getPrivateMediaRecord('phrase:yes'), null);
    assert.equal(writes, 0);
});

test('discard restores text, drops media draft, and performs no persistent writes', async () => {
    const c = load(['restoreContentEditorSnapshot'], {
        contentEditorCleanSnapshot: JSON.stringify(newState),
        contentEditorMediaDraft: newMedia(), buttonData: { quick: [] },
        normaliseCategoryConfig: value => value, stopSpokenOutput() {},
        revokeAllPrivateMediaUrls() {}, refreshPrivateVoiceKeyIndex: async () => {},
        markContentEditorClean() {}, renderCategoryMenuCards() {}, currentViewCategory: '', showMainMenu() {},
        saveCategoryConfig() { throw new Error('Must not persist on discard'); },
        saveDataToStorage() { throw new Error('Must not persist on discard'); }
    });
    assert.equal(await c.restoreContentEditorSnapshot(), true);
    assert.equal(c.buttonData.quick[0].text, 'Yes');
    assert.equal(c.contentEditorMediaDraft.size, 0);
});

test('cancel recording detaches delayed save callback before stopping', () => {
    let saveCalled = false;
    let cleaned = false;
    const recorder = { state: 'recording', onstop() { saveCalled = true; }, stop() { this.onstop?.(); } };
    const c = load(['stopActiveRecording'], { activeRecorder: recorder, cleanupRecorderState() { cleaned = true; } });
    c.stopActiveRecording(false);
    assert.equal(saveCalled, false);
    assert.equal(cleaned, true);
});

test('failed editor save retains draft, restores interaction, and does not navigate', async () => {
    let navigated = false;
    const panel = { inert: false };
    const draft = newMedia();
    const c = load(['handleContentEditorLeave'], {
        contentEditorMediaDraft: draft, activeRecorder: null, recordingPermissionPending: false,
        commitActiveContentEditorField() {}, contentEditorHasUnsavedChanges: () => true,
        document: { getElementById: () => panel },
        ...newState, normaliseAppSettings: value => value,
        commitContentAndMedia: async () => { throw new Error('Quota'); },
        finishContentEditorNavigation() { navigated = true; }, showToast() {}
    });
    await c.handleContentEditorLeave('origin', true);
    assert.equal(navigated, false);
    assert.equal(c.contentEditorMediaDraft, draft);
    assert.equal(c.contentEditorLeaving, false);
    assert.equal(panel.inert, false);
});

test('Save and Return commits media before marking clean or leaving', async () => {
    const steps = [];
    const c = load(['handleContentEditorLeave'], {
        contentEditorMediaDraft: newMedia(), activeRecorder: null, recordingPermissionPending: false,
        commitActiveContentEditorField() {}, contentEditorHasUnsavedChanges: () => true,
        document: { getElementById: () => ({ inert: false }) },
        ...newState, normaliseAppSettings: value => value,
        commitContentAndMedia: async () => { steps.push('commit'); },
        markContentEditorClean() { steps.push('clean'); },
        finishContentEditorNavigation() { steps.push('leave'); }, showToast() {}
    });
    await c.handleContentEditorLeave('origin', true);
    assert.deepEqual(steps, ['commit', 'clean', 'leave']);
});

test('ordinary editor field saves do not write through the draft', () => {
    const c = load(['saveDataToStorage', 'saveCategoryConfig'], {
        contentEditorMediaDraft: new Map(), categoryConfig: {}, normaliseCategoryConfig: value => value,
        localStorage: { setItem() { assert.fail('Unexpected persistent write'); } }
    });
    c.saveDataToStorage();
    c.saveCategoryConfig();
});

test('failed media read prevents a misleading complete backup export', async () => {
    const c = load(['getAllPrivateMediaRecords', 'buildCompleteBackupPayload'], {
        privateMediaTransaction: async () => { throw new Error('Database unavailable'); }
    });
    await assert.rejects(c.buildCompleteBackupPayload(), /Database unavailable/);
});

test('phrase without recording starts generated speech synchronously', () => {
    let spoken = '';
    const c = load(['speakPhrase'], {
        showPhrasePopup: () => 1, hasKnownPrivateVoice: () => false,
        getPhraseSpeechLanguage: () => 'en',
        getPhraseSpeechText: phrase => phrase.text,
        speakText(text) { spoken = text; }
    });
    c.speakPhrase({ text: 'Hello' }, null);
    assert.equal(spoken, 'Hello');
});

test('Te Reo mode selects only the separate Te Reo recording', () => {
    const c = load(['getPrivateMediaKey', 'getPhraseSpeechLanguage', 'getPhraseVoiceKey', 'hasKnownPrivateVoice'], {
        isTeReoModeEnabled: () => true,
        privateVoiceKeySet: new Set(['voice:yes'])
    });
    const phrase = { id: 'yes', text: 'Yes', reoText: 'Ae' };
    assert.equal(c.getPhraseVoiceKey(phrase), 'voice-mi:yes');
    assert.equal(c.hasKnownPrivateVoice(phrase), false);
    c.privateVoiceKeySet.add('voice-mi:yes');
    assert.equal(c.hasKnownPrivateVoice(phrase), true);
    assert.equal(c.getPhraseVoiceKey({ id: 'name', text: 'Andrew' }), 'voice:name');
});

test('English mode keeps the original recording key', () => {
    const c = load(['getPrivateMediaKey', 'getPhraseSpeechLanguage', 'getPhraseVoiceKey'], { isTeReoModeEnabled: () => false });
    assert.equal(c.getPhraseVoiceKey({ id: 'yes', reoText: 'Ae' }), 'voice:yes');
});

test('Te Reo generated speech does not select a configured English voice', () => {
    const english = { name: 'English', lang: 'en-NZ' };
    const maori = { name: 'Maori', lang: 'mi-NZ' };
    const voices = [english, maori];
    const c = load(['getPreferredSpeechVoice'], {
        window: { speechSynthesis: { getVoices: () => voices } }, appSettings: {},
        findSpeechVoiceBySetting: () => english, findSpeechVoiceByStyle: () => null
    });
    assert.equal(c.getPreferredSpeechVoice('mi'), maori);
    voices.pop();
    assert.equal(c.getPreferredSpeechVoice('mi'), null);
    assert.equal(c.getPreferredSpeechVoice('en'), english);
});

test('missing Te Reo voice gives a visible warning without speaking English', async () => {
    const warnings = [];
    let spoke = false;
    const c = load(['stopSpokenOutput', 'speakText'], {
        window: { speechSynthesis: { cancel() {}, resume() {}, speak() { spoke = true; } } },
        SpeechSynthesisUtterance: class {}, normaliseTextForSpeech: text => text,
        appSettings: { speechRate: 1, speechPitch: 1 }, DEFAULT_APP_SETTINGS: {},
        clampNumber: n => n, getPreferredSpeechVoice: () => null,
        warmSpeechVoices: async () => {}, showToast: text => warnings.push(text)
    });
    c.speakText('Kia ora', null, { language: 'mi', showPopup: false });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(spoke, false);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /Te Reo recording/);
});

test('failed update does not reload or delete cached files', async () => {
    let reloads = 0;
    const c = load(['performSafeAppCodeRefresh'], {
        appCodeRefreshInProgress: false,
        getPreparedOfflineRegistration: async () => { throw new Error('Download failed'); },
        window: { location: { replace() { reloads++; } } },
        caches: { delete() { assert.fail('Working cache deleted'); } },
        showToast() {}, clearExpectedWebsiteVersion() {}
    });
    await c.performSafeAppCodeRefresh();
    assert.equal(reloads, 0);
    assert.equal(c.appCodeRefreshInProgress, false);
});

test('update reload waits for the replacement worker to activate', async () => {
    const steps = [];
    const worker = { postMessage: () => steps.push('activate') };
    const c = load(['performSafeAppCodeRefresh'], {
        appCodeRefreshInProgress: false,
        getPreparedOfflineRegistration: async () => ({ registration: { waiting: worker }, worker }),
        waitForOfflineWorker: async () => { steps.push('activated'); },
        window: { location: { href: 'https://example.com/app/', replace() { steps.push('reload'); } } },
        showToast() {}, rememberExpectedWebsiteVersion() {}, clearExpectedWebsiteVersion() {}
    });
    await c.performSafeAppCodeRefresh();
    assert.deepEqual(steps, ['activate', 'activated', 'reload']);
});

test('Password keyboard handling contains Tab and cancels without closing underlying screens', () => {
    let focused, cancelled = 0, submitted = 0;
    const input = { focus() { focused = 'input'; }, getClientRects: () => [1] };
    const cancel = { focus() { focused = 'cancel'; }, getClientRects: () => [1] };
    const modal = { style: { display: 'flex' }, querySelectorAll: () => [input, cancel] };
    const c = load(['handlePasswordModalKeydown'], {
        document: { getElementById: id => id === 'passwordModal' ? modal : input },
        hidePasswordModal() { cancelled++; }, checkPassword() { submitted++; }
    });
    const event = (key, target, extra = {}) => ({ key, target, preventDefault() { this.prevented = true; }, stopImmediatePropagation() { this.stopped = true; }, ...extra });
    c.handlePasswordModalKeydown(event('Tab', input, { shiftKey: true }));
    assert.equal(focused, 'cancel');
    c.handlePasswordModalKeydown(event('Tab', cancel));
    assert.equal(focused, 'input');
    const escape = event('Escape', input);
    c.handlePasswordModalKeydown(escape);
    assert.equal(cancelled, 1);
    assert.equal(escape.stopped, true);
    c.handlePasswordModalKeydown(event('Enter', input));
    assert.equal(submitted, 1);
    c.handlePasswordModalKeydown(event('Enter', cancel));
    c.handlePasswordModalKeydown(event('Enter', input, { isComposing: true }));
    assert.equal(submitted, 1);
    modal.style.display = 'none';
    c.handlePasswordModalKeydown(event('Escape', input));
    assert.equal(cancelled, 1);
});

test('Popup has no separate repeat or stop controls', () => {
    assert.doesNotMatch(source, /data-repeat-speech|data-stop-speech|currentPopupMessage|function repeatPopupSpeech/);
});

test('Import preview counts menus, phrases, photos and recordings', () => {
    const c = load(['buildBackupImportPreview']);
    const preview = c.buildBackupImportPreview({
        buttonData: { greetings: [{ text: 'Hello' }, { text: 'Bye' }], needs: [] },
        replaceMedia: true,
        media: new Map([['image', { type: 'image' }], ['voice', { type: 'voice' }], ['voice-mi', { type: 'voice' }]])
    });
    assert.match(preview, /2 menus and 2 phrases/);
    assert.match(preview, /1 photos and 2 recordings/);
    assert.match(preview, /Replace all saved/);
});

test('Backup preview includes creation date and version with safe legacy fallbacks', () => {
    const c = load(['buildBackupImportPreview']);
    const incoming = { buttonData: { greetings: [] }, replaceMedia: false, media: new Map() };
    const exportedAt = '2026-10-10T12:00:00.000Z';
    const preview = c.buildBackupImportPreview(incoming, { exportedAt, appVersion: 'v218' });
    assert.ok(preview.includes(new Date(exportedAt).toLocaleString()));
    assert.match(preview, /Backup app version: v218/);
    const legacy = c.buildBackupImportPreview(incoming);
    assert.match(legacy, /Backup created: Unknown/);
    assert.match(legacy, /Backup app version: Unknown/);
    const invalid = c.buildBackupImportPreview(incoming, { exportedAt: 'bad date', appVersion: 'v218\nMisleading text' });
    assert.match(invalid, /Backup created: Unknown/);
    assert.match(invalid, /Backup app version: Unknown/);
    assert.doesNotMatch(invalid, /Misleading text/);
});

test('Release version agrees across runtime, HTML, metadata and offline shell', () => {
    const root = path.join(__dirname, '..');
    const metadata = JSON.parse(fs.readFileSync(path.join(root, 'app-version.json'), 'utf8'));
    const version = source.match(/const CURRENT_APP_VERSION = '(v\d+)'/)[1];
    assert.equal(version, 'v218');
    assert.equal(metadata.appVersion, version);
    assert.equal(metadata.version, version);
    assert.equal(metadata.label, `MyNewVoice ${version}`);
    assert.ok(fs.readFileSync(path.join(root, 'index.html'), 'utf8').includes(`id="aboutVersionText">Version: ${version}</strong>`));
    assert.ok(fs.readFileSync(path.join(root, 'sw.js'), 'utf8').includes(`mnv-shell-${version}-`));
});

test('Legacy import preview preserves existing media', () => {
    const c = load(['buildBackupImportPreview']);
    assert.match(c.buildBackupImportPreview({ buttonData: { greetings: [] }, replaceMedia: false, media: new Map() }),
        /Existing photos and recordings will be kept/);
});

test('Backup status distinguishes download initiation from confirmed save', () => {
    const panel = {};
    let saved = null;
    const c = load(['updateBackupStatusPanel', 'rememberBackupExport'], {
        document: { getElementById: () => panel },
        localStorage: { getItem: () => saved, setItem: (key, value) => { saved = value; } }
    });
    c.updateBackupStatusPanel();
    assert.match(panel.textContent, /No backup export recorded/);
    c.rememberBackupExport('download');
    assert.match(panel.textContent, /download started/);
    const before = saved;
    c.rememberBackupExport('cancelled');
    assert.equal(saved, before);
    c.rememberBackupExport('picker');
    assert.match(panel.textContent, /Last backup saved/);
});

test('Backup history storage failure does not fail the export', () => {
    let warning;
    const c = load(['rememberBackupExport'], {
        localStorage: { setItem() { throw new Error('Storage unavailable'); } },
        showToast: text => { warning = text; }, updateBackupStatusPanel() {}
    });
    assert.doesNotThrow(() => c.rememberBackupExport('picker'));
    assert.match(warning, /history could not be saved/);
});
