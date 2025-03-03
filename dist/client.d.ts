import Emitter from './emitter';
import type * as Types from './types';
export { Types };
interface ClientEvents {
    ON_MESSAGE_RECEIVED: (data: Types.MessageEnvelope) => void;
    ON_CREDENTIALS_CHANGE: (data: Types.EventChangeCredentials) => void;
    ON_CONNECT: (data: void) => void;
    ON_DISCONNECT: (data: void) => void;
    ON_READY: (data: void) => void;
    ON_HEARTBEAT: (data: void) => void;
}
export default class PushReceiver extends Emitter<ClientEvents> {
    #private;
    persistentIds: Types.PersistentId[];
    get fcmToken(): string;
    constructor(config: Types.ClientConfig);
    get whenReady(): Promise<unknown>;
    setDebug(enabled?: boolean): void;
    onNotification(listener: (data: Types.MessageEnvelope) => void): Types.DisposeFunction;
    onCredentialsChanged(listener: (data: Types.EventChangeCredentials) => void): Types.DisposeFunction;
    onReady(listener: () => void): Types.DisposeFunction;
    connect: () => Promise<void>;
    destroy: () => void;
    checkCredentials(credentials: Types.Credentials): boolean;
    registerIfNeeded(): Promise<Types.Credentials>;
}
export { PushReceiver };
