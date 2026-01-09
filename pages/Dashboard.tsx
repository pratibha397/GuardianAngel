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
    
    // Send Alert Signal and Location to Guardians
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((pos) => {
        const { latitude, longitude } = pos.coords;
        
        currentUser.guardians.forEach(async (gEmail) => {
           // 1. Send Chat Message (Record)
           await sendMessage({
             senderEmail: currentUser.email,
             receiverEmail: gEmail,
             text: `🚨 SOS! ALERT TRIGGERED: ${reason}`,
             isLocation: true,
             lat: latitude,
             lng: longitude
           });
           
           // 2. Send Alert Signal (Triggers Alarm on Guardian Phone)
           await sendAlert(currentUser.email, gEmail, reason, latitude, longitude);
        });
      }, (err) => {
          // If geolocation fails, still send the alert without location
          console.error("Geo error", err);
           currentUser.guardians.forEach(async (gEmail) => {
             await sendMessage({
               senderEmail: currentUser.email,
               receiverEmail: gEmail,
               text: `🚨 SOS! ALERT TRIGGERED: ${reason} (Location Unavailable)`,
             });
             await sendAlert(currentUser.email, gEmail, reason);
           });
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

  // --- Live Location Tracking (Self) ---
  useEffect(() => {
    if (navigator.geolocation) {
        // Watch position for real-time updates on dashboard
        const watchId = navigator.geolocation.watchPosition(
            (pos) => {
                setCurrentLocation({
                    lat: pos.coords.latitude,
                    lng: pos.coords.longitude
                });
            },
            (err) => console.error("Location watch error:", err),
            { enableHighAccuracy: true, maximumAge: 10000, timeout: 5000 }
        );
        return () => navigator.geolocation.clearWatch(watchId);
    }
  }, []);

  // --- Nearby Places (One-time fetch) ---
  useEffect(() => {
    if (navigator.geolocation) {
      setLoadingPlaces(true);
      navigator.geolocation.getCurrentPosition(async (pos) => {
        const places = await getNearbyStations(pos.coords.latitude, pos.coords.longitude);
        setNearbyPlaces(places);
        setLoadingPlaces(false);
      }, (err) => {
        console.error(err);
        setLoadingPlaces(false);
      });
    }
  }, []);

  return (
    <div className="space-y-6 pb-8">
      {/* Alert Overlay - Visual Only */}
      {alertActive && (
        <div className="fixed inset-0 z-[100] bg-red-600/95 backdrop-blur-2xl flex flex-col items-center justify-center animate-pulse-fast text-white p-8 text-center">
          <div className="text-9xl mb-6 filter drop-shadow-2xl animate-bounce">🚨</div>
          <h1 className="text-6xl font-black mb-4 tracking-tighter uppercase drop-shadow-lg">SOS Sent</h1>
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
      <div className={`relative overflow-hidden p-8 rounded-[2.5rem] border transition-all duration-700 shadow-2xl group ${isListening ? 'border-green-500/30 bg-gradient-to-br from-green-950/80 via-slate-900 to-black shadow-green-500/20' : 'border-white/5 bg-slate-900/60 backdrop-blur-xl shadow-black/40'}`}>
        
        {/* Background glow effects */}
        <div className={`absolute -top-32 -right-32 w-96 h-96 rounded-full blur-[120px] opacity-30 transition-colors duration-1000 ${isListening ? 'bg-green-500' : 'bg-blue-600'}`}></div>
        
        <div className="relative z-10 flex flex-col items-center text-center">
            
            <h2 className="text-xs font-bold uppercase tracking-[0.2em] mb-6 text-gray-400">
                System Status: <span className={isListening ? 'text-green-400' : 'text-gray-500'}>{isListening ? 'ARMED' : 'STANDBY'}</span>
            </h2>

            <div className="relative mb-8 group-hover:scale-105 transition-transform duration-500">
                {isListening && <div className="absolute inset-0 bg-green-500/30 rounded-full blur-2xl animate-pulse"></div>}
                <button 
                    onClick={toggleListening}
                    className={`w-32 h-32 rounded-full flex items-center justify-center border-4 transition-all duration-500 shadow-[0_0_50px_rgba(0,0,0,0.5)] ${
                        isListening 
                        ? 'bg-slate-900 border-green-500 text-green-500 hover:bg-slate-800' 
                        : 'bg-gradient-to-b from-slate-700 to-slate-800 border-slate-600 text-gray-300 hover:border-blue-400 hover:text-white'
                    }`}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={`w-12 h-12 transition-transform ${isListening ? 'scale-110' : ''}`}>
                        <path fillRule="evenodd" d="M12.516 2.17a.75.75 0 00-1.032 0 11.209 11.209 0 01-7.877 3.08.75.75 0 00-.722.515A12.74 12.74 0 002.25 9.75c0 5.942 4.064 10.933 9.563 12.348a.749.749 0 00.374 0c5.499-1.415 9.563-6.406 9.563-12.348 0-1.352-.272-2.636-.759-3.807a.75.75 0 00-.724-.516 11.209 11.209 0 01-7.75-3.256zM8.25 10.5a.75.75 0 000 1.5h7.5a.75.75 0 000-1.5h-7.5z" clipRule="evenodd" />
                    </svg>
                </button>
            </div>

            <h3 className="text-3xl font-black text-white mb-2 tracking-tight">Active Shield</h3>
            <p className="text-gray-400 text-sm max-w-xs mx-auto mb-6">
                Listening for: <span className="text-blue-300 font-mono bg-blue-500/10 px-2 rounded border border-blue-500/20">"{currentUser.dangerPhrase}"</span>
            </p>

            {isListening && (
                <div className="w-full bg-black/40 rounded-xl p-4 border border-green-500/20 backdrop-blur-md relative overflow-hidden text-left">
                    <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-transparent via-green-500 to-transparent opacity-50"></div>
                    <div className="text-[10px] uppercase tracking-widest text-green-500 mb-2 font-bold flex justify-between items-center">
                        <span>Audio Stream Analysis</span>
                        <div className="flex gap-1">
                            <span className="w-1 h-3 bg-green-500/50 rounded-full animate-pulse"></span>
                            <span className="w-1 h-3 bg-green-500/80 rounded-full animate-pulse delay-75"></span>
                            <span className="w-1 h-3 bg-green-500 rounded-full animate-pulse delay-150"></span>
                        </div>
                    </div>
                    <p className="font-mono text-xs text-green-100/80 h-12 overflow-hidden leading-relaxed opacity-70">
                        {transcript || "Analysis running..."}
                    </p>
                </div>
            )}
        </div>
      </div>
      
      {/* Live Location Card */}
      <div className="bg-slate-800/40 backdrop-blur-xl p-5 rounded-3xl border border-white/5 flex items-center justify-between shadow-lg relative overflow-hidden group">
          <div className="absolute inset-0 bg-blue-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
          <div className="flex items-center gap-4 relative z-10">
              <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
                      <path fillRule="evenodd" d="M11.54 22.351l.07.04.028.016a.76.76 0 00.723 0l.028-.015.071-.041a16.975 16.975 0 001.144-.742 19.58 19.58 0 002.683-2.282c1.944-1.99 3.963-4.98 3.963-8.827a8.25 8.25 0 00-16.5 0c0 3.846 2.02 6.837 3.963 8.827a19.58 19.58 0 002.682 2.282 16.975 16.975 0 001.145.742zM12 13.5a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
                  </svg>
              </div>
              <div>
                  <h3 className="text-gray-400 text-[10px] font-bold uppercase tracking-wider mb-1">My Coordinates</h3>
                  {currentLocation ? (
                      <p className="text-white font-mono text-base font-medium tracking-wide">
                          {currentLocation.lat.toFixed(4)}, {currentLocation.lng.toFixed(4)}
                      </p>
                  ) : (
                      <div className="flex items-center gap-2">
                          <span className="text-gray-500 text-xs animate-pulse">Triangulating...</span>
                      </div>
                  )}
              </div>
          </div>
          {currentLocation && (
              <a 
                  href={`https://www.google.com/maps/search/?api=1&query=${currentLocation.lat},${currentLocation.lng}`}
                  target="_blank"
                  rel="noreferrer" 
                  className="relative z-10 bg-slate-700 hover:bg-blue-600 text-white p-3 rounded-xl transition-all shadow-lg hover:shadow-blue-500/30"
              >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                      <path fillRule="evenodd" d="M12.293 5.293a1 1 0 011.414 0l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-2.293-2.293a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
              </a>
          )}
      </div>

      {/* Quick Actions Grid */}
      <div className="grid grid-cols-2 gap-4">
        <button 
            onClick={() => triggerAlert("MANUAL PANIC BUTTON")}
            className="group relative overflow-hidden bg-gradient-to-br from-red-600 to-rose-700 p-6 rounded-[2rem] flex flex-col items-center justify-center shadow-lg shadow-red-900/30 active:scale-95 transition-all hover:shadow-red-500/40 border border-white/5"
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
          <div className="w-14 h-14 bg-white/10 rounded-full flex items-center justify-center mb-3 backdrop-blur-sm group-hover:scale-110 transition-transform duration-300 border border-white/10">
             <span className="text-3xl">🚨</span>
          </div>
          <span className="font-bold text-white text-lg tracking-tight">INSTANT SOS</span>
          <span className="text-red-200 text-xs mt-1 font-medium">Tap to trigger</span>
        </button>

        <button 
            onClick={startSafeTimer}
            disabled={safeTimer !== null}
            className={`group relative overflow-hidden p-6 rounded-[2rem] flex flex-col items-center justify-center shadow-lg active:scale-95 transition-all border border-white/5 ${
                safeTimer !== null 
                ? 'bg-amber-900/40 border-amber-500 cursor-default' 
                : 'bg-gradient-to-br from-amber-500 to-orange-600 shadow-orange-900/30 hover:shadow-orange-500/40'
            }`}
        >
          {safeTimer !== null ? (
            <>
                <span className="text-5xl font-mono font-bold text-amber-500 mb-1 drop-shadow-lg">{safeTimer}</span>
                <span className="text-xs text-amber-500 uppercase font-bold tracking-widest animate-pulse">Seconds Left</span>
            </>
          ) : (
            <>
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                <div className="w-14 h-14 bg-white/10 rounded-full flex items-center justify-center mb-3 backdrop-blur-sm group-hover:rotate-12 transition-transform duration-300 border border-white/10">
                    <span className="text-3xl">⏱️</span>
                </div>
                <span className="font-bold text-white text-lg tracking-tight">SAFE TIMER</span>
                <span className="text-amber-100 text-xs mt-1 font-medium">30s Countdown</span>
            </>
          )}
        </button>
      </div>

      {/* Timer Cancellation (if active) */}
      {safeTimer !== null && (
          <div className="bg-amber-950/40 border border-amber-500/50 p-4 rounded-2xl flex justify-between items-center backdrop-blur-xl animate-fade-in shadow-xl">
              <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></div>
                  <p className="text-amber-200 font-medium text-sm">Timer Active</p>
              </div>
              <button 
                onClick={() => setSafeTimer(null)} 
                className="bg-amber-600 hover:bg-amber-500 text-white px-5 py-2 rounded-xl text-xs font-bold shadow-lg shadow-amber-900/20 transition-colors uppercase tracking-wider"
              >
                Cancel
              </button>
          </div>
      )}

      {/* Nearby Stations */}
      <div className="bg-slate-900/60 backdrop-blur-xl rounded-[2rem] p-6 border border-white/5 shadow-xl">
        <h3 className="text-white font-bold text-lg mb-6 flex items-center gap-3">
            <span className="bg-gradient-to-br from-blue-500 to-indigo-600 p-2 rounded-lg text-white shadow-lg shadow-blue-500/20">📍</span>
            Nearby Stations which might be helpful
        </h3>
        
        {loadingPlaces ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-500 space-y-4">
                <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                <span className="text-xs font-medium animate-pulse uppercase tracking-wider">Scanning Area...</span>
            </div>
        ) : nearbyPlaces.length > 0 ? (
            <div className="grid gap-4">
                {nearbyPlaces.map((place, idx) => (
                    <a 
                        key={idx} 
                        href={place.uri} 
                        target="_blank" 
                        rel="noreferrer" 
                        className="group block bg-slate-800/40 hover:bg-slate-700/60 border border-white/5 hover:border-blue-500/30 p-4 rounded-2xl transition-all duration-300 relative overflow-hidden"
                    >
                        <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                        <div className="relative z-10">
                            <div className="flex justify-between items-start mb-2">
                                <div className="text-gray-200 font-semibold group-hover:text-blue-400 transition-colors">{place.title}</div>
                                {place.distance && (
                                    <span className="text-[10px] font-bold bg-slate-700 text-blue-300 px-2.5 py-1 rounded-full whitespace-nowrap border border-white/5">
                                        {place.distance}
                                    </span>
                                )}
                            </div>
                            {place.address && (
                                <div className="text-sm text-gray-400 mb-3 line-clamp-2">{place.address}</div>
                            )}
                            <div className="flex items-center text-xs text-gray-500 group-hover:text-blue-400/80 transition-colors gap-1 uppercase tracking-wide font-bold">
                                <span>Navigate</span>
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3 transform group-hover:translate-x-1 transition-transform">
                                    <path fillRule="evenodd" d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z" clipRule="evenodd" />
                                </svg>
                            </div>
                        </div>
                    </a>
                ))}
            </div>
        ) : (
            <div className="text-center py-8 bg-white/5 rounded-2xl border border-dashed border-white/10">
                <span className="text-4xl block mb-2 opacity-30 grayscale">🗺️</span>
                <p className="text-gray-500 text-xs uppercase tracking-wide">No nearby stations found.</p>
            </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;