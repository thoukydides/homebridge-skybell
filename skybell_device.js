// Homebridge plugin for SkyBell HD video doorbells
// Copyright © 2017 Alexander Thoukydides

'use strict';

let request = require('request');

// Default options
const DEFAULT_OPTIONS = {
    log:                    console.log,

    // Callback functions to be called for interesting events
    callbackInfo:           () => {},
    callbackSettings:       () => {},
    callbackButton:         () => {},
    callbackMotion:         () => {},

    // Interval between polling for changes (in seconds)
    intervalInfo:           5 * 60,
    intervalSettings:       60,
    intervalActivities:     5,

    // Maximum retries when starting a call
    callRetries:            5
};
const MS = 1000;

// A single SkyBell HD device
module.exports = class SkyBellDevice {

    // Create a new SkyBell device object
    constructor(api, device, options = {}) {
        // Store useful information about the device
        this.api      = api;
        this.deviceId = device.id;
        this.name     = device.name;

        // Store the options, applying defaults for missing options
        this.options = Object.assign({}, DEFAULT_OPTIONS, options);

        // Cache the initial device information
        this.cache = { device: device };

        // No alternative API identifiers initially
        this.apiById = {};

        // Start polling the device
        this.pollInfo();
        this.pollSettings();
        this.pollActivities();
    }

    // Modify the options
    setOptions(options) {
        Object.assign(this.options, options);
    }

    // Periodically poll the device's information
    pollInfo() {
        clearTimeout(this.timerPollInfo);
        this.api.getInfoByDevice(this.deviceId, (err, body) => {
            // Process the information
            if (err) {
                this.options.log("Failed to read SkyBell '" + this.name
                                 + "' device information: " + err);
            } else {
                this.newInfo(body);
            }
            
            // Poll again later
            this.timerPollInfo = setTimeout(() => this.pollInfo(),
                                              this.options.intervalInfo * MS);
        });
    }
    
    // Periodically poll the device's settings
    pollSettings() {
        clearTimeout(this.timerPollSettings);
        this.api.getSettingsByDevice(this.deviceId, (err, body) => {
            // Process the settings
            if (err) {
                this.options.log("Failed to read SkyBell '" + this.name
                                 + "' device settings: " + err);
            } else {
                this.newSettings(body);
            }

            // Poll again later
            this.timerPollSettings =
                setTimeout(() => this.pollSettings(),
                           this.options.intervalSettings * MS);
        });
    }
    
    // Periodically poll the device's activity log
    pollActivities() {
        clearTimeout(this.timerPollActivities);
        this.api.getActivitiesByDevice(this.deviceId, (err, body) => {
            // Process the activities
            if (err) {
                this.options.log("Failed to read SkyBell '" + this.name
                                 + "' device activities: " + err);
            } else {
                if (this.lastActivityId) {
                    // Find the first new activity
                    for (var i = 0; i < body.length; ++i) {
                        if (body[i].id == this.lastActivityId) break;
                    }
                    // Process the new activities from oldest to newest
                    while (i--) {
                        this.newActivity(body[i]);
                    }
                }
                this.lastActivityId = body.length ? body[0].id : 'none';
            }
            
            // Poll again later
            this.timerPollActivities =
                setTimeout(() => this.pollActivities(),
                           this.options.intervalActivities * MS);
        });
    }

    // Information has been read
    newInfo(info) {
        this.options.log("SkyBell '" + this.name + "' Wi-Fi status: "
                         + ' Quality='  + info.status.wifiLink
                         + ", SSID='"   + info.essid           + "'"
                         + ', RSSI='    + info.wifiSignalLevel + 'dBm'
                         + ', Noise='   + info.wifiNoise       + 'dBm'
                         + ', SNR='     + info.wifiSnr         + 'dB'
                         + ', Quality=' + info.wifiLinkQuality + '%'
                         + ', Rate='    + info.wifiBitrate     + 'Mbps)');
        this.cache.info = info;
        this.options.callbackInfo(info);
    }

    // Settings have been read
    newSettings(settings) {
        // do_not_disturb:     'true' (indoor chime disabled) | 'false'
        // chime_level:        0 (off) | 1 (low) | 2 (medium) | 3 (high)
        // green_r:            0-255
        // green_g:            0-255
        // green_b:            0-255
        // led_intensity:      0 (off) | 25 (low) | 62 (medium) | 100 (high)
        // motion_policy:      'disabled' | 'call'
        // motion_threshold:   100 (low) | 50 (medium) | 32 (high)
        // video_profile:      0 (1080p) | 1 (720p) | 2 (720p) | 3 (480p)
        // low_front_led_dac:  integer
        // med_front_led_dac:  integer
        // high_front_led_dac: integer
        // low_lux_threshold:  integer
        // med_lux_threshold:  integer
        // high_lux_threshold: integer
        // do_not_ring:        'true' | 'false'
        // ring_tone:          integer
        // mic_volume:         integer
        // speaker_volume:     integer
        // digital_doorbell:   'true' | 'false'
        this.cache.settings = settings;
        this.options.callbackSettings(settings);
    }

    // Change some settings
    updateSettings(settings, callback) {
        this.api.setSettingsByDevice(this.deviceId, settings, (err, body) => {
            if (err) {
                this.options.log("Failed to reconfigure SkyBell '" + this.name
                                 + "' " + JSON.stringify(settings)
                                 + ': ' + err);
            } else {
                Object.assign(this.cache.settings, settings);
            }
            callback(err);
        });
    }

    // A new activity has been detected
    newActivity(activity) {
        switch (activity.event) {
        case 'device:sensor:button':
            this.options.log("Button pressed on SkyBell '" + this.name + "'");
            this.options.callbackButton(activity);
            break;
            
        case 'device:sensor:motion':
            this.options.log("Motion detected by SkyBell '" + this.name + "'");
            this.options.callbackMotion(activity);
            break;
            
        case 'application:on-demand':
            this.options.log("On-demand activiation for SkyBell '"
                             + this.name + "'");
            break;
            
        default:
            this.options.log("Unknown activity event for SkyBell '"
                             + this.name + "': " + activity.event);
        }
    }

    // Obtain the URL for the video associated with an activity
    getVideoUrl(activity, callback) {
        this.api.getActivityVideoByDevice(this.deviceId, activity.id,
                                          (err, body) => {
            if (err) {
                this.options.log("Failed to retrieve video " + activity.id
                                 + " from SkyBell '" + this.name + "': " + err);
            }
            callback(err, body.url);
        });
    }
    
    // Obtain the current avatar
    getAvatar(callback) {
        this.api.getAvatarByDevice(this.deviceId, (err, body) => {
            if (err) {
                this.options.log("Failed to read SkyBell '" + this.name
                                 + "' avatar: " + err);
                callback(err);
            } else {
                // URL obtained, so download the actual avatar image
                let logPrefix = 'Avatar download: ';
                this.options.log(logPrefix + body.url);
                let startTime = Date.now();
                request({ url: body.url, encoding: null },
                        (err, response, image) => {
                    this.options.log(logPrefix
                                     + (err || response.statusMessage)
                                     + ' +' + (Date.now() - startTime) + 'ms ');
                    if (err) {
                        callback(err);
                    } else if (image) {
                        let type = 'jpg'; // (should extract from body.url)
                        callback(null, image, type);
                    } else {
                        callback(new Error('No avatar image retrieved'));
                    }
                });
            }
        });
    }

    // Start a call
    startCall(id, callback, attempt = 1) {
        this.getApiById(id).startCallByDevice(this.deviceId, (err, body) => {
            if (err && (attempt < this.options.callRetries)) {
                this.options.log("Retrying call to SkyBell '" + this.name
                                 + "' " + id + ': ' + err);
                return this.startCall(id, callback, attempt + 1);
            }
            if (err) {
                this.options.log("Failed to start call to SkyBell '" + this.name
                                 + "' " + id + ': ' + err);
            }
            callback(err, body);
        });
    }

    // End a call
    stopCall(id, callback) {
        this.getApiById(id).stopCallByDevice(this.deviceId, (err, body) => {
            if (err) {
                this.options.log("Failed to stop call to SkyBell '" + this.name
                                 + "' " + id + ': ' + err);
            }
            callback(err);
        });
    }

    // Obtain an API using specific identifiers
    getApiById(id) {
        if (!this.apiById[id]) this.apiById[id] = this.api.clone();
        return this.apiById[id];
    }
};
