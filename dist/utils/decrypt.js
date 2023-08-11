"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const crypto_1 = __importDefault(require("crypto"));
const http_ece_1 = __importDefault(require("http_ece"));
// https://tools.ietf.org/html/draft-ietf-webpush-encryption-03
function decrypt(object, keys) {
    const cryptoKey = object.appData.find(item => item.key === 'crypto-key');
    if (!cryptoKey)
        throw new Error('crypto-key is missing');
    const contentEncoding = object.appData.find(item => item.key === 'content-encoding');
    const encryption = object.appData.find(item => item.key === 'encryption');
    if (!encryption)
        throw new Error('encryption is missing');
    const _encryption = encryption.value.split(';').map(function (item) {
        return item.trim();
    });
    ;
    const _keys = cryptoKey.value.split(';').map(function (item) {
        return item.trim();
    }).filter(x => x);
    const _dh = _keys.find(function (key) {
        return key.indexOf('dh=') === 0;
    }).substring('dh='.length);
    const dh = crypto_1.default.createECDH('prime256v1');
    dh.setPrivateKey(keys.privateKey, 'base64');
    const salt = _encryption.find(function (key) {
        return key.indexOf('salt=') === 0;
    }).substring('salt='.length);
    const params = {
        version: contentEncoding?.value ?? 'aesgcm',
        authSecret: keys.authSecret,
        dh: _dh?.substring('dh='.length) ?? cryptoKey[0],
        privateKey: dh,
        salt: salt,
    };
    const decrypted = http_ece_1.default.decrypt(object.rawData, params);
    return JSON.parse(decrypted);
}
exports.default = decrypt;
//# sourceMappingURL=decrypt.js.map