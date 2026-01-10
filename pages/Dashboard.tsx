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
  const [nearbyPlaces, setNearbyPlaces] = useState<PlaceResult[]>([]);
  const [loadingPlaces, setLoadingPlaces] = useState(false);
  const [safeTimer, setSafeTimer] = useState<number | null>(null);
  const [currentLocation, setCurrentLocation] = useState<{lat: number, lng: number} | null>(null);
  
  const stopListeningRef = useRef<(() => void) | null>(null);

  // --- Alert System ---
  const triggerAlert = async (reason: string) => {
    setAlertActive(true);
    
    // Helper to send data to a specific guardian
    const notifyGuardian = async (gEmail: string, lat?: number, lng?: number) => {
        // 1. Send High Priority Alert (Triggers Alarm Sound)
        await sendAlert(currentUser.email, gEmail, reason, lat, lng);
        
        // 2. Send Chat Message (Logs in 2-way comms & provides persistent map link)
        await sendMessage({
            senderEmail: currentUser.email,
            receiverEmail: gEmail,
            text: `🚨 SOS TRIGGERED: ${reason}`,
            isLocation: !!(lat && lng),
            lat: lat,
            lng: lng
        });
    };

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((pos) => {
        const { latitude, longitude } = pos.coords;
        currentUser.guardians.forEach(gEmail => notifyGuardian(gEmail, latitude, longitude));
      }, (err) => {
           console.error("Geo error", err);
           currentUser.guardians.forEach(gEmail => notifyGuardian(gEmail));
      });
    } else {
        // Fallback for no geolocation support
        currentUser.guardians.forEach(gEmail => notifyGuardian(gEmail));
    }

    if (isListening) toggleListening();
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
          (text) => setTranscript(prev => (prev + ' ' + text).slice(-100))
        );
        stopListeningRef.current = monitor.stop;
      } catch (e) {
        console.error("Failed to start monitoring", e);
        setIsListening(false);
        alert("Microphone access required.");
      }
    }
  };

  // --- Safe Timer ---
  const startSafeTimer = () => {
    setSafeTimer(30); 
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

  // --- Live Location ---
  useEffect(() => {
    if (navigator.geolocation) {
        const watchId = navigator.geolocation.watchPosition(
            (pos) => {
                setCurrentLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
            },
            (err) => console.error(err),
            { enableHighAccuracy: true, maximumAge: 10000, timeout: 5000 }
        );
        return () => navigator.geolocation.clearWatch(watchId);
    }
  }, []);

  // --- Nearby Places ---
  useEffect(() => {
    if (navigator.geolocation) {
      setLoadingPlaces(true);
      navigator.geolocation.getCurrentPosition(async (pos) => {
        try {
            const places = await getNearbyStations(pos.coords.latitude, pos.coords.longitude);
            setNearbyPlaces(places);
        } catch(e) {
            console.error(e);
        } finally {
            setLoadingPlaces(false);
        }
      }, () => setLoadingPlaces(false));
    }
  }, []);

  return (
    <div className="space-y-6 pb-8">
      {/* Alert Overlay */}
      {alertActive && (
        <div className="fixed inset-0 z-[100] bg-red-600/95 backdrop-blur-xl flex flex-col items-center justify-center animate-pulse-fast text-white p-8 text-center">
          <div className="text-9xl mb-6">🚨</div>
          <h1 className="text-6xl font-black mb-4 tracking-tighter uppercase">SOS Sent</h1>
          <p className="text-2xl mb-12 opacity-90">Guardians have been notified.</p>
          <button 
            onClick={() => { setAlertActive(false); window.location.reload(); }} 
            className="bg-white text-red-600 px-12 py-5 rounded-full font-bold text-xl shadow-2xl hover:scale-105 transition-all"
          >
            I AM SAFE
          </button>
        </div>
      )}

      {/* Monitor Card */}
      <div className={`relative overflow-hidden p-8 rounded-3xl border transition-all duration-500 shadow-2xl ${isListening ? 'border-green-500/30 bg-gradient-to-b from-green-900/20 to-slate-900/50' : 'border-white/5 bg-card/40 backdrop-blur-md'}`}>
        <div className="relative z-10">
            <div className="flex justify-between items-start mb-8">
                <div>
                    <h2 className="text-3xl font-bold text-white mb-2">Active Shield</h2>
                    <p className="text-gray-400 text-sm">
                        Phrase: <span className="text-blue-300 font-mono">"{currentUser.dangerPhrase}"</span>
                    </p>
                </div>
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all ${isListening ? 'bg-green-500 text-white animate-pulse' : 'bg-slate-700 text-gray-400'}`}>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
                        <path d="M8.25 4.5a3.75 3.75 0 117.5 0v8.25a3.75 3.75 0 11-7.5 0V4.5z" />
                        <path d="M6 10.5a.75.75 0 01.75.75v1.5a5.25 5.25 0 1010.5 0v-1.5a.75.75 0 011.5 0v1.5a6.75 6.75 0 01-6 6.75v2.25h3a.75.75 0 010 1.5h-7.5a.75.75 0 010-1.5h3v-2.25A6.75 6.75 0 016 12.75v-1.5a.75.75 0 01.75-.75z" />
                    </svg>
                </div>
            </div>

            {isListening && (
                <div className="mb-6 bg-black/40 rounded-xl p-4 border border-white/5">
                    <p className="font-mono text-sm text-green-100/80 h-12 overflow-hidden">
                        {transcript || "Listening..."}
                    </p>
                </div>
            )}

            <button 
              onClick={toggleListening}
              className={`w-full py-5 rounded-2xl font-bold text-lg shadow-xl transition-all ${
                isListening 
                    ? 'bg-slate-700 text-gray-300' 
                    : 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white'
              }`}
            >
              {isListening ? 'DEACTIVATE' : 'ACTIVATE SHIELD'}
            </button>
        </div>
      </div>
      
      {/* Location & Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-slate-800/40 p-5 rounded-2xl border border-white/5 flex items-center justify-between">
              <div>
                  <h3 className="text-gray-400 text-xs font-bold uppercase mb-1">My Location</h3>
                  {currentLocation ? (
                      <p className="text-white font-mono text-sm">{currentLocation.lat.toFixed(4)}, {currentLocation.lng.toFixed(4)}</p>
                  ) : (
                      <span className="text-gray-500 text-xs animate-pulse">Locating...</span>
                  )}
              </div>
              {currentLocation && (
                  <a href={`https://www.google.com/maps/search/?api=1&query=${currentLocation.lat},${currentLocation.lng}`} target="_blank" className="bg-white/10 p-2 rounded-lg text-white hover:bg-white/20">
                      ↗
                  </a>
              )}
          </div>
          
          <div className="flex gap-2">
            <button onClick={() => triggerAlert("MANUAL SOS")} className="flex-1 bg-red-600 hover:bg-red-500 text-white rounded-2xl font-bold shadow-lg shadow-red-900/20 active:scale-95 transition-all p-4">
                SOS
            </button>
            <button 
                onClick={startSafeTimer}
                disabled={safeTimer !== null}
                className="flex-1 bg-amber-500 hover:bg-amber-400 text-white rounded-2xl font-bold shadow-lg shadow-amber-900/20 active:scale-95 transition-all p-4 disabled:opacity-50"
            >
                {safeTimer !== null ? `${safeTimer}s` : 'TIMER'}
            </button>
          </div>
      </div>

      {safeTimer !== null && (
          <button onClick={() => setSafeTimer(null)} className="w-full bg-slate-800 text-amber-500 p-4 rounded-2xl font-bold border border-amber-500/50">
              Cancel Timer
          </button>
      )}

      {/* Nearby Stations List */}
      <div className="bg-card/40 backdrop-blur-md rounded-3xl p-6 border border-white/5">
        <h3 className="text-white font-bold text-xl mb-6 flex items-center gap-3">
            <span className="bg-blue-500/20 p-2 rounded-lg text-blue-400">📍</span>
            Nearby Safe Havens
        </h3>
        
        {loadingPlaces ? (
            <div className="py-8 text-center">
                <div className="inline-block w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mb-2"></div>
                <p className="text-gray-500 text-xs">Locating services...</p>
            </div>
        ) : nearbyPlaces.length > 0 ? (
            <div className="space-y-3">
                {nearbyPlaces.map((place, idx) => (
                    <a 
                        key={idx} 
                        href={place.uri} 
                        target="_blank" 
                        rel="noreferrer" 
                        className="block bg-slate-800/40 hover:bg-slate-700/50 border border-white/5 p-4 rounded-2xl transition-all flex justify-between items-center group"
                    >
                        <div>
                            <div className="text-gray-200 font-semibold group-hover:text-blue-400 transition-colors">{place.title}</div>
                            <div className="text-xs text-gray-500 mt-1">{place.address || "Tap to view on map"}</div>
                        </div>
                        <div className="bg-blue-500/10 text-blue-400 px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap">
                            {place.distance || "Go ↗"}
                        </div>
                    </a>
                ))}
            </div>
        ) : (
            <div className="text-center py-8 bg-white/5 rounded-2xl border border-dashed border-white/10">
                <p className="text-gray-400 text-sm">No specific stations found nearby.</p>
                <a 
                    href={`https://www.google.com/maps/search/emergency+services/@${currentLocation?.lat || 0},${currentLocation?.lng || 0},14z`} 
                    target="_blank"
                    className="text-blue-400 text-xs mt-2 inline-block hover:underline"
                >
                    Open Google Maps Search
                </a>
            </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;