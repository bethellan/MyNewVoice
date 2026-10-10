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
const source = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');

function workerFixture() {
    const handlers = {};
    const entries = new Map();
    const writes = [];
    const fixture = {
        handlers, entries, writes, networkCalls: 0,
        response: new Response('new network file'),
        context: null
    };
    const cache = {
        match: async request => entries.get(typeof request === 'string' ? request : request.url)?.clone(),
        put: async (request, response) => {
            writes.push(request.url);
            entries.set(request.url, response);
        },
        addAll: async requests => {
            fixture.batch = requests;
            if (fixture.failInstall) throw new Error('One shell file failed');
        }
    };
    fixture.context = vm.createContext({
        URL, Request, Response, console,
        self: { registration: { scope: 'https://example.com/app/' },
            addEventListener: (name, handler) => { handlers[name] = handler; },
            clients: { claim: async () => {} }, skipWaiting: async () => {} },
        caches: { open: async () => cache, delete: () => assert.fail('Unexpected cache deletion') },
        fetch: async () => {
            fixture.networkCalls++;
            if (fixture.offline) throw new Error('Offline');
            return fixture.response.clone();
        }
    });
    vm.runInContext(source, fixture.context);
    return fixture;
}

test('script uses installed snapshot even when a different release is online', async () => {
    const f = workerFixture();
    f.entries.set('https://example.com/app/script.js', new Response('installed script'));
    const result = await f.context.serveRequest(new Request('https://example.com/app/script.js'));
    assert.equal(await result.text(), 'installed script');
    assert.equal(f.networkCalls, 0);
});

test('missing script fails explicitly instead of returning HTML or another release', async () => {
    const f = workerFixture();
    const result = await f.context.serveRequest(new Request('https://example.com/app/script.js'));
    assert.equal(result.status, 503);
    assert.equal(f.networkCalls, 0);
});

test('HTTP error images are not cached', async () => {
    const f = workerFixture();
    f.response = new Response('Not found', { status: 404 });
    assert.equal((await f.context.serveRequest(new Request('https://example.com/app/images/photo.png'))).status, 404);
    assert.equal(f.writes.length, 0);
});

test('version checks bypass the installed version snapshot', async () => {
    const f = workerFixture();
    f.entries.set('https://example.com/app/app-version.json', new Response('old version'));
    f.response = new Response('website version');
    const response = await f.context.serveRequest(new Request('https://example.com/app/app-version.json?check=1'));
    assert.equal(await response.text(), 'website version');
    assert.equal(f.writes.length, 0);
});

test('failed shell batch prevents successful installation', async () => {
    const f = workerFixture();
    f.failInstall = true;
    await assert.rejects(f.context.installShell(), /shell file failed/);
    assert.ok(f.batch.some(request => request.url.endsWith('/script.js')));
    assert.ok(f.batch.every(request => request.cache === 'reload'));
    assert.equal(f.writes.length, 0);
});

test('non-GET requests are not intercepted', () => {
    const f = workerFixture();
    f.handlers.fetch({ request: new Request('https://example.com/app/', { method: 'POST' }),
        respondWith() { assert.fail('Non-GET request intercepted'); } });
});

test('uncached offline assets receive a failure response, not an HTML document', async () => {
    const f = workerFixture();
    f.offline = true;
    const response = await f.context.serveRequest(new Request('https://example.com/app/assets/sounds/click.mp3'));
    assert.equal(response.status, 503);
    assert.doesNotMatch(await response.text(), /<!doctype/i);
});
