"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = defer;
function defer() {
    let resolve;
    let reject;
    let isResolved = false;
    const promise = new Promise((res, rej) => {
        resolve = (value) => {
            isResolved = true;
            res(value);
        };
        reject = (reason) => {
            isResolved = true;
            rej(reason);
        };
    });
    return { promise, resolve, reject, isResolved };
}
//# sourceMappingURL=defer.js.map