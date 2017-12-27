// Homebridge plugin for SkyBell HD video doorbells
// Copyright © 2017 Alexander Thoukydides

'use strict';

let ip = require('ip');
let spawn = require('child_process').spawn;
let dgram = require('dgram');
let fs = require('fs');
let UUIDGen;

// SkyBell supports a maximum of 30fps, but dynamically adjusts to suit the link
const MAX_FPS = 30;

// SkyBell supports 1080p, 720p or 480p, all 16:9 widescreen
const VIDEO_RESOLUTIONS = [
    [1920, 1080, MAX_FPS],               // 1080p
    [1280,  720, MAX_FPS],               // 720p
    [ 640,  360, MAX_FPS],
    [ 480,  270, MAX_FPS],
    [ 320,  240, Math.min(MAX_FPS, 15)], // Apple watch 4:3
    [ 320,  180, Math.min(MAX_FPS, 15)]  // Apple watch 16:9
];

// FFmpeg drawtext filter configuration for recorded video overlay
const OVERLAY_ARGS = [
    'fontsize=18',
    'x=(w-tw)/2',
    'y=2',
    'box=1',
    'boxborderw=2',
    'fontcolor=red',
    'boxcolor=black@0.7'
];

// Possible FFmpeg commands and options in order to be tried
const FFMPEG_COMMANDS = [
    ['ffmpeg', ['-protocol_whitelist', 'rtp,udp,pipe']],
    ['avconv', ['-protocol_whitelist', 'rtp,udp,pipe']],
    ['ffmpeg', []],
    ['avconv', []]
];
let ffmpegCommand;

// A single stream for the camera component of a Homebridge SkyBell accessory
module.exports = class SkyBellCameraStream {

    // Initialise a camera stream
    constructor(log, homebridge, skybellDevice, id) {
        this.log = log;
        this.skybellDevice = skybellDevice;
        this.name = skybellDevice.name + ' #' + id;
        this.id = id;
        log("new SkyBellCameraStream '" + this.name + "'");
        
        // Shortcuts to useful objects
        UUIDGen = homebridge.hap.uuid;

        // Default configuration
        this.maxHeight = VIDEO_RESOLUTIONS[0][1];
        this.sessions = {};
        this.childProcesses = {};
    }

    // Obtain the video and audio stream configuration
    getCodecParameters() {
        // Filter the video resolutions to those below the source
        let videoResolutions = VIDEO_RESOLUTIONS.filter(res => {
            return res[1] <= this.maxHeight
        });

        // Return the supported codec configurations
        return {
            proxy: false, // No (additional) proxy required
            srtp:  true,  // Supports SRTP AES_CM_128_HMAC_SHA1_80 encryption
            video: {
                resolutions: videoResolutions,
                codec: {
                    profiles: [0, 1, 2], // H.264 profiles: baseline, main, high
                    levels:   [0, 1, 2]  // H.264 levels: 3.1, 3.2 and 4.0
                }
            },
            audio: {
                comfort_noise: false,
                // SkyBell only supports PCM S16LE at 8kHz
                // HomeKit requires OPUS or AAC-eld at 16 or 24kHz
                // Most FFmpeg versions do not support libfdk_aac (for AAC-eld)
                codecs: [{
                    type:       'OPUS',
                    samplerate: 16 // kHz
                }]
            }
        };
    }

    // Set the maximum supported resolution
    setResolution(height) {
        if (this.maxHeight != height) {
            this.log("setResolution '" + this.name + "': " + height + 'p');
            this.maxHeight = height;
        }
    }

    // Set the activity to replay instead of streaming live video
    setActivity(activity) {
        if (this.log != this.activity) {
            this.log("setActivityVideo '" + this.name + "': "
                     + (activity ? activity.createdAt : 'none'));
            this.activity = activity;
        }
    }
    
    // Provide the endpoint information for a stream
    prepareStream(request, callback) {
        let sessionId = UUIDGen.unparse(request.sessionID);
        this.log("prepareStream '" + this.name + "': sessionId=" + sessionId);

        // Most of the response values are the same as the request
        let response = request;
        let myAddress = ip.address();
        response.address = {
            address: myAddress,
            type:    ip.isV4Format(myAddress) ? 'v4' : 'v6'
        };

        // Remember details of the outgoing streams
        this.sessions[sessionId] = {
            // Video stream to the client
            video: {
                // SRTP configuration
                server:        request.targetAddress,
                port:          request.video.port,
                outgoingSsrc:  response.video.ssrc = 1,
                key:           Buffer.concat([request.video.srtp_key,
                                              request.video.srtp_salt]),
                
                // Default video parameters
                profile:       2,     // 0 = baseline, 1 = main, 2 = high
                level:         2,     // 0 = 3.1, 1 = 3.2, 2 = 4.0
                // Default video attributes
                width:         VIDEO_RESOLUTIONS[0][0],
                height:        VIDEO_RESOLUTIONS[0][1],
                fps:           MAX_FPS,
                // Default video RTP parameters
                pt:            99,
                ssrc:          null,  // (not used; for received RTCP feedback)
                max_bit_rate:  800,   // kbps
                rtcp_interval: null,  // (not used)
                mtu:           ip.isV4Format(request.targetAddress)
                               ? 1378 : 1228
            },

            // Audio stream to the client
            audio: {
                // SRTP configuration
                server:        request.targetAddress,
                port:          request.audio.port,
                outgoingSsrc:  response.audio.ssrc = 2,
                key:           Buffer.concat([request.audio.srtp_key,
                                              request.audio.srtp_salt]),
                
                // Default audio codec
                codec:         'AAC-eld',
                // Default audio codec parameters
                channel:       1,
                bit_rate:      0,     // 0 = VBR, 1 = CBR
                sample_rate:   16,    // kHz
                packet_time:   30,    // ms
                // Default audio RTP parameters            
                pt:            110,
                ssrc:          null,  // (not used; for received RTCP feedback)
                max_bit_rate:  24,    // kbps
                rtcp_interval: null,  // (not used)
                comfort_pt:    13     // (not used; comfort noise unsupported)
            }
        };

        // Send the response to the client
        callback(response);
    }

    // Start, stop, or reconfigure a steam
    handleStreamRequest(request) {
        let sessionId = UUIDGen.unparse(request.sessionID);
        this.log("handleStreamRequest '" + this.name + "': " + request.type
                 + ' sessionId=' + sessionId);
        let session = this.sessions[sessionId];
        
        if (request.type == 'start') {

            if (session) {
                // Update the audio and video parameters
                Object.assign(session.video, request.video);
                Object.assign(session.audio, request.audio);
                
                // Terminate any previous call
                if (this.activeCall) endCall();
                this.activeCall = sessionId;
                
                // Initiate the new call
                this.startCall(session, (err) => {
                    if (err) {
                        this.log.error("Failed to initiate call to '"
                                       + this.name + "': " + err);
                    }
                });
            }
            
        } else if (request.type == 'stop') {
            
            // End the current call if it is for the specified session
            if (this.activeCall == sessionId) {
                this.endCall();
                this.activeCall = null;
            }
            
        } else {
            
            // Reconfigure stream parameters
            this.log('Stream request type=' + request.type + ' not supported');
            
        }
    }

    // Start a call
    startCall(session, callback) {
        this.log("startCall '" + this.name + "'");

        // Start a live call if there was no recent activity
        let activity = this.activity;
        if (!activity) return this.startLiveCall(session, callback);
        
        // Retrieve the URL for the recorded video
        this.skybellDevice.getVideoUrl(activity, (err, url) => {
            if (err) {
                // Fallback to live stream if unable to obtain video URL
                this.log.warn("Failed to obtain URL for video recorded by '"
                              + this.name + "': " + err);
                return this.startLiveCall(session, callback);
            }

            // Generate a caption to indicate that the video is not live
            const prefix = {
                'device:sensor:button': 'Button pressed ',
                'device:sensor:motion': 'Motion detected '
            };
            let dateRecorded = new Date(activity.createdAt);
            let minutes = Math.ceil((Date.now() - dateRecorded) / (60 * 1000));
            let caption = (prefix[activity.event] || '') +
                          (1 < minutes ? minutes + ' minutes ago' : 'just now');
                
            // Spawn FFmpeg to download and transcode the recorded video
            this.startPlayback(url, caption, session.video, session.audio,
                               callback);
        });
    }

    // Start a live call
    startLiveCall(session, callback) {
        this.log("startLiveCall '" + this.name + "'");

        // Start a call to the SkyBell device to obtain the SRTP configuration
        this.skybellDevice.startCall(this.id, (err, call) => {
            if (err) return callback(err);
            // Spawn FFmpeg to transcode the video and audio streams
            this.startStream(call.incomingVideo, call.incomingAudio,
                             session.video, session.audio, callback);
        });
    }

    // End a call
    endCall() {
        this.log("stopCall '" + this.name + "'");
        this.skybellDevice.stopCall(this.id, () => {});

        // Kill any FFmpeg processes that have survived this long
        Object.keys(this.childProcesses).forEach(type => {
            this.log("Killing FFmpeg '" + this.name + ' (' + type + ")'");
            this.childProcesses[type].kill('SIGKILL');
            delete this.childProcesses[type];
        });
    }

    // Start an FFmpeg process for a previously recorded video
    startPlayback(videoIn, overlay, videoOut, microphoneOut, callback) {
        this.log("startPlayback '" + this.name + "'");

        // FFmpeg parameters
        let args = [
            '-threads',            0,
            '-loglevel',           'warning',

            // Input stream is the URL of the recorded MP4 video
            '-re',
            '-i',                  videoIn,

            // Output streams
            ...this.ffmpegOutputArgs(videoOut, microphoneOut)
        ];

        // Add the overlay text to the video filter
        let text = overlay.replace(/[\\':]/g, '\\$&')
                          .replace(/[\\'\[\],;]/g, '\\$&');
        let vfExtra = ',drawtext=' + OVERLAY_ARGS.join(':') + ':text=' + text;
        args[args.indexOf('-vf') + 1] += vfExtra;

        // Punch through the firewall and then spawn the FFmpeg process
        this.spawnFfmpeg('Playback', args, [], callback);
    }

    // Start an FFmpeg process for a live stream
    startStream(videoIn, microphoneIn, videoOut, microphoneOut, callback) {
        this.log("startStream '" + this.name + "'");

        // Session Description Protocol (SDP) file for the input streams
        let sdpIn = [
            'v=0',
            'o=- 0 0 IN IP4 127.0.0.1',
            's=' + this.name + ' in',
            't=0 0',

            // Video stream
            'm=video '  + videoIn.port + ' RTP/SAVP ' + videoIn.payloadType,
            'c=IN '     + (ip.isV4Format(videoIn.server) ? 'IP4' : 'IP6')
                + ' ' + videoIn.server,
            'a=rtpmap:' + videoIn.payloadType + ' ' + videoIn.encoding
                + '/' + videoIn.sampleRate,
            'a=crypto:1 AES_CM_128_HMAC_SHA1_80 inline:' + videoIn.key,
            'a=ssrc:'   + videoIn.ssrc,
            
            // Microphone audio stream
            // (use L16 as a placeholder; overridden by '-acodec pcm_s16le' arg)
            'm=audio '  + microphoneIn.port + ' RTP/SAVP '
                + microphoneIn.payloadType,
            'c=IN '     + (ip.isV4Format(microphoneIn.server) ? 'IP4' : 'IP6')
                + ' ' + microphoneIn.server,
            'a=rtpmap:' + microphoneIn.payloadType + ' L16/'
                + microphoneIn.sampleRate + '/' + microphoneIn.channels,
            'a=crypto:1 AES_CM_128_HMAC_SHA1_80 inline:' + microphoneIn.key,
            'a=ssrc:'   + microphoneIn.ssrc
        ];

        // FFmpeg parameters
        let args = [
            '-threads',            0,
            '-loglevel',           'warning',

            // Input streams are (mostly) described by the SDP file
            '-acodec',             'pcm_s16le', // (SDP specifies pcm_s16be)
            '-i',                  '-', // (SDP file provided via stdin)

            // Output streams
            ...this.ffmpegOutputArgs(videoOut, microphoneOut)
        ];

        // Punch through the firewall and then spawn the FFmpeg process
        let firewallPorts = [videoIn.port, microphoneIn.port];
        this.sendPunchPackets(videoIn.server, firewallPorts, (err) => {
            if (err) return callback(err);
            this.spawnFfmpeg('Stream', args, sdpIn, callback);
        });
    }

    // Common FFmpeg output parameters
    ffmpegOutputArgs(videoOut, microphoneOut) {
        // Pick a lower video resolution if requested is higher than the source
        if (this.maxHeight < videoOut.height) {
            let resolution = VIDEO_RESOLUTIONS.find(resolution => {
                return resolution[1] <= this.maxHeight;
            });
            this.log("Resolution for '" + this.name + "' reduced from "
                     + videoOut.width + 'x' + videoOut.height
                     + ' to ' + resolution[0] + 'x' + resolution[1]);
            videoOut.width  = resolution[0];
            videoOut.height = resolution[1];
        }

        // FFmpeg output parameters
        let args = [
            // Video filter to adjust the resolution
            '-vf',                 'scale=' + videoOut.width
                                            + ':' + videoOut.height,

            // Video encoding options (always H.264/AVC)
            '-vcodec',             'libx264',
            '-pix_fmt',            'yuv420p',
            '-r',                  videoOut.fps,
            '-tune',               'zerolatency',
            '-profile:v',          ['baseline', 'main', 'high'][videoOut.profile],
            '-level:v',            ['3.1', '3.2', '4.0'][videoOut.level],
            '-b:v',                videoOut.max_bit_rate + 'K',
            '-bufsize',            videoOut.max_bit_rate + 'K',

            // Output video stream
            '-an',
            '-f',                  'rtp',
            '-payload_type',       videoOut.pt,
            '-srtp_out_suite',     'AES_CM_128_HMAC_SHA1_80',
            '-srtp_out_params',    videoOut.key.toString('base64'),
            '-ssrc',               this.int32(videoOut.outgoingSsrc),
            'srtp://' + videoOut.server + ':' + videoOut.port
                + '?rtcpport=' + videoOut.port + '&localrtcpport='
                + videoOut.port + '&pkt_size=' + videoOut.mtu
        ];
        if (microphoneOut.codec == 'OPUS') {
            args.push(
                // Audio encoding options for Opus codec
                '-acodec',         'libopus',
                '-vbr',            (microphoneOut.bit_rate == 0) ? 'on' : 'off',
                '-frame_duration', microphoneOut.packet_time,
                '-application',    'lowdelay'
            );
        } else if (microphoneOut.codec == 'AAC-eld') {
            args.push(
                // Audio encoding options for Enhanced Low Delay AAC codec
                '-acodec',         'libfdk_aac',
                '-profile:a',      'aac_eld'
            );
        } else {
            this.log.error("Unsupported audio codec '"
                           + microphoneOut.codec + "'");
        }
        args.push(
            // Common audio encoding options
            '-ac',                 microphoneOut.channel,
            '-ar',                 microphoneOut.sample_rate + 'K',
            '-b:a',                microphoneOut.max_bit_rate + 'K',
            
            // Output microphone audio stream
            '-vn',
            '-f',                  'rtp',
            '-flags',              '+global_header',
            '-payload_type',       microphoneOut.pt,
            '-srtp_out_suite',     'AES_CM_128_HMAC_SHA1_80',
            '-srtp_out_params',    microphoneOut.key.toString('base64'),
            '-ssrc',               this.int32(microphoneOut.outgoingSsrc),
            'srtp://' + microphoneOut.server + ':' + microphoneOut.port
                + '?rtcpport=' + microphoneOut.port + '&localrtcpport='
                + microphoneOut.port
        );

        // Return the arguments
        return args;
    }

    // Send dummy packets to setup the reverse route through the firewall
    sendPunchPackets(host, ports, callback) {
        if (ports.length == 0) return callback();
        
        let port = ports.shift();
        this.log("sendPunchPacket '" + this.name + "': " + host + ':' + port);
        
        let udp = dgram.createSocket({ type: 'udp4' });
        udp.on('error', err => callback(err));
        udp.bind(port, () => {
            udp.send(Buffer.alloc(8), port, host, err => {
                if (err) return callback(err);
                udp.close(err => {
                    if (err) return callback(err);
                    this.sendPunchPackets(host, ports, callback);
                });
            });
        });
    }

    // Start an FFmpeg process
    spawnFfmpeg(type, args, input, callback) {
        let prefix = "FFmpeg '" + this.name + ' (' + type + ")': ";

        // Identify a suitable FFmpeg command
        this.getFfmpegOptions((err, cmd, preArgs) => {
            if (err) return callback(err);

            // Spawn an FFmpeg child process
            let allArgs = [...preArgs, ...args];
            this.log(prefix + cmd + ' ' + allArgs.join(' '));
            let child = spawn(cmd, allArgs);
            this.childProcesses[type] = child;

            // Provide input to the child process
            input.forEach(line => this.log.debug(prefix + '< ' + line));
            child.stdin.setEncoding('utf8');
            child.stdin.write(input.join('\n'));
            child.stdin.end();

            // Log output and exit code from the FFmpeg process
            let logOutput = stream => {
                stream.setEncoding('utf8');
                stream.on('data', output => {
                    output.split('\n').forEach(line => {
                        if (line.length) this.log.debug(prefix + '> ' + line);
                    });
                });
            };
            logOutput(child.stdout);
            logOutput(child.stderr);
            child.on('error', err => {
                this.log.error(prefix + 'Child process error: ' + err);
                delete this.childProcesses[type];
            });
            child.on('close', code => {
                if (this.childProcesses[type]) {
                    this.log.warn(prefix + 'Unexpected exit: ' + code);
                    delete this.childProcesses[type];
                } else {
                    this.log(prefix + 'Normal exit: ' + code);
                }
            });

            // Assume for now that the child process was spawned successfully
            callback();
        });
    }

    // Attempt to identify a suitable FFmpeg command
    getFfmpegOptions(callback) {
        if (ffmpegCommand) return callback(null, ...ffmpegCommand);
        let testNextCommand = cmds => {
            let cmd = cmds.shift();
            if (!cmd) return callback(Error('No suitable FFmpeg executable'));

            // Try spawning the next command in the list
            let allArgs = [...cmd[1], '-version'];
            this.log.debug("getFfmpegOptions '" + this.name + "': "
                           + cmd[0] + ' ' + allArgs.join(' '));
            let child = spawn(cmd[0], allArgs);

            // Check whether it executes successfully
            child.on('error', err => {
                this.log.debug("getFfmpegOptions '" + this.name
                               + "': Failed with error: " + err);
                testNextCommand(cmds);
                child = null;
            });
            child.on('close', code => {
                if (!child) return;
                if (code) {
                    this.log.debug("getFfmpegOptions '" + this.name
                                   + "': Failed with code " + code);
                    testNextCommand(cmds);
                } else {
                    this.log.debug("getFfmpegOptions '" + this.name
                                   + "': Success");
                    ffmpegCommand = cmd;
                    callback(null, ...ffmpegCommand);
                }
            });
        }
        testNextCommand(FFMPEG_COMMANDS);
    }

    // Convert integer to signed 32-bit (required for FFmpeg output SSRC values)
    int32(value) {
        return ~~value;
    }
}
