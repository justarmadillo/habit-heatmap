import { useState, useEffect, useMemo, useRef } from "react";
import "./App.css";
import { subscribeToData, saveData, clearData } from "./firebase";

interface Habit { id: string; name: string; weight: number; }
interface AppSettings { startDate: string; }
interface DayData { 
  date: string; 
  habitsDone: string[]; 
  isFuture: boolean; 
  isBeforeStart: boolean; 
  isToday: boolean; 
  isPlaceholder?: boolean;
  hasNote: boolean;
}
interface MonthGroup { name: string; year: number; days: DayData[]; }

function App() {
  const [habits, setHabits] = useState<Habit[]>([]);
  const [history, setHistory] = useState<Record<string, string[]>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [settings, setSettings] = useState<AppSettings>({ startDate: new Date(new Date().getFullYear(), 0, 1).toLocaleDateString('en-CA') });
  const [isLoading, setIsLoading] = useState(true);
  const [newHabitName, setNewHabitName] = useState("");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showHabitManager, setShowHabitManager] = useState(false);
  const [tempNote, setTempNote] = useState("");
  const [isAnimating, setIsAnimating] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const todayRef = useRef<HTMLDivElement>(null);

  const todayStr = useMemo(() => new Date().toLocaleDateString('en-CA'), []);

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

  useEffect(() => {
    if (!isLoading && scrollRef.current && todayRef.current) {
      const container = scrollRef.current;
      const todayEl = todayRef.current;
      const offset = todayEl.offsetLeft - container.offsetLeft - (container.clientWidth / 2) + (todayEl.clientWidth / 2);
      container.scrollTo({
        left: Math.max(0, offset),
        behavior: "smooth"
      });
    }
  }, [isLoading]);

  const addHabit = () => {
    if (!newHabitName.trim()) return;
    setIsAnimating(true);
    setTimeout(() => setIsAnimating(false), 300);
    saveData("habits", [...habits, { id: Date.now().toString(), name: newHabitName, weight: 1 }]);
    setNewHabitName("");
  };
  const deleteHabit = (id: string) => {
    setIsAnimating(true);
    setTimeout(() => setIsAnimating(false), 300);
    saveData("habits", habits.filter(h => h.id !== id));
  };
  const updateWeight = (id: string, w: number) =>
    saveData("habits", habits.map(h => h.id === id ? { ...h, weight: Math.max(1, w) } : h));

  const toggleHabitForToday = (habitName: string) => {
    const current = history[todayStr] || [];
    const updated = current.includes(habitName) ? current.filter(h => h !== habitName) : [...current, habitName];
    saveData("history", { ...history, [todayStr]: updated });
  };

  const updateStartDate = (date: string) => saveData("settings", { ...settings, startDate: date });
  const handleClear = () => confirm("Wipe all data?") && (clearData(), setShowSettings(false));

  const openDayModal = (date: string) => { setSelectedDate(date); setTempNote(notes[date] || ""); };
  const saveNote = () => { if(selectedDate) { saveData("notes", { ...notes, [selectedDate]: tempNote }); setSelectedDate(null); } };

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
          hasNote: !!notes[dateStr]?.trim().length
        });
      }

      groups.push({
        name: d.toLocaleString('default', { month: 'short' }),
        year,
        days: monthDays
      });
    }
    return groups;
  }, [history, notes, settings.startDate, todayStr]);

  const stats = useMemo(() => {
    const start = new Date(settings.startDate);
    const end = new Date(); 
    
    let currentStreak = 0;
    let longestStreak = 0;
    let tempStreak = 0;
    
    const itr = new Date(start);
    while (itr <= end) {
      const dStr = itr.toLocaleDateString('en-CA');
      const hasBadHabit = (history[dStr]?.length ?? 0) > 0;
      if (!hasBadHabit) {
        tempStreak++;
        longestStreak = Math.max(longestStreak, tempStreak);
      } else {
        tempStreak = 0;
      }
      itr.setDate(itr.getDate() + 1);
    }

    const todayBad = (history[todayStr]?.length ?? 0) > 0;
    if (!todayBad) {
      let backItr = new Date();
      while (backItr >= start) {
        const dStr = backItr.toLocaleDateString('en-CA');
        if ((history[dStr]?.length ?? 0) > 0) break;
        currentStreak++;
        backItr.setDate(backItr.getDate() - 1);
      }
    }

    return { currentStreak, longestStreak };
  }, [history, settings.startDate, todayStr]);

  const getBoxColor = (day: DayData) => {
    if (day.isPlaceholder) return "transparent";
    if (day.isFuture || day.isBeforeStart) return "rgba(71, 85, 105, 0.5)"; 
    if (day.habitsDone.length === 0) return "linear-gradient(135deg, #10b981, #059669)"; 

    const maxW = habits.reduce((s, h) => s + h.weight, 0) || 1;
    const curW = day.habitsDone.reduce((s, n) => s + (habits.find(h => h.name === n)?.weight || 0), 0);
    const intensity = curW / maxW;

    if (intensity <= 0.1) return "linear-gradient(135deg, #fef3c7, #fde68a)"; 
    if (intensity <= 0.25) return "linear-gradient(135deg, #fed7aa, #fdba74)"; 
    if (intensity <= 0.5) return "linear-gradient(135deg, #fca5a5, #f87171)";  
    if (intensity <= 0.75) return "linear-gradient(135deg, #f87171, #ef4444)"; 
    return "linear-gradient(135deg, #dc2626, #b91c1c)"; 
  };

  if (isLoading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Loading your habits...</p>
      </div>
    );
  }

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="header-content">
          <div className="logo">
            <div className="logo-icon">◉</div>
            <h1>HabitFlow</h1>
          </div>
          <nav className="header-nav">
            <button className="nav-btn" onClick={() => setShowHabitManager(true)}>
              <span className="icon">✏</span> Habits
            </button>
            <button className="nav-btn" onClick={() => setShowSettings(true)}>
              <span className="icon">⚙</span> Settings
            </button>
          </nav>
        </div>
      </header>

      <main className="app-main">
        <section className="stats-section">
          <div className="stat-card">
            <div className="stat-icon">
              <span className="icon">🔥</span>
            </div>
            <div className="stat-content">
              <div className="stat-number">{stats.currentStreak}</div>
              <div className="stat-label">Current Streak</div>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon">
              <span className="icon">⭐</span>
            </div>
            <div className="stat-content">
              <div className="stat-number">{stats.longestStreak}</div>
              <div className="stat-label">Best Streak</div>
            </div>
          </div>
        </section>

        <section className="today-section">
          <div className="section-header">
            <h2>Today's Focus</h2>
            <span className="date-badge">
              {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
            </span>
          </div>
          <div className={`habits-grid ${isAnimating ? 'animate' : ''}`}>
            {habits.length === 0 ? (
              <div className="empty-state">
                <span className="empty-icon">📝</span>
                <p>No habits yet. Start building better habits!</p>
                <button className="primary-btn" onClick={() => setShowHabitManager(true)}>Add Your First Habit</button>
              </div>
            ) : (
              habits.map(h => (
                <div 
                  key={h.id} 
                  className={`habit-card ${(history[todayStr]||[]).includes(h.name)?'completed':''}`}
                  onClick={() => toggleHabitForToday(h.name)}
                >
                  <div className="habit-check">
                    <div className="checkbox">
                      {(history[todayStr]||[]).includes(h.name) && <span>✓</span>}
                    </div>
                  </div>
                  <div className="habit-info">
                    <div className="habit-name">{h.name}</div>
                    <div className="habit-weight">Weight: {h.weight}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="heatmap-section">
          <div className="section-header">
            <h2>Progress Timeline</h2>
            <div className="heatmap-legend">
              <div className="legend-item">
                <div className="legend-box clean"></div>
                <span>Clean</span>
              </div>
              <div className="legend-item">
                <div className="legend-box moderate"></div>
                <span>Mixed</span>
              </div>
              <div className="legend-item">
                <div className="legend-box bad"></div>
                <span>Challenging</span>
              </div>
              <div className="legend-item">
                <div className="legend-box notes"></div>
                <span>Note</span>
              </div>
            </div>
          </div>
          
          <div className="heatmap-container" ref={scrollRef}>
            <div className="heatmap-grid">
              {monthGroups.map((month, mIdx) => (
                <div key={mIdx} className="month-block">
                  <div className="month-label">{month.name}</div>
                  <div className="days-grid">
                    {month.days.map((day, dIdx) => (
                      <div
                        key={dIdx}
                        ref={day.isToday ? todayRef : null}
                        className={`
                          day-box 
                          ${day.isToday?'today':''} 
                          ${day.isPlaceholder?'empty':(!day.isFuture && !day.isBeforeStart ? 'active' : '')}
                          ${day.hasNote ? 'has-note' : ''}
                        `}
                        style={{ background: getBoxColor(day) }}
                        onClick={() => !day.isPlaceholder && !day.isFuture && !day.isBeforeStart && openDayModal(day.date)}
                        title={day.isPlaceholder ? '' : day.date}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      {showHabitManager && (
        <div className="modal-overlay" onClick={() => setShowHabitManager(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div className="modal-header">
              <h3>Manage Habits</h3>
              <button className="close-btn" onClick={()=>setShowHabitManager(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="input-group">
                <input 
                  type="text" 
                  placeholder="New habit name..." 
                  value={newHabitName} 
                  onChange={e=>setNewHabitName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addHabit()}
                />
                <button className="add-btn" onClick={addHabit}>Add</button>
              </div>
              <div className="habits-list">
                {habits.map(h => (
                  <div key={h.id} className="habit-item">
                    <span className="habit-name">{h.name}</span>
                    <div className="habit-controls">
                      <div className="weight-control">
                        <label>Weight:</label>
                        <input 
                          type="number" 
                          value={h.weight} 
                          min="1" 
                          max="10" 
                          onChange={e=>updateWeight(h.id, parseInt(e.target.value))} 
                        />
                      </div>
                      <button className="delete-btn" onClick={()=>deleteHabit(h.id)}>🗑</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {showSettings && (
        <div className="modal-overlay" onClick={() => setShowSettings(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div className="modal-header">
              <h3>Settings</h3>
              <button className="close-btn" onClick={()=>setShowSettings(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="setting-group">
                <label>Start Tracking Date</label>
                <input 
                  type="date" 
                  value={settings.startDate} 
                  onChange={e=>updateStartDate(e.target.value)} 
                />
              </div>
              <div className="setting-group danger">
                <button className="danger-btn" onClick={handleClear}>
                  <span>⚠</span> Clear All Data
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedDate && (
        <div className="modal-overlay" onClick={() => setSelectedDate(null)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div className="modal-header">
              <h3>{new Date(selectedDate).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</h3>
              <button className="close-btn" onClick={()=>setSelectedDate(null)}>×</button>
            </div>
            <div className="modal-body">
              {(history[selectedDate]||[]).length===0 ? (
                <div className="success-message">
                  <span className="success-icon">🎉</span>
                  <p>Great job! No habits to break today.</p>
                </div>
              ) : (
                <div className="habits-breakdown">
                  {(history[selectedDate]||[]).map((h,i) => (
                    <div key={i} className="habit-breakdown-item">
                      <span className="habit-name">{h}</span>
                      <span className="habit-weight">×{habits.find(habit => habit.name === h)?.weight || 1}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="journal-section">
                <label>Journal Entry</label>
                <textarea 
                  className="journal-textarea" 
                  value={tempNote} 
                  onChange={e=>setTempNote(e.target.value)} 
                  placeholder="Add your thoughts..."
                />
                <button className="primary-btn" onClick={saveNote}>Save Entry</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;