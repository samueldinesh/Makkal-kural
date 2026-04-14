/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  MapContainer, 
  TileLayer, 
  Marker, 
  Popup, 
  useMap,
  Circle
} from 'react-leaflet';
import L from 'leaflet';
import { 
  collection, 
  addDoc, 
  onSnapshot, 
  query, 
  orderBy, 
  serverTimestamp, 
  doc, 
  updateDoc, 
  increment,
  setDoc,
  getDoc
} from 'firebase/firestore';
import { 
  GoogleAuthProvider, 
  signInWithPopup, 
  onAuthStateChanged,
  signOut 
} from 'firebase/auth';
import { db, auth } from './firebase';
import { 
  Camera, 
  Map as MapIcon, 
  LayoutDashboard, 
  AlertCircle, 
  CheckCircle2, 
  Navigation, 
  Plus,
  X,
  ThumbsUp,
  MapPin,
  Loader2,
  LogIn,
  LogOut
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';
import { formatDistanceToNow } from 'date-fns';

// Fix Leaflet marker icon issue
const markerIcon = 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png';
const markerShadow = 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png';

const DefaultIcon = L.icon({
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

L.Marker.prototype.options.icon = DefaultIcon;

const CITIES = [
  { name: 'Chennai', coords: [13.0827, 80.2707] as [number, number] },
  { name: 'Coimbatore', coords: [11.0168, 76.9558] as [number, number] },
  { name: 'Madurai', coords: [9.9252, 78.1198] as [number, number] },
  { name: 'Tiruppur', coords: [11.1085, 77.3411] as [number, number] },
  { name: 'Salem', coords: [11.6643, 78.1460] as [number, number] },
  { name: 'Trichy', coords: [10.7905, 78.7047] as [number, number] },
];

interface Report {
  id: string;
  imageUrl: string;
  location: { lat: number; lng: number };
  city: string;
  description: string;
  status: 'pending' | 'validated' | 'resolved';
  createdAt: any;
  validations: number;
  reportedBy: string;
}

function MapUpdater({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, 12);
  }, [center, map]);
  return null;
}

export default function App() {
  const [view, setView] = useState<'map' | 'dashboard'>('map');
  const [reports, setReports] = useState<Report[]>([]);
  const [selectedCity, setSelectedCity] = useState(CITIES[0]);
  const [isReporting, setIsReporting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  
  // Form state
  const [description, setDescription] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (u) => {
      setUser(u);
    });

    const q = query(collection(db, 'reports'), orderBy('createdAt', 'desc'));
    const unsubscribeReports = onSnapshot(q, (snapshot) => {
      const reportsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Report[];
      setReports(reportsData);
    });

    return () => {
      unsubscribeAuth();
      unsubscribeReports();
    };
  }, []);

  const handleGetLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation([position.coords.latitude, position.coords.longitude]);
        },
        (error) => {
          console.error("Error getting location:", error);
          alert("Please enable location permissions to report an issue.");
        }
      );
    }
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmitReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userLocation || !imagePreview) {
      alert("Please provide location and an image.");
      return;
    }

    setLoading(true);
    try {
      const imageUrl = imagePreview.length > 500000 ? "https://picsum.photos/seed/garbage/800/600" : imagePreview;

      await addDoc(collection(db, 'reports'), {
        imageUrl,
        location: { lat: userLocation[0], lng: userLocation[1] },
        city: selectedCity.name,
        description,
        status: 'pending',
        createdAt: serverTimestamp(),
        validations: 0,
        reportedBy: user?.uid || 'anonymous'
      });

      setIsReporting(false);
      setDescription('');
      setImageFile(null);
      setImagePreview(null);
      alert("Report submitted successfully!");
    } catch (error) {
      console.error("Error submitting report:", error);
      alert("Failed to submit report.");
    } finally {
      setLoading(false);
    }
  };

  const handleValidate = async (reportId: string) => {
    if (!user) return;

    const validationRef = doc(db, 'reports', reportId, 'validations', user.uid);
    const validationSnap = await getDoc(validationRef);

    if (validationSnap.exists()) {
      alert("You have already validated this report.");
      return;
    }

    try {
      await setDoc(validationRef, {
        reportId,
        userId: user.uid,
        createdAt: serverTimestamp()
      });

      const reportRef = doc(db, 'reports', reportId);
      const reportSnap = await getDoc(reportRef);
      const currentValidations = reportSnap.data()?.validations || 0;
      
      const updates: any = {
        validations: increment(1)
      };

      if (currentValidations + 1 >= 3) {
        updates.status = 'validated';
      }

      await updateDoc(reportRef, updates);
    } catch (error) {
      console.error("Error validating:", error);
    }
  };

  const stats = {
    total: reports.length,
    pending: reports.filter(r => r.status === 'pending').length,
    validated: reports.filter(r => r.status === 'validated').length,
    resolved: reports.filter(r => r.status === 'resolved').length,
  };

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Error signing in:", error);
      alert("Failed to sign in with Google.");
    }
  };

  const handleLogout = () => signOut(auth);

  return (
    <div className="flex flex-col h-screen bg-[#F0F4F8] font-sans text-[#1A1A1A]">
      {/* Header */}
      <header className="bg-white border-b-2 border-[#E2E8F0] px-10 py-5 flex items-center justify-between sticky top-0 z-[1001]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center text-white font-bold text-2xl">
            M
          </div>
          <h1 className="font-extrabold text-2xl tracking-tight text-primary">Makkal Kural</h1>
        </div>
        
        <div className="flex items-center gap-6">
          <div className="flex bg-slate-100 p-1 rounded-full border border-slate-200">
            <button 
              onClick={() => setView('map')}
              className={cn(
                "flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold transition-all",
                view === 'map' ? "bg-primary text-white shadow-md" : "text-slate-600 hover:text-slate-900"
              )}
            >
              <MapIcon size={14} />
              Map
            </button>
            <button 
              onClick={() => setView('dashboard')}
              className={cn(
                "flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold transition-all",
                view === 'dashboard' ? "bg-primary text-white shadow-md" : "text-slate-600 hover:text-slate-900"
              )}
            >
              <LayoutDashboard size={14} />
              Stats
            </button>
          </div>

          <div className="flex gap-2">
            {CITIES.map((city) => (
              <button
                key={city.name}
                onClick={() => setSelectedCity(city)}
                className={cn(
                  "px-4 py-2 rounded-full text-sm font-bold transition-all",
                  selectedCity.name === city.name 
                    ? "bg-primary text-white shadow-lg shadow-primary/30" 
                    : "bg-slate-200 text-slate-700 hover:bg-slate-300"
                )}
              >
                {city.name}
              </button>
            ))}
          </div>

          {user ? (
            <div className="flex items-center gap-3 pl-6 border-l border-slate-200">
              {user.photoURL && <img src={user.photoURL} alt="User" className="w-8 h-8 rounded-full border-2 border-primary" />}
              <button onClick={handleLogout} className="text-slate-600 hover:text-primary transition-colors">
                <LogOut size={20} />
              </button>
            </div>
          ) : (
            <button 
              onClick={handleLogin}
              className="bg-slate-900 text-white px-6 py-2 rounded-full text-sm font-bold hover:bg-primary transition-all"
            >
              Login
            </button>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 relative overflow-hidden">
        {view === 'map' ? (
          <div className="h-full w-full relative">
            <MapContainer 
              center={selectedCity.coords} 
              zoom={12} 
              className="h-full w-full"
              zoomControl={false}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <MapUpdater center={selectedCity.coords} />
              
              {reports.map((report) => (
                <div key={report.id}>
                  <Marker position={[report.location.lat, report.location.lng]}>
                    <Popup className="custom-popup">
                      <div className="w-64 font-sans">
                        <img 
                          src={report.imageUrl} 
                          alt="Issue" 
                          className="w-full h-32 object-cover rounded-sm mb-3 border-2 border-saffron/20"
                          referrerPolicy="no-referrer"
                        />
                        <div className="flex items-center justify-between mb-2">
                          <span className={cn(
                            "text-[9px] uppercase font-black px-2 py-1 rounded-sm tracking-tighter",
                            report.status === 'pending' ? "bg-amber-100 text-amber-700 border border-amber-200" :
                            report.status === 'validated' ? "bg-primary/10 text-primary border border-primary/20" :
                            "bg-emerald-100 text-emerald-700 border border-emerald-200"
                          )}>
                            {report.status}
                          </span>
                          <span className="text-slate-500 text-[9px] font-bold italic">
                            {report.createdAt?.seconds ? formatDistanceToNow(new Date(report.createdAt.seconds * 1000)) + ' ago' : 'Just now'}
                          </span>
                        </div>
                        <p className="text-sm font-serif text-slate-800 mb-4 leading-relaxed">{report.description || "No description provided."}</p>
                        <div className="flex items-center justify-between border-t border-slate-100 pt-3">
                          <div className="flex items-center gap-1.5 text-slate-600 text-[10px] font-bold uppercase tracking-tight">
                            <ThumbsUp size={12} className="text-primary" />
                            <span>{report.validations} Validations</span>
                          </div>
                          <button 
                            onClick={() => handleValidate(report.id)}
                            className="bg-primary text-white px-3 py-1.5 rounded-sm font-black text-[10px] uppercase tracking-wider hover:bg-primary/90 transition-colors"
                          >
                            Verify
                          </button>
                        </div>
                      </div>
                    </Popup>
                  </Marker>
                  <Circle 
                    center={[report.location.lat, report.location.lng]}
                    radius={250}
                    pathOptions={{ 
                      fillColor: report.status === 'pending' ? '#FF9933' : '#E67E22',
                      fillOpacity: 0.3,
                      stroke: true,
                      color: '#FF9933',
                      weight: 1
                    }}
                  />
                </div>
              ))}
            </MapContainer>

            {/* City Selector Overlay - Primary Style */}
            <div className="absolute top-6 left-6 z-[1000] flex flex-col gap-3">
              <div className="bg-white p-1.5 rounded-sm shadow-2xl border-2 border-slate-900 flex flex-wrap gap-1.5 max-w-[calc(100vw-3rem)]">
                {CITIES.map((city) => (
                  <button
                    key={city.name}
                    onClick={() => setSelectedCity(city)}
                    className={cn(
                      "px-4 py-2 rounded-sm text-[10px] font-black uppercase tracking-widest transition-all border",
                      selectedCity.name === city.name 
                        ? "bg-slate-900 text-white border-slate-900 shadow-lg" 
                        : "bg-white text-slate-700 border-slate-100 hover:border-primary"
                    )}
                  >
                    {city.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Floating Action Button - Primary Style */}
            {user ? (
              <button 
                onClick={() => {
                  setIsReporting(true);
                  handleGetLocation();
                }}
                className="absolute bottom-10 right-10 z-[1000] bg-primary text-white px-8 py-5 rounded-sm shadow-[8px_8px_0px_0px_rgba(15,23,42,1)] hover:translate-x-1 hover:translate-y-1 hover:shadow-none transition-all flex items-center gap-3 border-2 border-slate-900"
              >
                <Camera size={24} />
                <span className="font-black uppercase tracking-[0.2em] text-sm">Report Issue</span>
              </button>
            ) : (
              <button 
                onClick={handleLogin}
                className="absolute bottom-10 right-10 z-[1000] bg-slate-900 text-white px-8 py-5 rounded-sm shadow-[8px_8px_0px_0px_rgba(255,92,0,1)] hover:translate-x-1 hover:translate-y-1 hover:shadow-none transition-all flex items-center gap-3 border-2 border-slate-900"
              >
                <LogIn size={24} />
                <span className="font-black uppercase tracking-[0.2em] text-sm">Login to Report</span>
              </button>
            )}
          </div>
        ) : (
          <div className="h-full overflow-y-auto p-8 bg-[#FFF9F5]">
            <div className="max-w-5xl mx-auto space-y-12">
              {/* Stats Grid - Editorial Style */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {[
                  { label: 'Public Reports', value: stats.total, color: 'bg-white border-slate-900', icon: AlertCircle, textColor: 'text-slate-900' },
                  { label: 'Under Review', value: stats.pending, color: 'bg-white border-amber-400', icon: Loader2, textColor: 'text-amber-600' },
                  { label: 'Verified Issues', value: stats.validated, color: 'bg-white border-primary', icon: CheckCircle2, textColor: 'text-primary' },
                  { label: 'Action Taken', value: stats.resolved, color: 'bg-white border-emerald-500', icon: CheckCircle2, textColor: 'text-emerald-600' },
                ].map((stat, i) => (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: i * 0.1 }}
                    key={stat.label} 
                    className={cn("p-6 rounded-sm border-2 shadow-[4px_4px_0px_0px_rgba(15,23,42,0.1)]", stat.color)}
                  >
                    <div className="flex items-center justify-between mb-4">
                      <stat.icon className={cn("opacity-60", stat.textColor)} size={24} />
                      <div className={cn("text-3xl font-black tracking-tighter", stat.textColor)}>{stat.value}</div>
                    </div>
                    <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-600">{stat.label}</div>
                  </motion.div>
                ))}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* City Breakdown */}
                <div className="lg:col-span-1 bg-white rounded-sm p-8 shadow-sm border-2 border-slate-100">
                  <h3 className="font-serif font-black text-xl mb-8 flex items-center gap-3 uppercase tracking-tighter">
                    <MapPin className="text-saffron" size={24} />
                    Regional Pulse
                  </h3>
                  <div className="space-y-6">
                    {CITIES.map(city => {
                      const cityReports = reports.filter(r => r.city === city.name);
                      const percentage = reports.length > 0 ? (cityReports.length / reports.length) * 100 : 0;
                      return (
                        <div key={city.name} className="space-y-2">
                          <div className="flex justify-between text-[11px] font-black uppercase tracking-wider">
                            <span>{city.name}</span>
                            <span className="text-saffron">{cityReports.length}</span>
                          </div>
                          <div className="h-1.5 bg-slate-50 rounded-none overflow-hidden border border-slate-100">
                            <motion.div 
                              initial={{ width: 0 }}
                              animate={{ width: `${percentage}%` }}
                              className="h-full bg-saffron"
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Recent Activity - News Feed Style */}
                <div className="lg:col-span-2 space-y-6">
                  <h3 className="font-serif font-black text-xl flex items-center gap-3 uppercase tracking-tighter">
                    <Navigation className="text-primary" size={24} />
                    Latest Reports
                  </h3>
                  <div className="grid grid-cols-1 gap-4">
                    {reports.slice(0, 5).map((report) => (
                      <div key={report.id} className="bg-white p-4 rounded-sm shadow-sm border border-slate-100 flex gap-6 group hover:border-primary transition-all">
                        <div className="relative w-32 h-32 flex-shrink-0">
                          <img 
                            src={report.imageUrl} 
                            alt="Issue" 
                            className="w-full h-full object-cover rounded-sm grayscale group-hover:grayscale-0 transition-all"
                            referrerPolicy="no-referrer"
                          />
                          <div className="absolute top-0 left-0 bg-primary text-white text-[8px] font-black px-2 py-1 uppercase">
                            {report.city}
                          </div>
                        </div>
                        <div className="flex-1 min-w-0 py-1">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] font-black text-slate-500 italic">
                              {report.createdAt?.seconds ? formatDistanceToNow(new Date(report.createdAt.seconds * 1000)) + ' ago' : 'Just now'}
                            </span>
                            <span className={cn(
                              "text-[8px] uppercase font-black px-2 py-0.5 rounded-sm border",
                              report.status === 'pending' ? "border-amber-200 text-amber-600" : "border-primary text-primary"
                            )}>
                              {report.status}
                            </span>
                          </div>
                          <p className="font-serif text-base text-slate-800 line-clamp-2 mb-3 leading-snug">
                            {report.description || "Citizen report from " + report.city}
                          </p>
                          <div className="flex items-center gap-4 text-[10px] font-black uppercase tracking-widest text-slate-500">
                            <span className="flex items-center gap-1">
                              <ThumbsUp size={12} className="text-primary" />
                              {report.validations} Verified
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Reporting Modal */}
      <AnimatePresence>
        {isReporting && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[2000] bg-[#1A1A1A]/60 backdrop-blur-sm flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white w-full max-w-lg rounded-[32px] shadow-2xl overflow-hidden border-4 border-white"
            >
              <div className="p-8 border-b border-[#E2E8F0] flex items-center justify-between">
                <h2 className="text-2xl font-black text-[#1A1A1A] tracking-tight">Report New Issue</h2>
                <button onClick={() => setIsReporting(false)} className="p-2 hover:bg-[#F0F4F8] rounded-full transition-colors">
                  <X size={24} />
                </button>
              </div>
              
              <form onSubmit={handleSubmitReport} className="p-8 space-y-8">
                {/* Image Upload */}
                <div className="space-y-3">
                  <label className="text-xs font-black uppercase tracking-widest text-[#64748B]">Capture Image</label>
                  <div 
                    onClick={() => document.getElementById('camera-input')?.click()}
                    className="aspect-video bg-[#F0F4F8] border-4 border-dashed border-[#CBD5E1] rounded-3xl flex flex-col items-center justify-center cursor-pointer hover:bg-[#E2E8F0] transition-all overflow-hidden relative"
                  >
                    {imagePreview ? (
                      <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <>
                        <Camera className="text-[#64748B] mb-2" size={40} />
                        <span className="text-sm font-bold text-[#64748B]">Tap to open camera</span>
                      </>
                    )}
                  </div>
                  <input 
                    id="camera-input"
                    type="file" 
                    accept="image/*" 
                    capture="environment"
                    onChange={handleImageChange}
                    className="hidden"
                  />
                </div>

                {/* Location Status */}
                <div className="flex items-center justify-between p-5 bg-[#FFF7ED] rounded-2xl border-2 border-[#FFEDD5]">
                  <div className="flex items-center gap-4">
                    <div className="bg-primary p-2.5 rounded-xl shadow-lg shadow-primary/20">
                      <Navigation className="text-white" size={20} />
                    </div>
                    <div>
                      <div className="text-xs font-black uppercase tracking-wider text-[#9A3412]">Location Status</div>
                      <div className="text-sm font-bold text-[#EA580C]">
                        {userLocation ? `${userLocation[0].toFixed(4)}, ${userLocation[1].toFixed(4)}` : 'Detecting location...'}
                      </div>
                    </div>
                  </div>
                  {!userLocation && (
                    <button 
                      type="button"
                      onClick={handleGetLocation}
                      className="text-xs font-black text-primary underline decoration-2 underline-offset-4"
                    >
                      Retry
                    </button>
                  )}
                </div>

                {/* Description */}
                <div className="space-y-3">
                  <label className="text-xs font-black uppercase tracking-widest text-[#64748B]">Description</label>
                  <textarea 
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Describe the issue..."
                    className="w-full p-5 bg-[#F0F4F8] border-2 border-[#E2E8F0] rounded-2xl text-sm font-bold focus:border-primary outline-none transition-all resize-none h-28"
                  />
                </div>

                <button 
                  type="submit"
                  disabled={loading || !userLocation || !imagePreview}
                  className="w-full bg-primary text-white py-5 rounded-2xl font-black text-lg shadow-xl shadow-primary/30 hover:bg-primary-dark transition-all disabled:opacity-50 disabled:shadow-none flex items-center justify-center gap-3"
                >
                  {loading ? <Loader2 className="animate-spin" size={24} /> : 'SUBMIT REPORT'}
                </button>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
