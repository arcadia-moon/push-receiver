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
exports.installFCM = installFCM;
exports.registerFCM = registerFCM;
exports.default = register;
const crypto_1 = __importDefault(require("crypto"));
const request_1 = __importStar(require("./utils/request"));
const FCM_API = 'https://fcm.googleapis.com/';
const FCM_REGISTRATION = 'https://fcmregistrations.googleapis.com/v1/';
const FCM_INSTALLATION = 'https://firebaseinstallations.googleapis.com/v1/';
const AUTH_VERSION = 'FIS_v2';
const SDK_VERSION = 'w:0.6.6';
// TODO: FIXME it is optional to send it but better to implement proper heatbeat in the future
const getEmptyHeatbeat = () => btoa(JSON.stringify({ heartbeats: [], version: 2 })).toString();
function generateFirebaseFID() {
    // A valid FID has exactly 22 base64 characters, which is 132 bits, or 16.5
    // bytes. our implementation generates a 17 byte array instead.
    const fid = crypto_1.default.randomBytes(17);
    // Replace the first 4 random bits with the constant FID header of 0b0111.
    fid[0] = 0b01110000 + (fid[0] % 0b00010000);
    return fid.toString('base64');
}
function encodeBase64URL(value) {
    return String(value).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}
// TODO: Installation token expires after 7 days. It should be refreshed but requests are failing (404)
// export async function refreshFCMInstallationToken(fcmData: Types.FcmData, config: Types.ClientConfig) {
//     const response = await request(getEndpoint(config, FCM_INSTALLATION, `${fcmData.fid}/authTokens:generate`), {
//         method: 'POST',
//         headers: new Headers({
//             Authorization: `${AUTH_VERSION} ${fcmData.refreshToken}`,
//             'x-firebase-client': getEmptyHeatbeat(),
//         }),
//         body: JSON.stringify({
//             installation: {
//                 sdkVersion: SDK_VERSION,
//                 appId: config.firebase.appId,
//             }
//         })
//     })
//     const data = await response.json()
//     return data
// }
async function installFCM(config) {
    const response = await (0, request_1.default)((0, request_1.getEndpoint)(config, FCM_INSTALLATION, 'installations'), {
        method: 'POST',
        headers: {
            'x-firebase-client': getEmptyHeatbeat(),
            'x-goog-api-key': config.firebase.apiKey
        },
        body: JSON.stringify({
            appId: config.firebase.appId,
            authVersion: AUTH_VERSION,
            fid: generateFirebaseFID(),
            sdkVersion: SDK_VERSION
        }),
    });
    const data = await response.json();
    return {
        token: data.authToken.token,
        createdAt: (new Date()).getTime(), // in ms
        expiresIn: Number.parseInt(data.authToken.expiresIn) * 1000, // in ms
        refreshToken: data.refreshToken,
        fid: data.fid,
    };
}
async function registerFCM(gcmData, installation, keys, config) {
    const requestOptions = {
        method: 'POST',
        headers: {
            'x-goog-api-key': config.firebase.apiKey,
            'x-goog-firebase-installations-auth': installation.token,
        },
        body: JSON.stringify({
            web: {
                // Include VAPID only if it's not default key, otherwise FCM registration will fail
                applicationPubKey: config.vapidKey || undefined,
                auth: encodeBase64URL(keys.authSecret),
                /**
                 * TODO
                 * Shouldn't endpoint be migrated to v1 too??? But official JS module still uses the old one...
                 * https://firebase.google.com/docs/cloud-messaging/migrate-v1
                 * Currently not working with
                 * Works - https://fcm.googleapis.com/fcm/send
                 * Does not work - https://fcm.googleapis.com/v1/projects/{projectId}/messages:send
                 */
                endpoint: `${FCM_API}fcm/send/${gcmData.token}`,
                p256dh: encodeBase64URL(keys.publicKey),
            }
        })
    };
    const response = await (0, request_1.default)((0, request_1.getEndpoint)(config, FCM_REGISTRATION, 'registrations'), requestOptions);
    const data = await response.json();
    if (data.error) {
        throw new Error('FCM registration failed... ' + data.error.message);
    }
    return data;
}
async function register(gcm, keys, config) {
    const installation = await installFCM(config);
    const registration = await registerFCM(gcm, installation, keys, config);
    return {
        token: registration.token,
        installation
    };
}
//# sourceMappingURL=fcm.js.map