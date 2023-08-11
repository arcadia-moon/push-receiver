/// <reference types="node" />
import type * as Types from '../types';
interface MessageHeader {
    key: 'crypto-key' | 'encryption' | 'content-encoding';
    value: string;
}
interface EncryptedMessage {
    appData: MessageHeader[];
    rawData: Buffer;
}
export default function decrypt<T = Types.MessageEnvelope>(object: EncryptedMessage, keys: Types.Keys): T;
export {};
