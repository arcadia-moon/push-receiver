"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const axios_1 = __importDefault(require("axios"));
const timeout_1 = __importDefault(require("./timeout"));
const logger_1 = __importDefault(require("./logger"));
// In seconds
const MAX_RETRY_TIMEOUT = 15;
// Step in seconds
const RETRY_STEP = 5;
function requestWithRety(options) {
    return retry(0, options);
}
exports.default = requestWithRety;
async function retry(retryCount = 0, options) {
    try {
        const response = await (0, axios_1.default)(options);
        return response.data;
    }
    catch (e) {
        const timeout = Math.min(retryCount * RETRY_STEP, MAX_RETRY_TIMEOUT);
        logger_1.default.verbose(`Request failed : ${e.message}`);
        logger_1.default.verbose(`Retrying in ${timeout} seconds`);
        await (0, timeout_1.default)(timeout * 1000);
        return retry(retryCount + 1, options);
    }
}
//# sourceMappingURL=request.js.map