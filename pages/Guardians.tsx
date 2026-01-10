import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { User } from '../types';
import { sendAlert, sendMessage, updateLiveLocation } from './services/storage';

/**
 * Singleton Service to manage Safety Monitoring.
 * Persists across React component unmounts.
 */
class GuardianService {
  private static instance: GuardianService;
  private ai: GoogleGenAI;
  private session: Promise<any> | null = null;
  private stream: MediaStream | null = null;
  private inputContext: AudioContext | null = null;
  public isListening: boolean = false;
  private user: User | null = null;
  
  // State Subscriptions
  private onTranscript: ((text: string) => void) | null = null;
  private onStatusChange: ((isListening: boolean) => void) | null = null;
  private onTrigger: ((reason: string) => void) | null = null;

  private constructor() {
    const apiKey = process.env.API_KEY;
    if (!apiKey) throw new Error("API Key missing");
    this.ai = new GoogleGenAI({ apiKey });
  }

  public static getInstance(): GuardianService {
    if (!GuardianService.instance) {
      GuardianService.instance = new GuardianService();
    }
    return GuardianService.instance;
  }

  /**
   * Register UI callbacks to receive updates from the service.
   */
  public setCallbacks(
    onTranscript: (text: string) => void,
    onStatusChange: (isListening: boolean) => void,
    onTrigger: (reason: string) => void
  ) {
    this.onTranscript = onTranscript;
    this.onStatusChange = onStatusChange;
    this.onTrigger = onTrigger;
    
    // Send immediate state on subscription
    if (this.onStatusChange) this.onStatusChange(this.isListening);
  }

  /**
   * Start the monitoring shield.
   */
  public async start(user: User) {
    if (this.isListening) {
        console.log("Guardian already listening.");
        return;
    }
    
    this.user = user;
    console.log("Starting Guardian for:", user.email);

    try {
      this.inputContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      const sysInstruction = `
        You are a safety monitoring system. 
        Your task is to listen to the user audio stream.
        The user has set a specific danger phrase: "${user.dangerPhrase}".
        
        If you hear the phrase "${user.dangerPhrase}" (or a very close variation like "help me"), you MUST output the text "TRIGGER_DANGER: PHRASE_DETECTED".
        
        If you hear other clear signs of extreme distress (screaming, pleading for life, "call the police"), output "TRIGGER_DANGER: DISTRESS_DETECTED".

        Otherwise, just transcribe what you hear normally. Do not be conversational. Just listen and monitor.
      `;

      const sessionPromise = this.ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        callbacks: {
          onopen: () => {
             console.log("Guardian Connected & Monitoring");
             this.isListening = true;
             if (this.onStatusChange) this.onStatusChange(true);
             this.processAudio(sessionPromise);
          },
          onmessage: (msg: LiveServerMessage) => this.handleMessage(msg),
          onclose: () => {
             console.log("Guardian Disconnected");
             this.stop(false); // Stop internal state, but don't force kill if it was a server drop
          },
          onerror: (err) => {
             console.error("Guardian Error", err);
             // Attempt restart or stop?
             this.stop();
          }
        },
        config: {
          systemInstruction: sysInstruction,
          responseModalities: [Modality.AUDIO],
          outputAudioTranscription: {},
        }
      });
      
      this.session = sessionPromise;

    } catch (e) {
      console.error("Failed to start Guardian", e);
      this.stop();
      throw e;
    }
  }

  /**
   * Stop the monitoring shield.
   */
  public stop(notify: boolean = true) {
      this.isListening = false;
      if (notify && this.onStatusChange) this.onStatusChange(false);
      
      if (this.session) {
          this.session.then((s: any) => s.close().catch(() => {}));
          this.session = null;
      }
      
      if (this.stream) {
          this.stream.getTracks().forEach(t => t.stop());
          this.stream = null;
      }
      
      if (this.inputContext) {
          this.inputContext.close();
          this.inputContext = null;
      }
  }

  private processAudio(sessionPromise: Promise<any>) {
      if (!this.inputContext || !this.stream) return;
      
      const source = this.inputContext.createMediaStreamSource(this.stream);
      const scriptProcessor = this.inputContext.createScriptProcessor(4096, 1, 1);
      
      scriptProcessor.onaudioprocess = (e) => {
          if (!this.isListening) return;
          const inputData = e.inputBuffer.getChannelData(0);
          const pcmBlob = this.createBlob(inputData);
          
          sessionPromise.then(s => {
              try { s.sendRealtimeInput({ media: pcmBlob }); } 
              catch(e) { console.warn("Stream send error", e); }
          });
      };
      
      source.connect(scriptProcessor);
      scriptProcessor.connect(this.inputContext.destination);
  }

  private handleMessage(message: LiveServerMessage) {
      if (message.serverContent?.outputTranscription?.text) {
          const text = message.serverContent.outputTranscription.text;
          if (this.onTranscript) this.onTranscript(text);

          if (text.includes('TRIGGER_DANGER')) {
              this.triggerSOS(text.includes('DISTRESS') ? 'DISTRESS_DETECTED' : 'DANGER_PHRASE');
          }
      }
  }

  /**
   * Robust High-Accuracy Location Fetching
   */
  private getLocation(): Promise<{latitude: number, longitude: number}> {
      return new Promise((resolve, reject) => {
         if (!navigator.geolocation) return reject("Geo not supported");
         
         // Try High Accuracy
         navigator.geolocation.getCurrentPosition(
             (pos) => resolve(pos.coords),
             () => {
                 // Fallback to low accuracy
                 console.warn("High accuracy failed, using low accuracy");
                 navigator.geolocation.getCurrentPosition(
                     (pos) => resolve(pos.coords),
                     (err) => reject(err),
                     { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
                 );
             },
             { enableHighAccuracy: true, timeout: 5000 }
         );
      });
  }

  public async triggerSOS(reason: string) {
      if (!this.user) return;
      if (this.onTrigger) this.onTrigger(reason);
      
      console.log("⚠️ TRIGGERING SOS:", reason);
      
      let lat = 0, lng = 0;
      try {
          const coords = await this.getLocation();
          lat = coords.latitude;
          lng = coords.longitude;
          updateLiveLocation(this.user.email, lat, lng);
      } catch (e) {
          console.error("Location failed during SOS", e);
      }

      this.user.guardians.forEach(async (gEmail) => {
          await sendMessage({
             senderEmail: this.user!.email,
             receiverEmail: gEmail,
             text: `🚨 SOS ALERT! ${reason}`,
             isLocation: lat !== 0,
             lat, lng
          });
          await sendAlert(this.user!.email, gEmail, reason, lat, lng);
      });

      // We do NOT stop listening immediately, in case the user needs to say more, 
      // but in this implementation we keep it running.
  }

  // --- Utils ---

  private createBlob(data: Float32Array) {
    const l = data.length;
    const int16 = new Int16Array(l);
    for (let i = 0; i < l; i++) {
        int16[i] = data[i] * 32768;
    }
    const binaryString = this.encode(new Uint8Array(int16.buffer));
    return {
        data: binaryString,
        mimeType: 'audio/pcm;rate=16000',
    };
  }

  private encode(bytes: Uint8Array) {
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }
}

export default GuardianService.getInstance();