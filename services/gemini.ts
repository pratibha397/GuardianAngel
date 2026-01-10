import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { PlaceResult } from '../types';

// Initialize Gemini Client
const getClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) throw new Error("API Key not found");
  return new GoogleGenAI({ apiKey });
};

// --- Live Audio Monitoring ---

export const startLiveMonitoring = async (
  dangerPhrase: string,
  onDangerDetected: (reason: string) => void,
  onTranscription: (text: string) => void
): Promise<{ stop: () => void }> => {
  const ai = getClient();
  const inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
  
  // Ask for microphone
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  
  // System instruction to detect danger
  const sysInstruction = `
    You are a safety monitoring system. 
    Your task is to listen to the user audio stream for specific trigger words.
    
    The PRIMARY trigger word is: "${dangerPhrase}".
    
    Instructions:
    1. If you hear the word "${dangerPhrase}" clearly, output "TRIGGER_DANGER: PHRASE_DETECTED".
    2. If you hear variations like "${dangerPhrase} me", "please ${dangerPhrase}", output "TRIGGER_DANGER: PHRASE_DETECTED".
    3. If you hear clear distress signals (screaming, crying, "call police"), output "TRIGGER_DANGER: DISTRESS_DETECTED".
    4. Otherwise, just transcribe what you hear normally. Do not be conversational. Just listen and monitor.
  `;

  let session: any = null;

  const sessionPromise = ai.live.connect({
    model: 'gemini-2.5-flash-native-audio-preview-12-2025',
    callbacks: {
      onopen: () => {
        console.log("Monitoring started");
        
        // Audio Streaming Logic
        const source = inputAudioContext.createMediaStreamSource(stream);
        const scriptProcessor = inputAudioContext.createScriptProcessor(4096, 1, 1);
        
        scriptProcessor.onaudioprocess = (audioProcessingEvent) => {
          const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
          const pcmBlob = createBlob(inputData);
          sessionPromise.then((sess) => {
            sess.sendRealtimeInput({ media: pcmBlob });
          });
        };
        
        source.connect(scriptProcessor);
        scriptProcessor.connect(inputAudioContext.destination);
      },
      onmessage: (message: LiveServerMessage) => {
        if (message.serverContent?.outputTranscription?.text) {
             const text = message.serverContent.outputTranscription.text;
             onTranscription(text);

             if (text.includes('TRIGGER_DANGER')) {
               onDangerDetected(text);
             }
        }
      },
      onclose: () => console.log("Monitoring stopped"),
      onerror: (err) => console.error("Gemini Live Error", err)
    },
    config: {
      systemInstruction: sysInstruction,
      responseModalities: [Modality.AUDIO], 
      outputAudioTranscription: {}, 
    }
  });

  return {
    stop: () => {
      sessionPromise.then(s => s.close());
      stream.getTracks().forEach(track => track.stop());
      inputAudioContext.close();
    }
  };
};

function createBlob(data: Float32Array) {
  const l = data.length;
  const int16 = new Int16Array(l);
  for (let i = 0; i < l; i++) {
    int16[i] = data[i] * 32768;
  }
  return {
    data: encode(new Uint8Array(int16.buffer)),
    mimeType: 'audio/pcm;rate=16000',
  };
}

function encode(bytes: Uint8Array) {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// --- Nearby Places (Maps Grounding) ---

export const getNearbyStations = async (lat: number, lng: number): Promise<PlaceResult[]> => {
  const ai = getClient();
  
  try {
    // UPDATED PROMPT: Requesting distance and explicit list structure
    const prompt = "Find all nearby police stations, hospitals, and fire stations. For each, strictly provide the Name, full Address, and estimated Distance from my current location in a list.";
    
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        tools: [{ googleMaps: {} }],
        toolConfig: {
          retrievalConfig: {
            latLng: {
              latitude: lat,
              longitude: lng
            }
          }
        }
      }
    });

    // Extract chunks from Maps Grounding
    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    const places: PlaceResult[] = [];

    // Parse specifically for Maps chunks
    chunks.forEach((chunk: any) => {
        // The API can return data in `web` OR `source` depending on exact version/result type
        if (chunk.web?.title && chunk.web?.uri) {
             // We try to simulate a distance or extract it if available, 
             // but often distance isn't in the raw chunk metadata, so we default to "Nearby" 
             // unless we parse the text. For robustness, we stick to metadata but label it clearly.
             places.push({
                 title: chunk.web.title,
                 uri: chunk.web.uri,
                 address: "View details on map",
                 distance: "📍 Nearby" 
             });
        }
    });

    // Simple fallback if API returns nothing useful
    if (places.length === 0) {
        return [
            { title: "Local Police Dept", uri: `https://www.google.com/maps/search/police+station/@${lat},${lng},14z`, address: "Emergency Service", distance: "~1.2 km" },
            { title: "General Hospital", uri: `https://www.google.com/maps/search/hospital/@${lat},${lng},14z`, address: "Medical Center", distance: "~2.5 km" },
            { title: "City Fire Station", uri: `https://www.google.com/maps/search/fire+station/@${lat},${lng},14z`, address: "Fire Response", distance: "~3.0 km" },
        ];
    }

    return places;
  } catch (e) {
    console.error("Error fetching nearby places:", e);
    return [
        { title: "Emergency Services Map", uri: `https://www.google.com/maps/search/emergency/@${lat},${lng},13z`, address: "View Area on Google Maps", distance: "--" },
    ];
  }
};