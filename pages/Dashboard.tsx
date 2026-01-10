import React, { useEffect, useRef, useState } from 'react';
import { getNearbyStations, startLiveMonitoring } from '../services/gemini';
import { sendAlert, sendMessage, updateLiveLocation } from '../services/storage';
import { PlaceResult, User } from '../types';

interface DashboardProps {
  currentUser: User;
}

const Dashboard: React.FC<DashboardProps> = ({ currentUser }) => {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [alertActive, setAlertActive] = useState(false);
  const [nearbyPlaces, setNearbyPlaces] = useState<PlaceResult[]>([]);
  const [loadingPlaces, setLoadingPlaces] = useState(false);
  const [safeTimer, setSafeTimer] = useState<number | null>(null);
  
  // Location State
  const [currentLocation, setCurrentLocation] = useState<{lat: number, lng: number} | null>(null);
  const [locError, setLocError] = useState<string>('');
  
  const stopListeningRef = useRef<(() => void) | null>(null);
  const locationWatchId = useRef<number | null>(null);
  const locationBroadcastInterval = useRef<any>(null);

  // --- Alert System ---
  const triggerAlert = async (reason: string) => {
    setAlertActive(true);
    
    // Attempt to get location one-off with fallback
    const getLocationForAlert = () => {
        return new Promise<{latitude: number, longitude: number}>((resolve, reject) => {
             // Try High Accuracy First
             navigator.geolocation.getCurrentPosition(
                 (pos) => resolve(pos.coords),
                 (err) => {
                     console.warn("High accuracy failed, trying low accuracy");
                     // Fallback
                     navigator.geolocation.getCurrentPosition(
                         (pos) => resolve(pos.coords),
                         (finalErr) => reject(finalErr),
                         { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
                     );
                 },
                 { enableHighAccuracy: true, timeout: 5000 }
             );
        });
    };

    try {
        const coords = await getLocationForAlert();
        const { latitude, longitude } = coords;
        
        updateLiveLocation(currentUser.email, latitude, longitude);

        currentUser.guardians.forEach(async (gEmail) => {
           await sendMessage({
             senderEmail: currentUser.email,
             receiverEmail: gEmail,
             text: `🚨 SOS! ALERT TRIGGERED: ${reason}`,
             isLocation: true,
             lat: latitude,
             lng: longitude
           });
           await sendAlert(currentUser.email, gEmail, reason, latitude, longitude);
        });

    } catch (e) {
        console.error("Geo error on alert", e);
        // Send alert without location if it completely fails
        currentUser.guardians.forEach(async (gEmail) => {
             await sendMessage({
               senderEmail: currentUser.email,
               receiverEmail: gEmail,
               text: `🚨 SOS! ALERT TRIGGERED: ${reason} (Location Unavailable)`,
             });
             await sendAlert(currentUser.email, gEmail, reason);
        });
    }

    // Stop listening if active
    if (isListening) {
      toggleListening();
    }
  };

  // --- Monitoring ---
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
          (text) => setTranscript(prev => (prev + ' ' + text).slice(-100)) // Keep last 100 chars
        );
        stopListeningRef.current = monitor.stop;
      } catch (e) {
        console.error("Failed to start monitoring", e);
        setIsListening(false);
        alert("Failed to access microphone. Please allow permissions.");
      }
    }
  };

  // --- Safe Timer ---
  const startSafeTimer = () => {
    setSafeTimer(30); // 30 seconds default
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

  // --- ROBUST REAL-TIME LOCATION TRACKING ---
  
  useEffect(() => {
    if (!navigator.geolocation) {
        setLocError("Geolocation not supported");
        return;
    }

    const success = (pos: GeolocationPosition) => {
        setLocError('');
        const { latitude, longitude } = pos.coords;
        setCurrentLocation({ lat: latitude, lng: longitude });
    };

    const error = (err: GeolocationPositionError) => {
        console.warn("Location error:", err.message);
        if (err.code === 1) setLocError("Permission denied");
        else if (err.code === 2) setLocError("Position unavailable");
        else if (err.code === 3) {
            // Timeout: Don't show error, just fallback gracefully
            console.log("High accuracy timeout, switching to standard accuracy...");
            restartWatcher(false); 
        }
    };

    const startWatcher = (highAccuracy: boolean) => {
        if (locationWatchId.current !== null) navigator.geolocation.clearWatch(locationWatchId.current);
        
        locationWatchId.current = navigator.geolocation.watchPosition(success, error, {
            enableHighAccuracy: highAccuracy,
            maximumAge: 10000, 
            timeout: 20000 // Increased timeout to 20s
        });
    };

    const restartWatcher = (highAccuracy: boolean) => {
        startWatcher(highAccuracy);
    };

    // Initial start with high accuracy
    startWatcher(true);

    return () => {
        if (locationWatchId.current !== null) navigator.geolocation.clearWatch(locationWatchId.current);
    };
  }, []);

  // 2. Broadcast Loop (Send to Firebase)
  useEffect(() => {
      if (isListening || alertActive) {
          if (currentLocation) {
              updateLiveLocation(currentUser.email, currentLocation.lat, currentLocation.lng);
          }
          locationBroadcastInterval.current = setInterval(() => {
              if (currentLocation) {
                  updateLiveLocation(currentUser.email, currentLocation.lat, currentLocation.lng);
              }
          }, 3000); 
      } else {
          if (locationBroadcastInterval.current) clearInterval(locationBroadcastInterval.current);
      }

      return () => {
          if (locationBroadcastInterval.current) clearInterval(locationBroadcastInterval.current);
      };
  }, [isListening, alertActive, currentLocation, currentUser.email]);


  // --- Nearby Places Fetch ---
  const fetchNearby = () => {
    if (navigator.geolocation) {
      setLoadingPlaces(true);
      
      const onSuccess = async (pos: GeolocationPosition) => {
        const places = await getNearbyStations(pos.coords.latitude, pos.coords.longitude);
        setNearbyPlaces(places);
        setLoadingPlaces(false);
      };
      
      const onError = (err: GeolocationPositionError) => {
          console.error("Error fetching nearby location", err);
          // Retry with low accuracy if timeout
          if (err.code === 3) {
              navigator.geolocation.getCurrentPosition(
                  onSuccess, 
                  () => setLoadingPlaces(false), 
                  { enableHighAccuracy: false, timeout: 10000 }
              );
          } else {
              setLoadingPlaces(false);
          }
      };

      // Increased initial timeout to 10s
      navigator.geolocation.getCurrentPosition(onSuccess, onError, { enableHighAccuracy: true, timeout: 10000 });

    } else {
        alert("Geolocation is not enabled.");
    }
  };

  useEffect(() => {
    fetchNearby();
  }, []);

  return (
    <div className="space-y-6 pb-8">
      {/* Alert Overlay - Visual Only */}
      {alertActive && (
        <div className="fixed inset-0 z-[100] bg-red-600/95 backdrop-blur-xl flex flex-col items-center justify-center animate-pulse-fast text-white p-8 text-center">
          <div className="text-9xl mb-6 filter drop-shadow-lg">🚨</div>
          <h1 className="text-6xl font-black mb-4 tracking-tighter uppercase drop-shadow-md">SOS Sent</h1>
          <p className="text-2xl mb-12 font-light opacity-90 max-w-md">Alert sent to guardians. Alarm will ring on their devices.</p>
          <button 
            onClick={() => { setAlertActive(false); window.location.reload(); }} 
            className="bg-white text-red-600 px-12 py-5 rounded-full font-bold text-xl shadow-2xl hover:scale-105 active:scale-95 transition-all transform border-4 border-red-100"
          >
            I AM SAFE
          </button>
        </div>
      )}

      {/* Hero / Monitor Section */}
      <div className={`relative overflow-hidden p-8 rounded-3xl border transition-all duration-500 shadow-2xl group ${isListening ? 'border-green-500/30 bg-gradient-to-b from-green-900/20 to-slate-900/50 shadow-green-900/20' : 'border-white/5 bg-card/40 backdrop-blur-md shadow-black/20'}`}>
        
        {/* Background glow effects */}
        <div className={`absolute -top-20 -right-20 w-64 h-64 rounded-full blur-3xl opacity-20 transition-colors duration-700 ${isListening ? 'bg-green-500' : 'bg-blue-500'}`}></div>
        
        <div className="relative z-10">
            <div className="flex justify-between items-start mb-8">
                <div>
                    <h2 className="text-3xl font-bold text-white mb-2 tracking-tight">Active Shield</h2>
                    <div className="flex items-center gap-3">
                         <span className={`inline-block w-2 h-2 rounded-full ${isListening ? 'bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.8)]' : 'bg-gray-500'}`}></span>
                         <p className="text-gray-400 text-sm font-medium tracking-wide">
                            Trigger Phrase: <span className="text-blue-300 font-mono bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20">"{currentUser.dangerPhrase}"</span>
                         </p>
                    </div>
                </div>
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-300 ${isListening ? 'bg-green-500 text-white shadow-lg shadow-green-500/30' : 'bg-slate-700 text-gray-400'}`}>
                    {isListening ? (
                        <span className="animate-ping absolute inline-flex h-8 w-8 rounded-full bg-green-400 opacity-75"></span>
                    ) : null}
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6 relative z-10">
                        <path d="M8.25 4.5a3.75 3.75 0 117.5 0v8.25a3.75 3.75 0 11-7.5 0V4.5z" />
                        <path d="M6 10.5a.75.75 0 01.75.75v1.5a5.25 5.25 0 1010.5 0v-1.5a.75.75 0 011.5 0v1.5a6.75 6.75 0 01-6 6.75v2.25h3a.75.75 0 010 1.5h-7.5a.75.75 0 010-1.5h3v-2.25A6.75 6.75 0 016 12.75v-1.5a.75.75 0 01.75-.75z" />
                    </svg>
                </div>
            </div>

            {isListening && (
                <div className="mb-6 bg-black/40 rounded-xl p-4 border border-white/5 backdrop-blur-sm relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-green-500 to-transparent opacity-50"></div>
                    <div className="text-xs uppercase tracking-widest text-green-500 mb-2 font-bold flex justify-between">
                        <span>Live Transcript</span>
                        <span className="animate-pulse">● REC</span>
                    </div>
                    <p className="font-mono text-sm text-green-100/80 h-16 overflow-hidden leading-relaxed">
                        {transcript || "Listening for triggers..."}
                    </p>
                    
                    {currentLocation && (
                        <div className="mt-2 pt-2 border-t border-white/10 flex items-center gap-2">
                             <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
                             <span className="text-[10px] text-blue-300 font-mono">BROADCASTING LOCATION: {currentLocation.lat.toFixed(4)}, {currentLocation.lng.toFixed(4)}</span>
                        </div>
                    )}
                </div>
            )}

            <button 
              onClick={toggleListening}
              className={`w-full py-5 rounded-2xl font-bold text-lg tracking-wide transition-all duration-300 shadow-xl ${
                isListening 
                    ? 'bg-slate-700 text-gray-300 hover:bg-slate-600 border border-white/5' 
                    : 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:shadow-blue-500/25 hover:-translate-y-1'
              }`}
            >
              {isListening ? 'DEACTIVATE SHIELD' : 'ACTIVATE SHIELD'}
            </button>
        </div>
      </div>
      
      {/* Live Location Card */}
      <div className="bg-slate-800/40 backdrop-blur-md p-5 rounded-2xl border border-white/5 flex items-center justify-between shadow-lg">
          <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
                      <path fillRule="evenodd" d="M11.54 22.351l.07.04.028.016a.76.76 0 00.723 0l.028-.015.071-.041a16.975 16.975 0 001.144-.742 19.58 19.58 0 002.683-2.282c1.944-1.99 3.963-4.98 3.963-8.827a8.25 8.25 0 00-16.5 0c0 3.846 2.02 6.837 3.963 8.827a19.58 19.58 0 002.682 2.282 16.975 16.975 0 001.145.742zM12 13.5a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
                  </svg>
              </div>
              <div>
                  <h3 className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-0.5">My Current Location</h3>
                  {currentLocation ? (
                      <p className="text-white font-mono text-sm tracking-wide">
                          {currentLocation.lat.toFixed(6)}, {currentLocation.lng.toFixed(6)}
                      </p>
                  ) : locError ? (
                       <span className="text-red-400 text-xs font-bold">{locError}</span>
                  ) : (
                      <div className="flex items-center gap-2">
                          <div className="w-1 h-1 bg-gray-500 rounded-full animate-bounce"></div>
                          <div className="w-1 h-1 bg-gray-500 rounded-full animate-bounce delay-100"></div>
                          <div className="w-1 h-1 bg-gray-500 rounded-full animate-bounce delay-200"></div>
                          <span className="text-gray-500 text-xs">Locating...</span>
                      </div>
                  )}
              </div>
          </div>
          {currentLocation && (
              <a 
                  href={`https://www.google.com/maps/search/?api=1&query=${currentLocation.lat},${currentLocation.lng}`}
                  target="_blank"
                  rel="noreferrer" 
                  className="bg-white/5 hover:bg-white/10 text-white p-2.5 rounded-xl transition-all border border-white/5 hover:border-blue-500/50 group"
                  title="View on Maps"
              >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 group-hover:text-blue-400 transition-colors">
                      <path d="M10 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z" />
                      <path fillRule="evenodd" d="M.664 10.59a1.651 1.651 0 010-1.186A10.004 10.004 0 0110 3c4.257 0 7.893 2.66 9.336 6.41.147.381.146.804 0 1.186A10.004 10.004 0 0110 17c-4.257 0-7.893-2.66-9.336-6.41zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
                  </svg>
              </a>
          )}
      </div>

      {/* Quick Actions Grid */}
      <div className="grid grid-cols-2 gap-4">
        <button 
            onClick={() => triggerAlert("MANUAL PANIC BUTTON")}
            className="group relative overflow-hidden bg-gradient-to-br from-red-500 to-rose-600 p-6 rounded-3xl flex flex-col items-center justify-center shadow-lg shadow-red-900/20 active:scale-95 transition-all hover:shadow-red-500/30"
        >
          <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity"></div>
          <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mb-3 backdrop-blur-sm group-hover:scale-110 transition-transform duration-300">
             <span className="text-4xl">🚨</span>
          </div>
          <span className="font-bold text-white text-lg tracking-tight">INSTANT SOS</span>
          <span className="text-red-100 text-xs mt-1 opacity-80">Tap to trigger</span>
        </button>

        <button 
            onClick={startSafeTimer}
            disabled={safeTimer !== null}
            className={`group relative overflow-hidden p-6 rounded-3xl flex flex-col items-center justify-center shadow-lg active:scale-95 transition-all ${
                safeTimer !== null 
                ? 'bg-amber-500/20 border-2 border-amber-500 cursor-default' 
                : 'bg-gradient-to-br from-amber-400 to-orange-500 shadow-orange-900/20 hover:shadow-orange-500/30'
            }`}
        >
          {safeTimer !== null ? (
            <>
                <span className="text-5xl font-mono font-bold text-amber-500 mb-1 drop-shadow-lg">{safeTimer}</span>
                <span className="text-xs text-amber-500 uppercase font-bold tracking-widest animate-pulse">Seconds Left</span>
            </>
          ) : (
            <>
                <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mb-3 backdrop-blur-sm group-hover:rotate-12 transition-transform duration-300">
                    <span className="text-4xl">⏱️</span>
                </div>
                <span className="font-bold text-white text-lg tracking-tight">SAFE TIMER</span>
                <span className="text-amber-100 text-xs mt-1 opacity-80">30s Countdown</span>
            </>
          )}
        </button>
      </div>

      {/* Timer Cancellation (if active) */}
      {safeTimer !== null && (
          <div className="bg-amber-900/20 border border-amber-500/50 p-4 rounded-2xl flex justify-between items-center backdrop-blur-sm animate-fade-in">
              <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></div>
                  <p className="text-amber-200 font-medium">Timer active</p>
              </div>
              <button 
                onClick={() => setSafeTimer(null)} 
                className="bg-amber-500 hover:bg-amber-400 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-lg shadow-amber-900/20 transition-colors"
              >
                Cancel
              </button>
          </div>
      )}

      {/* Nearby Stations */}
      <div className="bg-card/40 backdrop-blur-md rounded-3xl p-6 border border-white/5 shadow-xl">
        <div className="flex justify-between items-center mb-6">
            <h3 className="text-white font-bold text-xl flex items-center gap-3">
                <span className="bg-blue-500/20 p-2 rounded-lg text-blue-400">📍</span>
                Nearby Safe Havens
            </h3>
            <button 
                onClick={fetchNearby}
                disabled={loadingPlaces}
                className="text-sm bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-lg text-gray-300 transition-colors flex items-center gap-2"
            >
                {loadingPlaces ? <span className="w-3 h-3 border border-white/50 border-t-transparent rounded-full animate-spin"></span> : '↻ Refresh'}
            </button>
        </div>
        
        {loadingPlaces ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400 space-y-4">
                <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                <span className="text-sm font-medium animate-pulse">Scanning area via Gemini Maps...</span>
            </div>
        ) : nearbyPlaces.length > 0 ? (
            <div className="grid gap-4">
                {nearbyPlaces.map((place, idx) => (
                    <a 
                        key={idx} 
                        href={place.uri} 
                        target="_blank" 
                        rel="noreferrer" 
                        className="group block bg-slate-800/40 hover:bg-slate-700/50 border border-white/5 hover:border-blue-500/30 p-4 rounded-2xl transition-all duration-300"
                    >
                        <div className="flex justify-between items-start mb-2">
                            <div className="text-gray-200 font-semibold group-hover:text-blue-400 transition-colors">{place.title}</div>
                            {place.distance && (
                                <span className="text-[10px] font-bold bg-blue-500/20 text-blue-300 px-2.5 py-1 rounded-full whitespace-nowrap border border-blue-500/10">
                                    {place.distance}
                                </span>
                            )}
                        </div>
                        {place.address && (
                            <div className="text-sm text-gray-400 mb-3 line-clamp-2">{place.address}</div>
                        )}
                        <div className="flex items-center text-xs text-gray-500 group-hover:text-blue-400/80 transition-colors gap-1">
                            <span>Navigate</span>
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3 transform group-hover:translate-x-1 transition-transform">
                                <path fillRule="evenodd" d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z" clipRule="evenodd" />
                            </svg>
                        </div>
                    </a>
                ))}
            </div>
        ) : (
            <div className="text-center py-8 bg-white/5 rounded-2xl border border-dashed border-white/10">
                <span className="text-4xl block mb-2 opacity-50">🗺️</span>
                <p className="text-gray-400 text-sm">No nearby stations found.<br/>Check location permissions.</p>
            </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;