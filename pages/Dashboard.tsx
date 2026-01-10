import React, { useEffect, useRef, useState } from 'react';
import { getNearbyStations, startLiveMonitoring } from '../services/gemini';
import { sendAlert, sendMessage } from '../services/storage';
import { PlaceResult, User } from '../types';

interface DashboardProps {
  currentUser: User;
}

const Dashboard: React.FC<DashboardProps> = ({ currentUser }) => {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [alertActive, setAlertActive] = useState(false);
  const [triggerReason, setTriggerReason] = useState('');
  const [nearbyPlaces, setNearbyPlaces] = useState<PlaceResult[]>([]);
  const [loadingPlaces, setLoadingPlaces] = useState(false);
  const [safeTimer, setSafeTimer] = useState<number | null>(null);
  const [currentLocation, setCurrentLocation] = useState<{lat: number, lng: number} | null>(null);
  const [locationStatus, setLocationStatus] = useState<string>('Initializing...');
  
  const stopListeningRef = useRef<(() => void) | null>(null);

  // --- Helper: Robust Geolocation ---
  const getRobustLocation = (): Promise<GeolocationPosition> => {
      return new Promise((resolve, reject) => {
          if (!navigator.geolocation) {
              reject(new Error("Not supported"));
              return;
          }

          const success = (pos: GeolocationPosition) => {
              // Cache successful location
              sessionStorage.setItem('last_known_lat', pos.coords.latitude.toString());
              sessionStorage.setItem('last_known_lng', pos.coords.longitude.toString());
              resolve(pos);
          };

          const error = (err: GeolocationPositionError) => {
              // If high accuracy fails, try cache or fail
              const lat = sessionStorage.getItem('last_known_lat');
              const lng = sessionStorage.getItem('last_known_lng');
              if (lat && lng) {
                  // Fake a position object from cache
                  resolve({
                      coords: { latitude: parseFloat(lat), longitude: parseFloat(lng), accuracy: 100, altitude: null, altitudeAccuracy: null, heading: null, speed: null },
                      timestamp: Date.now()
                  } as GeolocationPosition);
                  return;
              }
              reject(err);
          };
          
          // 1. Try High Accuracy (GPS) with short timeout
          navigator.geolocation.getCurrentPosition(success, (e) => {
              console.warn("GPS failed/timeout, trying low accuracy...", e.message);
              // 2. Fallback to Low Accuracy (Wifi/Cell) immediately
              navigator.geolocation.getCurrentPosition(success, error, {
                  enableHighAccuracy: false,
                  timeout: 10000, 
                  maximumAge: 300000 // Accept 5 min old data
              });
          }, {
              enableHighAccuracy: true,
              timeout: 3000 // 3s timeout for GPS
          });
      });
  };

  // --- Alert System ---
  const triggerAlert = async (reason: string) => {
    setAlertActive(true);
    
    let displayReason = reason;
    if (reason.includes("PHRASE_DETECTED")) displayReason = `Danger Phrase "${currentUser.dangerPhrase}" Detected`;
    else if (reason.includes("DISTRESS_DETECTED")) displayReason = "Distress Signals Detected";
    
    setTriggerReason(displayReason);
    
    let lat, lng;
    try {
        const pos = await getRobustLocation();
        lat = pos.coords.latitude;
        lng = pos.coords.longitude;
    } catch (e) {
        console.error("Location failed during alert", e);
    }
    
    currentUser.guardians.forEach(async (gEmail) => {
        await sendMessage({
            senderEmail: currentUser.email,
            receiverEmail: gEmail,
            text: `🚨 SOS! ALERT TRIGGERED: ${displayReason} ${!lat ? '(Location Unavailable)' : ''}`,
            isLocation: !!lat,
            lat,
            lng
        });
        await sendAlert(currentUser.email, gEmail, displayReason, lat, lng);
    });

    if (isListening) toggleListening();
  };

  const toggleListening = async () => {
    if (isListening) {
      if (stopListeningRef.current) stopListeningRef.current();
      setIsListening(false);
      setTranscript('');
    } else {
      setIsListening(true);
      try {
        const monitor = await startLiveMonitoring(
          currentUser.dangerPhrase,
          (reason) => triggerAlert(reason),
          (text) => setTranscript(prev => (prev + ' ' + text).slice(-100))
        );
        stopListeningRef.current = monitor.stop;
      } catch (e) {
        console.error("Failed to start monitoring", e);
        setIsListening(false);
        alert("Microphone access denied. Please check site permissions.");
      }
    }
  };

  useEffect(() => {
    let interval: any;
    if (safeTimer !== null && safeTimer > 0) {
      interval = setInterval(() => setSafeTimer(prev => prev! - 1), 1000);
    } else if (safeTimer === 0) {
      triggerAlert("SAFE TIMER EXPIRED");
      setSafeTimer(null);
    }
    return () => clearInterval(interval);
  }, [safeTimer]);

  useEffect(() => {
    const init = async () => {
        setLocationStatus('Acquiring Satellites...');
        try {
            const pos = await getRobustLocation();
            const { latitude, longitude } = pos.coords;
            setCurrentLocation({ lat: latitude, lng: longitude });
            setLocationStatus('Active');
            
            setLoadingPlaces(true);
            try {
                const places = await getNearbyStations(latitude, longitude);
                setNearbyPlaces(places);
            } catch (e) { console.error(e); }
            setLoadingPlaces(false);

        } catch (e: any) {
            console.error("Dashboard location error", e);
            if (e.code === 1) setLocationStatus("Permission Denied");
            else if (e.code === 2) setLocationStatus("Unavailable");
            else setLocationStatus("Signal Lost");
            setLoadingPlaces(false);
        }
    };
    init();
  }, []);

  return (
    <div className="space-y-6 pb-8">
      {/* Alert Overlay */}
      {alertActive && (
        <div className="fixed inset-0 z-[100] bg-red-950/90 flex flex-col items-center justify-center animate-pulse text-white p-8 text-center backdrop-blur-xl">
          <div className="text-9xl mb-6 text-red-500">🚨</div>
          <h1 className="text-6xl font-black mb-4 uppercase tracking-tighter">SOS ACTIVE</h1>
          <div className="bg-black/40 px-8 py-4 rounded-lg border border-red-500/30 mb-12">
             <p className="text-xl font-mono text-red-200 uppercase">{triggerReason}</p>
          </div>
          <button 
            onClick={() => { setAlertActive(false); window.location.reload(); }} 
            className="bg-red-600 hover:bg-red-500 text-white px-12 py-5 rounded-lg font-bold text-2xl shadow-2xl tracking-widest border border-red-400"
          >
            DEACTIVATE
          </button>
        </div>
      )}

      {/* Hero Status Card */}
      <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-6 shadow-xl relative overflow-hidden">
         <div className="absolute top-0 right-0 p-4 opacity-10">
             <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-32 h-32 text-white">
                <path fillRule="evenodd" d="M12.516 2.17a.75.75 0 00-1.032 0 11.209 11.209 0 01-7.877 3.08.75.75 0 00-.722.515A12.74 12.74 0 002.25 9.75c0 5.942 4.064 10.933 9.563 12.348a.749.749 0 00.374 0c5.499-1.415 9.563-6.406 9.563-12.348 0-1.352-.272-2.636-.759-3.807a.75.75 0 00-.724-.516 11.209 11.209 0 01-7.75-3.256zM8.25 10.5a.75.75 0 000 1.5h7.5a.75.75 0 000-1.5h-7.5z" clipRule="evenodd" />
             </svg>
         </div>

         <div className="flex justify-between items-start relative z-10">
            <div>
                <h2 className="text-zinc-400 text-xs font-bold uppercase tracking-[0.2em] mb-1">System Status</h2>
                <div className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full ${isListening ? 'bg-green-500 animate-pulse' : 'bg-zinc-600'}`}></div>
                    <span className={`text-2xl font-bold ${isListening ? 'text-white' : 'text-zinc-500'}`}>
                        {isListening ? 'MONITORING ACTIVE' : 'STANDBY MODE'}
                    </span>
                </div>
            </div>
            {currentLocation && (
                <div className="text-right">
                    <h2 className="text-zinc-400 text-xs font-bold uppercase tracking-[0.2em] mb-1">GPS Signal</h2>
                    <p className="font-mono text-blue-400 font-bold">{locationStatus}</p>
                </div>
            )}
         </div>

         <div className="mt-8 flex gap-4 relative z-10">
             <button 
                onClick={toggleListening}
                className={`flex-1 py-4 rounded-lg font-bold uppercase tracking-wider transition-all border ${
                    isListening 
                    ? 'bg-green-900/20 border-green-500/50 text-green-400 hover:bg-green-900/40' 
                    : 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700 hover:text-white'
                }`}
             >
                {isListening ? 'Deactivate Shield' : 'Activate Shield'}
             </button>
         </div>
         {transcript && isListening && (
             <div className="mt-4 p-3 bg-black/40 rounded border border-zinc-800 font-mono text-xs text-green-500/70 truncate">
                 &gt; {transcript}
             </div>
         )}
      </div>

      {/* Emergency Actions */}
      <div className="grid grid-cols-2 gap-4">
        <button 
            onClick={() => triggerAlert("MANUAL SOS")}
            className="group bg-gradient-to-br from-red-600 to-red-800 hover:from-red-500 hover:to-red-700 text-white p-6 rounded-lg shadow-lg border border-red-500/50 flex flex-col items-center justify-center transition-all active:scale-[0.98]"
        >
          <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center mb-3 group-hover:bg-white/20 transition-colors">
            <span className="text-3xl">🆘</span>
          </div>
          <span className="font-black text-lg tracking-widest">PANIC</span>
        </button>

        <button 
            onClick={() => setSafeTimer(30)}
            disabled={safeTimer !== null}
            className={`group p-6 rounded-lg border flex flex-col items-center justify-center transition-all ${
                safeTimer !== null 
                ? 'bg-amber-900/20 border-amber-500/50 cursor-default' 
                : 'bg-zinc-800 border-zinc-700 hover:bg-zinc-750 hover:border-zinc-600'
            }`}
        >
          {safeTimer !== null ? (
            <>
                <span className="text-4xl font-mono font-bold text-amber-500 mb-2 animate-pulse">{safeTimer}s</span>
                <span className="text-xs font-bold text-amber-600 uppercase">Counting Down</span>
            </>
          ) : (
            <>
                 <div className="w-16 h-16 rounded-full bg-zinc-700/50 flex items-center justify-center mb-3 group-hover:bg-zinc-700 transition-colors">
                    <span className="text-3xl">⏱️</span>
                </div>
                <span className="font-bold text-zinc-300 tracking-wider">TIMER</span>
            </>
          )}
        </button>
      </div>

      {/* Cancel Timer Button */}
      {safeTimer !== null && (
          <button 
            onClick={() => setSafeTimer(null)} 
            className="w-full bg-amber-600 hover:bg-amber-500 text-white py-4 rounded-lg font-bold text-lg uppercase tracking-widest shadow-lg animate-fade-in"
          >
              ABORT TIMER
          </button>
      )}

      {/* Location Status Bar */}
      <div className="bg-zinc-900 p-4 rounded-lg border border-zinc-800 flex justify-between items-center">
          <div>
              <h3 className="text-zinc-500 text-xs font-bold uppercase tracking-wider mb-1">Current Coordinates</h3>
              {currentLocation ? (
                  <div className="flex items-baseline gap-2">
                      <span className="text-white font-mono text-sm">{currentLocation.lat.toFixed(6)}, {currentLocation.lng.toFixed(6)}</span>
                      <a href={`https://maps.google.com/?q=${currentLocation.lat},${currentLocation.lng}`} target="_blank" className="text-blue-500 text-xs hover:underline ml-2">Open Map</a>
                  </div>
              ) : (
                  <span className="text-red-500 text-sm font-bold flex items-center gap-2">
                      {locationStatus === 'Permission Denied' ? (
                          <button onClick={() => window.location.reload()} className="underline">Retry Permission</button>
                      ) : locationStatus}
                  </span>
              )}
          </div>
          <div className="w-10 h-10 rounded bg-zinc-800 flex items-center justify-center text-zinc-500">
             <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
                <path fillRule="evenodd" d="M11.54 22.351l.07.04.028.016a.76.76 0 00.723 0l.028-.015.071-.041a16.975 16.975 0 001.144-.742 19.58 19.58 0 002.683-2.282c1.944-1.99 3.963-4.98 3.963-8.827a8.25 8.25 0 00-16.5 0c0 3.846 2.02 6.837 3.963 8.827a19.58 19.58 0 002.682 2.282 16.975 16.975 0 001.145.742zM12 13.5a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
            </svg>
          </div>
      </div>

      {/* Nearby Services List */}
      <div className="border-t border-zinc-800 pt-6">
        <h3 className="text-zinc-500 font-bold text-xs uppercase tracking-wider mb-4 px-1">Nearby Emergency Assets</h3>
        <div className="space-y-2">
            {loadingPlaces ? (
                <div className="p-4 text-center text-zinc-600 text-sm font-mono animate-pulse">
                    SCANNING FREQUENCIES...
                </div>
            ) : nearbyPlaces.length > 0 ? (
                nearbyPlaces.map((place, idx) => (
                    <a 
                        key={idx} 
                        href={place.uri} 
                        target="_blank" 
                        rel="noreferrer" 
                        className="block bg-zinc-900 hover:bg-zinc-800 p-4 rounded-lg border border-zinc-800 transition-colors group"
                    >
                        <div className="flex justify-between items-center mb-1">
                            <span className="text-zinc-300 font-bold text-sm group-hover:text-white">{place.title}</span>
                            <span className="text-[10px] bg-zinc-800 text-zinc-400 px-2 py-1 rounded font-mono">
                                {place.distance}
                            </span>
                        </div>
                        <div className="text-xs text-zinc-500 truncate">{place.address}</div>
                    </a>
                ))
            ) : (
                <div className="p-4 bg-zinc-900 rounded-lg border border-zinc-800 text-center text-zinc-500 text-sm">
                    No verified stations nearby. 
                    {currentLocation && (
                        <a href={`https://www.google.com/maps/search/police/@${currentLocation.lat},${currentLocation.lng}`} target="_blank" className="text-blue-500 ml-2 hover:underline">Manual Search</a>
                    )}
                </div>
            )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;