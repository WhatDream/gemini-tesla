import React, { useState, useEffect } from 'react';
import { 
  Battery, 
  Lock, 
  Unlock, 
  Wind, 
  Zap, 
  Car, 
  Navigation, 
  Settings, 
  Power,
  Thermometer,
  Gauge,
  MapPin,
  RefreshCw,
  LogOut,
  Mic,
  MicOff,
  Volume2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';

// --- Types ---
declare global {
  interface Window {
    mapkit: any;
  }
}

interface VehicleData {
  display_name: string;
  state: string;
  drive_state: {
    speed: number;
    shift_state: string;
    latitude: number;
    longitude: number;
  };
  charge_state: {
    battery_level: number;
    minutes_to_full_charge: number;
    charging_state: string;
  };
  climate_state: {
    inside_temp: number;
    outside_temp: number;
    is_climate_on: boolean;
  };
  vehicle_state: {
    locked: boolean;
    odometer: number;
  };
}

// --- Components ---
const AppleMap = ({ lat, lng, zoom = 12 }: { lat: number, lng: number, zoom?: number }) => {
  const mapRef = React.useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<any>(null);

  useEffect(() => {
    const initMap = async () => {
      if (!window.mapkit || !mapRef.current) return;

      try {
        const res = await fetch('/api/mapkit/token');
        const { token } = await res.json();

        if (!token) {
          console.warn("Apple MapKit token missing. Map will not initialize.");
          return;
        }

        window.mapkit.init({
          authorizationCallback: (done: any) => done(token)
        });

        const newMap = new window.mapkit.Map(mapRef.current, {
          center: new window.mapkit.Coordinate(lat, lng),
          showsUserLocation: false,
          showsPointsOfInterest: false,
          colorScheme: window.mapkit.ColorScheme.Dark,
        });

        setMap(newMap);
      } catch (err) {
        console.error("MapKit Init Error", err);
      }
    };

    if (!map) initMap();
  }, []);

  useEffect(() => {
    if (map && window.mapkit) {
      map.setCenterAnimated(new window.mapkit.Coordinate(lat, lng));
    }
  }, [lat, lng, map]);

  return (
    <div className="relative w-full h-full bg-zinc-900 rounded-3xl overflow-hidden border border-border">
      <div ref={mapRef} className="w-full h-full" />
      {!map && (
        <div className="absolute inset-0 flex items-center justify-center bg-zinc-900/80 backdrop-blur-sm text-zinc-500 text-xs text-center p-4">
          <div>
            <MapPin className="w-6 h-6 mx-auto mb-2 opacity-20" />
            <p>Apple Maps 需配置 MapKit Token</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default function App() {
  const [data, setData] = useState<VehicleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isMock, setIsMock] = useState(true);

  const [isDrivingMode, setIsDrivingMode] = useState(false);
  const [commandLoading, setCommandLoading] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [voiceFeedback, setVoiceFeedback] = useState<string | null>(null);

  // Fetch Vehicle Data
  const fetchData = async () => {
    try {
      const res = await fetch('/api/vehicle/data');
      const json = await res.json();
      setData(json);
      
      // Auto-enter driving mode if speed > 0
      if (json.drive_state.speed > 0 && !isDrivingMode) {
        setIsDrivingMode(true); 
      }
    } catch (err) {
      console.error("Failed to fetch vehicle data", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, isDrivingMode ? 2000 : 5000);
    return () => clearInterval(interval);
  }, [isDrivingMode]);

  // OAuth Handler
  const handleConnect = async () => {
    try {
      const res = await fetch('/api/auth/url');
      const { url } = await res.json();
      const authWindow = window.open(url, 'tesla_oauth', 'width=600,height=700');
      
      if (!authWindow) {
        alert('Please allow popups to connect your Tesla account.');
      }
    } catch (err) {
      console.error("OAuth Error", err);
    }
  };

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        setIsAuthenticated(true);
        setIsMock(false);
        fetchData();
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // --- Voice Control ---
  const startVoiceControl = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("您的浏览器不支持语音识别。");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'zh-CN';
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onstart = () => {
      setIsListening(true);
      setVoiceFeedback("正在聆听...");
    };

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript.toLowerCase();
      setVoiceFeedback(`识别到: "${transcript}"`);
      handleVoiceCommand(transcript);
    };

    recognition.onerror = () => {
      setIsListening(false);
      setVoiceFeedback("语音识别出错");
      setTimeout(() => setVoiceFeedback(null), 3000);
    };

    recognition.onend = () => {
      setIsListening(false);
      setTimeout(() => setVoiceFeedback(null), 3000);
    };

    recognition.start();
  };

  const handleVoiceCommand = (command: string) => {
    if (command.includes("进入驾驶") || command.includes("开始驾驶") || command.includes("驾驶模式")) {
      setIsDrivingMode(true);
    } else if (command.includes("退出驾驶") || command.includes("关闭驾驶")) {
      setIsDrivingMode(false);
    } else if (command.includes("锁定") || command.includes("关门")) {
      sendCommand('door_lock');
    } else if (command.includes("解锁") || command.includes("开门")) {
      sendCommand('door_unlock');
    } else if (command.includes("空调") && (command.includes("开") || command.includes("启动"))) {
      sendCommand('auto_conditioning_start');
    } else if (command.includes("空调") && (command.includes("关") || command.includes("停止"))) {
      sendCommand('auto_conditioning_stop');
    } else if (command.includes("前备箱")) {
      sendCommand('actuate_trunk');
    } else if (command.includes("充电")) {
      sendCommand('charge_port_door_open');
    }
  };

  const sendCommand = async (command: string) => {
    setCommandLoading(command);
    
    // Optimistic UI update
    const previousData = data;
    if (data) {
      const newData = { ...data };
      if (command === 'door_lock') newData.vehicle_state.locked = true;
      if (command === 'door_unlock') newData.vehicle_state.locked = false;
      if (command === 'auto_conditioning_start') newData.climate_state.is_climate_on = true;
      if (command === 'auto_conditioning_stop') newData.climate_state.is_climate_on = false;
      setData(newData);
    }

    try {
      const response = await fetch('/api/vehicle/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command }),
      });
      
      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || 'Command failed');
      }
      
      // Refresh data after command
      await fetchData();
    } catch (err) {
      console.error("Command Error", err);
      // Rollback on error
      setData(previousData);
    } finally {
      setCommandLoading(null);
    }
  };

  if (loading && !data) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
        >
          <RefreshCw className="text-red-600 w-8 h-8" />
        </motion.div>
      </div>
    );
  }

  // --- Driving Mode View ---
  if (isDrivingMode) {
    return (
      <div className="fixed inset-0 bg-bg text-text-primary z-[100] flex flex-col overflow-hidden font-sans">
        {/* Background Map (Optional for full immersion) */}
        <div className="absolute inset-0 opacity-30 pointer-events-none">
          <AppleMap lat={data?.drive_state.latitude || 37.7749} lng={data?.drive_state.longitude || -122.4194} />
        </div>

        {/* Top Bar */}
        <div className="relative z-10 p-8 flex justify-between items-center bg-gradient-to-b from-bg to-transparent">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsDrivingMode(false)}
              className="p-3 rounded-2xl bg-card border border-border hover:bg-zinc-800 transition-colors"
            >
              <LogOut className="w-6 h-6 text-text-secondary rotate-180" />
            </button>
            <span className="text-text-secondary font-bold tracking-widest uppercase text-sm">驾驶模式</span>
          </div>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <Thermometer className="w-5 h-5 text-text-secondary" />
              <span className="text-xl font-medium">{data?.climate_state.inside_temp}°</span>
            </div>
            <div className="flex items-center gap-2">
              <Battery className="w-5 h-5 text-accent-green" />
              <span className="text-xl font-medium">{data?.charge_state.battery_level}%</span>
            </div>
          </div>
        </div>

        {/* Main Display */}
        <div className="flex-1 flex flex-col items-center justify-center relative">
          {/* Speedometer Gauge */}
          <div className="relative w-[450px] h-[450px] flex items-center justify-center">
            {/* Outer Glow/Ring */}
            <div className="absolute inset-0 border-[1px] border-border/20 rounded-full" />
            
            {/* Speed Arc */}
            <svg className="absolute inset-0 w-full h-full -rotate-90">
              <circle
                cx="225"
                cy="225"
                r="210"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="text-border/20"
              />
              <motion.circle
                cx="225"
                cy="225"
                r="210"
                fill="none"
                stroke="currentColor"
                strokeWidth="8"
                strokeDasharray="1320"
                initial={{ strokeDashoffset: 1320 }}
                animate={{ strokeDashoffset: 1320 - (Math.min(data?.drive_state.speed || 0, 200) / 200) * 1320 }}
                transition={{ type: "spring", stiffness: 50, damping: 20 }}
                className="text-accent-red"
                strokeLinecap="round"
              />
            </svg>

            {/* Speed Text */}
            <motion.div 
              key={data?.drive_state.speed}
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="text-center z-10"
            >
              <span className="text-[200px] font-black tracking-tighter leading-none block">
                {data?.drive_state.speed}
              </span>
              <span className="text-4xl text-text-secondary font-bold uppercase tracking-[0.4em] mt-[-10px] block">
                km/h
              </span>
            </motion.div>
          </div>

          {/* Location Display */}
          <div className="mt-12 flex items-center gap-3 px-6 py-3 bg-card/80 backdrop-blur-md border border-border rounded-full">
            <MapPin className="w-5 h-5 text-accent-red animate-pulse" />
            <span className="text-lg font-medium tracking-wide">
              {data?.drive_state.latitude ? `北纬 ${data.drive_state.latitude.toFixed(4)}°, 西经 ${Math.abs(data.drive_state.longitude).toFixed(4)}°` : "定位中..."}
            </span>
          </div>

          {/* Gear Indicator */}
          <div className="absolute bottom-20 left-0 right-0 flex justify-center gap-12">
            {['P', 'R', 'N', 'D'].map((g) => (
              <motion.span 
                key={g}
                animate={{ 
                  scale: data?.drive_state.shift_state === g ? 1.5 : 1,
                  opacity: data?.drive_state.shift_state === g ? 1 : 0.2
                }}
                className={cn(
                  "text-5xl font-black transition-colors",
                  data?.drive_state.shift_state === g ? "text-accent-red" : "text-text-secondary"
                )}
              >
                {g}
              </motion.span>
            ))}
          </div>
        </div>

        {/* Bottom Status Bar */}
        <div className="p-12 grid grid-cols-3 border-t border-border bg-card">
          <div className="flex flex-col items-center border-r border-border">
            <span className="text-text-secondary text-xs font-bold uppercase tracking-widest mb-1">总里程</span>
            <span className="text-2xl font-mono">{Math.round(data?.vehicle_state.odometer || 0)} km</span>
          </div>
          <div className="flex flex-col items-center border-r border-border">
            <span className="text-text-secondary text-xs font-bold uppercase tracking-widest mb-1">状态</span>
            <span className="text-2xl font-bold text-accent-green uppercase">{data?.state === 'online' ? '在线' : '离线'}</span>
          </div>
          <div className="flex flex-col items-center">
            <span className="text-text-secondary text-xs font-bold uppercase tracking-widest mb-1">自动辅助驾驶</span>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-blue-500 animate-pulse" />
              <span className="text-2xl font-bold text-blue-500">就绪</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg text-text-primary font-sans selection:bg-accent-red/30 p-10 overflow-hidden flex flex-col">
      {/* Header */}
      <header className="flex justify-between items-start mb-10">
        <div className="car-identity">
          <motion.h1 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="text-[32px] font-semibold tracking-tight"
          >
            {data?.display_name || "Model 3 Performance"}
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="text-text-secondary text-sm mt-1"
          >
            VIN: 5YJ3E1EA5KFXXXXXX • 更新于: 刚刚
          </motion.p>
        </div>
        <div className="flex items-center gap-4">
          <AnimatePresence>
            {voiceFeedback && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="bg-accent-red/20 border border-accent-red/50 px-4 py-1.5 rounded-full text-accent-red text-xs font-medium flex items-center gap-2"
              >
                <Volume2 className="w-3 h-3" />
                {voiceFeedback}
              </motion.div>
            )}
          </AnimatePresence>
          <button 
            onClick={startVoiceControl}
            className={cn(
              "p-2.5 rounded-full border transition-all",
              isListening ? "bg-accent-red border-accent-red animate-pulse" : "bg-card border-border hover:bg-zinc-800"
            )}
          >
            {isListening ? <Mic className="w-5 h-5 text-white" /> : <MicOff className="w-5 h-5 text-text-secondary" />}
          </button>
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex items-center bg-accent-green/10 border border-accent-green px-4 py-1.5 rounded-full text-accent-green text-[12px] font-bold uppercase tracking-widest"
          >
            <span className="mr-2">●</span> {data?.state === 'online' ? "已连接" : "离线"}
          </motion.div>
          <div className="flex gap-2">
            <button 
              onClick={() => setIsDrivingMode(true)}
              className="p-2.5 rounded-full bg-card border border-border hover:bg-zinc-800 transition-colors"
              title="进入驾驶模式"
            >
              <Gauge className="w-5 h-5 text-text-secondary" />
            </button>
            <button 
              onClick={handleConnect}
              className="p-2.5 rounded-full bg-card border border-border hover:bg-zinc-800 transition-colors"
            >
              <Settings className="w-5 h-5 text-text-secondary" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Grid */}
      <main className="grid grid-cols-[1fr_380px_1fr] gap-10 flex-grow items-center">
        {/* Left Stats */}
        <div className="flex flex-col gap-8">
          <StatBox label="车内温度" value={`${data?.climate_state.inside_temp}°C`} />
          <StatBox label="胎压" value="2.8 bar" />
          <StatBox label="总里程" value={`${Math.round(data?.vehicle_state.odometer || 0)} km`} />
          
          {/* Map Preview */}
          <div className="h-32 mt-4">
            <AppleMap lat={data?.drive_state.latitude || 37.7749} lng={data?.drive_state.longitude || -122.4194} />
          </div>
        </div>

        {/* Central Dashboard */}
        <div className="text-center relative">
          <motion.div 
            whileHover={{ scale: 1.02 }}
            onClick={() => setIsDrivingMode(true)}
            className="cursor-pointer group"
          >
            <div className="w-80 h-80 border-4 border-border rounded-full flex flex-col items-center justify-center mx-auto relative">
              {/* Speed Arc Overlay */}
              <div className="absolute -inset-2.5 border-2 border-accent-red rounded-full opacity-60 group-hover:opacity-100 transition-opacity" 
                   style={{ clipPath: 'polygon(50% 50%, 0 0, 100% 0, 100% 30%)' }} />
              
              <motion.span 
                key={data?.drive_state.speed}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-[100px] font-extralight leading-none"
              >
                {data?.drive_state.speed || 0}
              </motion.span>
              <span className="text-text-secondary text-lg uppercase tracking-widest">km/h</span>
              
              {/* Hover Hint */}
              <div className="absolute bottom-10 opacity-0 group-hover:opacity-100 transition-opacity text-accent-red text-[10px] font-bold uppercase tracking-widest">
                点击进入驾驶模式
              </div>
            </div>
          </motion.div>
          <div className="text-[48px] text-accent-red font-semibold mt-6 tracking-[8px]">
            {data?.drive_state.shift_state || 'P'}
          </div>
        </div>

        {/* Right Stats */}
        <div className="flex flex-col gap-8">
          <StatBox label="外部温度" value={`${data?.climate_state.outside_temp}°C`} />
          <StatBox label="预计续航" value="412 km" />
          <StatBox label="充电功率" value="0 kW" />
        </div>

        {/* Battery Section */}
        <section className="col-span-3 mt-10 bg-card p-6 rounded-2xl border border-border">
          <div className="flex justify-between items-center mb-3">
            <div className="flex items-center gap-4">
              <div>
                <span className="text-text-secondary text-sm">电池状态: </span>
                <span className="text-xl font-semibold text-accent-green">{data?.charge_state.battery_level}%</span>
              </div>
              <div className="h-4 w-[1px] bg-border" />
              <div className="flex items-center gap-2">
                <Zap className={cn("w-4 h-4", data?.charge_state.charging_state === 'Charging' ? "text-accent-green animate-pulse" : "text-text-secondary")} />
                <span className="text-sm font-medium">
                  {data?.charge_state.charging_state === 'Charging' ? '正在充电' : '未在充电'}
                </span>
              </div>
            </div>
            <div className="text-text-secondary text-sm">
              {data?.charge_state.charging_state === 'Charging' ? (
                <span className="flex items-center gap-2">
                  <RefreshCw className="w-3 h-3 animate-spin" />
                  剩余 {data?.charge_state.minutes_to_full_charge} 分钟充满
                </span>
              ) : '充电已停止'}
            </div>
          </div>
          <div className="h-2 bg-zinc-900 rounded-full overflow-hidden">
            <motion.div 
              initial={{ width: 0 }}
              animate={{ width: `${data?.charge_state.battery_level}%` }}
              className={cn(
                "h-full shadow-[0_0_15px_rgba(50,215,75,0.4)]",
                data?.charge_state.charging_state === 'Charging' ? "bg-accent-green animate-pulse" : "bg-accent-green"
              )}
            />
          </div>
        </section>
      </main>

      {/* Controls Footer */}
      <footer className="grid grid-cols-4 gap-5 mt-10">
        <ControlBtn 
          icon={data?.vehicle_state.locked ? Lock : Unlock} 
          label={data?.vehicle_state.locked ? "解锁车门" : "锁定车门"}
          loading={commandLoading === 'door_lock' || commandLoading === 'door_unlock'}
          onClick={() => sendCommand(data?.vehicle_state.locked ? 'door_unlock' : 'door_lock')}
        />
        <ControlBtn 
          icon={Wind} 
          label={data?.climate_state.is_climate_on ? "关闭空调" : "开启空调"} 
          loading={commandLoading === 'auto_conditioning_start' || commandLoading === 'auto_conditioning_stop'}
          active={data?.climate_state.is_climate_on}
          onClick={() => sendCommand(data?.climate_state.is_climate_on ? 'auto_conditioning_stop' : 'auto_conditioning_start')}
        />
        <ControlBtn 
          icon={Car} 
          label="开启前备箱" 
          loading={commandLoading === 'actuate_trunk'}
          onClick={() => sendCommand('actuate_trunk')}
        />
        <ControlBtn 
          icon={Zap} 
          label="充电口盖" 
          loading={commandLoading === 'charge_port_door_open'}
          onClick={() => sendCommand('charge_port_door_open')}
        />
      </footer>
    </div>
  );
}

function StatBox({ label, value }: { label: string, value: string }) {
  return (
    <div className="border-l-2 border-border pl-5">
      <div className="text-text-secondary text-[12px] uppercase tracking-widest mb-2 font-medium">{label}</div>
      <div className="text-2xl font-normal">{value}</div>
    </div>
  );
}

function ControlBtn({ icon: Icon, label, onClick, loading, active }: { icon: any, label: string, onClick: () => void, loading?: boolean, active?: boolean }) {
  return (
    <button 
      onClick={onClick}
      disabled={loading}
      className={cn(
        "bg-card border border-border p-5 rounded-xl flex items-center gap-4 transition-all group active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed",
        active ? "border-accent-red bg-accent-red/5" : "hover:bg-zinc-800"
      )}
    >
      {loading ? (
        <div className="w-6 h-6 border-2 border-accent-red border-t-transparent rounded-full animate-spin" />
      ) : (
        <Icon className={cn("w-6 h-6 transition-colors", active ? "text-accent-red" : "text-text-primary group-hover:text-accent-red")} />
      )}
      <span className={cn("text-sm font-semibold transition-colors", active ? "text-accent-red" : "text-text-primary")}>{label}</span>
    </button>
  );
}
