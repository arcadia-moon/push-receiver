"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getEndpoint = void 0;
exports.default = requestWithRety;
const timeout_1 = __importDefault(require("./timeout"));
const logger_1 = __importDefault(require("./logger"));
// In seconds
const MAX_RETRY_TIMEOUT = 15;
// Step in seconds
const RETRY_STEP = 5;
function requestWithRety(url, options, maxRetries = 3) {
    return retry(0, url, options, maxRetries);
}
async function retry(retryCount = 0, url, options, maxRetries = 3) {
    try {
        return await fetch(url, options)
            .then(async (response) => {
            if (response.ok)
                return response;
            // Response not ok. This means server responded but with an error. We retry with increased retry count
            const timeout = Math.min(retryCount * RETRY_STEP, MAX_RETRY_TIMEOUT);
            logger_1.default.debug(`Request failed : ${response.statusText}`);
            logger_1.default.debug(`Retrying in ${timeout} seconds`);
            if (retryCount >= maxRetries)
                throw response.statusText;
            await (0, timeout_1.default)(timeout * 1000);
            return retry(retryCount + 1, url, options);
        });
    }
    catch (error) {
        logger_1.default.debug('Request failed with network error. Wait 10s and retry');
        // Fetch throws only for network errors. In that case we wait a bit and retry without increasing the count
        await (0, timeout_1.default)(10_000); // 10 seconds
        return retry(retryCount, url, options);
    }
}
const getEndpoint = (config, baseUrl, path = '') => (`${baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`}projects/${config.firebase.projectId}/${path}`);
exports.getEndpoint = getEndpoint;
//# sourceMappingURL=request.js.map