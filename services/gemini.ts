import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { PlaceResult } from '../types';

const getClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) throw new Error("API Key not found");
  return new GoogleGenAI({ apiKey });
};

// --- Live Audio ---
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
    If you hear "${dangerPhrase}" or distress, output "TRIGGER_DANGER: DETECTED".
    Otherwise, transcribe briefly.
  `;

  let sessionPromise = ai.live.connect({
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

// --- Nearby Places ---
export const getNearbyStations = async (lat: number, lng: number): Promise<PlaceResult[]> => {
  const ai = getClient();
  
  try {
    // 1. Explicit Prompt demanding Tool Use
    const prompt = `
      Find exactly 5 nearby emergency services (Police Stations, Hospitals, Fire Stations).
      Current location: ${lat}, ${lng}.
      Use the Google Maps tool.
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

    // 2. Robust Parsing
    const places: PlaceResult[] = [];
    const candidates = response.candidates || [];
    
    for (const candidate of candidates) {
        const chunks = candidate.groundingMetadata?.groundingChunks || [];
        for (const chunk of chunks) {
            if (chunk.maps) {
                places.push({
                    title: chunk.maps.title || "Emergency Service",
                    uri: chunk.maps.uri || `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`,
                    address: "View on Map",
                    distance: "Nearby"
                });
            }
        }
    }

    // 3. Fallback: If no tool chunks, return a generic link
    if (places.length === 0) {
        return [{
            title: "Open Google Maps",
            uri: `https://www.google.com/maps/search/emergency+services/@${lat},${lng},14z`,
            address: "Click to find nearby services",
            distance: "-"
        }];
    }

    // Deduplicate
    return places.filter((p, i, a) => a.findIndex(t => t.title === p.title) === i).slice(0, 5);

  } catch (e) {
    console.error("Gemini Error:", e);
    // 4. Error Fallback
    return [{
        title: "Search Nearby Services",
        uri: `https://www.google.com/maps/search/emergency+services/@${lat},${lng},14z`,
        address: "Click to view map",
        distance: "Unknown"
    }];
  }
};
