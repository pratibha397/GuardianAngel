import { GoogleGenAI } from '@google/genai';
import { PlaceResult } from '../types';

// Initialize Gemini Client
const getClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) throw new Error("API Key not found");
  return new GoogleGenAI({ apiKey });
};

// --- Nearby Places (Maps Grounding) ---

export const getNearbyStations = async (lat: number, lng: number): Promise<PlaceResult[]> => {
  const ai = getClient();
  
  try {
    // We use a specific delimiter "||" to avoid issues with commas in addresses
    const prompt = `
      I am located at Latitude: ${lat}, Longitude: ${lng}.
      
      Please find the nearest Police Stations, Hospitals, and Fire Stations within a reasonable driving range.
      List up to 15 relevant locations.
      
      CRITICAL OUTPUT FORMAT:
      For each location found, output a single line using exactly this format:
      PLACE: <Name> || <Address> || <Distance from me>
      
      Example:
      PLACE: General Hospital || 123 Main St, New York || 0.8 miles
      PLACE: FDNY Station 4 || 5th Avenue || 1.2 km
      
      Do not include intro text. Just the list.
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
    
    // Regex matches "PLACE: Name || Address || Distance" handling potential extra whitespace
    const regex = /PLACE:\s*(.*?)\s*\|\|\s*(.*?)\s*\|\|\s*(.*)/;
    
    const lines = text.split('\n');

    for (const line of lines) {
        // We clean the line of potential markdown bullets like "* PLACE:" or "- PLACE:"
        const cleanLine = line.replace(/^[\*\-\s]+/, '');
        
        const match = cleanLine.match(regex);
        if (match) {
            const title = match[1].trim();
            const address = match[2].trim();
            const distance = match[3].trim();

            // Fuzzy match the title with the Grounding Chunks to get the official Google Maps URI
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

    // Fallback: If strict parsing failed completely (places is empty), use the raw map chunks.
    if (places.length === 0) {
        chunks.forEach((chunk: any) => {
            if (chunk.maps) {
                places.push({
                    title: chunk.maps.title,
                    uri: chunk.maps.uri,
                    address: "View on Map",
                    distance: "Nearby" // Fallback text since distance wasn't parsed
                });
            }
        });
    }
    
    // Deduplicate by title
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