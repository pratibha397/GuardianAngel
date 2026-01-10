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
  
  // Timer Config
  const [showTimerSettings, setShowTimerSettings] = useState(false);
  const [timerDuration, setTimerDuration] = useState(30); // Default 30s
  const [safeTimer, setSafeTimer] = useState<number | null>(null);
  
  const [currentLocation, setCurrentLocation] = useState<{lat: number, lng: number} | null>(null);
  const stopListeningRef = useRef<(() => void) | null>(null);

  // --- Alert System ---
  const triggerAlert = async (reason: string) => {
    setAlertActive(true);
    setTriggerReason(reason);
    
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((pos) => {
        const { latitude, longitude } = pos.coords;
        currentUser.guardians.forEach(async (gEmail) => {
           await sendMessage({
             senderEmail: currentUser.email,
             receiverEmail: gEmail,
             text: `🚨 SOS! ${reason}`,
             isLocation: true,
             lat: latitude,
             lng: longitude
           });
           await sendAlert(currentUser.email, gEmail, reason, latitude, longitude);
        });
      }, (err) => {
           currentUser.guardians.forEach(async (gEmail) => {
             await sendMessage({
               senderEmail: currentUser.email,
               receiverEmail: gEmail,
               text: `🚨 SOS! ${reason} (No Loc)`,
             });
             await sendAlert(currentUser.email, gEmail, reason);
           });
      });
    }

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
    if (navigator.geolocation) {
        const watchId = navigator.geolocation.watchPosition(
            (pos) => setCurrentLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
            (err) => console.error(err),
            { enableHighAccuracy: true }
        );
        return () => navigator.geolocation.clearWatch(watchId);
    }
  }, []);

  useEffect(() => {
    if (navigator.geolocation) {
      setLoadingPlaces(true);
      navigator.geolocation.getCurrentPosition(async (pos) => {
        const places = await getNearbyStations(pos.coords.latitude, pos.coords.longitude);
        setNearbyPlaces(places);
        setLoadingPlaces(false);
      }, () => setLoadingPlaces(false));
    }
  }, []);

  return (
    <div className="space-y-6 pb-8">
      {/* Alert Overlay */}
      {alertActive && (
        <div className="fixed inset-0 z-[100] bg-red-600/95 backdrop-blur-xl flex flex-col items-center justify-center animate-pulse-fast text-white p-8 text-center">
          <div className="text-9xl mb-6 drop-shadow-lg">🚨</div>
          <h1 className="text-5xl font-black mb-4 uppercase">SOS Sent</h1>
          <p className="text-xl mb-12 font-mono bg-red-800/50 px-4 py-2 rounded">{triggerReason}</p>
          <button 
            onClick={() => { setAlertActive(false); window.location.reload(); }} 
            className="bg-white text-red-600 px-12 py-5 rounded-full font-bold text-xl shadow-2xl border-4 border-red-100"
          >
            I AM SAFE
          </button>
        </div>
      )}

      {/* Timer Settings Modal */}
      {showTimerSettings && (
          <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm">
              <div className="bg-slate-900 border border-white/10 rounded-2xl p-6 w-full max-w-sm">
                  <h3 className="text-white font-bold text-lg mb-4">Set Timer Duration</h3>
                  <div className="grid grid-cols-4 gap-2 mb-6">
                      {[15, 30, 60, 120].map(s => (
                          <button 
                            key={s}
                            onClick={() => setTimerDuration(s)}
                            className={`p-3 rounded-lg font-mono font-bold ${timerDuration === s ? 'bg-amber-500 text-white' : 'bg-slate-800 text-gray-400'}`}
                          >
                              {s}s
                          </button>
                      ))}
                  </div>
                  <button onClick={() => setShowTimerSettings(false)} className="w-full bg-blue-600 py-3 rounded-xl text-white font-bold">Done</button>
              </div>
          </div>
      )}

      {/* Hero Monitor */}
      <div className={`relative overflow-hidden p-6 rounded-3xl border transition-all duration-500 shadow-2xl ${isListening ? 'border-green-500/30 bg-green-900/10' : 'border-white/5 bg-slate-900/50'}`}>
        <div className="flex justify-between items-start mb-6">
            <div>
                <h2 className="text-2xl font-bold text-white mb-1">Active Shield</h2>
                <div className="flex items-center gap-2">
                     <div className={`w-2 h-2 rounded-full ${isListening ? 'bg-green-400 animate-pulse' : 'bg-gray-500'}`}></div>
                     <span className="text-gray-400 text-xs font-mono">{isListening ? 'LISTENING' : 'OFFLINE'}</span>
                </div>
            </div>
        </div>

        {isListening && transcript && (
             <div className="mb-4 bg-black/30 rounded-lg p-3 border border-white/5 h-20 overflow-hidden relative">
                 <div className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                 <p className="font-mono text-xs text-green-400/80">{transcript}</p>
             </div>
        )}

        <button 
            onClick={toggleListening}
            className={`w-full py-4 rounded-xl font-bold tracking-wide transition-all shadow-lg ${
                isListening ? 'bg-slate-700 text-gray-300' : 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white'
            }`}
        >
            {isListening ? 'DEACTIVATE' : 'ACTIVATE SHIELD'}
        </button>
      </div>
      
      {/* Actions */}
      <div className="grid grid-cols-2 gap-4">
        <button 
            onClick={() => triggerAlert("MANUAL PANIC")}
            className="bg-gradient-to-br from-red-600 to-rose-700 p-6 rounded-3xl flex flex-col items-center justify-center shadow-lg active:scale-95 transition-all"
        >
          <span className="text-4xl mb-2">🚨</span>
          <span className="font-bold text-white">PANIC</span>
        </button>

        <button 
            onClick={() => safeTimer ? setSafeTimer(null) : setSafeTimer(timerDuration)}
            className={`relative p-6 rounded-3xl flex flex-col items-center justify-center shadow-lg active:scale-95 transition-all ${safeTimer ? 'bg-amber-500/20 border border-amber-500' : 'bg-slate-800 border border-white/5'}`}
        >
          {safeTimer ? (
             <>
                <span className="text-4xl font-mono font-bold text-amber-500 mb-1">{safeTimer}</span>
                <span className="text-[10px] text-amber-500 font-bold uppercase">Cancel</span>
             </>
          ) : (
             <>
                <div className="absolute top-2 right-2 text-gray-500" onClick={(e) => {e.stopPropagation(); setShowTimerSettings(true);}}>⚙️</div>
                <span className="text-4xl mb-2">⏱️</span>
                <span className="font-bold text-white">TIMER</span>
                <span className="text-[10px] text-gray-500">{timerDuration}s</span>
             </>
          )}
        </button>
      </div>

      {/* Nearby */}
      <div className="bg-slate-900/50 rounded-3xl p-5 border border-white/5">
        <h3 className="text-white font-bold text-sm mb-4 uppercase tracking-wider flex items-center justify-between">
            <span>Nearby Assets</span>
            {loadingPlaces && <span className="text-xs text-blue-400 animate-pulse">Scanning...</span>}
        </h3>
        <div className="space-y-3">
            {nearbyPlaces.map((place, idx) => (
                <a key={idx} href={place.uri} target="_blank" rel="noreferrer" className="block bg-black/20 p-3 rounded-xl border border-white/5 hover:border-blue-500/50 transition-colors">
                    <div className="flex justify-between items-center mb-1">
                        <span className="text-gray-200 font-bold text-sm truncate pr-2">{place.title}</span>
                        <span className="text-[10px] bg-blue-900/30 text-blue-300 px-2 py-0.5 rounded border border-blue-500/20 whitespace-nowrap">{place.distance || 'NEARBY'}</span>
                    </div>
                    <div className="text-xs text-gray-500 truncate">{place.address}</div>
                </a>
            ))}
            {!loadingPlaces && nearbyPlaces.length === 0 && (
                <div className="text-center text-gray-600 text-xs py-4">No stations detected nearby.</div>
            )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;