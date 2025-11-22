import { useState, useEffect, useMemo, useRef } from "react";
import "./App.css";
import { subscribeToData, saveData, clearData } from "./firebase";

// --- TYPES ---
interface Habit { id: string; name: string; weight: number; }
interface AppSettings { startDate: string; }
interface DayData { 
  date: string; 
  habitsDone: string[]; 
  isFuture: boolean; 
  isBeforeStart: boolean; 
  isToday: boolean; 
  isPlaceholder?: boolean;
  hasNote: boolean; // Added this to track visual state
}
interface MonthGroup { name: string; year: number; days: DayData[]; }

function App() {
  // --- STATE ---
  const [habits, setHabits] = useState<Habit[]>([]);
  const [history, setHistory] = useState<Record<string, string[]>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [settings, setSettings] = useState<AppSettings>({ startDate: new Date(new Date().getFullYear(), 0, 1).toLocaleDateString('en-CA') });
  const [isLoading, setIsLoading] = useState(true);
  
  // Refs for scrolling
  const scrollRef = useRef<HTMLDivElement>(null);
  const todayRef = useRef<HTMLDivElement>(null);

  // UI State
  const [newHabitName, setNewHabitName] = useState("");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showHabitManager, setShowHabitManager] = useState(false);
  const [tempNote, setTempNote] = useState("");

  const todayStr = useMemo(() => new Date().toLocaleDateString('en-CA'), []);

  // --- FIREBASE ---
  useEffect(() => {
    const unsubscribe = subscribeToData((data) => {
      if (data) {
        if (data.habits) setHabits(data.habits);
        if (data.history) setHistory(data.history);
        if (data.notes) setNotes(data.notes);
        if (data.settings) setSettings(data.settings);
      }
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // --- AUTO SCROLL TO TODAY ---
  useEffect(() => {
    if (!isLoading) {
      setTimeout(() => {
        if (todayRef.current) {
          todayRef.current.scrollIntoView({ 
            behavior: 'smooth', 
            block: 'nearest', 
            inline: 'center' 
          });
        } else if (scrollRef.current) {
          scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
        }
      }, 100);
    }
  }, [isLoading]);

  // --- ACTIONS ---
  const addHabit = () => {
    if (!newHabitName.trim()) return;
    saveData("habits", [...habits, { id: Date.now().toString(), name: newHabitName, weight: 1 }]);
    setNewHabitName("");
  };
  const deleteHabit = (id: string) => saveData("habits", habits.filter(h => h.id !== id));
  const updateWeight = (id: string, w: number) => saveData("habits", habits.map(h => h.id === id ? { ...h, weight: Math.max(1, w) } : h));
  
  const toggleHabitForToday = (habitName: string) => {
    const current = history[todayStr] || [];
    const updated = current.includes(habitName) ? current.filter(h => h !== habitName) : [...current, habitName];
    saveData("history", { ...history, [todayStr]: updated });
  };

  const updateStartDate = (date: string) => saveData("settings", { ...settings, startDate: date });
  const handleClear = () => confirm("Wipe all data?") && (clearData(), setShowSettings(false));

  const openDayModal = (date: string) => { setSelectedDate(date); setTempNote(notes[date] || ""); };
  const saveNote = () => { if(selectedDate) { saveData("notes", { ...notes, [selectedDate]: tempNote }); setSelectedDate(null); } };

  // --- DATA GENERATION ---
  const monthGroups = useMemo(() => {
    const groups: MonthGroup[] = [];
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth();

    for (let i = 11; i >= 0; i--) {
      const d = new Date(currentYear, currentMonth - i, 1);
      const monthIndex = d.getMonth();
      const year = d.getFullYear();
      const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
      
      let startDay = d.getDay() - 1; 
      if (startDay < 0) startDay = 6;

      const monthDays: DayData[] = [];

      for (let p = 0; p < startDay; p++) {
        monthDays.push({ 
          date: `placeholder-${year}-${monthIndex}-${p}`, 
          habitsDone: [], 
          isFuture: false, 
          isBeforeStart: false, 
          isToday: false, 
          isPlaceholder: true,
          hasNote: false
        });
      }

      for (let day = 1; day <= daysInMonth; day++) {
        const dateObj = new Date(year, monthIndex, day);
        const dateStr = dateObj.toLocaleDateString('en-CA');
        
        monthDays.push({
          date: dateStr,
          habitsDone: history[dateStr] || [],
          isFuture: dateStr > todayStr,
          isBeforeStart: dateStr < settings.startDate,
          isToday: dateStr === todayStr,
          hasNote: !!notes[dateStr] && notes[dateStr].trim().length > 0
        });
      }

      groups.push({
        name: d.toLocaleString('default', { month: 'short' }),
        year: year,
        days: monthDays
      });
    }
    return groups;
  }, [history, notes, settings.startDate, todayStr]);

  // --- STREAK CALCULATION ---
  const stats = useMemo(() => {
    const start = new Date(settings.startDate);
    const end = new Date(); 
    
    let currentStreak = 0;
    let longestStreak = 0;
    let tempStreak = 0;
    
    const itr = new Date(start);
    while (itr <= end) {
      const dStr = itr.toLocaleDateString('en-CA');
      const hasBadHabit = (history[dStr] && history[dStr].length > 0);
      
      if (!hasBadHabit) {
        tempStreak++;
        longestStreak = Math.max(longestStreak, tempStreak);
      } else {
        tempStreak = 0;
      }
      itr.setDate(itr.getDate() + 1);
    }

    const todayBad = (history[todayStr] && history[todayStr].length > 0);
    if (todayBad) {
      currentStreak = 0;
    } else {
      currentStreak = 0;
      let backItr = new Date();
      while (backItr >= start) {
        const dStr = backItr.toLocaleDateString('en-CA');
        const isBad = (history[dStr] && history[dStr].length > 0);
        if (isBad) break;
        currentStreak++;
        backItr.setDate(backItr.getDate() - 1);
      }
    }

    return { currentStreak, longestStreak };
  }, [history, settings.startDate, todayStr]);


  // --- COLOR LOGIC ---
  const getBoxColor = (day: DayData) => {
    if (day.isPlaceholder) return "transparent";
    if (day.isFuture || day.isBeforeStart) return "#334155"; 
    if (day.habitsDone.length === 0) return "#10b981"; 

    const maxW = habits.reduce((s, h) => s + h.weight, 0) || 1;
    const curW = day.habitsDone.reduce((s, n) => s + (habits.find(h => h.name === n)?.weight || 0), 0);
    const intensity = curW / maxW;

    if (intensity <= 0.1) return "#fecaca"; 
    if (intensity <= 0.25) return "#fca5a5"; 
    if (intensity <= 0.5) return "#ef4444";  
    if (intensity <= 0.75) return "#b91c1c"; 
    return "#7f1d1d"; 
  };

  if (isLoading) return <div style={{color:'white', padding:'2rem'}}>Loading...</div>;

  return (
    <div className="dashboard-container">
      {/* SIDEBAR */}
      <div className="sidebar">
        <div className="card stats-card">
          <div className="stat-item">
            <div className="stat-val">{stats.currentStreak} <span className="stat-unit">days</span></div>
            <div className="stat-label">Current Clean Streak</div>
          </div>
          <div className="stat-divider"></div>
          <div className="stat-item">
            <div className="stat-val">{stats.longestStreak} <span className="stat-unit">days</span></div>
            <div className="stat-label">Longest Clean Streak</div>
          </div>
        </div>

        <div className="card">
          <h2>Today's Checklist</h2>
          <h3>{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric'})}</h3>
          {habits.length === 0 ? <p style={{color:'#94a3b8'}}>No habits yet.</p> : (
            <div className="checklist-container">
              {habits.map(h => (
                <div key={h.id} className={`checklist-item ${(history[todayStr]||[]).includes(h.name)?'checked':''}`} onClick={() => toggleHabitForToday(h.name)}>
                  <span className="checklist-label">{h.name}</span>
                  <div className="custom-checkbox">{(history[todayStr]||[]).includes(h.name) && "✕"}</div>
                </div>
              ))}
            </div>
          )}
        </div>
        <button className="btn-action" onClick={() => setShowHabitManager(true)}><span>✎</span> Manage Habits</button>
      </div>

      {/* MAIN HEATMAP */}
      <div className="main-content">
        <div className="heatmap-card">
          <div className="heatmap-header">
            <div>
              <h2>History Overview</h2>
              <div className="heatmap-legend">
                <div className="legend-item"><div className="dot" style={{background: '#10b981'}}></div> Clean</div>
                <div className="legend-item"><div className="dot" style={{background: '#ef4444'}}></div> Bad</div>
                <div className="legend-item"><div className="dot" style={{background: '#334155'}}></div> Untracked</div>
                <div className="legend-item"><div className="dot" style={{background: 'transparent', border:'1px solid #94a3b8', position:'relative'}}><div style={{position:'absolute', top:'-2px', right:'-2px', width:'4px', height:'4px', background:'white', borderRadius:'50%'}}></div></div> Has Note</div>
              </div>
            </div>
            <button className="settings-icon-btn" onClick={() => setShowSettings(true)}>⚙</button>
          </div>

          <div className="heatmap-scroll-container" ref={scrollRef}>
            <div className="week-labels">
              <div>Mon</div><div></div><div>Wed</div><div></div><div>Fri</div><div></div><div>Sun</div>
            </div>

            <div className="months-track">
              {monthGroups.map((month, mIdx) => (
                <div key={mIdx} className="month-block">
                  <div className="month-label">{month.name}</div>
                  <div className="month-grid">
                    {month.days.map((day, dIdx) => (
                      <div
                        key={dIdx}
                        ref={day.isToday ? todayRef : null}
                        className={`
                          box 
                          ${day.isToday?'today':''} 
                          ${day.isPlaceholder?'empty':(!day.isFuture && !day.isBeforeStart ? 'clickable' : '')}
                          ${day.hasNote ? 'has-note' : ''}
                        `}
                        style={{ backgroundColor: getBoxColor(day) }}
                        onClick={() => !day.isPlaceholder && !day.isFuture && !day.isBeforeStart && openDayModal(day.date)}
                        title={day.isPlaceholder ? '' : day.date}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* MODALS */}
      {showHabitManager && (
        <div className="modal-overlay" onClick={() => setShowHabitManager(false)}>
          <div className="modal-content" onClick={e=>e.stopPropagation()}>
            <div className="modal-header"><h2>Manage Habits</h2><button className="close-btn" onClick={()=>setShowHabitManager(false)}>×</button></div>
            <div style={{display:'flex', gap:'10px', marginBottom:'1rem'}}>
              <input type="text" placeholder="New habit..." value={newHabitName} onChange={e=>setNewHabitName(e.target.value)} />
              <button className="btn-add" onClick={addHabit}>Add</button>
            </div>
            <ul className="mini-habit-list">
              {habits.map(h => (
                <li key={h.id} className="mini-habit-item">
                  <span>{h.name}</span>
                  <div className="habit-controls">
                    <span style={{fontSize:'0.8rem', color:'#94a3b8'}}>Wt:</span>
                    <input type="number" className="weight-input" value={h.weight} min="1" max="10" onChange={e=>updateWeight(h.id, parseInt(e.target.value))} />
                    <button className="btn-delete" onClick={()=>deleteHabit(h.id)}>×</button>
                  </div>
                </li>
              ))}
            </ul>
            <button className="btn-action" style={{marginTop:'1rem'}} onClick={()=>setShowHabitManager(false)}>Done</button>
          </div>
        </div>
      )}

      {showSettings && (
        <div className="modal-overlay" onClick={() => setShowSettings(false)}>
          <div className="modal-content" onClick={e=>e.stopPropagation()}>
            <div className="modal-header"><h2>Settings</h2><button className="close-btn" onClick={()=>setShowSettings(false)}>×</button></div>
            <div style={{marginBottom:'1.5rem'}}>
              <label style={{display:'block', marginBottom:'0.5rem'}}>Start Tracking Date</label>
              <input type="date" value={settings.startDate} onChange={e=>updateStartDate(e.target.value)} style={{width:'100%', boxSizing:'border-box'}} />
            </div>
            <div style={{borderTop:'1px solid #334155', paddingTop:'1rem'}}>
              <button style={{background:'rgba(239,68,68,0.1)', color:'#ef4444', border:'1px solid #ef4444', padding:'10px', borderRadius:'8px', width:'100%', cursor:'pointer'}} onClick={handleClear}>Clear All Data</button>
            </div>
          </div>
        </div>
      )}

      {selectedDate && (
        <div className="modal-overlay" onClick={() => setSelectedDate(null)}>
          <div className="modal-content" onClick={e=>e.stopPropagation()}>
            <div className="modal-header"><h2>{selectedDate}</h2><button className="close-btn" onClick={()=>setSelectedDate(null)}>×</button></div>
            {(history[selectedDate]||[]).length===0 ? <div className="clean-day-msg" style={{textAlign:'center', color:'#10b981', padding:'1rem', background:'rgba(16,185,129,0.1)', borderRadius:'8px'}}>No bad habits! 🎉</div> : (
              <div style={{display:'flex', flexDirection:'column', gap:'8px'}}>
                {(history[selectedDate]||[]).map((h,i)=><div key={i} style={{padding:'8px', background:'rgba(239,68,68,0.1)', color:'#fca5a5', borderRadius:'4px', border:'1px solid rgba(239,68,68,0.2)'}}>• {h}</div>)}
              </div>
            )}
            <div className="journal-section">
              <label style={{display:'block', color:'#94a3b8', marginBottom:'0.5rem'}}>Journal</label>
              <textarea className="journal-textarea" value={tempNote} onChange={e=>setTempNote(e.target.value)} placeholder="Notes..." />
              <button className="btn-primary" onClick={saveNote}>Save Note</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;