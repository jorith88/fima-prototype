let FIMA = require('./fima.js');
const btoa = require('btoa');
const atob = require('atob');
const Client = require('node-rest-client').Client;

/**
 * PDM API endpoint implementations.
 */
let API = module.exports = function(app, wsApp, web3, contractsRegistry) {
    this.wsByIdentity = {};

    var stubs = require('./api-stubs.js');
    var self = this;

    // Send anti-caching headers for all API endpoints
    app.get('/api/v1/*', function(req, res, next) {
        res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.set('Pragma', 'no-cache');
        res.set('Expires', '0');
        next();
    });

    // API: retrieve available fields
    app.get('/api/v1/fields', function(req, res) {
        var response = stubs.getFields();
        res.json(response);
    });

    // API: retrieve identity attributes
    app.get('/api/v1/identity/:identityId/attributes', function(req, res) {
        var identityId = req.params.identityId;

        var response = stubs.getAttributesForIdentity(identityId);

        res.json(response);
    });

    // API: retrieve identity authorizations
    app.get('/api/v1/identity/:identityId/authorizations', function(req, res) {
        var identityId = req.params.identityId;

        var response = stubs.getAuthorizationsForIdentity(identityId);

        res.json(response);
    });

    // API: events websocket
    wsApp.ws('/api/v1/identity/:identityId/events', function(ws, req) {
        var identityId = req.params.identityId + '';
        console.log('New webservice connection for identity: ' + identityId);
        self.wsByIdentity[identityId] = ws;
    });

    // API: retrieve identity requests
    app.get('/api/v1/identity/:identityId/requests', function(req, res) {
        var identityId = req.params.identityId;

        var response = stubs.getRequestsForIdentity(identityId);

        res.json(response);
    });

    // API: confirm request
    app.post('/api/v1/identity/:identityId/requests/:requestId/confirm', function(req, res) {
        var identityId = req.params.identityId;
        var requestId = req.params.requestId;

        var request = stubs.getRequestById(requestId);
        var response = stubs.confirmRequest(identityId, request.requestId);

        // TODO work in progress
        const subsnap = {
            foo: 'bar'
        };

        self.saveSubsnap(subsnap).then(subsnapID => {
            // TODO Make account address configurable
            var accountAddress = '0x0067af5b87da32b14ff58af203cf3d4684319c5c';

            // Put the authorization on the blockchain
            var fima = new FIMA(accountAddress, web3);
            var authContract = fima.getAuthorizationTrackerContract(contractsRegistry.authorizationTracker.address);

            var granter = fima.numberToBytes32(identityId);
            var grantee = fima.numberToBytes32(request.askIdentity.identityId);

            authContract.authorize(granter, grantee, subsnapID);

            res.json(response);
        });
    });

    // API: create request for authorization
    app.post('/api/v1/requests', function(req, res) {
        var askIdentityId = req.body.askIdentityId;
        var targetIdentityId = req.body.targetIdentityId;
        var requestFields = req.body.requestFields;

        var response = stubs.createRequest(askIdentityId, targetIdentityId, requestFields);

        // Notify target
        self.sendWebsocketMessage(targetIdentityId, 'RequestCreated');

        res.json(response);
    });

    // API: reset prototype scenario state
    app.post('/api/v1/stubs/reset', function(req, res) {
        var response = stubs.reset();
        res.json(response);
    });
};

API.prototype.sendWebsocketMessage = function(identityId, message) {
    identityId += '';

    if (identityId in this.wsByIdentity) {
        console.log('Notifying identity ' + identityId + ' via WS');
        this.wsByIdentity[identityId].send(message);
    }
};

API.prototype.saveSubsnap = function(data) {
    return new Promise(function(resolve, reject) {
        const client = new Client();

        const requestArgs = {
            data: {
                data: btoa(JSON.stringify(data))
            },
            headers: {
                'Content-Type': 'application/json'
            }
        };

        client.post('http://datastore-api:8080/subsnap', requestArgs, function(data) {
            resolve(data.subsnapID);
        }).on('error', function (err) {
            reject(err);
        });
    });
};
