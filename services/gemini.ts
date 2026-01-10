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
    Your task is to listen to the user audio stream.
    The user has set a specific danger phrase: "${dangerPhrase}".
    
    If you hear the phrase "${dangerPhrase}" (or a very close variation like "help me"), you MUST output the text "TRIGGER_DANGER: PHRASE_DETECTED".
    
    If you hear other clear signs of extreme distress (screaming, pleading for life, "call the police"), output "TRIGGER_DANGER: DISTRESS_DETECTED".

    Otherwise, just transcribe what you hear normally. Do not be conversational. Just listen and monitor.
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
      responseModalities: [Modality.AUDIO], // We only need text output to analyze triggers, but AUDIO is required
      outputAudioTranscription: {}, // Request transcription to get text
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
    const prompt = `
      I am located at Latitude: ${lat}, Longitude: ${lng}.
      
      Please find the nearest Police Stations, Hospitals, and Fire Stations.
      
      OUTPUT REQUIREMENTS:
      List 5-10 places.
      For each place, provide the Name, Address, and Approximate Distance.
    `;
    
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

    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    const places: PlaceResult[] = [];
    
    // Primary Strategy: Extract structured data directly from Grounding Chunks
    if (chunks.length > 0) {
        chunks.forEach((chunk: any) => {
            if (chunk.maps) {
                places.push({
                    title: chunk.maps.title || "Unknown Place",
                    uri: chunk.maps.uri || `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`,
                    address: "View map for details", // Maps tool grounding often has minimal address data in chunk, mostly title/uri
                    distance: "Nearby" 
                });
            }
        });
    }

    // Secondary Strategy: If chunks are sparse, parse the text for details that match the chunks
    // (Simplification: We prioritize the chunks because they contain the correct URIs)

    // Deduplicate
    const uniquePlaces = places.filter((place, index, self) =>
        index === self.findIndex((p) => p.title === place.title)
    );

    return uniquePlaces;

  } catch (e) {
    console.error("Error fetching nearby places:", e);
    return [];
  }
};