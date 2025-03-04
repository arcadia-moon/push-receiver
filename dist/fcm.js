"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const crypto_1 = __importDefault(require("crypto"));
const request_1 = __importDefault(require("./utils/request"));
const base64_1 = require("./utils/base64");
const FCM_SUBSCRIBE = 'https://fcm.googleapis.com/fcm/connect/subscribe';
const FCM_ENDPOINT = 'https://fcm.googleapis.com/fcm/send';
async function registerFCM(gcm, config) {
    const keys = await createKeys();
    if (!config.skipFcmRegistration) {
        // URL 안전한 base64 문자열로 변환
        const publicKey = (0, base64_1.escape)(keys.publicKey);
        const authSecret = (0, base64_1.escape)(keys.authSecret);
        const response = await (0, request_1.default)({
            ...config.axiosConfig,
            url: FCM_SUBSCRIBE,
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            data: (new URLSearchParams({
                authorized_entity: config.senderId,
                endpoint: `${FCM_ENDPOINT}/${gcm.token}`,
                encryption_key: publicKey,
                encryption_auth: authSecret,
            })).toString(),
        });
        return {
            gcm,
            keys,
            fcm: response,
        };
    }
    else {
        return {
            gcm,
            keys,
            fcm: {
                token: '',
                pushSet: ''
            },
        };
    }
}
exports.default = registerFCM;
function createKeys() {
    return new Promise((resolve, reject) => {
        const dh = crypto_1.default.createECDH('prime256v1');
        dh.generateKeys();
        crypto_1.default.randomBytes(16, (err, buf) => {
            if (err) {
                return reject(err);
            }
            return resolve({
                privateKey: (0, base64_1.escape)(dh.getPrivateKey('base64')),
                publicKey: (0, base64_1.escape)(dh.getPublicKey('base64')),
                authSecret: (0, base64_1.escape)(buf.toString('base64')),
            });
        });
    });
}
//# sourceMappingURL=fcm.js.map