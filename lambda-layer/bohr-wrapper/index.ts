import { APIGatewayEvent, Context } from 'aws-lambda';
import { patchConsole } from "./trace/patch-console";

patchConsole(console);
let PROJECT_PATH = process.env.PROJECT_PATH ? process.env.PROJECT_PATH : '/var/task/core.js';
const originalHandler = require(PROJECT_PATH);

export function handler(event: APIGatewayEvent, context: Context, callback: any) {
    const result = originalHandler.handler(event, context);
    return result;
}