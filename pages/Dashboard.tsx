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
  const [locationStatus, setLocationStatus] = useState<string>('Initializing...');
  
  const stopListeningRef = useRef<(() => void) | null>(null);

  // --- Helper: Robust Geolocation ---
  const getRobustLocation = (): Promise<GeolocationPosition> => {
      return new Promise((resolve, reject) => {
          if (!navigator.geolocation) {
              reject(new Error("Not supported"));
              return;
          }
          
          // 1. Try High Accuracy (GPS)
          navigator.geolocation.getCurrentPosition(resolve, (error) => {
              console.warn("High accuracy GPS failed, falling back to low accuracy", error);
              
              // 2. Fallback to Low Accuracy (Wifi/Cell)
              navigator.geolocation.getCurrentPosition(resolve, (err2) => {
                  reject(err2);
              }, {
                  enableHighAccuracy: false,
                  timeout: 10000, 
                  maximumAge: 60000 // Accept cache from last minute
              });
          }, {
              enableHighAccuracy: true,
              timeout: 5000 // Short timeout for GPS so we don't wait forever
          });
      });
  };

  // --- Alert System ---
  const triggerAlert = async (reason: string) => {
    setAlertActive(true);
    
    let lat, lng;
    try {
        const pos = await getRobustLocation();
        lat = pos.coords.latitude;
        lng = pos.coords.longitude;
    } catch (e) {
        console.error("Location failed during alert", e);
    }
    
    // Send to Guardians
    currentUser.guardians.forEach(async (gEmail) => {
        // Chat
        await sendMessage({
            senderEmail: currentUser.email,
            receiverEmail: gEmail,
            text: `🚨 SOS! ALERT TRIGGERED: ${reason} ${!lat ? '(Location Unavailable)' : ''}`,
            isLocation: !!lat,
            lat,
            lng
        });
        // Signal
        await sendAlert(currentUser.email, gEmail, reason, lat, lng);
    });

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
        alert("Microphone access denied.");
      }
    }
  };

  // --- Safe Timer ---
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

  // --- Initial Data Load ---
  useEffect(() => {
    const init = async () => {
        setLocationStatus('Locating...');
        try {
            const pos = await getRobustLocation();
            const { latitude, longitude } = pos.coords;
            setCurrentLocation({ lat: latitude, lng: longitude });
            setLocationStatus('');
            
            // Fetch Nearby
            setLoadingPlaces(true);
            try {
                const places = await getNearbyStations(latitude, longitude);
                setNearbyPlaces(places);
            } catch (e) { console.error(e); }
            setLoadingPlaces(false);

        } catch (e: any) {
            console.error("Dashboard location error", e);
            if (e.code === 1) setLocationStatus("Location permission denied.");
            else if (e.code === 2) setLocationStatus("Position unavailable.");
            else setLocationStatus("Location request timed out.");
            setLoadingPlaces(false);
        }
    };
    init();
  }, []);

  return (
    <div className="space-y-4 pb-8">
      {/* Alert Overlay */}
      {alertActive && (
        <div className="fixed inset-0 z-[100] bg-red-600 flex flex-col items-center justify-center animate-pulse text-white p-8 text-center">
          <div className="text-9xl mb-4">🚨</div>
          <h1 className="text-5xl font-black mb-4 uppercase">SOS Sent</h1>
          <p className="text-xl mb-8 opacity-90">Guardians have been notified.</p>
          <button 
            onClick={() => { setAlertActive(false); window.location.reload(); }} 
            className="bg-white text-red-600 px-10 py-4 rounded-full font-bold text-xl shadow-xl"
          >
            I AM SAFE
          </button>
        </div>
      )}

      {/* Monitoring Card */}
      <div className={`p-6 rounded-2xl border transition-colors duration-300 shadow-sm ${isListening ? 'bg-green-900/20 border-green-500/50' : 'bg-slate-800 border-slate-700'}`}>
        <div className="flex items-center justify-between mb-4">
            <div>
                <h3 className="text-lg font-bold text-white">Active Shield</h3>
                <p className="text-xs text-slate-400">Trigger: "{currentUser.dangerPhrase}"</p>
            </div>
            <div className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide ${isListening ? 'bg-green-500/20 text-green-400 animate-pulse' : 'bg-slate-700 text-slate-400'}`}>
                {isListening ? 'Monitoring' : 'Standby'}
            </div>
        </div>
        
        <div className="flex justify-center mb-4">
            <button 
                onClick={toggleListening}
                className={`w-24 h-24 rounded-full flex items-center justify-center border-4 transition-all shadow-lg ${
                    isListening 
                    ? 'bg-slate-800 border-green-500 text-green-500 hover:scale-105' 
                    : 'bg-slate-700 border-slate-600 text-slate-400 hover:border-blue-400 hover:text-white'
                }`}
            >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-10 h-10">
                    <path fillRule="evenodd" d="M12.516 2.17a.75.75 0 00-1.032 0 11.209 11.209 0 01-7.877 3.08.75.75 0 00-.722.515A12.74 12.74 0 002.25 9.75c0 5.942 4.064 10.933 9.563 12.348a.749.749 0 00.374 0c5.499-1.415 9.563-6.406 9.563-12.348 0-1.352-.272-2.636-.759-3.807a.75.75 0 00-.724-.516 11.209 11.209 0 01-7.75-3.256zM8.25 10.5a.75.75 0 000 1.5h7.5a.75.75 0 000-1.5h-7.5z" clipRule="evenodd" />
                </svg>
            </button>
        </div>

        {isListening && transcript && (
            <div className="bg-black/30 p-3 rounded-lg border border-slate-700/50">
                <p className="font-mono text-xs text-green-400/80 truncate">{transcript}</p>
            </div>
        )}
      </div>

      {/* Location Status */}
      <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 flex justify-between items-center shadow-sm">
          <div className="flex items-center gap-3">
              <div className="bg-blue-600/20 p-2 rounded-lg text-blue-400">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                    <path fillRule="evenodd" d="M11.54 22.351l.07.04.028.016a.76.76 0 00.723 0l.028-.015.071-.041a16.975 16.975 0 001.144-.742 19.58 19.58 0 002.683-2.282c1.944-1.99 3.963-4.98 3.963-8.827a8.25 8.25 0 00-16.5 0c0 3.846 2.02 6.837 3.963 8.827a19.58 19.58 0 002.682 2.282 16.975 16.975 0 001.145.742zM12 13.5a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
                </svg>
              </div>
              <div>
                  <h4 className="text-sm font-semibold text-white">Current Location</h4>
                  {currentLocation ? (
                      <p className="text-xs text-slate-400 font-mono">{currentLocation.lat.toFixed(4)}, {currentLocation.lng.toFixed(4)}</p>
                  ) : (
                      <p className="text-xs text-red-400">{locationStatus}</p>
                  )}
              </div>
          </div>
          {currentLocation && (
              <a href={`https://maps.google.com/?q=${currentLocation.lat},${currentLocation.lng}`} target="_blank" className="text-blue-400 hover:text-blue-300 text-sm font-bold">Map</a>
          )}
      </div>

      {/* Action Buttons */}
      <div className="grid grid-cols-2 gap-4">
        <button 
            onClick={() => triggerAlert("MANUAL SOS")}
            className="bg-red-600 hover:bg-red-700 active:scale-95 transition-all text-white p-5 rounded-2xl flex flex-col items-center justify-center shadow-lg shadow-red-900/20"
        >
          <span className="text-3xl mb-1">🚨</span>
          <span className="font-bold tracking-tight">SOS BUTTON</span>
        </button>

        <button 
            onClick={() => setSafeTimer(30)}
            disabled={safeTimer !== null}
            className={`p-5 rounded-2xl flex flex-col items-center justify-center transition-all shadow-lg ${
                safeTimer !== null 
                ? 'bg-amber-900/20 border border-amber-500/50 cursor-default' 
                : 'bg-amber-600 hover:bg-amber-700 active:scale-95 shadow-amber-900/20'
            }`}
        >
          {safeTimer !== null ? (
            <>
                <span className="text-3xl font-mono font-bold text-amber-500 mb-1">{safeTimer}</span>
                <span className="text-xs text-amber-500 font-bold">CANCEL</span>
            </>
          ) : (
            <>
                <span className="text-3xl mb-1">⏱️</span>
                <span className="font-bold text-white tracking-tight">SAFE TIMER</span>
            </>
          )}
        </button>
      </div>

      {/* Timer Cancel Button Overlay */}
      {safeTimer !== null && (
          <button 
            onClick={() => setSafeTimer(null)} 
            className="w-full bg-slate-800 border border-amber-500/30 text-amber-500 py-3 rounded-xl font-bold text-sm uppercase"
          >
              Stop Timer
          </button>
      )}

      {/* Nearby Stations */}
      <div className="bg-slate-800 rounded-2xl p-4 border border-slate-700 shadow-sm">
        <h3 className="text-white font-bold mb-4 flex items-center gap-2">
            📍 Nearby Stations
        </h3>
        
        {loadingPlaces ? (
            <div className="py-8 text-center text-slate-500 text-sm animate-pulse">Scanning nearby services...</div>
        ) : nearbyPlaces.length > 0 ? (
            <div className="space-y-3">
                {nearbyPlaces.map((place, idx) => (
                    <a 
                        key={idx} 
                        href={place.uri} 
                        target="_blank" 
                        rel="noreferrer" 
                        className="block bg-slate-700/50 hover:bg-slate-700 p-3 rounded-xl transition-colors"
                    >
                        <div className="flex justify-between items-start">
                            <span className="text-slate-200 font-medium text-sm">{place.title}</span>
                            <span className="text-[10px] bg-slate-600 text-blue-300 px-2 py-0.5 rounded-full">Go</span>
                        </div>
                        {place.address && <div className="text-xs text-slate-400 mt-1 truncate">{place.address}</div>}
                    </a>
                ))}
            </div>
        ) : (
            <div className="py-6 text-center text-slate-500 text-sm">
                No stations found. 
                {currentLocation && <a href={`https://www.google.com/maps/search/police/@${currentLocation.lat},${currentLocation.lng}`} target="_blank" className="text-blue-400 ml-1 hover:underline">Search Maps</a>}
            </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;