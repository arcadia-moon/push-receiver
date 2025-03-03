"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PushReceiver = void 0;
const long_1 = __importDefault(require("long"));
const protobufjs_1 = __importDefault(require("protobufjs"));
const tls_1 = __importDefault(require("tls"));
const gcm_1 = __importStar(require("./gcm"));
const fcm_1 = __importDefault(require("./fcm"));
const keys_1 = __importDefault(require("./keys"));
const parser_1 = __importDefault(require("./parser"));
const decrypt_1 = __importDefault(require("./utils/decrypt"));
const logger_1 = __importDefault(require("./utils/logger"));
const protos_1 = __importDefault(require("./protos"));
const defer_1 = __importDefault(require("./utils/defer"));
const emitter_1 = __importDefault(require("./emitter"));
const constants_1 = require("./constants");
protobufjs_1.default.util.Long = long_1.default;
protobufjs_1.default.configure();
const HOST = 'mtalk.google.com';
const PORT = 5228;
const MAX_RETRY_TIMEOUT = 15;
class PushReceiver extends emitter_1.default {
    #config;
    #socket;
    #retryCount = 0;
    #retryTimeout;
    #parser;
    #heartbeatTimer;
    #heartbeatTimeout;
    #streamId = 0;
    #lastStreamIdReported = -1;
    #ready = (0, defer_1.default)();
    persistentIds;
    get fcmToken() {
        return this.#config.credentials?.fcm?.token;
    }
    constructor(config) {
        super();
        this.setDebug(config.debug);
        logger_1.default.debug('constructor', config);
        this.#config = {
            bundleId: 'receiver.push.com',
            chromeId: 'org.chromium.linux',
            chromeVersion: '94.0.4606.51',
            vapidKey: '',
            persistentIds: [],
            heartbeatIntervalMs: 5 * 60 * 1000, // 5 min
            ...config
        };
        this.persistentIds = this.#config.persistentIds;
    }
    get whenReady() {
        return this.#ready.promise;
    }
    setDebug(enabled) {
        logger_1.default.setDebug(enabled);
    }
    onNotification(listener) {
        return this.on('ON_MESSAGE_RECEIVED', listener);
    }
    onCredentialsChanged(listener) {
        return this.on('ON_CREDENTIALS_CHANGE', listener);
    }
    onReady(listener) {
        return this.on('ON_READY', listener);
    }
    connect = async () => {
        if (this.#socket)
            return;
        await this.registerIfNeeded();
        logger_1.default.debug('connect');
        this.#lastStreamIdReported = -1;
        this.#socket = new tls_1.default.TLSSocket(null);
        this.#socket.setKeepAlive(true);
        this.#socket.on('connect', () => this.#handleSocketConnect());
        this.#socket.on('close', () => this.#handleSocketClose());
        this.#socket.on('error', (err) => this.#handleSocketError(err));
        this.#socket.connect({ host: HOST, port: PORT });
        this.#parser = new parser_1.default(this.#socket);
        this.#parser.on('message', (data) => this.#handleMessage(data));
        this.#parser.on('error', (err) => this.#handleParserError(err));
        this.#sendLogin();
        return new Promise((res) => {
            const dispose = this.onReady(() => {
                dispose();
                res();
            });
        });
    };
    destroy = () => {
        this.#clearReady();
        clearTimeout(this.#retryTimeout);
        this.#clearHeartbeat();
        if (this.#socket) {
            this.#socket.removeAllListeners();
            this.#socket.destroy();
            this.#socket = null;
        }
        if (this.#parser) {
            this.#parser.destroy();
            this.#parser = null;
        }
    };
    get #configMetaData() {
        return {
            bundleId: this.#config.bundleId,
            projectId: this.#config.firebase.projectId,
            vapidKey: this.#config.vapidKey
        };
    }
    checkCredentials(credentials) {
        // Structure check
        if (!credentials)
            return false;
        if (!credentials.fcm || !credentials.gcm || !credentials.keys)
            return false;
        if (!credentials.fcm.installation)
            return false;
        if (!credentials.config)
            return false;
        // Config data
        if (JSON.stringify(credentials.config) !== JSON.stringify(this.#configMetaData))
            return false;
        return true;
    }
    async registerIfNeeded() {
        if (this.checkCredentials(this.#config.credentials)) {
            await (0, gcm_1.checkIn)(this.#config);
            return this.#config.credentials;
        }
        const keys = await (0, keys_1.default)();
        const gcm = await (0, gcm_1.default)(this.#config);
        const fcm = await (0, fcm_1.default)(gcm, keys, this.#config);
        const credentials = {
            keys,
            gcm,
            fcm,
            config: this.#configMetaData,
        };
        this.emit('ON_CREDENTIALS_CHANGE', {
            oldCredentials: this.#config.credentials,
            newCredentials: credentials
        });
        this.#config.credentials = credentials;
        logger_1.default.debug('got credentials', credentials);
        return this.#config.credentials;
    }
    #clearReady() {
        if (!this.#ready.isResolved) {
            this.#ready.reject(new Error('Client destroyed'));
        }
        this.#ready = (0, defer_1.default)();
    }
    #clearHeartbeat() {
        clearTimeout(this.#heartbeatTimer);
        this.#heartbeatTimer = undefined;
        clearTimeout(this.#heartbeatTimeout);
        this.#heartbeatTimeout = undefined;
    }
    #startHeartbeat() {
        this.#clearHeartbeat();
        if (!this.#config.heartbeatIntervalMs)
            return;
        this.#heartbeatTimer = setTimeout(() => this.#sendHeartbeatPing(), this.#config.heartbeatIntervalMs);
        this.#heartbeatTimeout = setTimeout(() => this.#socketRetry(), this.#config.heartbeatIntervalMs * 2);
    }
    #handleSocketConnect = () => {
        this.#retryCount = 0;
        this.emit('ON_CONNECT');
        this.#startHeartbeat();
    };
    #handleSocketClose = () => {
        this.emit('ON_DISCONNECT');
        this.#clearHeartbeat();
        this.#socketRetry();
    };
    #handleSocketError = (err) => {
        logger_1.default.error(err);
        // ignore, the close handler takes care of retry
    };
    #socketRetry() {
        this.destroy();
        const timeout = Math.min(++this.#retryCount, MAX_RETRY_TIMEOUT) * 1000;
        this.#retryTimeout = setTimeout(() => this.connect(), timeout);
    }
    #getStreamId() {
        this.#lastStreamIdReported = this.#streamId;
        return this.#streamId;
    }
    #newStreamIdAvailable() {
        return this.#lastStreamIdReported != this.#streamId;
    }
    #sendHeartbeatPing() {
        const heartbeatPingRequest = {};
        if (this.#newStreamIdAvailable()) {
            heartbeatPingRequest.last_stream_id_received = this.#getStreamId();
        }
        logger_1.default.debug('Heartbeat send pong', heartbeatPingRequest);
        const HeartbeatPingRequestType = protos_1.default.mcs_proto.HeartbeatPing;
        const errorMessage = HeartbeatPingRequestType.verify(heartbeatPingRequest);
        if (errorMessage) {
            throw new Error(errorMessage);
        }
        const buffer = HeartbeatPingRequestType.encodeDelimited(heartbeatPingRequest).finish();
        logger_1.default.debug('HEARTBEAT sending PING', heartbeatPingRequest);
        this.#socket.write(Buffer.concat([
            Buffer.from([constants_1.MCSProtoTag.kHeartbeatPingTag]),
            buffer,
        ]));
    }
    #sendHeartbeatPong(object) {
        const heartbeatAckRequest = {};
        if (this.#newStreamIdAvailable()) {
            heartbeatAckRequest.last_stream_id_received = this.#getStreamId();
        }
        if (object?.status) {
            heartbeatAckRequest.status = object.status;
        }
        logger_1.default.debug('Heartbeat send pong', heartbeatAckRequest);
        const HeartbeatAckRequestType = protos_1.default.mcs_proto.HeartbeatAck;
        const errorMessage = HeartbeatAckRequestType.verify(heartbeatAckRequest);
        if (errorMessage) {
            throw new Error(errorMessage);
        }
        const buffer = HeartbeatAckRequestType.encodeDelimited(heartbeatAckRequest).finish();
        logger_1.default.debug('HEARTBEAT sending PONG', heartbeatAckRequest);
        this.#socket.write(Buffer.concat([
            Buffer.from([constants_1.MCSProtoTag.kHeartbeatAckTag]),
            buffer
        ]));
    }
    #sendLogin() {
        const gcm = this.#config.credentials.gcm;
        const LoginRequestType = protos_1.default.mcs_proto.LoginRequest;
        const hexAndroidId = long_1.default.fromString(gcm.androidId).toString(16);
        const loginRequest = {
            adaptiveHeartbeat: false,
            authService: 2,
            authToken: gcm.securityToken,
            id: `chrome-${this.#config.chromeVersion}`,
            domain: 'mcs.android.com',
            deviceId: `android-${hexAndroidId}`,
            networkType: 1,
            resource: gcm.androidId,
            user: gcm.androidId,
            useRmq2: true,
            setting: [{ name: 'new_vc', value: '1' }],
            clientEvent: [],
            // Id of the last notification received
            receivedPersistentId: this.#config.persistentIds,
        };
        if (this.#config.heartbeatIntervalMs) {
            loginRequest.heartbeatStat = {
                ip: '',
                timeout: true,
                intervalMs: this.#config.heartbeatIntervalMs,
            };
        }
        const errorMessage = LoginRequestType.verify(loginRequest);
        if (errorMessage) {
            throw new Error(errorMessage);
        }
        const buffer = LoginRequestType.encodeDelimited(loginRequest).finish();
        this.#socket.write(Buffer.concat([
            Buffer.from([constants_1.Variables.kMCSVersion, constants_1.MCSProtoTag.kLoginRequestTag]),
            buffer,
        ]));
    }
    #handleMessage = ({ tag, object }) => {
        // any message will reset the client side heartbeat timeout.
        this.#startHeartbeat();
        switch (tag) {
            case constants_1.MCSProtoTag.kLoginResponseTag:
                // clear persistent ids, as we just sent them to the server while logging in
                this.#config.persistentIds = [];
                this.emit('ON_READY');
                this.#startHeartbeat();
                this.#ready.resolve();
                break;
            case constants_1.MCSProtoTag.kDataMessageStanzaTag:
                this.#handleDataMessage(object);
                break;
            case constants_1.MCSProtoTag.kHeartbeatPingTag:
                this.emit('ON_HEARTBEAT');
                logger_1.default.debug('HEARTBEAT PING', object);
                this.#sendHeartbeatPong(object);
                break;
            case constants_1.MCSProtoTag.kHeartbeatAckTag:
                this.emit('ON_HEARTBEAT');
                logger_1.default.debug('HEARTBEAT PONG', object);
                break;
            case constants_1.MCSProtoTag.kCloseTag:
                logger_1.default.debug('Close: Server requested close! message: ', JSON.stringify(object));
                this.#handleSocketClose();
                break;
            case constants_1.MCSProtoTag.kLoginRequestTag:
                logger_1.default.debug('Login request: message: ', JSON.stringify(object));
                break;
            case constants_1.MCSProtoTag.kIqStanzaTag:
                logger_1.default.debug('IqStanza: ', JSON.stringify(object));
                // FIXME: If anyone knows what is this and how to respond, please let me know
                break;
            default:
                logger_1.default.error('Unknown message: ', JSON.stringify(object));
                return;
            // no default
        }
        this.#streamId++;
    };
    #handleDataMessage = (object) => {
        if (this.persistentIds.includes(object.persistentId)) {
            return;
        }
        let message;
        try {
            message = (0, decrypt_1.default)(object, this.#config.credentials.keys);
        }
        catch (error) {
            switch (true) {
                case error.message.includes('Unsupported state or unable to authenticate data'):
                case error.message.includes('crypto-key is missing'):
                case error.message.includes('salt is missing'):
                    // NOTE(ibash) Periodically we're unable to decrypt notifications. In
                    // all cases we've been able to receive future notifications using the
                    // same keys. So, we silently drop this notification.
                    logger_1.default.warn('Message dropped as it could not be decrypted: ' + error.message);
                    return;
                default:
                    throw error;
            }
        }
        // Maintain persistentIds updated with the very last received value
        this.persistentIds.push(object.persistentId);
        // Send notification
        this.emit('ON_MESSAGE_RECEIVED', {
            message,
            // Needs to be saved by the client
            persistentId: object.persistentId,
        });
    };
    #handleParserError = (error) => {
        logger_1.default.error(error);
        this.#socketRetry();
    };
}
exports.default = PushReceiver;
exports.PushReceiver = PushReceiver;
//# sourceMappingURL=client.js.map