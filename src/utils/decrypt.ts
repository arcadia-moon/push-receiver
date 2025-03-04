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
    if (!cryptoKey) {
        throw new Error('crypto-key is missing')
    }
    
    const contentEncoding = object.appData.find(item => item.key === 'content-encoding')
    const encryption = object.appData.find(item => item.key === 'encryption')
    
    if (!encryption) {
        throw new Error('encryption is missing')
    }
    
    // 문자열을 분할하고 trim하는 헬퍼 함수
    const splitAndTrim = (value: string) => value.split(';').map(item => item.trim())
    
    const _encryption = splitAndTrim(encryption.value)
    const _keys = splitAndTrim(cryptoKey.value).filter(x => x)
    
    // dh= 로 시작하는 키 찾기
    const _dh = _keys.find(key => key.indexOf('dh=') === 0)
    
    const dh = crypto.createECDH('prime256v1')
    dh.setPrivateKey(keys.privateKey, 'base64')
    
    // salt= 로 시작하는 값 찾기
    const saltItem = _encryption.find(key => key.indexOf('salt=') === 0)
    if (!saltItem) {
        throw new Error('salt is missing')
    }
    
    const salt = saltItem.substring('salt='.length)
    
    const params = {
        version: contentEncoding?.value ?? 'aesgcm',
        authSecret: keys.authSecret,
        dh: _dh ? _dh.substring('dh='.length) : (_keys.length > 0 ? _keys[0] : ''),
        privateKey: dh,
        salt: salt,
    }
    
    const decrypted = ece.decrypt(object.rawData, params)

    try {
        return JSON.parse(decrypted.toString())
    } catch (error) {
        throw new Error(`Failed to parse decrypted message: ${error.message}`)
    }
}
