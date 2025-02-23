import { AfterViewInit, Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { MatSnackBar } from '@angular/material/snack-bar';
import * as JsSIP from 'jssip';
import { RTCSession, RTCSessionEventMap, IncomingEvent, OutgoingEvent, EndEvent, PeerConnectionEvent, ConnectingEvent, SDPEvent } from 'jssip/lib/RTCSession';
import { CallOptions, RTCSessionEvent, IncomingMessageEvent, OutgoingMessageEvent } from 'jssip/lib/UA';
import { of, Observable } from 'rxjs';
import { find, first, map, skipUntil } from 'rxjs/operators';
// base on: https://github.com/philiptwcn/JsSip-Angular/blob/master/src/app/app.component.html
@Component({
    selector: 'app-phone-call',
    templateUrl: './phone-call.component.html',
    styleUrls: ['./phone-call.component.scss']
})
export class PhoneCallComponent implements OnInit, AfterViewInit {
    //#region Properties
    title = 'AngularJsSip';
    @ViewChild('localAudio')
    public localAudioElement!: ElementRef;
    @ViewChild('remoteAudio')
    public remoteAudioElement!: ElementRef;

    userAgent: JsSIP.UA;  ///UserAgent https://jssip.net/documentation/api/ua_configuration_parameters/
    ua$!: Observable<JsSIP.UA>;
    UARegistrationForm!: FormGroup;
    callToForm!: FormGroup;
    isRegistered = false;
    originator = '';
    incomingUser = '';
    isMuted = false;

    outgoingSession: RTCSession = null;
    incomingSession: RTCSession = null;;
    currentSession: RTCSession = null;;

    inputDeviceList!: MediaDeviceInfo[];
    outputDeviceList!: MediaDeviceInfo[];

    showLocalAudio = false;
    showRemoteAudio = false;
    localAudio = new Audio();
    remoteAudio = new Audio();

    localStream: MediaStream | null = null;
    incomingStreams!: MediaStream[];
    incomingStream!: MediaStream;
    constraints: MediaStreamConstraints = {
        audio: {
            echoCancellation: true,
            noiseSuppression: true
        }
    };
    // Register callbacks to desired call events
    eventHandlers: Partial<RTCSessionEventMap> = {
        progress: (e: IncomingEvent | OutgoingEvent) => {
            console.log('%cCall is in progress', 'color:black;background-color:yellow', e);
            this.openSnackBar('call is in progress', 'progress', { duration: 2000 });
        },
        succeeded: (e) => {
            console.log('%cCall succeeded', 'color:black;background-color:yellow', e);
            this.openSnackBar('call is in succeeded', 'succeeded', { duration: 2000 });
        },
        failed: (e: EndEvent) => {
            console.error('%cCall failed: ', e);
            this.openSnackBar('call failed', 'failed', { duration: 2000 });
        },
        ended: (e: EndEvent) => {
            console.log('%cCall ended : ', 'color:white;background-color:red', e);
            this.openSnackBar('call ended', 'ended', { duration: 2000 });
        },
        confirmed: (e: IncomingEvent | OutgoingEvent) => {
            console.log('%cCall confirmed', 'color:black;background-color:lightgreen', e);
            this.openSnackBar('call is confirmed', 'confirmed', { duration: 2000 });
        },
        peerconnection: (e: PeerConnectionEvent) => {
            console.log('%cOn peerconnection', 'color:black;background-color:orange', e);
            this.openSnackBar('on peerconnection', 'peerconnection', { duration: 3000 });
            console.log('state', e.peerconnection.getStats());
            e.peerconnection.ontrack = (ev: RTCTrackEvent) => {
                console.log('onaddtrack from remote - ', ev);
                this.remoteAudio.srcObject = ev.streams[0];
                this.remoteAudio.play();
                this.showRemoteAudio = true;
            };
        }
    };
    callOptions: CallOptions = {
        eventHandlers: this.eventHandlers,
        mediaConstraints: {
            audio: true,
            video: false
        },
        mediaStream: this.localStream
    };
    //#endregion Properties
    //#region Component Life Cycle
    constructor(private snackBar: MatSnackBar) { }
    ngOnInit() {
        this.UARegistrationForm = new FormGroup({
            sipURI: new FormControl('sip:4002@192.168.1.10', [Validators.required]),
            sipPassword: new FormControl('a1c2525b9bcc6c60b12abd41d1b89b72', [Validators.required]),
            wsURI: new FormControl('wss://192.168.1.10:8089/ws', [Validators.required]),
        });
        this.callToForm = new FormGroup({
            sipPhoneNumber: new FormControl('sip:4001@192.168.1.10', [Validators.required]),
        });
    }
    ngAfterViewInit(): void {
        this.localAudio = this.localAudioElement.nativeElement;
        this.remoteAudio = this.remoteAudioElement.nativeElement;
    }
    //#endregion Component Life Cycle
    //#region Media Devices
    captureLocalMedia = async () => {
        console.log('Requesting local video & audio');
        let stream: MediaStream;
        try {
            stream = await navigator.mediaDevices.getUserMedia(this.constraints);
        } catch (error) {
            console.error('getUserMedia() error: ' + error);
            this.openSnackBar('Get User Media Error', 'ok', { duration: 2000 });
            return;
        }
        console.log('captureLocalMedia Received local media stream', stream, this.constraints);
        this.gotLocalMedia(stream);
    }
    gotLocalMedia(stream: MediaStream): void {
        this.localStream = stream;
        this.localAudio.srcObject = stream;
        this.showLocalAudio = true;
        console.log('gotLocalMedia Received local media stream', stream);
        this.openSnackBar('Received local media stream', 'Ok', { duration: 2000 });
    }

    closeLocalMedia(): void {
        this.remoteAudio.pause();
        this.localAudio.pause();
        this.localAudio.srcObject = null;
        this.localStream?.getTracks().forEach(track => track.stop());
        this.localStream = null;
        this.showLocalAudio = false;
        this.showRemoteAudio = false;
        console.log('closeLocalMedia Received local media stream');
        this.openSnackBar('Local Media Closed', 'Ok', { duration: 2000 });
    }
    //#endregion Media Devices
    //#region Call Functions
    register(): void {
        console.log(
            '%c register - get input info: ', 'color:black;background-color:lightgreen', '\n',
            'sip_uri = ', this.UARegistrationForm.get('sipURI')?.value, '\n',
            'sip_password = ', this.UARegistrationForm.get('sipPassword')?.value, '\n',
            'ws_uri = ', this.UARegistrationForm.get('wsURI')?.value
        );
        const socket = new JsSIP.WebSocketInterface(this.UARegistrationForm.get('wsURI')?.value);
        const configuration = {
            sockets: [socket],
            outbound_proxy_set: this.UARegistrationForm.get('wsURI')?.value,
            uri: this.UARegistrationForm.get('sipURI')?.value,
            password: this.UARegistrationForm.get('sipPassword')?.value,
            register: true,
            session_timers: false
        };
        this.userAgent = new JsSIP.UA(configuration);
        this.userAgent.on('registered', (registeredEvent) => {
            this.isRegistered = true;
            console.log('registered: ', registeredEvent);
            console.log('registered userAgent: ', this.userAgent);
            this.openSnackBar(
                `registered:  ${registeredEvent.response.status_code} , ${registeredEvent.response.reason_phrase}`,
                'Ok', { duration: 2000 }
            );
        });
        this.userAgent.on('registrationFailed', (registrationFailedEvent) => {
            this.isRegistered = false;
            console.log('registrationFailed, ', registrationFailedEvent);
            console.log('registrationFailed userAgent: ', this.userAgent);
            this.openSnackBar(`registrationFailed`, 'Ok', { duration: 2000 });
            console.warn('registrationFailed, ', registrationFailedEvent.response.status_code, ',', registrationFailedEvent.response.reason_phrase, ' cause - ', registrationFailedEvent.cause);
        });
        this.userAgent.on('registrationExpiring', () => {
            console.warn('registrationExpiring');
            this.openSnackBar('registrationExpiring', 'Ok', { duration: 2000 });
        });
        this.userAgent.on('newMessage', (data: IncomingMessageEvent | OutgoingMessageEvent) => {
            if (data.originator === 'local') {
                console.log('onNewMessage , OutgoingRequest - ', data.request);
            } else {
                console.log('onNewMessage , IncomingRequest - ', data.request);
            }
        });

        this.userAgent.on('newRTCSession', (sessionEvent: RTCSessionEvent) => {
            this.originator = sessionEvent.originator;
            console.log(
                '%cregister.on.newRTCSession: ', 'color:black;background-color:lightgreen', '\n',
                'onNewRTCSession: ', sessionEvent);
            if (sessionEvent.originator === 'remote') { // incoming call
                console.log('incomingSession', sessionEvent);
                this.incomingUser = sessionEvent.request.from.uri.user;
                this.incomingSession = sessionEvent.session;
                this.currentSession = this.incomingSession;
                console.log('incomingSession, answer the call', this.incomingSession);
                console.log('remote stream', this.incomingStream);

            } else {
                console.log('outgoingSession');
                this.outgoingSession = sessionEvent.session;
                this.outgoingSession.on('connecting', (event: ConnectingEvent) => {
                    console.log('onConnecting - ', event.request);
                    this.currentSession = this.outgoingSession;
                    this.outgoingSession = null;
                    console.log('call session', this.currentSession);
                });
            }
            sessionEvent.session.on('accepted', (event: IncomingEvent | OutgoingEvent) => {
                console.log('onAccepted - ', event);
                if (event.originator === 'remote' && this.currentSession == null) {
                    this.currentSession = this.incomingSession;
                    this.incomingSession = null;
                    console.log('accepted setCurrentSession - ', this.currentSession);
                }
            });
            sessionEvent.session.on('failed', (event: EndEvent) => {
                this.originator = '';
                this.incomingUser = '';
                this.isMuted = false;
                this.closeLocalMedia()
                console.log('%conFailed - ', 'color:white;background-color:red', event);
            })
            sessionEvent.session.on('ended', (event: EndEvent) => {
                this.originator = '';
                this.incomingUser = '';
                this.isMuted = false;
                this.closeLocalMedia()
                console.log('%conEnded - ', 'color:white;background-color:red', event);
            })
            sessionEvent.session.on('confirmed', (event: IncomingEvent | OutgoingEvent) => {
                console.log('%conConfirmed - ', 'color:black;background-color:lightgreen', event);
                if (event.originator === 'remote' && this.currentSession == null) {
                    this.currentSession = this.incomingSession;
                    this.incomingSession = null;
                    console.log('%cconfirmed setCurrentSession - ', 'color:black;background-color:kightgreen', this.currentSession);
                }
            });
            sessionEvent.session.on('sdp', (event: SDPEvent) => {
                console.log('onSDP, type - ', event.type, ' sdp - ', event.sdp);
            });
            sessionEvent.session.on('progress', (event: IncomingEvent | OutgoingEvent) => {
                console.log('%conProgress - ', 'color:black;background-color:yellow', event.originator);
                if (event.originator === 'remote') {
                    console.log('%conProgress, response - ', 'color:black;background-color:yellow', event.response);
                }
            });
            sessionEvent.session.on('peerconnection', (event: PeerConnectionEvent) => {
                console.log('%conPeerconnection - ', 'color:black;background-color:orange', event.peerconnection);
            });
        });
        this.userAgent.start();
        console.log('ua start');
    }
    call(): void {
        if (!this.isRegistered) this.register();
        const sipPhoneNumber = this.callToForm.get('sipPhoneNumber')?.value;
        const options: CallOptions = this.callOptions;
        this.ua$ = of(this.userAgent);
        this.ua$.pipe(
            find(ua => ua.isRegistered())
        ).subscribe(() => {
            try {
                this.captureLocalMedia();
                this.outgoingSession = this.userAgent.call(sipPhoneNumber, options);
            } catch (error) {
                console.log('getUserMedia() error: ' + error);
                this.openSnackBar('Get User Media Error', 'ok', { duration: 2000 });
            }
        });
    }
    answer(): void {
        this.currentSession.answer({
            mediaConstraints: this.callOptions.mediaConstraints,
            mediaStream: this.callOptions.mediaStream
        });
        this.currentSession.connection.ontrack = (ev: RTCTrackEvent) => {
            console.log('onaddtrack from remote - ', ev);
            this.remoteAudio.srcObject = ev.streams[0];
            this.remoteAudio.play();
            this.showRemoteAudio = true;
        };
        this.currentSession.answer({
            mediaConstraints: {
                audio: true,
                video: false,
            },
            mediaStream: this.localStream
        });
        this.currentSession.connection.ontrack = (ev: RTCTrackEvent) => {
            console.log('onaddtrack from remote - ', ev);
        };
    }

    hungup(): void {
        this.closeLocalMedia();
        this.userAgent.terminateSessions();
    }

    switchMute(): void {
        this.localStream?.getAudioTracks().forEach(track => {
            track.enabled = !track.enabled;
            this.isMuted = !track.enabled;
        });

    }
    //#endregion Call Functions
    //#region Accessorie Functions
    openSnackBar(message: string, action?: string, config?: object): void {
        this.snackBar.open(message, action, { ...config, panelClass: ['mat-toolbar', 'mat-primary'] });
    }
    //#endregion Accessorie Functions
}
