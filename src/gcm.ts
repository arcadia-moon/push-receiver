import Long from 'long'
import { randomUUID } from 'crypto'
import request from './utils/request'
import delay from './utils/timeout'
import Protos from './protos'
import Logger from './utils/logger'

import type * as Types from './types'

const REGISTER_URL = 'https://android.clients.google.com/c2dm/register3'
const CHECKIN_URL = 'https://android.clients.google.com/checkin'

// 디바이스 타입에 따른 앱 ID 매핑
const APP_IDS = {
    chrome: 'com.chrome.macosx',
    android: 'com.google.android.gms',
    ios: 'com.google.ios.youtube',
    chrome_os: 'com.chrome.os'
}

// 디바이스 타입에 따른 플랫폼 매핑 (ChromeBuildProto.Platform)
const PLATFORMS = {
    chrome: 2, // PLATFORM_MAC
    android: 6, // PLATFORM_ANDROID
    ios: 5, // PLATFORM_IOS
    chrome_os: 4 // PLATFORM_CROS
}

// 디바이스 타입에 따른 디바이스 타입 매핑 (DeviceType)
const DEVICE_TYPES = {
    chrome: 3, // DEVICE_CHROME_BROWSER
    android: 1, // DEVICE_ANDROID_OS
    ios: 2, // DEVICE_IOS_OS
    chrome_os: 4 // DEVICE_CHROME_OS
}

export default async (config: Types.ClientConfig): Promise<Types.GcmData> => {
    const options = await checkIn(config)
    const deviceType = config.deviceType || 'chrome'
    const appId = config.appId || APP_IDS[deviceType]
    
    const deleteCredentials = await doRegister(options, config, {
        delete: "true",
        scope: "*",
        'X-scope': "*",
        gmsv: 115,
        appId: makeid(11),
        sender: "*",
        deviceType
    })
    
    if(deleteCredentials.token === appId) {
        const credentials = await doRegister(options, config, {
            scope: "GCM",
            "X-scope": "GCM",
            appId: makeid(11),
            gmsv: 115,
            deviceType
        });
        return credentials;
    }
    else {
        throw `DELETE CREDENTIALS ERROR: Expected token ${appId}, got ${deleteCredentials.token}`
    }
}

export async function checkIn(config: Types.ClientConfig): Promise<Types.GcmData> {
    const body = await request<ArrayBuffer>({
        ...config.axiosConfig,
        url: CHECKIN_URL,
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-protobuf',
        },
        data: prepareCheckinBuffer(config),
        responseType: 'arraybuffer',
    })

    const AndroidCheckinResponse = Protos.checkin_proto.AndroidCheckinResponse
    const message = AndroidCheckinResponse.decode(new Uint8Array(body))
    const object = AndroidCheckinResponse.toObject(message, {
        longs: String,
        enums: String,
        bytes: String,
    })

    return {
        androidId: object.androidId,
        securityToken: object.securityToken,
    }
}

async function doRegister({ androidId, securityToken }: Types.GcmData, config: Types.ClientConfig, _body: any): Promise<Types.GcmData> {
    const subType = `wp:${config.bundleId}#${randomUUID()}-V2`
    const deviceType = _body.deviceType || config.deviceType || 'chrome'
    const appId = config.appId || APP_IDS[deviceType]

    const body = (new URLSearchParams({
        app: appId,
        'X-subtype': subType,
        device: androidId,
        sender: config.vapidKey,
        ..._body
    })).toString()

    const response = await postRegister({ androidId, securityToken, body, axiosConfig: config.axiosConfig })
    const token = response.split('=')[1]

    return {
        token,
        androidId,
        securityToken,
        appId: _body["appId"],
        subType
    }
}


async function postRegister({ androidId, securityToken, body, retry = 0, axiosConfig }: {
    androidId: Types.GcmData['androidId']
    securityToken: Types.GcmData['securityToken']
    body: string
    retry?: number
    axiosConfig: Types.ClientConfig['axiosConfig']
}): Promise<string> {
    const response = await request<string>({
        ...axiosConfig,
        url: REGISTER_URL,
        method: 'POST',
        headers: {
            Authorization: `AidLogin ${androidId}:${securityToken}`,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        data: body,
    })

    if (response.includes('Error')) {
        Logger.warn(`Register request has failed with ${response}`)
        if (retry >= 5) {
            throw new Error('GCM register has failed')
        }

        Logger.warn(`Retry... ${retry + 1}`)
        await delay(1000)
        return postRegister({ androidId, securityToken, body, retry: retry + 1, axiosConfig })
    }

    return response
}

function prepareCheckinBuffer(config: Types.ClientConfig) {
    const gcm = config.credentials?.gcm
    const deviceType = config.deviceType || 'chrome'
    const platform = PLATFORMS[deviceType]
    const type = DEVICE_TYPES[deviceType]
    
    const AndroidCheckinRequest = Protos.checkin_proto.AndroidCheckinRequest

    const payload = {
        userSerialNumber: 0,
        checkin: {
            type: type,
            chromeBuild: {
                platform: platform,
                chromeVersion: '115.0.5790.170',
                channel: 1,
            },
        },
        version: 3,
        id: gcm?.androidId ? Long.fromString(gcm.androidId) : undefined,
        securityToken: gcm?.securityToken ? Long.fromString(gcm?.securityToken, true) : undefined,
    }

    const errMsg = AndroidCheckinRequest.verify(payload)
    if (errMsg) throw Error(errMsg)

    const message = AndroidCheckinRequest.create(payload)
    return AndroidCheckinRequest.encode(message).finish()
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
}