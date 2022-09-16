import { APIGatewayEvent, Context } from 'aws-lambda';
import { patchConsole } from "./trace/patch-console";

patchConsole(console);
const originalHandler = require(process.env.PROJECT_PATH);

export function handler(event: APIGatewayEvent, context: Context, callback: any) {
    const result = originalHandler.handler(event, context);
    return result;
}