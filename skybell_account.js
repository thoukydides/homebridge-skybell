// Homebridge plugin for SkyBell HD video doorbells
// Copyright © 2017 Alexander Thoukydides

'use strict';

let SkyBellAPI = require('./skybell_api');
let SkyBellDevice = require('./skybell_device');

// Default options
const DEFAULT_OPTIONS = {
    log:                console.log,

    // Callback functions to be called for interesting events
    callbackAdd:        () => {},
    callbackDiscovered: () => {},

    // Interval between polling for new devices (in seconds)
    intervalDevices:    5 * 60,
};
const MS = 1000;

// A SkyBell account
module.exports = class SkyBellAccount {

    // Create a new SkyBell account object
    constructor(user, pass, options = {}) {
        // Store the options, applying defaults for missing options
        this.options = Object.assign({}, DEFAULT_OPTIONS, options);
        
        // Create a SkyBell API object
        this.api = new SkyBellAPI(user, pass, this.options.log);

        // Start polling the list of devices
        this.skybellDevices = {};
        this.pollDevices();
    }

    // Modify the options
    setOptions(options) {
        Object.assign(this.options, options);
    }

    // Periodically poll the list of SkyBell devices
    pollDevices() {
        this.api.getDevices((err, body) => {
            // Process the list of devices
            if (err) {
                this.options.log('Unable to enumerate SkyBell devices: ' + err);
            } else {
                this.gotDevices(body);
            }

            // Poll again later
            setTimeout(() => this.pollDevices(),
                       this.options.intervalDevices * MS);
        });
    }

    // An updated list of SkyBell devices has been obtained
    gotDevices(devices) {
        // Add any new devices
        devices.forEach(device => {
            let deviceId = device.id;
            if (!this.skybellDevices[deviceId]) {
                this.skybellDevices[deviceId] = this.addDevice(device);
            }
        });
        
        // End of discovery, first time only
        if (!this.discoveryDone) {
            this.options.callbackDiscovered();
            this.discoveryDone = true;
        }
    }

    // A new SkyBell device has been found
    addDevice(device) {
        this.options.log("Discovered Skybell '" + device.name
                         + "': device_id=" + device.id);
        let skybellDevice = new SkyBellDevice(this.api, device, this.options);
        this.options.callbackAdd(skybellDevice);
        return skybellDevice;
    }
};
