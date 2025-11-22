import { useState, useEffect, useMemo } from "react";
import "./App.css";
import { subscribeToData, saveData, clearData } from "./firebase"; // Import Firebase logic

// --- TYPES ---
interface Habit {
  id: string;
  name: string;
  weight: number;
}

interface AppSettings {
  startDate: string;
}

function App() {
  // --- 1. STATE ---
  // Initialize with empty/defaults, but data will load from Firebase
  const [habits, setHabits] = useState<Habit[]>([]);
  const [history, setHistory] = useState<Record<string, string[]>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [settings, setSettings] = useState<AppSettings>({ 
    startDate: new Date(new Date().getFullYear(), 0, 1).toLocaleDateString('en-CA') 
  });
  
  const [isLoading, setIsLoading] = useState(true);

  // UI State
  const [newHabitName, setNewHabitName] = useState("");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showHabitManager, setShowHabitManager] = useState(false);
  const [tempNote, setTempNote] = useState("");

  const todayStr = useMemo(() => {
    const d = new Date();
    return d.toLocaleDateString('en-CA');
  }, []);

  // --- 2. FIREBASE SUBSCRIPTION ---
  useEffect(() => {
    // Subscribe to real-time updates
    const unsubscribe = subscribeToData((data) => {
      if (data) {
        if (data.habits) setHabits(data.habits);
        if (data.history) setHistory(data.history);
        if (data.notes) setNotes(data.notes);
        if (data.settings) setSettings(data.settings);
      }
      setIsLoading(false);
    });

    // Cleanup listener on unmount
    return () => unsubscribe();
  }, []);

  // --- 3. ACTIONS (Updated for Firebase) ---
  
  const addHabit = () => {
    if (!newHabitName.trim()) return;
    const updatedHabits = [...habits, { id: Date.now().toString(), name: newHabitName, weight: 1 }];
    saveData("habits", updatedHabits); // Save to Cloud
    setNewHabitName("");
  };

  const deleteHabit = (id: string) => {
    const updatedHabits = habits.filter(h => h.id !== id);
    saveData("habits", updatedHabits); // Save to Cloud
  };

  const updateWeight = (id: string, newWeight: number) => {
    const val = Math.max(1, newWeight);
    const updatedHabits = habits.map(h => h.id === id ? { ...h, weight: val } : h);
    saveData("habits", updatedHabits); // Save to Cloud
  };

  const toggleHabitForToday = (habitName: string) => {
    const currentList = history[todayStr] || [];
    let newList;
    
    if (currentList.includes(habitName)) {
      newList = currentList.filter(h => h !== habitName);
    } else {
      newList = [...currentList, habitName];
    }
    
    const updatedHistory = { ...history, [todayStr]: newList };
    saveData("history", updatedHistory); // Save to Cloud
  };

  const updateStartDate = (date: string) => {
    const newSettings = { ...settings, startDate: date };
    saveData("settings", newSettings);
  };

  const handleClearAllData = () => {
    if (confirm("Are you sure? This will wipe the database.")) {
      clearData();
      setShowSettings(false);
    }
  };

  const openDayModal = (date: string) => {
    setSelectedDate(date);
    setTempNote(notes[date] || "");
  };

  const saveNote = () => {
    if (!selectedDate) return;
    const updatedNotes = { ...notes, [selectedDate]: tempNote };
    saveData("notes", updatedNotes); // Save to Cloud
    setSelectedDate(null);
  };

  // --- 4. HEATMAP CALCULATION ---
  const heatmapData = useMemo(() => {
    const today = new Date();
    const days = [];
    
    for (let i = 330; i >= -30; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const dateStr = d.toLocaleDateString('en-CA');
      
      const habitsDone = history[dateStr] || [];
      const isFuture = dateStr > todayStr; 
      const isBeforeStart = dateStr < settings.startDate;
      const isToday = dateStr === todayStr;

      days.push({ date: dateStr, habitsDone, isFuture, isBeforeStart, isToday });
    }
    return days;
  }, [history, settings.startDate, todayStr]);

  // --- 5. COLOR LOGIC ---
  const getBoxColor = (habitsDone: string[], isFuture: boolean, isBeforeStart: boolean) => {
    if (isFuture || isBeforeStart) return "#334155"; 

    const count = habitsDone.length;
    if (count === 0) return "#10b981"; 

    const maxPossibleWeight = habits.reduce((sum, h) => sum + h.weight, 0) || 1;
    const currentWeight = habitsDone.reduce((sum, habitName) => {
      const habit = habits.find(h => h.name === habitName);
      return sum + (habit ? habit.weight : 0);
    }, 0);

    const intensity = currentWeight / maxPossibleWeight; 

    if (intensity <= 0.1) return "#fecaca"; 
    if (intensity <= 0.25) return "#fca5a5"; 
    if (intensity <= 0.5) return "#ef4444";  
    if (intensity <= 0.75) return "#b91c1c"; 
    return "#7f1d1d"; 
  };

  if (isLoading) {
    return <div style={{color:'white', padding:'2rem'}}>Loading data from Cloud...</div>;
  }

  // --- 6. RENDER ---
  return (
    <div className="dashboard-container">
      
      {/* === LEFT SIDEBAR === */}
      <div className="sidebar">
        <div className="card">
          <h2>Today's Checklist</h2>
          <h3>{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric'})}</h3>
          
          {habits.length === 0 ? (
            <p style={{color: '#94a3b8'}}>No bad habits configured.</p>
          ) : (
            <div className="checklist-container">
              {habits.map(h => {
                const isChecked = (history[todayStr] || []).includes(h.name);
                return (
                  <div 
                    key={h.id} 
                    className={`checklist-item ${isChecked ? 'checked' : ''}`}
                    onClick={() => toggleHabitForToday(h.name)}
                  >
                    <span className="checklist-label">{h.name}</span>
                    <div className="custom-checkbox">{isChecked && "✕"}</div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <button className="btn-action" onClick={() => setShowHabitManager(true)}>
          <span>✎</span> Manage Habits
        </button>
      </div>

      {/* === RIGHT HEATMAP === */}
      <div className="main-content">
        <div className="card">
          <div className="heatmap-header">
            <div>
              <h2>History Overview</h2>
              <div className="heatmap-legend">
                <div className="legend-item"><div className="dot" style={{background: '#10b981'}}></div> Clean</div>
                <div className="legend-item"><div className="dot" style={{background: '#fca5a5'}}></div> Mild</div>
                <div className="legend-item"><div className="dot" style={{background: '#7f1d1d'}}></div> Severe</div>
                <div className="legend-item"><div className="dot" style={{background: '#334155'}}></div> Untracked</div>
              </div>
            </div>
            <button className="settings-icon-btn" onClick={() => setShowSettings(true)} title="Settings">
              ⚙
            </button>
          </div>

          <div className="heatmap-scroller">
            <div className="heatmap-grid-container">
              <div className="week-labels">
                <div style={{height: '14px'}}></div>
                <div>Mon</div>
                <div></div>
                <div>Wed</div>
                <div></div>
                <div>Fri</div>
                <div></div>
                <div>Sun</div>
              </div>

              <div className="grid-wrapper">
                {heatmapData.map((day) => {
                  const isClickable = !day.isFuture && !day.isBeforeStart;
                  return (
                    <div
                      key={day.date}
                      className={`box ${isClickable ? 'clickable' : ''} ${day.isToday ? 'today' : ''}`}
                      style={{ backgroundColor: getBoxColor(day.habitsDone, day.isFuture, day.isBeforeStart) }}
                      onClick={() => isClickable && openDayModal(day.date)}
                      title={day.date}
                    />
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* === HABIT MANAGER MODAL === */}
      {showHabitManager && (
        <div className="modal-overlay" onClick={() => setShowHabitManager(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Manage Habits</h2>
              <button className="close-btn" onClick={() => setShowHabitManager(false)}>×</button>
            </div>
            
            <div className="add-habit-row">
              <input 
                type="text" 
                placeholder="New habit name..." 
                value={newHabitName}
                onChange={e => setNewHabitName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addHabit()}
                autoFocus
              />
              <button className="btn-add" onClick={addHabit}>Add</button>
            </div>

            <ul className="mini-habit-list">
              {habits.length === 0 && <p style={{color:'#64748b', textAlign:'center'}}>No habits yet.</p>}
              {habits.map(h => (
                <li key={h.id} className="mini-habit-item">
                  <span>{h.name}</span>
                  <div className="habit-controls">
                    <span style={{fontSize: '0.75rem', color:'#64748b'}}>Wt:</span>
                    <input 
                      type="number" 
                      className="weight-input"
                      value={h.weight} 
                      min="1" 
                      max="20"
                      onChange={(e) => updateWeight(h.id, parseInt(e.target.value))} 
                    />
                    <button className="btn-delete" onClick={() => deleteHabit(h.id)}>×</button>
                  </div>
                </li>
              ))}
            </ul>
            <button className="btn-action" style={{marginTop:'1.5rem'}} onClick={() => setShowHabitManager(false)}>Done</button>
          </div>
        </div>
      )}

      {/* === SETTINGS MODAL === */}
      {showSettings && (
        <div className="modal-overlay" onClick={() => setShowSettings(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Settings</h2>
              <button className="close-btn" onClick={() => setShowSettings(false)}>×</button>
            </div>
            
            <div className="setting-row">
              <label>Start Tracking Date</label>
              <input 
                type="date" 
                value={settings.startDate} 
                onChange={(e) => updateStartDate(e.target.value)}
              />
              <p className="setting-helper">Dates before this will appear gray.</p>
            </div>

            <div className="setting-row" style={{borderTop: '1px solid #334155', paddingTop: '1.5rem'}}>
              <label style={{color: '#ef4444'}}>Danger Zone</label>
              <button className="btn-danger" onClick={handleClearAllData}>Clear All History Data</button>
            </div>
          </div>
        </div>
      )}

      {/* === DAY DETAIL / JOURNAL MODAL === */}
      {selectedDate && (
        <div className="modal-overlay" onClick={() => setSelectedDate(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{selectedDate}</h2>
              <button className="close-btn" onClick={() => setSelectedDate(null)}>×</button>
            </div>
            
            {/* Summary Section */}
            {(history[selectedDate] || []).length === 0 ? (
              <div className="clean-day-msg"><strong>Great job! 🎉</strong><p style={{margin:0}}>No bad habits recorded.</p></div>
            ) : (
              <div className="daily-summary-list">
                {(history[selectedDate] || []).map((h, i) => <div key={i} className="summary-item">• {h}</div>)}
              </div>
            )}

            {/* Journal Section */}
            <div className="journal-section">
              <label className="journal-label">Daily Note / Journal</label>
              <textarea 
                className="journal-textarea"
                placeholder="How was your day? Any triggers?"
                value={tempNote}
                onChange={(e) => setTempNote(e.target.value)}
              />
              <button className="btn-primary" onClick={saveNote}>Save Note</button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}

export default App;