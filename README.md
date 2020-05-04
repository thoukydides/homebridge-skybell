<span align=center>
  <a href="https://github.com/homebridge/homebridge/wiki/Verified-Plugins"><img src="https://raw.githubusercontent.com/wiki/thoukydides/homebridge-skybell/homebridge-skybell.png" height="200"></a>

# homebridge-skybell

[![npm](https://badgen.net/npm/v/homebridge-skybell)](https://www.npmjs.com/package/homebridge-skybell)
[![npm](https://badgen.net/npm/dt/homebridge-skybell)](https://www.npmjs.com/package/homebridge-skybell)
[![npm](https://badgen.net/npm/dw/homebridge-skybell)](https://www.npmjs.com/package/homebridge-skybell)
[![verified-by-homebridge](https://badgen.net/badge/homebridge/verified/purple)](https://github.com/homebridge/homebridge/wiki/Verified-Plugins)

SkyBell HD Wi-Fi video doorbell plugin for [Homebridge](https://github.com/nfarina/homebridge).

</span>

SkyBell is a trademark owned by [SkyBell Technologies, Inc](http://www.skybell.com/).

## Installation

1. Install [FFmpeg](https://www.ffmpeg.org/) (with `libx264` and `libopus` codecs enabled) using: `sudo apt-get install ffmpeg`
1. Install this plugin using: `npm install -g homebridge-skybell`
1. Edit `config.json` and add the SkyBell platform (see example below).
1. Run [Homebridge](https://github.com/nfarina/homebridge).
1. Add extra camera accessories using the Home app:
   1. Click on the **+** (in the top-right corner of the screen) and select *Add Accessory*.
   1. Select *Don't Have a Code or Can't Scan?*
   1. Select the SkyBell HD camera accessory to be added.
   1. Ignore the warning about it being an *Uncertified Accessory* (which applies to all non-commercial accessories) and select *Add Anyway*.
   1. Enter the 8-digit setup code that Homebridge displayed when launched (possibly configured via a `pin` value in `config.json`).
   1. Select a room for the camera and motion sensor. They should be located in the same room, but not the *Default Room*.
 
### Example `config.json`
```JSON
{
    "platforms":
    [{
        "platform":     "SkyBell",
        "username":     "skybell@gmail.com",
        "password":     "Passw0rd!",
        "port":         47569,
        "secret":       "My webhooks secret"
    }]
}
```
The `username` (email address) and `password` should be set to the credentials used to log into the SkyBell HD app. The plugin will automatically create HomeKit accessories for all SkyBell HD (and SkyBell Trim Plus) doorbells associated with the account.

The `port` and `secret` values are optional. They should be omitted unless [webhooks](https://github.com/thoukydides/homebridge-skybell/wiki/Webhooks) are being used.

## Notes

### SkyBell API

SkyBell Technologies only share API details with selected third parties through their [SkyBell Connect API](http://www.skybell.com/skybell-connect/) program. Instead this plugin uses the [unpublished API](https://github.com/thoukydides/homebridge-skybell/wiki/Protocol-HTTPS) that the SkyBell HD app uses to communicate with the SkyBell cloud.

Without access to mobile push notifcations (Apple Push Notification service (APNs) or Google Cloud Messaging (GCM) for Android) this plugin has to poll the API for changes. It leaves 5 seconds between successive requests. Unfortunately, the SkyBell cloud servers appear to be very heavily loaded, with responses to each API request typically taking a few seconds.

### Button and Motion Events

By default button presses and motion events are detected by polling the SkyBell cloud for new video recordings being available. The doorbell only uploads the video after it has stopped recording so this typically results in a delay of several minutes between the event occurring and HomeKit being notified (and hence any automation being triggered).

The delay can be significantly reduced by snooping on the [packets between the doorbell and its cloud services](https://github.com/thoukydides/homebridge-skybell/wiki/Protocol-CoAP). If `tcpdump` can be run on the gateway/router between the doorbell and the internet then configure [webhooks](https://github.com/thoukydides/homebridge-skybell/wiki/Webhooks) and install the [doorbell packet sniffer](https://github.com/thoukydides/homebridge-skybell/wiki/Webhooks-Sniffer).

### Apple Home App

Apple's Home app (as of iOS 11) does not display *Doorbell* services; their characteristics cannot be viewed or controlled. For full functionality use one of the following apps:
* Matthias Hochgatterer's [Home](http://hochgatterer.me/home/) *(recommended)*.
* Elgato's [Eve](https://www.elgato.com/en/eve/eve-app) *(free)*.

However, Apple's Home app does generate rich notifications for both doorbell button presses and motion events. These appear with a small snapshot image from the camera. A larger image and live video stream can be viewed by sliding the notification left and selecting *View*. The dootbell button notification is enabled by default, but the motion event notification has to be explicitly enabled within the app.

### Snapshot Image

This plugin normally uses the *avatar* image that the SkyBell HD pushes to the SkyBell cloud once per hour. However, if a video was recorded more recently then its thumbnail will be used instead. The update time shown within the HomeKit app indicates when the image was requested, not when it was actually captured.

### Video and Audio Streams

Viewing the doorbell's video via HomeKit will normally establish a live stream showing the current camera image. However, within 30 minutes of a video being recorded (in response to a button press or motion event) this plugin will instead play that recording. In both cases the Home and Eve apps will badge the video as *LIVE*, so to make it clear when a recording is being played this plugin superimposes a caption at the top of recorded videos. Only recordings made after Homebridge is started are played.

Viewing the live stream from a SkyBell HD via HomeKit results in an *On demand* video being recorded, just as it does with the official SkyBell HD app. For some reason the SkyBell cloud terminates the live video stream after approximately 45 seconds when viewed via this plugin (instead of 5 minutes with the official SkyBell HD app). It is not obvious why this occurs.

This plugin currently only supports audio in a single direction: from the doorbell's microphone to HomeKit. This is because the audio streams in each direction use the same ports, but unfortunately FFmpeg (which is used by this plugin to transcode the audio and video) does not support sharing a single port between two SRTP streams.

## Changelog

All notable changes to this project will be documented in [CHANGELOG.md](CHANGELOG.md).

## License

> ISC License (ISC)<br>Copyright © 2017-2020 Alexander Thoukydides
>
> Permission to use, copy, modify, and/or distribute this software for any purpose with or without fee is hereby granted, provided that the above copyright notice and this permission notice appear in all copies.
>
> THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
