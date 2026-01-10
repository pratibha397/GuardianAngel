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
    // We ask the model to format the output strictly so we can parse address and distance
    // The `googleMaps` tool handles the actual lookup logic
    const prompt = `
      I am at Latitude: ${lat}, Longitude: ${lng}.
      Find all nearby Police Stations, Hospitals, and Fire Stations within a reasonable driving distance.
      
      List as many relevant stations as you can find (up to 15).
      
      For each station found, strictly output a single line in this format:
      DETAILS: <Name> | <Address> | <Distance>
      
      Example:
      DETAILS: Central Hospital | 123 Main St, City | 0.5 miles
      DETAILS: City Police Dept | 456 Oak Ave | 1.2 km
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

    const text = response.text || "";
    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    const places: PlaceResult[] = [];
    
    const lines = text.split('\n');

    for (const line of lines) {
        if (line.trim().startsWith('DETAILS:')) {
            const parts = line.replace('DETAILS:', '').split('|').map(s => s.trim());
            if (parts.length >= 3) {
                const title = parts[0];
                const address = parts[1];
                const distance = parts[2];

                // Attempt to link with the official Maps URI from grounding chunks
                // We fuzzy match the title
                const matchedChunk = chunks.find((c: any) => 
                    c.maps?.title && title.toLowerCase().includes(c.maps.title.toLowerCase())
                );

                const uri = matchedChunk?.maps?.uri || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(title + " " + address)}`;

                places.push({
                    title,
                    address,
                    distance,
                    uri
                });
            }
        }
    }

    // Fallback: If text parsing yielded no results (model didn't follow format), use raw chunks
    if (places.length === 0) {
        chunks.forEach((chunk: any) => {
            if (chunk.maps) {
                places.push({
                    title: chunk.maps.title,
                    uri: chunk.maps.uri,
                    address: "View on Map",
                    distance: "Nearby"
                });
            }
        });
    }
    
    // Deduplicate
    const uniquePlaces = places.filter((place, index, self) =>
        index === self.findIndex((p) => (
            p.title === place.title
        ))
    );

    return uniquePlaces;

  } catch (e) {
    console.error("Error fetching nearby places:", e);
    return [];
  }
};