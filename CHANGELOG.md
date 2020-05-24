# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

## [v2.0.2] - 2020-05-24
### Added
* Added **[HOOBS Certified](https://plugins.hoobs.org/plugin/homebridge-skybell)** badge to the `README.md`. ([#15], [#17])

## [v2.0.1] - 2020-05-07
### Added
* Added **[Verified By Homebridge](https://github.com/homebridge/homebridge/wiki/Verified-Plugins)** badge to the `README.md`.
* The homebridge API version is now checked at start-up.

## [v2.0.0] - 2020-05-03
### Fixed
* Now supports (and requires) homebridge version 1.0.0 or later. ([#16])

## [v1.8.1] - 2020-03-02
### Fixed
* Corrected the platform name in the configuration schema.

## [v1.8.0] - 2020-01-09
### Added
* Added a schema (`config.schema.json`) to allow editing of this plugin's configuration using [homebridge-config-ui-x](https://github.com/oznu/homebridge-config-ui-x). ([config.json])
* Created this `CHANGELOG.md` file.

## [v1.7.0] - 2019-12-29
### Fixed
* Corrected conversion of the LED colour between HomeKit and SkyBell representations. This previously failed when converting pure white to HomeKit, and for hues that were multiples of 60° when converting from HomeKit.

## [v1.6.0] - 2019-11-06
### Changed
* If an error occurs whilst retrieving an avatar image then the response is now inspected to check whether it contains an error message. This makes the log output more helpful when Amazon Simple Storage Service (S3) returns an error. ([#14])
### Fixed
* Fixed use of the `Buffer()` constructor to prevent the Node.js `DEP0005` deprecation warning.

## [v1.5.1] - 2019-01-28
### Removed
* Deleted a spurious file that was not intended to be committed.

## [v1.5.0] - 2018-07-08
### Fixed
* Replaced use of `pajk-lwip` by FFmpeg for scaling snapshot (avatar) images to the size requested by HomeKit. This allows use of Node.js version 10. ([#6])

## [v1.4.1] - 2017-12-31
### Fixed
* Corrected a typo that broke the handling of button press and motion event triggers in [v1.4.0].

## [v1.4.0] - 2017-12-29
### Changed
* FFmpeg is now only configured to transcode a video stream if either its resolution needs to be adjusted (to comply with HomeKit requirements) or an overlay is being added (to indicate a pre-recorded video). This should reduce latency and load on the Homebridge server.

## [v1.3.0] - 2017-12-28
### Fixed
* Switched from `lwip` to the `pajk-lwip` fork to fix compatibility with more recent versions of Node.js. ([#1])

## [v1.2.0] - 2017-12-27
### Added
* Use the thumbnail for the most recent video recording if it is newer than the current avatar image.

## [v1.1.0] - 2017-12-27
### Added
* When video streaming is started, if a new video was recorded within the last 30 minutes then that is played instead of live streaming from the SkyBell. When this happens the age of the video is added as an overlay.

## [v1.0.1] - 2017-12-26
### Changed
* Simplified parsing of error messages returned by the SkyBell API.

## [v1.0.0] - 2017-12-22
### Added
* Added webhooks that can be used to receive button press and motion detection event triggers from an external source. This allows latency to be reduced, e.g. by using IFTTT or network traffic sniffing to detect activity instead of polling the SkyBell API to check for a new video recording. ([Webhooks] / [Webhooks Sniffer])

## [v0.3.0] - 2017-12-19
### Removed
* Removed the unnecessary second `Motion Sensor` service that duplicated the functionality of the `Programmable Switch Event` characteristic for button presses.

## [v0.2.0] - 2017-12-19
### Removed
* Removed unnecessary handling of the `Microphone Mute` characteristic (since it is read-only).

## [v0.1.0] - 2017-12-19
* Initial version.

---

Copyright © 2017-2020 Alexander Thoukydides

[Wiki]:                 https://github.com/thoukydides/homebridge-skybell/wiki
[config.json]:          https://github.com/thoukydides/homebridge-skybell/wiki/config.json          "Wiki: config.json"
[Webhooks]:             https://github.com/thoukydides/homebridge-skybell/wiki/Webhooks             "Wiki: Webhooks"
[Webhooks Sniffer]:     https://github.com/thoukydides/homebridge-skybell/wiki/Webhooks-Sniffer     "Wiki: Doorbell Packet Sniffer"
[Protocol Overview]:    https://github.com/thoukydides/homebridge-skybell/wiki/Protocol-Overview    "Wiki: Protocol Overview"
[Protocol HTTPS]:       https://github.com/thoukydides/homebridge-skybell/wiki/Protocol-HTTPS       "Wiki: App ↔ Cloud (HTTPS)"
[Protocol CoAP]:        https://github.com/thoukydides/homebridge-skybell/wiki/Protocol-CoAP        "Wiki: Doorbell ↔ Cloud (CoAP)"
[Protocol SRTP]:        https://github.com/thoukydides/homebridge-skybell/wiki/Protocol-SRTP        "Wiki: Doorbell ↔ Cloud ↔ App (SRTP)"
                        
[#1]:                   https://github.com/thoukydides/homebridge-skybell/issues/1                  "Issue #1"
[#2]:                   https://github.com/thoukydides/homebridge-skybell/issues/2                  "Issue #2"
[#3]:                   https://github.com/thoukydides/homebridge-skybell/issues/3                  "Issue #3"
[#4]:                   https://github.com/thoukydides/homebridge-skybell/issues/4                  "Issue #4"
[#5]:                   https://github.com/thoukydides/homebridge-skybell/issues/5                  "Issue #5"
[#6]:                   https://github.com/thoukydides/homebridge-skybell/issues/6                  "Issue #6"
[#7]:                   https://github.com/thoukydides/homebridge-skybell/issues/7                  "Issue #7"
[#8]:                   https://github.com/thoukydides/homebridge-skybell/issues/8                  "Issue #8"
[#9]:                   https://github.com/thoukydides/homebridge-skybell/issues/9                  "Issue #9"
[#10]:                  https://github.com/thoukydides/homebridge-skybell/issues/10                 "Issue #10"
[#11]:                  https://github.com/thoukydides/homebridge-skybell/issues/11                 "Issue #11"
[#12]:                  https://github.com/thoukydides/homebridge-skybell/issues/12                 "Issue #12"
[#13]:                  https://github.com/thoukydides/homebridge-skybell/issues/13                 "Issue #13"
[#14]:                  https://github.com/thoukydides/homebridge-skybell/issues/14                 "Issue #14"
[#15]:                  https://github.com/thoukydides/homebridge-skybell/issues/15                 "Issue #15"
[#16]:                  https://github.com/thoukydides/homebridge-skybell/issues/16                 "Issue #16"
[#17]:                  https://github.com/thoukydides/homebridge-skybell/issues/17                 "Issue #17"
                        
[Unreleased]:           https://github.com/thoukydides/homebridge-skybell/compare/v2.0.2...HEAD
[v2.0.2]:               https://github.com/thoukydides/homebridge-skybell/compare/v2.0.1...v2.0.2
[v2.0.1]:               https://github.com/thoukydides/homebridge-skybell/compare/v2.0.0...v2.0.1
[v2.0.0]:               https://github.com/thoukydides/homebridge-skybell/compare/v1.8.1...v2.0.0
[v1.8.1]:               https://github.com/thoukydides/homebridge-skybell/compare/v1.8.0...v1.8.1
[v1.8.0]:               https://github.com/thoukydides/homebridge-skybell/compare/v1.7.0...v1.8.0
[v1.7.0]:               https://github.com/thoukydides/homebridge-skybell/compare/v1.6.0...v1.7.0
[v1.6.0]:               https://github.com/thoukydides/homebridge-skybell/compare/v1.5.1...v1.6.0
[v1.5.1]:               https://github.com/thoukydides/homebridge-skybell/compare/v1.5.0...v1.5.1
[v1.5.0]:               https://github.com/thoukydides/homebridge-skybell/compare/v1.4.1...v1.5.0
[v1.4.1]:               https://github.com/thoukydides/homebridge-skybell/compare/v1.4.0...v1.4.1
[v1.4.0]:               https://github.com/thoukydides/homebridge-skybell/compare/v1.3.0...v1.4.0
[v1.3.0]:               https://github.com/thoukydides/homebridge-skybell/compare/v1.2.0...v1.3.0
[v1.2.0]:               https://github.com/thoukydides/homebridge-skybell/compare/v1.1.0...v1.2.0
[v1.1.0]:               https://github.com/thoukydides/homebridge-skybell/compare/v1.0.1...v1.1.0
[v1.0.1]:               https://github.com/thoukydides/homebridge-skybell/compare/v1.0.0...v1.0.1
[v1.0.0]:               https://github.com/thoukydides/homebridge-skybell/compare/v0.3.0...v1.0.0
[v0.3.0]:               https://github.com/thoukydides/homebridge-skybell/compare/v0.2.0...v0.3.0
[v0.2.0]:               https://github.com/thoukydides/homebridge-skybell/compare/v0.1.0...v0.2.0
[v0.1.0]:               https://github.com/thoukydides/homebridge-skybell/releases/tag/v0.1.0
