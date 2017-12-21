# homebridge-skybell

SkyBell HD Wi-Fi video doorbell plugin for [Homebridge](https://github.com/nfarina/homebridge).

SkyBell is a trademark owned by [SkyBell Technologies, Inc](http://www.skybell.com/).

## Installation

1. Install [FFmpeg](https://www.ffmpeg.org/) using: `sudo apt-get install ffmpeg`
1. Install this plugin using: `npm install -g homebridge-skybell`
1. Edit `config.json` and add the SkyBell platform (see example below).
1. Run [Homebridge](https://github.com/nfarina/homebridge).
1. Add extra camera accessories using the Home app:
   1. Click on the **+** (in the top-right corner of the screen) and select *Add Accessory*.
   1. Select *Don't Have a Code or Can't Scan?*.
   1. Select the SkyBell HD camera accessory to be added.
   1. Ignore the warning about it being an *Uncertified Accessory* (which applies to all non-commercial accessories) and select *Add Anyway*.
   1. Enter the 8-digit setup code that Homebridge displayed when launched (possibly configured via a `pin` value in `config.json`).
   1. Select a room for the camera and motion sensor. They should be located in the same room, but not the *Default Room*.
 
### config.json Example
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
The `username` (email address) and `password` should be set to the credentials used to log into the SkyBell HD app.

The `port` and `secret` values are optional. Unless webhooks are being used ([see below](#Webhooks)) they should be omitted.

HomeKit accessories will be created automatically for all SkyBell HD (and SkyBell Trim Plus) doorbells associated with the account.

## Notes

### SkyBell API

SkyBell Technologies only share API details with selected third parties as part of their [SkyBell Connect API](http://www.skybell.com/skybell-connect/) program. This plugin instead uses the undocumented SkyBell cloud API used by their SkyBell HD app, as [reverse engineered](https://github.com/MisterWil/skybellpy) by Wil Schrader, but without the benefit of access to the Apple Push Notification service (APNs).

### Button and Motion Events

Button presses and motion events are detected by polling the SkyBell cloud for new video recordings being available. This typically results in a delay of several minutes between the event occurring and HomeKit being notified (and hence any automation being triggered).

The SkyBell cloud servers appear to be very heavily loaded. They typically take a few seconds to respond to each API request. This plugin leaves 5 seconds between successive polls of the activity log.

### Apple Home App

Apple's Home app (as of iOS 11) does not display *Doorbell* services; their characteristics cannot be viewed or controlled. For full functionality use one of:
* Matthias Hochgatterer's [Home](http://hochgatterer.me/home/) app *(recommended)*.
* Elgato's [Eve](https://www.elgato.com/en/eve/eve-app) app *(free)*.

However, Apple's Home app does generate rich notifications for both doorbell button presses and motion events. These appear with a small snapshot image from the camera. A larger image and live video stream can be viewed by sliding the notification left and selecting *View*.

### Video and Audio Streams
 
Viewing the live video stream from a SkyBell via HomeKit results in an *On demand* video being recorded, just as it does with the official SkyBell HD app.

For some reason the SkyBell cloud terminates the live video stream after approximately 45 seconds when viewed via HomeKit (instead of 5 minutes with the official SkyBell HD app). It is not obvious why this occurs.

This plugin currently only supports audio in a single direction: from the SkyBell's microphone to HomeKit. This is because the audio streams in each direction use the same ports, but unfortunately FFmpeg (which is used by this plugin to transcode the audio and video) does not support sharing a single port in this way for SRTP streams.

## Webhooks

This plugin supports webhooks that can be used to supplement polling of the SkyBell cloud to detect button press and motion events. Use of the webhooks is entirely optional.

Webhooks are enabled by adding a `port` value in the `config.json` file to specify the port number on which the web server should listen for requests. An optional `secret` phrase may also be specified to authenticate webhook requests.

Two URLs are supported corresponding to button press and motion events:
* `/homebridge-skybell/trigger/button`
* `/homebridge-skybell/trigger/motion`

To trigger an event issue a `PUT` request to one of these URLs with the following data:
```JSON
{
    "name":         "Front Door",
    "secret":       "My webhooks secret"
}
```
The `name` should be the name of the doorbell as configured in the SkyBell HD app, and the `secret` should match the value in the `config.json` file.

### Command Line Trigger

For example, to trigger a button press on the same machine that is running the Homebridge server:
```Shell
curl -d '{"name":"Front Door","secret":"My webhooks secret"}' http://localhost:47569/homebridge-skybell/trigger/button
```

Obviously the name, port number, and secret should be replaced by appropriate values.

### Duplicate Event Suppression

Enabling webhooks does not prevent this plugin from polling the SkyBell cloud API. In order to prevent duplicate HomeKit triggers if a webhook event is received then events from the SkyBell cloud are suppressed for a period of 10 minutes afterwards (or vice versa if the SkyBell cloud event occurred first). This timeout is implemented indenendeptly for each doorbell, and for button press and motion events.

In practice this means that the quickest event notification will be used.

### IFTTT Integration

This plugin's webhooks can be invoked from an [IFTTT](https://ifttt.com/) applet. For example to trigger from [SkyBell IFTTT](https://ifttt.com/skybell) channel events an applet should be created as follows:
* **If this**
  * *SkyBell HD*
    * *Your SkyBell HD's button was pressed*
* **then that:**
  * *Webhooks*
     * *Make a web request*
       * URL: `http://myserver.duckdns.org:47569/homebridge-skybell/trigger/button`
       * Method: `POST`
       * Content Type: `application/json`
       * Body: `{"name":"{{DeviceName}}","secret":"My webhooks secret"}`

Again, the host name, port number and secret should be replaced by appropriate values. IFTTT will substitute `{{DeviceName}}` automatically with the correct name; it is does not need to be set manually.

A suitable port forwarding rule may need to be configured so that IFTTT can access the webhooks server if it behind NAT (network address translation). It may also be necessary to use a dynamic DNS host such as [Duck DNS](http://www.duckdns.org/) to obtain a static host name.

Separate applets will need to be created for each doorbell. For motion detection events the *Your SkyBell HD detected motion* trigger should be used instead.

*(This particular example is of dubious benefit because the SkyBell IFTTT channel is typically slower than this plugin polling the SkyBell cloud directly.)*

## License

> ISC License (ISC)<br>Copyright © 2017 Alexander Thoukydides
>
> Permission to use, copy, modify, and/or distribute this software for any purpose with or without fee is hereby granted, provided that the above copyright notice and this permission notice appear in all copies.
>
> THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
