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
    if (!cryptoKey) {
        throw new Error('crypto-key is missing');
    }
    const contentEncoding = object.appData.find(item => item.key === 'content-encoding');
    const encryption = object.appData.find(item => item.key === 'encryption');
    if (!encryption) {
        throw new Error('encryption is missing');
    }
    // 문자열을 분할하고 trim하는 헬퍼 함수
    const splitAndTrim = (value) => value.split(';').map(item => item.trim());
    const _encryption = splitAndTrim(encryption.value);
    const _keys = splitAndTrim(cryptoKey.value).filter(x => x);
    // dh= 로 시작하는 키 찾기
    const _dh = _keys.find(key => key.indexOf('dh=') === 0);
    const dh = crypto_1.default.createECDH('prime256v1');
    dh.setPrivateKey(keys.privateKey, 'base64');
    // salt= 로 시작하는 값 찾기
    const saltItem = _encryption.find(key => key.indexOf('salt=') === 0);
    if (!saltItem) {
        throw new Error('salt is missing');
    }
    const salt = saltItem.substring('salt='.length);
    const params = {
        version: contentEncoding?.value ?? 'aesgcm',
        authSecret: keys.authSecret,
        dh: _dh ? _dh.substring('dh='.length) : (_keys.length > 0 ? _keys[0] : ''),
        privateKey: dh,
        salt: salt,
    };
    const decrypted = http_ece_1.default.decrypt(object.rawData, params);
    try {
        return JSON.parse(decrypted.toString());
    }
    catch (error) {
        throw new Error(`Failed to parse decrypted message: ${error.message}`);
    }
}
exports.default = decrypt;
//# sourceMappingURL=decrypt.js.map