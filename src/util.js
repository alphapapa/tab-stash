// Things which are not specific to Tab Stash or browser functionality go here.

// Ugh, stupid hack for the fact that getting stuff from the browser that should
// be a compiled-in set of constants is actually done through an async API...
//
// This is f*king racy and gross, but there's nothing we can do here since the
// browser doesn't give us a way to block on a Promise (understandably so, since
// that would raise a whole host of other reentrancy issues that most developers
// probably don't want to deal with...).
let PLATFORM_INFO = {
    'os': 'unknown',
    'arch': 'unknown',
    'nacl_arch': 'unknown',
};
browser.runtime.getPlatformInfo().then(x => {PLATFORM_INFO = x});
export const altKeyName = () => PLATFORM_INFO.os === 'mac' ? 'Option' : 'Alt';

export const bgKeyPressed = ev =>
    PLATFORM_INFO.os === 'mac' ? ev.metaKey : ev.ctrlKey;

export function urlsInTree(bm_tree) {
    let urls = [];
    function collect(bm) {
        if (bm.children) {
            for (let c of bm.children) collect(c);
        } else if (bm.url) {
            urls.push(bm.url);
        }
    }
    if (bm_tree) collect(bm_tree);
    return urls;
}

export function asyncEvent(async_fn) {
    return function() {
        async_fn.apply(this, arguments).catch(console.log);
    };
}

// Returns a function which, when called, arranges to call the async function
// /fn/ immediately, but only if it's not already running.
//
// We ensure that only one instance of the function is running at a time.  If
// the function is requested to be run before the previous call has finished
// running, the request will be queued and the function will be re-run again.
//
// The async function is always called with no arguments.  The return value from
// its promise is ignored.
//
// Since this is ostensibly a background task, exceptions which bubble out of
// the function are caught and logged to the console.
export function nonReentrant(fn) {
    let running = null;
    let next = null;
    let resolve_next = null;

    const inner = () => {
        if (! running) {
            running = fn().finally(() => {
                running = null;
                if (next) {
                    let rn = resolve_next;
                    next = null;
                    resolve_next = null;
                    inner().finally(rn);
                }
            }).catch(console.log);
            return running;

        } else if (! next) {
            next = new Promise(resolve => {resolve_next = resolve});
        }

        return next;
    };

    return inner;
}



// A "defer queue" is a queue of functions (and their arguments) to be called
// later (referred to as "events").  This is mostly useful for event
// handling--e.g. if you need to collect and defer delivery of some events while
// you are doing some other asynchronous processing that depends on events NOT
// being delivered until that processing is complete.
//
// You can append to the queue with push(), or you can use wrap() to create a
// "wrapper function" which, when called, adds the call to the queue to be
// forwarded to another function on release().  (This wrapped function can then
// be provided as an event handler to other parts of the system.)
//
// To control the delivery of events, call plug() and unplug().  If the queue is
// "plugged" (the default state when it is constructed), events will be queued
// and not delivered.  When the queue is "unplugged", any queued events will be
// delivered in order, and future events will be delivered immediately.
export class DeferQueue {
    constructor() {
        this._events = [];
    }

    push(fn, ...args) {
        if (this._events !== null) {
            this._events.push([fn, args]);
        } else {
            fn(...args);
        }
    }

    wrap(fn) {
        return (...args) => this.push(fn, ...args);
    }

    /* Untested; uncomment this only after adding unit tests
    plug() {
        if (this._events === null) {
            this._events = [];
        }
    }
    */

    unplug() {
        let evq = this._events;
        this._events = null;
        for (let [fn, args] of evq) fn(...args);
    }
}
