import { useState, useEffect } from 'react'
import { Routes, Route, useNavigate, useParams } from 'react-router-dom'
import io from 'socket.io-client'

// --- ПІДКЛЮЧЕННЯ ДО СЕРВЕРА ---
// Ми створюємо сокет поза компонентами. Це важливо!
// Якщо створити його всередині компонента, то при кожному перемалюванні (рендері)
// буде створюватись нове підключення, і сервер "ляже" від кількості конектів.
const socket = io.connect("http://localhost:3001")

// --- СТИЛІ (CSS-in-JS) ---
// Це просто об'єкт зі стилями. У великих проєктах використовують CSS-файли або Styled Components,
// але для прототипу це найшвидший варіант — все в одному файлі.
const styles = {
  container: {
    minHeight: '100vh',
    backgroundColor: '#1a1a1a',
    color: 'rgba(255, 255, 255, 0.87)',
    fontFamily: 'Inter, system-ui, Arial, sans-serif',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    backgroundColor: '#2a2a2a',
    padding: '40px',
    borderRadius: '15px',
    boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
    textAlign: 'center',
    maxWidth: '500px', 
    width: '90%',
    maxHeight: '80vh',
    overflowY: 'auto' 
  },
  title: { fontSize: '3em', fontWeight: 'bold', marginBottom: '10px', background: '-webkit-linear-gradient(45deg, #646cff, #a56eff)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' },
  button: { backgroundColor: '#646cff', color: 'white', border: 'none', padding: '15px 30px', fontSize: '18px', fontWeight: 'bold', borderRadius: '8px', cursor: 'pointer', width: '100%', marginTop: '10px' },
  input: { padding: '15px', borderRadius: '8px', border: '1px solid #555', backgroundColor: '#333', color: 'white', fontSize: '16px', width: '100%', marginBottom: '20px', outline: 'none' },
  gameLayout: { display: 'flex', flexDirection: 'row', justifyContent: 'space-between', gap: '40px', width: '98%', maxWidth: '1400px', alignItems: 'flex-start' },
  teamBox: { backgroundColor: '#2a2a2a', padding: '20px', borderRadius: '15px', flex: 1, minHeight: '300px', textAlign: 'center', border: '2px solid #444' },
  joinBtn: { marginTop: '15px', padding: '10px 20px', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', color: 'white', width: '100%' },
  smallRoomCode: { fontSize: '2em', fontWeight: 'bold', color: '#ffc107', margin: '10px 0', fontFamily: 'monospace' },
  
  // Стилі для списку слів (Review Mode)
  wordRow: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '10px',
      borderBottom: '1px solid #444',
      fontSize: '1.2em'
  },
  statusBtn: {
      padding: '5px 10px',
      borderRadius: '5px',
      border: 'none',
      cursor: 'pointer',
      fontWeight: 'bold',
      marginLeft: '5px',
      minWidth: '40px'
  }
};

// --- КОМПОНЕНТ: СТАРТОВА СТОРІНКА ---
function StartPage() {
  const navigate = useNavigate(); // Хук для переходу на інші сторінки

  // Відправляємо сигнал на сервер: "Хочу створити кімнату"
  const createRoom = () => socket.emit("create_room");

  // Слухаємо відповідь сервера. Виконується 1 раз при завантаженні сторінки.
  useEffect(() => { 
      socket.on("room_created", (roomId) => {
          // Коли сервер дав ID, ми перекидаємо користувача на сторінку гри
          navigate(`/game/${roomId}`)
      }); 
  }, []);

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>Alias</h1>
        <button style={styles.button} onClick={createRoom}>Створити нову гру</button>
      </div>
    </div>
  )
}

// --- КОМПОНЕНТ: СТОРІНКА ГРИ (Основна логіка) ---
function GamePage() {
  const { roomId } = useParams(); // Витягуємо ID кімнати з URL (напр. /game/X7A1)
  
  // 1. СТАНИ (React State) - це "пам'ять" компонента
  const [teams, setTeams] = useState({ team1: [], team2: [] }); // Списки гравців
  const [score, setScore] = useState({ 1: 0, 2: 0 });          // Рахунок
  const [nickname, setNickname] = useState("");                // Ім'я поточного гравця
  const [isNameSet, setIsNameSet] = useState(false);           // Чи ввів гравець ім'я?
  const [gameStatus, setGameStatus] = useState('lobby');       // Етап гри: 'lobby', 'game', 'review'
  const [currentWord, setCurrentWord] = useState("");          // Слово на екрані
  const [timeLeft, setTimeLeft] = useState(60);                // Таймер
  const [reviewHistory, setReviewHistory] = useState([]);      // Локальна копія історії слів для редагування
  const [activePlayerId, setActivePlayerId] = useState(null); // <--- НОВЕ
  const [nextExplainerId, setNextExplainerId] = useState(null); // <--- НОВЕ
  const [hostId, setHostId] = useState(null); // <--- Хто тут головний?
  const [settings, setSettings] = useState({ roundTime: 60, winScore: 30 }); // <--- Налаштування
  const [isLocked, setIsLocked] = useState(false); // <--- Стан замочка
  // ЕФЕКТ 1: Перевірка LocalStorage при першому вході
  // Якщо гравець оновив сторінку, ми намагаємось згадати його ім'я
  useEffect(() => {
    const savedName = localStorage.getItem("alias_player_name");
    if (savedName) { 
        setNickname(savedName); 
        setIsNameSet(true); 
    }
  }, []);

  // ЕФЕКТ 2: Основні сокет-слухачі (Логіка гри)
 // ЕФЕКТ 2: Основні сокет-слухачі (Логіка гри)
  useEffect(() => {
    if (isNameSet) {
        // Спочатку заходимо як глядач
        socket.emit("join_room", { roomId, name: nickname });
        
        // --- РОЗУМНИЙ АВТО-ВСТУП ---
        const savedTeam = localStorage.getItem("alias_saved_team");
        const savedRoom = localStorage.getItem("alias_saved_room"); // Перевіряємо збережену кімнату

        // Якщо ми вже обирали команду І це ТА САМА кімната (тобто це F5)
        if (savedTeam && savedRoom === roomId) {
            setTimeout(() => {
                socket.emit("join_team", { roomId, team: parseInt(savedTeam), name: nickname });
            }, 300); // Невелика затримка для стабільності
        } else {
            // Якщо кімната інша - очищаємо старий вибір, щоб бути спектатором
            localStorage.removeItem("alias_saved_team");
            localStorage.removeItem("alias_saved_room");
        }
        // ---------------------------
    }
    
    // ... далі твої socket.on без змін ...
    
    // --- СЛУХАЧІ ПОДІЙ ВІД СЕРВЕРА ---
    
    // Оновлення списків команд (хтось зайшов/вийшов)
   socket.on("update_teams", (updatedTeams) => {
      setTeams(updatedTeams);
      setNextExplainerId(updatedTeams.nextExplainerId);
      
      // Отримуємо хоста і налаштування
      if (updatedTeams.hostId) setHostId(updatedTeams.hostId);
      if (updatedTeams.settings) setSettings(updatedTeams.settings);
      if (updatedTeams.status === 'game') setGameStatus('game');
      if (updatedTeams.status === 'review') setGameStatus('review');
      if (updatedTeams.isLocked !== undefined) setIsLocked(updatedTeams.isLocked);
      if (updatedTeams.status === 'game') setGameStatus('game');
    });
    // Початок гри (сервер обрав перше слово)
    socket.on("game_started", ({ word, explainerId }) => { // <--- Приходить об'єкт
        setGameStatus('game');
        setCurrentWord(word);
        setActivePlayerId(explainerId); // <--- Запам'ятовуємо, хто бос
    });

    // Оновлення слова (коли натиснули "Вгадав" або "Пропустив")
    socket.on("update_word", (newWord) => setCurrentWord(newWord));
    
    // Синхронізація таймера (сервер тікає, клієнт відображає)
    socket.on("timer_update", (time) => setTimeLeft(time));
    
    // Оновлення рахунку в реальному часі
    socket.on("update_score", (newScore) => setScore(newScore));

    socket.on("update_teams", (updatedTeams) => {
      setTeams(updatedTeams);
      setNextExplainerId(updatedTeams.nextExplainerId);
      if (updatedTeams.hostId) setHostId(updatedTeams.hostId);
      if (updatedTeams.settings) setSettings(updatedTeams.settings);
      
      // 👇 НОВЕ
      if (updatedTeams.isLocked !== undefined) setIsLocked(updatedTeams.isLocked);
      
      if (updatedTeams.status === 'game') setGameStatus('game');
      // ...
    });

    socket.on("kicked", () => {
        alert("Вас було виключено з кімнати хостом.");
        window.location.href = "/"; // Викидаємо на головну
    });

    socket.on("error_message", (msg) => {
        alert(msg); // Наприклад "Команди заблоковані"
    });

    // --- ПОЧАТОК REVIEW (Кінець раунду) ---
    // Сервер каже: "Час вийшов, ось історія слів, перевіряйте"
    socket.on("round_ended", (history) => {
        setReviewHistory(history);
        setGameStatus('review');
    
    });

    socket.on("review_update", (updatedHistory) => {
        setReviewHistory(updatedHistory);
    });

    // --- КІНЕЦЬ REVIEW ---
    // Сервер каже: "Бали зараховано, повертаємось у лобі"
    socket.on("results_confirmed", () => {
        setGameStatus('lobby');
    });

    // Очистка слухачів при виході (щоб не дублювалися події)
    return () => { 
        socket.off("update_teams"); 
        socket.off("game_started"); 
        socket.off("update_word"); 
        socket.off("timer_update"); 
        socket.off("round_ended"); 
        socket.off("results_confirmed"); // (Забув додати в оригіналі, тут додав для чистоти)
    };
  }, [roomId, isNameSet]); // Цей ефект перезапускається, якщо змінюється кімната або статус імені

  // --- ФУНКЦІЇ-ОБРОБНИКИ (HANDLERS) ---

  // Збереження імені та перехід до вибору команди
  const handleNameSubmit = () => {
    if (nickname.trim()) { 
        localStorage.setItem("alias_player_name", nickname); // Запам'ятовуємо назавжди
        setIsNameSet(true); 
        socket.emit("join_room", { roomId, name: nickname });
    }
  };

 // Вступ до команди
  const joinTeam = (teamId) => {
      // Запам'ятовуємо команду І поточну кімнату
      localStorage.setItem("alias_saved_team", teamId);
      localStorage.setItem("alias_saved_room", roomId); 
      
      socket.emit("join_team", { roomId, team: teamId, name: nickname });
  };
  // Кнопка "Почати раунд"
  const handleStartGame = () => socket.emit("request_start", { roomId });
  
  // Кнопки "Вгадав" / "Пропустив"
  const handleNextWord = (action) => socket.emit("next_word", { roomId, action });

  const handleToggleLock = () => socket.emit("toggle_lock", { roomId });
  
  const handleKick = (targetId) => {
      if(window.confirm("Вигнати цього гравця?")) {
          socket.emit("kick_player", { roomId, targetId });
      }
  };

  const handleTransferHost = (targetId) => {
      if(window.confirm("Передати права хоста цьому гравцю?")) {
          socket.emit("transfer_host", { roomId, targetId });
      }
  };
  // --- ЛОГІКА РЕДАГУВАННЯ СПИСКУ (REVIEW) ---
  // Це працює ТІЛЬКИ на клієнті. Ми змінюємо state `reviewHistory`.
  // На сервер нічого не летить, поки не натиснемо "Зарахувати".
 // --- ЛОГИКА РЕДАКТИРОВАНИЯ (ТЕПЕРЬ ОНЛАЙН) ---
  const toggleWordStatus = (index) => {
      // Мы больше не меняем setReviewHistory здесь вручную.
      // Мы говорим серверу: "Эй, переключи статус этого слова!"
      socket.emit("change_word_status", { roomId, index });
  };
const handleSettingsChange = (key, value) => {
      const newSettings = { ...settings, [key]: parseInt(value) };
      // Оптимістичне оновлення (щоб повзунок не лагав)
      setSettings(newSettings); 
      // Відправка на сервер
      socket.emit("update_settings", { roomId, newSettings });
  };
  // Кнопка "Зарахувати бали"
  // Ми відправляємо ВЕСЬ виправлений список на сервер.
  // Сервер перерахує бали на основі цього списку.
  const confirmResults = () => {
      socket.emit("confirm_round_results", { roomId, finalHistory: reviewHistory });
  };

  // Допоміжна функція: просто показує попередній підрахунок балів на екрані Review
  const calculateRoundScore = () => {
      return reviewHistory.reduce((acc, item) => {
          if (item.status === 'guessed') return acc + 1;
          if (item.status === 'skipped') return acc - 1;
          return acc;
      }, 0);
  };

  // Якщо ім'я ще не введено, показуємо екран вводу імені
  if (!isNameSet) return (
    <div style={styles.container}>
        <div style={styles.card}>
            <h2>Представься</h2>
            <input 
                style={styles.input} 
                placeholder="Твоє ім'я..." 
                value={nickname} 
                onChange={(e) => setNickname(e.target.value)} 
            />
            <button style={styles.button} onClick={handleNameSubmit}>Войти в игру</button>
        </div>
    </div>
  );

 // Основний рендер гри
  return (
    <div style={styles.container}>
      
      {/* 1. ПЛАШКА СПЕКТАТОРІВ (Зверху) */}
      <div style={{
          backgroundColor: '#333', 
          padding: '10px 20px', 
          borderRadius: '10px', 
          marginBottom: '20px', 
          display: 'flex', 
          gap: '15px', 
          alignItems: 'center',
          border: '1px solid #555',
          maxWidth: '90%', 
          flexWrap: 'wrap'
      }}>
          <span style={{color: '#888', fontWeight: 'bold'}}>👀 Глядачі:</span>
          {teams.spectators && teams.spectators.length > 0 ? (
              teams.spectators.map(s => (
                  <span key={s.id} style={{
                      backgroundColor: '#444', 
                      padding: '4px 10px', 
                      borderRadius: '15px', 
                      fontSize: '0.9em',
                      color: s.id === socket.id ? '#fff' : '#aaa', 
                      border: s.id === socket.id ? '1px solid #777' : 'none'
                  }}>
                      {s.name}
                  </span>
              ))
          ) : (
              <span style={{color: '#555', fontStyle: 'italic', fontSize: '0.8em'}}>(пусто)</span>
          )}
      </div>

      {/* 2. ІГРОВЕ ПОЛЕ (Три колонки в ряд) */}
      <div style={styles.gameLayout}>
        
        {/* === ЛІВА КОЛОНКА (Червоні) === */}
        <div style={{...styles.teamBox, borderColor: '#ff6b6b'}}>
          <h3 style={{color: '#ff6b6b'}}>🔴 Красные</h3>
          <h1 style={{fontSize: '4em', margin: '10px 0'}}>{score[1]}</h1>
          <div style={{textAlign: 'left', margin: '20px'}}>
            {teams.team1.map(p => {
                const isMe = p.id === socket.id;             
                const isExplainer = p.id === nextExplainerId; 
                const isHost = p.id === hostId;

                return (
                    <div key={p.id} style={{
                        padding:'10px', 
                        marginBottom: '8px',
                        borderRadius: '8px',
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '10px',
                        backgroundColor: isExplainer ? 'rgba(255, 215, 0, 0.15)' : 'transparent', 
                        border: isExplainer ? '1px solid #ffd700' : '1px solid transparent',     
                        fontWeight: isMe ? 'bold' : 'normal',
                        color: isMe ? '#fff' : 'rgba(255,255,255,0.7)',
                        
                        // 👇 ВАЖЛИВО ДЛЯ КНОПОК 👇
                        position: 'relative', 
                        paddingRight: (socket.id === hostId && !isMe) ? '60px' : '10px'
                        // 👆 --------------------
                    }}>
                        <span style={{width: '20px', textAlign: 'center'}}>{isMe ? '👤' : ''}</span>
                        <span>{isHost ? '⭐ ' : ''}{p.name}</span>
                        {isExplainer && <span style={{marginLeft: 'auto'}}>🎤</span>} 

                        {/* КНОПКИ АДМІНА */}
                        {socket.id === hostId && !isMe && (
                            <div style={{position: 'absolute', right: '5px', top: '50%', transform: 'translateY(-50%)', display: 'flex', gap: '5px'}}>
                                <button 
                                    onClick={() => handleTransferHost(p.id)} 
                                    title="Зробити хостом"
                                    style={{background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2em'}}
                                >
                                    👑
                                </button>
                                <button 
                                    onClick={() => handleKick(p.id)} 
                                    title="Вигнати"
                                    style={{background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2em'}}
                                >
                                    👢
                                </button>
                            </div>
                        )}
                    </div>
                )
            })}
          </div>
            {gameStatus === 'lobby' && <button style={{...styles.joinBtn, backgroundColor: '#ff6b6b'}} onClick={() => joinTeam(1)}>Вступить</button>}
            </div>  

        {/* === ЦЕНТРАЛЬНА ЧАСТИНА (Ігрове поле) === */}
        <div style={{...styles.teamBox, flex: 2, borderColor: 'transparent', background: 'transparent'}}>
          
          {/* ЕКРАН 1: ЛОБІ */}
          {gameStatus === 'lobby' && (
            <>
              <p>Код комнаты:</p> <div style={styles.smallRoomCode}>{roomId}</div>
              {socket.id === nextExplainerId ? (
                  <div style={{marginTop: '20px'}}>
                      <p style={{color: '#ffd700', marginBottom: '10px'}}>Твоя черга пояснювати! 🎤</p>
                      <button style={{...styles.joinBtn, backgroundColor: '#ffd700', color: 'black', fontSize: '20px'}} onClick={handleStartGame}>ПОЧАТИ РАУНД 🚀</button>
                  </div>
              ) : (
                  <div style={{marginTop: '30px', color: '#888', fontStyle: 'italic'}}>Чекаємо, поки ведучий почне гру... ⏳</div>
              )}
            </>
          )}

         {/* ЕКРАН 2: ГРА */}
         {gameStatus === 'game' && (
            <div style={styles.card}>
              <div style={{fontSize: '2em', fontWeight: 'bold', color: timeLeft <= 10 ? '#ff4d4d' : '#fff', marginBottom: '10px'}}>⏱ {timeLeft}</div>
              {socket.id === activePlayerId ? (
                  <>
                      <h1 style={{fontSize: '3em', color: '#ffd700', margin: '20px 0'}}>{currentWord}</h1>
                      <div style={{display: 'flex', gap: '10px', marginTop: '30px'}}>
                         <button style={{...styles.button, backgroundColor: '#ff6b6b'}} onClick={() => handleNextWord('skipped')}>Пропустити (-1)</button>
                         <button style={{...styles.button, backgroundColor: '#4ecdc4'}} onClick={() => handleNextWord('guessed')}>Вгадав (+1)</button>
                      </div>
                      <p style={{color: '#888', marginTop: '10px'}}>Ти пояснюєш! Швидше!</p>
                  </>
              ) : (
                  <>
                      <h1 style={{fontSize: '3em', color: '#555', margin: '20px 0'}}>???</h1>
                      <p style={{fontSize: '1.2em'}}>Зараз пояснює гравець твоєї (або чужої) команди.</p>
                      <p style={{color: '#ffd700'}}>Слухай уважно!</p>
                  </>
              )}
            </div>
          )}

          {/* ЕКРАН 3: REVIEW */}
          {gameStatus === 'review' && (
              <div style={styles.card}>
                  <h2>Перевірка слів 🧐</h2>
                  <h3 style={{color: '#ffd700'}}>Бали за раунд: {calculateRoundScore()}</h3>
                  <div style={{marginTop: '20px', maxHeight: '400px', overflowY: 'auto'}}>
                      {reviewHistory.map((item, index) => (
                          <div key={index} style={styles.wordRow}>
                              <span>{item.word}</span>
                              <button onClick={() => toggleWordStatus(index)} style={{...styles.statusBtn, backgroundColor: item.status === 'guessed' ? '#4ecdc4' : item.status === 'skipped' ? '#ff6b6b' : '#666', color: 'white'}}>
                                {item.status === 'guessed' ? '+1' : item.status === 'skipped' ? '-1' : '0'}
                              </button>
                          </div>
                      ))}
                  </div>
                  <button style={{...styles.button, backgroundColor: '#ffd700', color: 'black', marginTop: '20px'}} onClick={confirmResults}>ЗАРАХУВАТИ БАЛИ ✅</button>
              </div>
          )}
        </div>

       {/* === ПРАВА КОЛОНКА (Сині) === */}
        <div style={{...styles.teamBox, borderColor: '#4ecdc4'}}>
           <h3 style={{color: '#4ecdc4'}}>🔵 Синие</h3>
           <h1 style={{fontSize: '4em', margin: '10px 0'}}>{score[2]}</h1>
           <div style={{textAlign: 'left', margin: '20px'}}>
            {teams.team2.map(p => {
                const isMe = p.id === socket.id;
                const isExplainer = p.id === nextExplainerId;
                const isHost = p.id === hostId; // <--- ПЕРЕВІРКА ХОСТА ТУТ ТЕЖ ПОТРІБНА

                return (
                    <div key={p.id} style={{
                        padding:'10px', 
                        marginBottom: '8px',
                        borderRadius: '8px',
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '10px',
                        backgroundColor: isExplainer ? 'rgba(78, 205, 196, 0.15)' : 'transparent',
                        border: isExplainer ? '1px solid #4ecdc4' : '1px solid transparent',
                        fontWeight: isMe ? 'bold' : 'normal',
                        color: isMe ? '#fff' : 'rgba(255,255,255,0.7)'
                    }}>
                        <span style={{width: '20px', textAlign: 'center'}}>{isMe ? '👤' : ''}</span>
                        {/* ЗІРОЧКА */}
                        <span>{isHost ? '⭐ ' : ''}{p.name}</span>
                        {isExplainer && <span style={{marginLeft: 'auto'}}>🎤</span>}
                    </div>
                )
            })}
          </div>
           {gameStatus === 'lobby' && <button style={{...styles.joinBtn, backgroundColor: '#4ecdc4'}} onClick={() => joinTeam(2)}>Вступить</button>}
        </div>

      </div>

      {/* --- МІНІ-ПАНЕЛЬ НАЛАШТУВАНЬ (Right Bottom) --- */}
      {gameStatus === 'lobby' && (
        <div style={{
            position: 'fixed',
            bottom: '20px',
            right: '20px',
            backgroundColor: 'rgba(30, 30, 30, 0.9)',
            padding: '15px',
            borderRadius: '12px',
            border: '1px solid #444',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            zIndex: 1000,
            backdropFilter: 'blur(5px)',
            boxShadow: '0 4px 15px rgba(0,0,0,0.5)',
            minWidth: '140px'
        }}>
            {/* ТАЙМЕР */}
            <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px'}}>
                <span style={{fontSize: '1.2em'}} title="Час раунду">⏱️</span>
                {socket.id === hostId ? (
                   <input 
                      type="range" min="10" max="180" step="10" 
                      value={settings.roundTime}
                      onChange={(e) => handleSettingsChange('roundTime', e.target.value)}
                      style={{width: '70px', cursor: 'pointer', accentColor: '#4ecdc4'}}
                   />
                ) : <div style={{flex: 1}}></div>}
                <span style={{fontWeight: 'bold', minWidth: '25px', textAlign: 'right', color: '#fff'}}>{settings.roundTime}</span>
            </div>

            {/* ПЕРЕМОГА */}
            <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px'}}>
                <span style={{fontSize: '1.2em'}} title="Очки для перемоги">🏁</span>
                {socket.id === hostId ? (
                   <input 
                      type="range" min="10" max="100" step="5" 
                      value={settings.winScore}
                      onChange={(e) => handleSettingsChange('winScore', e.target.value)}
                      style={{width: '70px', cursor: 'pointer', accentColor: '#ffd700'}}
                   />
                ) : <div style={{flex: 1}}></div>}
                <span style={{fontWeight: 'bold', minWidth: '25px', textAlign: 'right', color: '#fff'}}>{settings.winScore}</span>
            </div>
            
            {/* ЗАМОК БЛОКУВАННЯ КОМАНД */}
            <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px'}}>
                <span style={{fontSize: '1.2em'}} title="Доступ до команд">🔐</span>
                
                {socket.id === hostId ? (
                   <button 
                      onClick={handleToggleLock}
                      style={{
                          flex: 1, 
                          padding: '5px', 
                          borderRadius: '5px', 
                          border: 'none', 
                          cursor: 'pointer',
                          backgroundColor: isLocked ? '#ff6b6b' : '#4ecdc4',
                          color: '#fff',
                          fontWeight: 'bold'
                      }}
                   >
                      {isLocked ? 'ЗАКРИТО' : 'ВІДКРИТО'}
                   </button>
                ) : (
                    <span style={{color: isLocked ? '#ff6b6b' : '#4ecdc4', fontSize: '0.9em'}}>
                        {isLocked ? 'Закрито' : 'Відкрито'}
                    </span>
                )}
            </div>
            
            {socket.id === hostId && (
                <div style={{fontSize: '0.7em', color: '#666', textAlign: 'center', marginTop: '2px', textTransform: 'uppercase', letterSpacing: '1px'}}>
                    Host Control
                </div>
            )}
        </div>
      )}

    </div>
  )
}

function App() { 
    // Налаштування маршрутизації (сторінок)
    return (
        <Routes>
            <Route path="/" element={<StartPage />} />
            <Route path="/game/:roomId" element={<GamePage />} />
        </Routes> 
    ) 
}

export default App