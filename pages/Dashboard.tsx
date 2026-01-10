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
  
  // Timer States
  const [showTimerModal, setShowTimerModal] = useState(false);
  const [safeTimer, setSafeTimer] = useState<number | null>(null);
  const [initialTimer, setInitialTimer] = useState<number>(0);
  
  const [currentLocation, setCurrentLocation] = useState<{lat: number, lng: number} | null>(null);
  const [locationStatus, setLocationStatus] = useState<string>('Initializing...');
  
  const stopListeningRef = useRef<(() => void) | null>(null);

  // --- Geolocation ---
  const getRobustLocation = (): Promise<GeolocationPosition> => {
      return new Promise((resolve, reject) => {
          if (!navigator.geolocation) {
              reject(new Error("Not supported"));
              return;
          }
          const success = (pos: GeolocationPosition) => {
              sessionStorage.setItem('last_known_lat', pos.coords.latitude.toString());
              sessionStorage.setItem('last_known_lng', pos.coords.longitude.toString());
              resolve(pos);
          };
          const error = (err: GeolocationPositionError) => {
              const lat = sessionStorage.getItem('last_known_lat');
              const lng = sessionStorage.getItem('last_known_lng');
              if (lat && lng) {
                  resolve({
                      coords: { latitude: parseFloat(lat), longitude: parseFloat(lng), accuracy: 100 }
                  } as any);
                  return;
              }
              reject(err);
          };
          
          navigator.geolocation.getCurrentPosition(success, (e) => {
              navigator.geolocation.getCurrentPosition(success, error, {
                  enableHighAccuracy: false,
                  timeout: 10000, 
                  maximumAge: 300000
              });
          }, { enableHighAccuracy: true, timeout: 3000 });
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
        console.error("Location failed", e);
    }
    
    currentUser.guardians.forEach(async (gEmail) => {
        await sendMessage({
            senderEmail: currentUser.email,
            receiverEmail: gEmail,
            text: `🚨 SOS! ALERT: ${displayReason} ${!lat ? '(No Loc)' : ''}`,
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
        setIsListening(false);
        alert("Microphone access needed.");
      }
    }
  };

  // --- Timer Logic ---
  const startTimer = (minutes: number) => {
      const seconds = minutes * 60;
      setInitialTimer(seconds);
      setSafeTimer(seconds);
      setShowTimerModal(false);
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

  // --- Init ---
  useEffect(() => {
    const init = async () => {
        setLocationStatus('Scanning...');
        try {
            const pos = await getRobustLocation();
            const { latitude, longitude } = pos.coords;
            setCurrentLocation({ lat: latitude, lng: longitude });
            setLocationStatus('Locked');
            
            setLoadingPlaces(true);
            try {
                const places = await getNearbyStations(latitude, longitude);
                setNearbyPlaces(places);
            } catch (e) { console.error(e); }
            setLoadingPlaces(false);

        } catch (e: any) {
            setLocationStatus("Offline");
            setLoadingPlaces(false);
        }
    };
    init();
  }, []);

  const formatTime = (seconds: number) => {
      const m = Math.floor(seconds / 60);
      const s = seconds % 60;
      return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="space-y-6 pb-8 relative">
      {/* Background Overlay for Scanlines */}
      <div className="fixed inset-0 scanlines opacity-20 pointer-events-none"></div>

      {/* SOS Overlay */}
      {alertActive && (
        <div className="fixed inset-0 z-[100] bg-red-950/95 flex flex-col items-center justify-center animate-pulse text-white p-8 text-center backdrop-blur-xl">
          <div className="text-9xl mb-6 text-red-500 animate-bounce">🚨</div>
          <h1 className="text-6xl font-black mb-4 uppercase tracking-tighter">SOS ACTIVE</h1>
          <div className="bg-black/40 px-8 py-4 rounded-lg border border-red-500/30 mb-12">
             <p className="text-xl font-mono text-red-200 uppercase tracking-widest">{triggerReason}</p>
          </div>
          <button 
            onClick={() => { setAlertActive(false); window.location.reload(); }} 
            className="bg-red-600 hover:bg-red-500 text-white px-12 py-5 rounded-lg font-bold text-2xl shadow-[0_0_30px_rgba(220,38,38,0.5)] tracking-widest border border-red-400"
          >
            CANCEL SOS
          </button>
        </div>
      )}

      {/* Timer Modal */}
      {showTimerModal && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-sm p-6 shadow-2xl relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-amber-500 to-yellow-500"></div>
                  <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                      <span className="text-amber-500">⏱️</span> Set Safe Timer
                  </h3>
                  <div className="grid grid-cols-2 gap-3 mb-6">
                      {[1, 5, 15, 30].map(m => (
                          <button 
                            key={m}
                            onClick={() => startTimer(m)}
                            className="bg-zinc-800 hover:bg-amber-900/30 hover:border-amber-500 border border-zinc-700 p-4 rounded-xl text-center transition-all active:scale-95"
                          >
                              <span className="text-2xl font-mono font-bold text-white block">{m}</span>
                              <span className="text-xs text-zinc-400 uppercase tracking-wider">Minutes</span>
                          </button>
                      ))}
                  </div>
                  <button 
                    onClick={() => setShowTimerModal(false)}
                    className="w-full py-3 bg-zinc-800 text-zinc-400 hover:text-white rounded-xl font-medium"
                  >
                      Cancel
                  </button>
              </div>
          </div>
      )}

      {/* Status Card (Radar) */}
      <div className="bg-zinc-900/80 backdrop-blur-md rounded-2xl border border-zinc-700/50 p-6 shadow-xl relative overflow-hidden group">
         {isListening && (
             <div className="absolute -right-20 -top-20 w-64 h-64 bg-green-500/5 rounded-full blur-3xl animate-pulse"></div>
         )}
         
         <div className="flex justify-between items-start relative z-10">
            <div>
                <h2 className="text-zinc-400 text-[10px] font-bold uppercase tracking-[0.2em] mb-2">Surveillance Mode</h2>
                <div className="flex items-center gap-3">
                    <div className="relative w-4 h-4">
                        <div className={`absolute inset-0 rounded-full ${isListening ? 'bg-green-500 animate-ping' : 'bg-zinc-600'}`}></div>
                        <div className={`relative w-4 h-4 rounded-full ${isListening ? 'bg-green-500' : 'bg-zinc-600'}`}></div>
                    </div>
                    <span className={`text-xl font-bold tracking-tight ${isListening ? 'text-white' : 'text-zinc-500'}`}>
                        {isListening ? 'ACTIVE SHIELD' : 'STANDBY'}
                    </span>
                </div>
            </div>
            {currentLocation && (
                <div className="text-right">
                    <h2 className="text-zinc-400 text-[10px] font-bold uppercase tracking-[0.2em] mb-1">GPS Lock</h2>
                    <p className="font-mono text-blue-400 text-xs">{currentLocation.lat.toFixed(4)}, {currentLocation.lng.toFixed(4)}</p>
                </div>
            )}
         </div>

         {/* Radar Visual */}
         <div className="mt-8 mb-4 relative h-32 flex items-center justify-center border-t border-b border-zinc-800 bg-black/20">
             {isListening ? (
                 <div className="relative w-24 h-24 rounded-full border border-green-900/50 flex items-center justify-center overflow-hidden">
                     <div className="absolute w-full h-full radar-sweep animate-radar"></div>
                     <div className="w-16 h-16 rounded-full border border-green-500/30 z-10"></div>
                     <div className="w-1 h-1 bg-green-500 rounded-full z-10 shadow-[0_0_10px_#0f0]"></div>
                 </div>
             ) : (
                 <div className="text-zinc-600 text-xs font-mono uppercase tracking-widest">System Offline</div>
             )}
         </div>

         <button 
            onClick={toggleListening}
            className={`w-full py-4 rounded-xl font-bold uppercase tracking-wider transition-all border shadow-lg ${
                isListening 
                ? 'bg-green-950/30 border-green-500/50 text-green-400 hover:bg-green-900/40 shadow-green-900/20' 
                : 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700 hover:text-white'
            }`}
         >
            {isListening ? 'Deactivate' : 'Initialize Monitor'}
         </button>
         
         {transcript && isListening && (
             <div className="mt-4 p-3 bg-black/40 rounded border border-green-900/30 font-mono text-[10px] text-green-500/70 truncate">
                 &gt; {transcript}
             </div>
         )}
      </div>

      {/* Action Grid */}
      <div className="grid grid-cols-2 gap-4">
        <button 
            onClick={() => triggerAlert("MANUAL SOS")}
            className="relative overflow-hidden bg-gradient-to-br from-red-600 to-red-900 hover:from-red-500 hover:to-red-800 text-white p-6 rounded-2xl shadow-xl shadow-red-900/20 border border-red-500/30 group active:scale-[0.98] transition-all"
        >
          <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20"></div>
          <div className="relative z-10 flex flex-col items-center">
            <span className="text-4xl mb-2 group-hover:scale-110 transition-transform">🆘</span>
            <span className="font-black text-sm tracking-[0.2em]">PANIC</span>
          </div>
        </button>

        <button 
            onClick={() => setSafeTimer(safeTimer ? null : 0) /* Toggle Logic */}
            disabled={safeTimer !== null}
            onClickCapture={(e) => { e.stopPropagation(); if(safeTimer === null) setShowTimerModal(true); }}
            className={`relative p-6 rounded-2xl border transition-all overflow-hidden ${
                safeTimer !== null 
                ? 'bg-amber-950/30 border-amber-500/50' 
                : 'bg-zinc-800 border-zinc-700 hover:bg-zinc-750'
            }`}
        >
           {safeTimer !== null ? (
               <div className="flex flex-col items-center relative z-10">
                   {/* Progress Ring Background would go here in complex implementation, simple text for now */}
                   <span className="text-3xl font-mono font-bold text-amber-500 mb-1">{formatTime(safeTimer)}</span>
                   <span className="text-[10px] font-bold text-amber-600 uppercase tracking-wider animate-pulse">Running</span>
               </div>
           ) : (
               <div className="flex flex-col items-center">
                   <span className="text-4xl mb-2">⏱️</span>
                   <span className="font-bold text-zinc-400 text-sm tracking-wider">TIMER</span>
               </div>
           )}
        </button>
      </div>

      {/* Cancel Timer Bar */}
      {safeTimer !== null && (
          <button 
            onClick={() => setSafeTimer(null)} 
            className="w-full bg-amber-600/10 border border-amber-500/50 text-amber-500 py-4 rounded-xl font-bold text-sm uppercase tracking-widest shadow-lg backdrop-blur-sm hover:bg-amber-600/20 transition-all"
          >
              Abort Countdown
          </button>
      )}

      {/* Nearby Assets List */}
      <div className="pt-2">
        <div className="flex items-center justify-between mb-4 px-1">
             <h3 className="text-zinc-500 font-bold text-[10px] uppercase tracking-widest">Detected Assets</h3>
             {loadingPlaces && <span className="text-[10px] text-green-500 animate-pulse">Scanning...</span>}
        </div>
        
        <div className="grid gap-3">
            {!loadingPlaces && nearbyPlaces.length > 0 ? (
                nearbyPlaces.map((place, idx) => (
                    <a 
                        key={idx} 
                        href={place.uri} 
                        target="_blank" 
                        rel="noreferrer" 
                        className="flex items-center gap-4 bg-zinc-900/50 hover:bg-zinc-800 p-4 rounded-xl border border-zinc-800 transition-all group"
                    >
                        <div className="w-10 h-10 rounded-full bg-blue-900/20 flex items-center justify-center text-blue-400 border border-blue-500/20 group-hover:scale-110 transition-transform">
                            📍
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="flex justify-between items-center mb-1">
                                <span className="text-zinc-200 font-bold text-sm truncate">{place.title}</span>
                                <span className="text-[10px] font-mono text-blue-400 bg-blue-900/10 px-2 py-0.5 rounded border border-blue-500/10">
                                    {place.distance || 'NEARBY'}
                                </span>
                            </div>
                            <div className="text-xs text-zinc-500 truncate">{place.address}</div>
                        </div>
                    </a>
                ))
            ) : (
                <div className="p-8 bg-zinc-900/30 rounded-xl border border-dashed border-zinc-800 text-center">
                    <p className="text-zinc-600 text-xs">No assets detected in immediate vicinity.</p>
                </div>
            )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;