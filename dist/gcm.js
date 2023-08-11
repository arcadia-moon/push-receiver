"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkIn = void 0;
const long_1 = __importDefault(require("long"));
const crypto_1 = require("crypto");
const request_1 = __importDefault(require("./utils/request"));
const timeout_1 = __importDefault(require("./utils/timeout"));
const protos_1 = __importDefault(require("./protos"));
const logger_1 = __importDefault(require("./utils/logger"));
const REGISTER_URL = 'https://android.clients.google.com/c2dm/register3';
const CHECKIN_URL = 'https://android.clients.google.com/checkin';
exports.default = async (config) => {
    const options = await checkIn(config);
    const deleteCredentials = await doRegister(options, config, {
        delete: "true",
        scope: "*",
        'X-scope': "*",
        gmsv: 115,
        appId: makeid(11),
        sender: "*"
    });
    if (deleteCredentials.token === "com.chrome.macosx") {
        const credentials = await doRegister(options, config, {
            scope: "GCM",
            "X-scope": "GCM",
            appId: makeid(11),
            gmsv: 115
        });
        return credentials;
    }
    else {
        throw "DELETE CREDENTIALS ERROR";
    }
};
async function checkIn(config) {
    const body = await (0, request_1.default)({
        ...config.axiosConfig,
        url: CHECKIN_URL,
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-protobuf',
        },
        data: prepareCheckinBuffer(config),
        responseType: 'arraybuffer',
    });
    const AndroidCheckinResponse = protos_1.default.checkin_proto.AndroidCheckinResponse;
    const message = AndroidCheckinResponse.decode(new Uint8Array(body));
    const object = AndroidCheckinResponse.toObject(message, {
        longs: String,
        enums: String,
        bytes: String,
    });
    return {
        androidId: object.androidId,
        securityToken: object.securityToken,
    };
}
exports.checkIn = checkIn;
async function doRegister({ androidId, securityToken }, config, _body) {
    const subType = `wp:${config.bundleId}#${(0, crypto_1.randomUUID)()}-V2`;
    const body = (new URLSearchParams({
        app: 'org.chrome.macosx',
        'X-subtype': subType,
        device: androidId,
        sender: config.vapidKey,
        ..._body
    })).toString();
    const response = await postRegister({ androidId, securityToken, body, axiosConfig: config.axiosConfig });
    const token = response.split('=')[1];
    return {
        token,
        androidId,
        securityToken,
        appId: _body["appId"],
        subType
    };
}
async function postRegister({ androidId, securityToken, body, retry = 0, axiosConfig }) {
    const response = await (0, request_1.default)({
        ...axiosConfig,
        url: REGISTER_URL,
        method: 'POST',
        headers: {
            Authorization: `AidLogin ${androidId}:${securityToken}`,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        data: body,
    });
    if (response.includes('Error')) {
        logger_1.default.warn(`Register request has failed with ${response}`);
        if (retry >= 5) {
            throw new Error('GCM register has failed');
        }
        logger_1.default.warn(`Retry... ${retry + 1}`);
        await (0, timeout_1.default)(1000);
        return postRegister({ androidId, securityToken, body, retry: retry + 1, axiosConfig });
    }
    return response;
}
function prepareCheckinBuffer(config) {
    const gcm = config.credentials?.gcm;
    const AndroidCheckinRequest = protos_1.default.checkin_proto.AndroidCheckinRequest;
    const payload = {
        userSerialNumber: 0,
        checkin: {
            type: 3,
            chromeBuild: {
                platform: 3,
                chromeVersion: '115.0.5790.170',
                channel: 1,
            },
        },
        version: 3,
        id: gcm?.androidId ? long_1.default.fromString(gcm.androidId) : undefined,
        securityToken: gcm?.securityToken ? long_1.default.fromString(gcm?.securityToken, true) : undefined,
    };
    const errMsg = AndroidCheckinRequest.verify(payload);
    if (errMsg)
        throw Error(errMsg);
    const message = AndroidCheckinRequest.create(payload);
    return AndroidCheckinRequest.encode(message).finish();
}
const makeid = (length) => {
    let result = '';
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const charactersLength = characters.length;
    let counter = 0;
    while (counter < length) {
        result += characters.charAt(Math.floor(Math.random() * charactersLength));
        counter += 1;
    }
    return result;
};
//# sourceMappingURL=gcm.js.map