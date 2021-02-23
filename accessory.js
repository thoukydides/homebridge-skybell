// Homebridge plugin for SkyBell HD video doorbells
// Copyright © 2017, 2018, 2020 Alexander Thoukydides

'use strict';

let SkyBellCameraStreamingDelegate = require('./camera');

let PlatformAccessory, CameraController;
let Accessory, Service, Characteristic, UUIDGen;
let VIDEO_DOORBELL, SINGLE_PRESS;

// Hard-coded characteristics
const MANUFACTURER = 'SkyBell Technologies, Inc.';
const TBD = '...';

// SkyBell only supports two concurrent calls
const MAX_STREAMS = 2;

// Length of time to signal motion (milliseconds)
const DURATION_MOTION = 10 * 1000;

// Length of time to ignore other sources when a trigger occurs (milliseconds)
const DURATION_SUPPRESS = 10 * 60 * 1000; // (10 minutes)

// Length of time to play recording instead of streaming live (milliseconds)
const DURATION_RECORDED = 30 * 60 * 1000; // (30 minutes)

// A Homebridge accessory for a SkyBell doorbell
module.exports = class SkyBellAccessory {
    
    // Initialise an accessory
    constructor(log, homebridge, skybellDevice, webhooks) {
        log("new SkyBellAccessory '" + skybellDevice.name + "': type='"
            + skybellDevice.cache.device.type + "'");
        this.log = log;
        this.skybellDevice = skybellDevice;
        this.name = skybellDevice.name;
    
        // Shortcuts to useful objects
        PlatformAccessory = homebridge.platformAccessory;
        CameraController = homebridge.hap.CameraController;
        Accessory = homebridge.hap.Accessory;
        VIDEO_DOORBELL = Accessory.Categories.VIDEO_DOORBELL;
        Service = homebridge.hap.Service;
        Characteristic = homebridge.hap.Characteristic;
        SINGLE_PRESS = Characteristic.ProgrammableSwitchEvent.SINGLE_PRESS;
        UUIDGen = homebridge.hap.uuid;

        // Create the accessory
        let uuid = UUIDGen.generate(skybellDevice.deviceId);
        this.accessory = new PlatformAccessory(this.name, uuid, VIDEO_DOORBELL);

        // Handle the identify request
        this.accessory.on('identify', this.identify.bind(this));

        // Add a hardware version characteristic
        // (not in x.y.z format required for Characteristic.HardwareRevision)
        this.informationService =
            this.accessory.getService(Service.AccessoryInformation);
        this.informationService
            .addCharacteristic(Characteristic.Version);
        this.informationService
            .setCharacteristic(Characteristic.Manufacturer, MANUFACTURER)
            .setCharacteristic(Characteristic.Model,
                               skybellDevice.cache.device.type)
            .setCharacteristic(Characteristic.SerialNumber, TBD)
            .setCharacteristic(Characteristic.FirmwareRevision, TBD)
            .setCharacteristic(Characteristic.Version, TBD);
                
        // Add a doorbell service
        this.doorbellService =
            this.accessory.addService(Service.Doorbell,
                                      this.name + ' doorbell');

        // Restrict the button to generating single press events only
        this.doorbellService
            .getCharacteristic(Characteristic.ProgrammableSwitchEvent)
            .setProps({ minValue: SINGLE_PRESS, maxValue: SINGLE_PRESS,
                        validValues: [SINGLE_PRESS] });
        
        // Add characteristics for the indoor and outdoor chimes
        this.doorbellService
            .addCharacteristic(Characteristic.Active)
            .on('set', this.setIndoorChime.bind(this))
            .displayName = 'Indoor Chime';
        this.doorbellService
            .addCharacteristic(Characteristic.Volume)
            .setProps({minValue: 0, maxValue: 99, minStep: 33,
                       validValues: [0, 33, 66, 99]})
            .on('set', this.setOutdoorChime.bind(this))
            .displayName = 'Outdoor Chime';
        
        // Add characteristics for controlling the LED
        this.doorbellService
            .addCharacteristic(Characteristic.Brightness)
            .setProps({minValue: 0, maxValue: 99, minStep: 33,
                       validValues: [0, 33, 66, 99]})
            .on('set', this.setLedIntensity.bind(this));
        this.doorbellService
            .addCharacteristic(Characteristic.Hue)
            .on('set', this.setLedHue.bind(this));
        this.doorbellService
            .addCharacteristic(Characteristic.Saturation)
            .on('set', this.setLedSaturation.bind(this));
        
        // Add a motion sensor service for motion detection
        this.motionSensorService =
            this.accessory.addService(Service.MotionSensor,
                                      this.name + ' motion sensor', 'motion');
        this.motionSensorService
            .addCharacteristic(Characteristic.Active)
            .on('set', this.setMotionPolicy.bind(this))
            .updateValue(false);

        // Add a speaker service
        this.speakerService =
            this.accessory.addService(Service.Speaker,
                                      this.name + ' camera speaker');
        this.speakerService
            .getCharacteristic(Characteristic.Mute)
            .setProps({perms: [Characteristic.Perms.READ,
                               Characteristic.Perms.NOTIFY]})
            .updateValue(true);
        this.speakerService.setHiddenService(true);
        
        // Add a microphone service
        this.microphoneService
            = this.accessory.addService(Service.Microphone,
                                        this.name + ' camera microphone');
        this.microphoneService
            .getCharacteristic(Characteristic.Mute)
            .setProps({perms: [Characteristic.Perms.READ,
                               Characteristic.Perms.NOTIFY]})
            .updateValue(false);
        this.microphoneService.setHiddenService(true);

        // Add a camera control service
        this.controlService = new Service.CameraControl(this.name + ' camera');
        this.controlService
            .getCharacteristic(Characteristic.On)
            .setProps({perms: [Characteristic.Perms.READ,
                               Characteristic.Perms.NOTIFY]})
            .updateValue(true);
        this.services = [this.controlService];

        // Add the camera controller services
        this.streamingDelegate =
            new SkyBellCameraStreamingDelegate(log, homebridge, skybellDevice);
        let options = {
            cameraStreamCount:  MAX_STREAMS,
            delegate:           this.streamingDelegate,
            streamingOptions:   this.streamingDelegate.getCodecParameters()
        };
        this.cameraController = new CameraController(options, true);
        this.accessory.configureController(this.cameraController);

        // Set the doorbell as the primary service
        if (this.accessory._associatedHAPAccessory) {
            this.accessory._associatedHAPAccessory
                .setPrimaryService(this.doorbellService);
        }

        // Link services
        this.speakerService.addLinkedService(this.controlService);
        this.microphoneService.addLinkedService(this.controlService);

        // No recent event triggers
        this.recentTriggers = {};

        // Register for status updates from the SkyBell device
        skybellDevice.setOptions({
            callbackInfo:     this.updateInfo.bind(this),
            callbackSettings: this.updateSettings.bind(this),
            callbackButton:
                activity => { this.trigger('cloud', 'button', activity) },
            callbackMotion:
                activity => { this.trigger('cloud', 'motion', activity) }
        });

        // Register for webhooks if configured
        if (webhooks) {
            webhooks.addHook('trigger/button', { name: skybellDevice.name },
                             () => { this.trigger('webhook', 'button') });
            webhooks.addHook('trigger/motion', { name: skybellDevice.name },
                             () => { this.trigger('webhook', 'motion') });
        }
    }

    // The device's information has been updated
    updateInfo(info) {
        this.log("updateInfo '" + this.name + "': serial=" + info.serialNo
                 + ', firmware=' + info.firmwareVersion
                 + ', hardware=' + info.hardwareRevision);
        
        // Set the values of dynamic characteristics
        this.informationService
            .updateCharacteristic(Characteristic.SerialNumber,
                                  info.serialNo)
            .updateCharacteristic(Characteristic.FirmwareRevision,
                                  info.firmwareVersion)
            .updateCharacteristic(Characteristic.Version,
                                  info.hardwareRevision);
    }

    // The device's settings have been updated
    updateSettings(settings) {
        this.log("updateSettings '" + this.name + "':"
                 + ' do_not_disturb=' + settings.do_not_disturb
                 + ', motion_policy=' + settings.motion_policy);

        // Map indoor chime and motion sensor enabled to HomeKit characteristics
        let indoorChimeActive = settings.do_not_disturb == 'true' ? 0 : 1;
        let motionSensorActive = settings.motion_policy == 'call' ? 1 : 0;

        // Map outdoor chime level to a HomeKit characteristic value
        let chimeVolume = settings.chime_level * 33;
        
        // Map LED brightness to HomeKit characteristic values
        let ledBrightness = Math.round(settings.led_intensity * 0.03) * 33;

        // Map LED colour to hue and saturation for HomeKit characteristics
        let rgb = [settings.green_r, settings.green_g, settings.green_b];
        let minRgb = Math.min(...rgb);
        let maxRgb = Math.max(...rgb);
        let chroma = maxRgb - minRgb;
        let hue;
        if (chroma == 0) {
            hue = 0; // (dummy value for white, i.e. R=G=B=255)
        } else if (maxRgb == rgb[0]) { // 0-60° or 300-360°
            hue = (rgb[1] - rgb[2]) / chroma;
            if (hue < 0) hue += 6;
        } else if (maxRgb == rgb[1]) { // 60-180°
            hue = (rgb[2] - rgb[0]) / chroma + 2;
        } else { // (maxRgb == rgb[2])    180-300°
            hue = (rgb[0] - rgb[1]) / chroma + 4;
        }
        let ledHue = Math.round(hue * 60);
        let ledSaturation = Math.round((chroma / maxRgb) * 100);
        
        // Set the values of the chime and LED characteristics
        this.doorbellService
            .updateCharacteristic(Characteristic.Active,     indoorChimeActive)
            .updateCharacteristic(Characteristic.Volume,     chimeVolume)
            .updateCharacteristic(Characteristic.Brightness, ledBrightness)
            .updateCharacteristic(Characteristic.Hue,        ledHue)
            .updateCharacteristic(Characteristic.Saturation, ledSaturation);
        
        // Set the value of the motion sensor enabled characteristic
        this.motionSensorService
            .updateCharacteristic(Characteristic.Active, motionSensorActive);

        // Set the maximum camera resolution
        let height = [1080, 720, 720, 480][settings.video_profile];
        this.streamingDelegate.setResolution(height);

        // Publish a new list of supported resolutions (this is a hack!)
        let options = this.streamingDelegate.getCodecParameters();
        this.cameraController.streamManagements.forEach(management => {
            let makeVideoStreamConfiguration =
                management._supportedVideoStreamConfiguration
                || management.constructor._supportedVideoStreamConfiguration;
            management.supportedVideoStreamConfiguration =
               makeVideoStreamConfiguration(options.video);
            management.service.setCharacteristic(
                Characteristic.SupportedVideoStreamConfiguration,
                management.supportedVideoStreamConfiguration);
        });
    }

    // Identify the SkyBell by flashing its LED (magenta and yellow)
    identify(paired, callback) {
        // Ignore if identify already running
        if (this.hasOwnProperty('identify')) {
            this.log("identify '" + this.name
                     + "' already in progress (ignored)");
            return callback();
        }

        // Start the animation
        this.log("identify '" + this.name + "'");
        this.identify = {
            callbacks: [callback],
            settings: [{
                led_intensity: this.skybellDevice.cache.settings.led_intensity,
                green_r:       this.skybellDevice.cache.settings.green_r,
                green_g:       this.skybellDevice.cache.settings.green_g,
                green_b:       this.skybellDevice.cache.settings.green_b
            }],
            interval: 1000
        };
        for (let i = 0; i < 2; ++i) {
            this.identify.settings.push({
                led_intensity: 100,
                green_r:       100,
                green_g:       0,
                green_b:       100
            });
            this.identify.settings.push({
                led_intensity: 100,
                green_r:       100,
                green_g:       100,
                green_b:       0
            });
        }
        this.identifyAnimate();
    }

    // Next step in identifying the SkyBell
    identifyAnimate() {
        // Set the next LED colour
        this.log("identifyAnimate '" + this.name + "': steps="
                 + this.identify.settings.length);
        this.identify.timer = null;
        let startTime = Date.now();
        this.skybellDevice.updateSettings(this.identify.settings.pop(),
                                          err => {
            if (!err && this.identify.settings.length) {
                // Schedule the next animation step
                let elapsed = Date.now() - startTime;
                let interval = Math.max(0, this.identify.interval - elapsed);
                this.log("identifyAnimate '" + this.name
                         + "' took=" + elapsed + 'ms'
                         + ', rescheduling in ' + interval + 'ms');
                this.identify.timer =
                    setTimeout(this.identifyAnimate.bind(this), interval);
            } else {
                // All done, so call the callback(s)
                this.log("identifyAnimate '" + this.name + "' finished");
                this.identify.callbacks.forEach(callback => callback(err));
                delete this.identify;
            }
        });
    }

    // Stop identifying the SkyBell
    identifyStop(callback) {
        if (this.hasOwnProperty('identify')) {
            // Terminate the identify animation as soon as possible
            if (this.identify.settings.length) {
                this.identify.settings.length = 1;
            }
            this.identify.interval = 0;
            this.identify.callbacks.push(callback);
            if (this.identify.timer) {
                clearTimeout(this.identify.timer);
                this.identify.timer =
                    setTimeout(this.identifyAnimate.bind(this));
            }
        } else {
            callback();
        }
    }

    // Set the state of the indoor chime (do not disturb)
    setIndoorChime(value, callback) {
        let settings = {
            do_not_disturb: value ? 'false' : 'true'
        };

        this.log("setIndoorChime '" + this.name + "': active=" + value
                 + ' as do_not_disturb=' + settings.do_not_disturb);
        this.skybellDevice.updateSettings(settings, callback);
    }

    // Set the volume of the outdoor chime
    setOutdoorChime(value, callback) {
        let settings = {
            chime_level: Math.round(value / 33)
        };

        this.log("setOutdoorChime '" + this.name + "': volume=" + value
                 + ' as level=' + settings.chime_level);
        this.skybellDevice.updateSettings(settings, callback);
    }

    // Set the brightness of the LED
    setLedIntensity(value, callback) {
        let settings = {
            led_intensity: [0, 25, 62, 100][Math.round(value / 33)]
        };
        
        this.log("setLedIntensity '" + this.name + "': brightness=" + value
                 + ' as intensity=' + settings.led_intensity);
        this.identifyStop(() => {
            this.skybellDevice.updateSettings(settings, callback);
        });
    }

    // Set the hue of the LED
    setLedHue(value, callback) {
        let saturation =
            this.doorbellService
                .getCharacteristic(Characteristic.Saturation).value;
        this.setLedColour(value, saturation, callback);
    }

    // Set the saturation of the LED
    setLedSaturation(value, callback) {
        let hue =
            this.doorbellService
                .getCharacteristic(Characteristic.Hue).value;
        this.setLedColour(hue, value, callback);
    }

    // Set the colour of the LED
    setLedColour(hue, saturation, callback) {
        // Convert the colour to RGB for the SkyBell settings
        let maxRgb = 255;
        let chroma = maxRgb * saturation / 100;
        let minRgb = maxRgb - chroma;
        let deltaRgb = chroma * ((hue / 60) % 1);
        let rgb;
        if (hue < 60) {
            rgb = [maxRgb, minRgb + deltaRgb, minRgb];
        } else if (hue < 120) {
            rgb = [maxRgb - deltaRgb, maxRgb, minRgb];
        } else if (hue < 180) {
            rgb = [minRgb, maxRgb, minRgb + deltaRgb];
        } else if (hue < 240) {
            rgb = [minRgb, maxRgb - deltaRgb, maxRgb];
        } else if (hue < 300) {
            rgb = [minRgb + deltaRgb, minRgb, maxRgb];
        } else { // (h < 360)
            rgb = [maxRgb, minRgb, maxRgb - deltaRgb];
        }
        let settings = {
            green_r: Math.round(rgb[0]),
            green_g: Math.round(rgb[1]),
            green_b: Math.round(rgb[2]),
        };

        this.log("setLedColor '" + this.name + "': hue=" + hue
                 + ', saturation=' + saturation
                 + ' as RGB=(' + settings.green_r + ', ' + settings.green_g
                 + ', ' + settings.green_b + ')');
        this.identifyStop(() => {
            this.skybellDevice.updateSettings(settings, callback);
        });
    }

    // Set the motion sensor policy
    setMotionPolicy(value, callback) {
        // Map the motion policy for the SkyBell settings
        let settings = {
            motion_policy: value ? 'call' : 'disabled'
        };
        
        this.log("setMotionPolicy '" + this.name + "': active=" + value
                 + ' as motion_policy=' + settings.motion_policy);
        this.skybellDevice.updateSettings(settings, callback);
    }
    
    // The button has been pressed
    buttonPressed() {
        this.log("buttonPressed '" + this.name + "'");
        this.doorbellService
            .updateCharacteristic(Characteristic.ProgrammableSwitchEvent,
                                  SINGLE_PRESS);
    }

    // Motion has been detected
    motionDetected() {
        this.log("motionDetected '" + this.name + "'");
        this.motionSensorService
            .updateCharacteristic(Characteristic.MotionDetected, true);

        // End the motion detection after a fixed delay
        clearTimeout(this.timerMotionEnd);
        this.timerMotionEnd = setTimeout(() => {
            this.log("motionDetected '" + this.name + "' finished");
            this.motionSensorService
                .updateCharacteristic(Characteristic.MotionDetected, false);
        }, DURATION_MOTION);
    }

    // Set the last activity
    setLastActivity(activity) {
        this.lastActivity = activity;

        // Set the activity to replay instead of streaming live video
        this.streamingDelegate.setActivity(activity);
    }

    // A button press or motion event trigger has been received
    trigger(source, type, activity) {
        // Remeber the most recent activity (of any type) for a short period
        if (activity) {
            this.log("trigger '" + this.name + "': Remembering activity");
            this.setLastActivity(activity);
            clearTimeout(this.timerLastActivity);
            this.timerLastActivity = setTimeout(() => {
                this.log("trigger '" + this.name + "': Forgetting activity");
                this.setLastActivity(null);
            }, DURATION_RECORDED);
        }

        // Check whether the event has come from another source recently
        let recent = this.recentTriggers[type];
        if (recent && (source != recent.source)) {
            return this.log("trigger '" + this.name + "': Suppressing "
                            + type + ' event from ' + source
                            + ' due to recent trigger from ' + recent.source);
        }

        // Suppress other sources of this event for a short period
        if (recent) clearTimeout(recent.timer);
        this.recentTriggers[type] = {
            source: source,
            timer:  setTimeout(() => {
                        this.log("trigger '" + this.name + "': Re-enabling "
                                 + type + ' triggers from all sources');
                        this.recentTriggers[type] = null;
                    }, DURATION_SUPPRESS)
        };

        // Process this event trigger
        if (type == 'button') {
            this.buttonPressed();
        } else if (type == 'motion') {
            this.motionDetected();
        }
    }
}
