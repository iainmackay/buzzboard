const { getArgs } = require("./utils");
const startFrontendDevServer = require("./server-frontend-dev");
const startBackendServer = require("./server-backend");

const SERVER_MODES = {
    PRODUCTION: 1,
    DEVELOPMENT: 2,
};

const config = require("./config/config");
const frontendPort = config.frontend.port;
const backendPort = config.backend.port;

const args = getArgs();

if (typeof args.mode === "undefined") {
    // default to production mode
    args.mode = "production";
}

if (args.mode !== "production" && args.mode !== "development") {
    throw new Error("--mode can only be 'development' or 'production'");
}

const server_mode = args.mode === "production" ? SERVER_MODES.PRODUCTION : SERVER_MODES.DEVELOPMENT;

if (server_mode === SERVER_MODES.DEVELOPMENT) {
    console.info("Starting server in development mode.");
    startFrontendDevServer(frontendPort);
    // this time, front and back end are on separate ports
    // requests for the backend will be proxied to prevent cross origins errors
    startBackendServer(backendPort);
} else {
    console.info("Starting server in production mode.");
    startBackendServer(frontendPort);
}
