// Homebridge plugin for SkyBell HD video doorbells
// Copyright © 2017 Alexander Thoukydides

'use strict';

let http = require('http');
let url = require('url');

// Default options
const DEFAULT_OPTIONS = {
    log:                console.log,

    // Base of all URL paths
    basePath:          '/homebridge-skybell/',
    
    // An optional secret that must be included in all requests
    secret:             null,

    // Maximum allowed payload size (in bytes)
    maxPayload:         10 * 1000
};

// A webhooks server
module.exports = class Webhooks {

    // Create a new webhooks server
    constructor(port, options = {}) {
        // Store the options, applying defaults for missing options
        this.options = Object.assign({}, DEFAULT_OPTIONS, options);

        // No clients initially
        this.clients = {};
        
        // Create a web server on the specified port
        this.server = http.createServer(this.requestListener.bind(this));
        this.server.on('error', (err) => {
            this.options.log('Webhooks server error: ' + err);
        });
        this.server.listen(port, () => {
            this.options.log('Webhooks listening on http://localhost:' + port
                             + this.options.basePath + '...');
        });
        this.requestCount = 0;
    }

    // Handle a new incoming HTTP request
    requestListener(request, response) {
        let logPrefix = 'Webhook request #' + ++this.requestCount + ': ';
        this.options.log(logPrefix + request.method + ' ' + request.url);

        // Complete a request
        let setStatusCode = statusCode => {
            this.options.log(logPrefix + 'STATUS ' + statusCode
                             + ' (' + http.STATUS_CODES[statusCode] + ')');
            response.statusCode = statusCode;
            response.end();
        };

        // Check whether the method and URL are acceptable
        if (request.method != 'POST') {
            this.options.log(logPrefix + 'Not using POST method');
            return setStatusCode(405);
        }
        let parsedUrl = this.parseUrl(request.url);
        if (!parsedUrl) {
            this.options.log(logPrefix + 'No handler registered for URL');
            return setStatusCode(404);
        }

        // Receive the body of the request
        let body = '';
        request.on('data', (chunk) => {
            body += chunk;
            if (this.options.maxPayload < body.length) {
                this.options.log(logPrefix + 'Payload exceeds maximum size ('
                                 + this.options.maxPayload + ' bytes)');
                request.destroy();
                setStatusCode(413);
            }
        });
        request.on('end', () => {
            // Attempt to parse the body as JSON encoded
            let parsedBody;
            try {
                parsedBody = JSON.parse(body);
            }
            catch (err) {
                this.options.log(logPrefix + 'Body not JSON encoded: ' + err);
                return setStatusCode(400);
            }

            // Check whether the request is authorised
            if (!this.isAuthorised(parsedBody)) {
                this.options.log(logPrefix + 'Secret not included in request');
                return setStatusCode(403);
            }

            // Process the request
            this.options.log(logPrefix + 'Dispatching '
                             + JSON.stringify(parsedBody));
            this.dispatchRequest(parsedUrl, parsedBody);
            setStatusCode(200);
        });
    }

    // Check whether a request is authorised
    isAuthorised(body) {
        return (this.options.secret == null)
               || (body.secret == this.options.secret);
    }

    // Add a webhook for a specific URL path and body values
    addHook(path, body, callback) {
        let keyMap = key => key + "='" + body[key] + "'";
        this.options.log('Adding webhook ' + this.options.basePath + path
                         + ' for ' + Object.keys(body).map(keyMap).join(', '));
        if (!this.clients[path]) this.clients[path] = [];
        this.clients[path].push({
            body:     body,
            callback: callback
        });
    }

    // Parse and check a received URL
    parseUrl(rawUrl) {
        // Check the base of the path
        let path = url.parse(rawUrl).pathname;
        if (!path.startsWith(this.options.basePath)) {
            return null;
        }

        // Check whether there are any clients for this path
        let remain = path.substr(this.options.basePath.length);
        return this.clients[remain];
    }

    // Dispatch a request to the appropriate client(s)
    dispatchRequest(clients, body) {
        let count = 0;
        clients.forEach(client => {
            let match = client.body;
            if (Object.keys(match).every(key => body[key] == match[key])) {
                ++count;
                client.callback(body);
            }
        });
        this.options.log('Webhook request dispatched to ' + count
                         + ((count == 1) ? ' client' : ' clients'));
    }
};



