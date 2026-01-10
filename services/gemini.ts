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
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  
  const sysInstruction = `
    You are a safety monitoring system. 
    User Danger Phrase: "${dangerPhrase}".
    If you hear "${dangerPhrase}" or distress (screaming), output "TRIGGER_DANGER: DETECTED".
    Otherwise, transcribe briefly.
  `;

  let session: any = null;

  const sessionPromise = ai.live.connect({
    model: 'gemini-2.5-flash-native-audio-preview-12-2025',
    callbacks: {
      onopen: () => {
        const source = inputAudioContext.createMediaStreamSource(stream);
        const scriptProcessor = inputAudioContext.createScriptProcessor(4096, 1, 1);
        
        scriptProcessor.onaudioprocess = (ev) => {
          const inputData = ev.inputBuffer.getChannelData(0);
          sessionPromise.then(sess => sess.sendRealtimeInput({ media: createBlob(inputData) }));
        };
        
        source.connect(scriptProcessor);
        scriptProcessor.connect(inputAudioContext.destination);
      },
      onmessage: (msg: LiveServerMessage) => {
        const text = msg.serverContent?.outputTranscription?.text;
        if (text) {
             onTranscription(text);
             if (text.includes('TRIGGER_DANGER')) onDangerDetected(text);
        }
      },
      onerror: (err) => console.error(err),
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
      stream.getTracks().forEach(t => t.stop());
      inputAudioContext.close();
    }
  };
};

function createBlob(data: Float32Array) {
  const l = data.length;
  const int16 = new Int16Array(l);
  for (let i = 0; i < l; i++) int16[i] = data[i] * 32768;
  return {
    data: encode(new Uint8Array(int16.buffer)),
    mimeType: 'audio/pcm;rate=16000',
  };
}

function encode(bytes: Uint8Array) {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

// --- Nearby Places (Fixed for Reliability) ---

export const getNearbyStations = async (lat: number, lng: number): Promise<PlaceResult[]> => {
  const ai = getClient();
  
  try {
    // Explicit prompt to force the tool to be used
    const prompt = `
      Find exactly 5 nearby emergency services (Police Stations, Hospitals, Fire Stations).
      Current location: ${lat}, ${lng}.
      Use the Google Maps tool to find real places.
    `;
    
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        tools: [{ googleMaps: {} }],
        toolConfig: {
          retrievalConfig: {
            latLng: { latitude: lat, longitude: lng }
          }
        }
      }
    });

    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    const places: PlaceResult[] = [];
    
    // Iterate chunks to find map data
    for (const chunk of chunks) {
        if (chunk.maps) {
            places.push({
                title: chunk.maps.title || "Unknown Location",
                uri: chunk.maps.uri || `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`,
                address: "Click to view details", // Gemini tool chunks often lack full address string, relying on URI
                distance: "Nearby"
            });
        }
    }

    // Deduplicate based on title
    const uniquePlaces = places.filter((p, i, a) => a.findIndex(t => t.title === p.title) === i);
    
    return uniquePlaces;

  } catch (e) {
    console.error("Gemini Maps Error:", e);
    return [];
  }
};
