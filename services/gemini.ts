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

// --- Nearby Places (Robust) ---

export const getNearbyStations = async (lat: number, lng: number): Promise<PlaceResult[]> => {
  const ai = getClient();
  
  try {
    // We ask for the data naturally. The model will use the tool, and the SDK will provide the structured data in 'groundingChunks'.
    // We do NOT try to parse the text response with regex anymore.
    const prompt = `Find 5 nearest emergency services (Police, Hospitals, Fire Stations) to my location ${lat}, ${lng}.`;
    
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

    const places: PlaceResult[] = [];
    const candidates = response.candidates || [];
    
    // The Gemini Maps tool returns data in "groundingChunks". This is the Source of Truth.
    for (const candidate of candidates) {
        const chunks = candidate.groundingMetadata?.groundingChunks || [];
        
        for (const chunk of chunks) {
            // Check if this chunk is a Map result
            if (chunk.maps) {
                places.push({
                    title: chunk.maps.title || "Emergency Service",
                    uri: chunk.maps.uri || `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`,
                    address: "Tap to view on map", // Address is not always in the chunk, but URI opens the exact place
                    distance: "Nearby" // Exact distance calculation requires complex geometry or parsing, 'Nearby' is safe and honest.
                });
            }
        }
    }

    // Deduplicate (sometimes tool returns same place twice)
    const uniquePlaces = places.filter((p, i, a) => a.findIndex(t => t.title === p.title) === i);

    // If API works but returns nothing (e.g. desert), return a manual search link
    if (uniquePlaces.length === 0) {
        return [{
            title: "Search Emergency Services",
            uri: `https://www.google.com/maps/search/police+hospital+fire/@${lat},${lng},14z`,
            address: "Click to search manually on Maps",
            distance: "-"
        }];
    }

    return uniquePlaces.slice(0, 5); // Limit to top 5

  } catch (e) {
    console.error("Maps Fetch Error:", e);
    // Graceful fallback
    return [{
        title: "Open Google Maps",
        uri: `https://www.google.com/maps/search/emergency+services/@${lat},${lng},14z`,
        address: "Click to find services manually",
        distance: "Network Error"
    }];
  }
};
