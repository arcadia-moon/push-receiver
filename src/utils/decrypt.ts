import crypto from 'crypto'
import ece from 'http_ece'

import type * as Types from '../types'

interface MessageHeader {
    key: 'crypto-key' | 'encryption' | 'content-encoding'
    value: string
}

interface EncryptedMessage {
    appData: MessageHeader[]
    rawData: Buffer
}

// https://tools.ietf.org/html/draft-ietf-webpush-encryption-03
export default function decrypt<T = Types.MessageEnvelope>(object: EncryptedMessage, keys: Types.Keys): T {
    const cryptoKey = object.appData.find(item => item.key === 'crypto-key')
    if (!cryptoKey) throw new Error('crypto-key is missing')
    const contentEncoding = object.appData.find(item => item.key === 'content-encoding');
    const encryption = object.appData.find(item => item.key === 'encryption');
    if (!encryption)
        throw new Error('encryption is missing');
    const _encryption = encryption.value.split(';').map(function (item) {
        return item.trim();
    });;
    const _keys = cryptoKey.value.split(';').map(function (item) {
        return item.trim();
    }).filter(x => x);
    const _dh = _keys.find(function (key) {
        return key.indexOf('dh=') === 0;
    });
    const dh = crypto.createECDH('prime256v1')
    dh.setPrivateKey(keys.privateKey, 'base64')
    const salt = _encryption.find(function (key) {
        return key.indexOf('salt=') === 0;
    }).substring('salt='.length);
    const params = {
        version: contentEncoding?.value ?? 'aesgcm',
        authSecret: keys.authSecret,
        dh: _dh?.substring('dh='.length) ?? _keys[0],
        privateKey: dh,
        salt: salt,
    }
    const decrypted = ece.decrypt(object.rawData, params)

    return JSON.parse(decrypted)
}
