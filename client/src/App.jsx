import { useState, useEffect } from 'react'
import { Routes, Route, useNavigate, useParams } from 'react-router-dom'
import io from 'socket.io-client'

// Автоматичне визначення адреси
// Якщо ми на локалхості - стукаємо на порт 3001
// Якщо в інтернеті - використовуємо змінну оточення (яку ми потім додамо)
const SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:3001";
const socket = io.connect(SERVER_URL);

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
    overflowY: 'auto',
    margin: '0 auto'
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
  const [winner, setWinner] = useState(null); // 1, 2 або 'draw'
  const [liveHistory, setLiveHistory] = useState([]); // <--- Історія поточного раунду
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

    
    // --- СЛУХАЧІ ПОДІЙ ВІД СЕРВЕРА ---
    
    // Оновлення списків команд (хтось зайшов/вийшов)
   socket.on("update_teams", (updatedTeams) => {
      setTeams(updatedTeams);
      setNextExplainerId(updatedTeams.nextExplainerId);
      if (updatedTeams.hostId) setHostId(updatedTeams.hostId);
      if (updatedTeams.settings) setSettings(updatedTeams.settings);
      if (updatedTeams.isLocked !== undefined) setIsLocked(updatedTeams.isLocked);
      
      // 👇 ОНОВЛЕННЯ ПЕРЕМОЖЦЯ
      if (updatedTeams.status === 'victory') {
          setGameStatus('victory');
          setWinner(updatedTeams.winner);
      } else if (updatedTeams.status === 'game') {
          setGameStatus('game');         
         }   else if (updatedTeams.status === 'paused') { // <--- НОВЕ
          setGameStatus('paused');
      } else if (updatedTeams.status === 'review') {
          setGameStatus('review');
      } else {
          setGameStatus('lobby');
      }
    });
    // Початок гри (сервер обрав перше слово)
    socket.on("game_started", ({ word, explainerId }) => { // <--- Приходить об'єкт
        setGameStatus('game');
        setCurrentWord(word);
        setActivePlayerId(explainerId); // <--- Запам'ятовуємо, хто бос
        setLiveHistory([]);
    });
    // Оновлення живої історії слів під час раунду
    socket.on("update_live_history", (history) => {
        setLiveHistory(history);
    });
    // Оновлення слова (коли натиснули "Вгадав" або "Пропустив")
    socket.on("update_word", (newWord) => setCurrentWord(newWord));
    
    // Синхронізація таймера (сервер тікає, клієнт відображає)
    socket.on("timer_update", (time) => setTimeLeft(time));
    
    // Оновлення рахунку в реальному часі
    socket.on("update_score", (newScore) => setScore(newScore));

  
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

  const joinSpectators = () => {
      if (!isLocked) {
          localStorage.removeItem("alias_saved_team"); // Забуваємо команду
          socket.emit("join_spectators", { roomId, name: nickname });
      }
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

  
  const handleShuffle = () => {
      if (!isLocked) {
          socket.emit("shuffle_teams", { roomId });
      }
  };

  const handleTogglePause = () => {
      socket.emit("toggle_pause", { roomId });
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
      // Якщо це число (час/очки), перетворюємо в Number, інакше лишаємо як є
      const finalValue = (key === 'difficulty') ? value : Number(value);
      
      // Оновлюємо локально для миттєвої реакції (опціонально)
      setSettings(prev => ({ ...prev, [key]: finalValue }));
      
      socket.emit("update_settings", { roomId, key, value: finalValue });
  };
  // Кнопка "Зарахувати бали"
  // Ми відправляємо ВЕСЬ виправлений список на сервер.
  // Сервер перерахує бали на основі цього списку.
 // Відправка підтвердження балів (із Review)
  const confirmResults = () => {
      socket.emit("confirm_results", { roomId });
  };

  // Рестарт гри
  const handleRestart = () => {
      socket.emit("restart_game", { roomId });
  };
  
const handleSetExplainer = (targetId) => {
      socket.emit("set_explainer", { roomId, targetId });
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
      <div 
          onClick={joinSpectators} // <--- КЛІК СЮДИ
          title={!isLocked ? "Натисніть, щоб стати глядачем" : "Заблоковано"}
          style={{
            marginBottom: '20px', 
            color: '#666', 
            fontSize: '0.9em',
            display: 'flex',
            gap: '10px',
            alignItems: 'center',
            flexWrap: 'wrap',
            cursor: isLocked ? 'not-allowed' : 'pointer', // <--- КУРСОР РУКИ
            padding: '5px',
            borderRadius: '5px',
            transition: 'background 0.2s',
            // Легка підсвітка при наведенні (можна через CSS, але тут спрощено)
            border: '1px solid transparent',
          }}
          onMouseEnter={(e) => !isLocked && (e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
      >
          <span>👀 Spectators:</span>
          
          {teams.spectators && teams.spectators.length > 0 ? (
              teams.spectators.map(s => (
                  <span key={s.id} style={{
                      color: s.id === socket.id ? '#fff' : '#888',
                      fontWeight: s.id === socket.id ? 'bold' : 'normal'
                  }}>
                      {s.name}
                  </span>
              ))
          ) : (
              <span>(click to join)</span>
          )}

      </div>

      {/* 2. ІГРОВЕ ПОЛЕ (Три колонки в ряд) */}
      <div style={styles.gameLayout}>
        
        {/* === ЛІВА КОЛОНКА (Червоні) === */}
        <div style={{...styles.teamBox, borderColor: '#ff6b6b'}}>
          <h3 style={{color: '#ff6b6b'}}>🔴 Черовоні</h3>
          <h1 style={{fontSize: '4em', margin: '10px 0'}}>{score[1]}</h1>
          <div style={{textAlign: 'left', margin: '20px'}}>
            {teams.team1.map(p => {
                const isMe = p.id === socket.id;             
                const isHost = p.id === hostId;
                const iAmHost = socket.id === hostId;

                // 👇 ВИПРАВЛЕНА ЛОГІКА (Сувора перевірка)
                const isExplainer = (gameStatus === 'game' || gameStatus === 'paused') 
                    ? p.id === activePlayerId 
                    : p.id === nextExplainerId;

                return (
                    <div key={p.id} style={{
                        padding:'12px 5px', 
                        borderBottom: '1px solid rgba(255,255,255,0.05)',
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'space-between', 
                        gap: '10px',
                        color: isExplainer ? '#4ecdc4' : (isMe ? '#fff' : 'rgba(255,255,255,0.6)'), // Бірюзовий для ведучого
                        fontWeight: isMe ? 'bold' : 'normal',
                        transition: 'all 0.3s',
                        background: isExplainer ? 'linear-gradient(90deg, rgba(78, 205, 196, 0.1) 0%, transparent 100%)' : 'transparent' // Легкий градієнт
                    }}>
                        {/* ІМ'Я + СТРІЛКА */}
                        <div style={{display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden'}}>
                             
                             {/* 👇 ВЕДУЧИЙ: CSS СТРІЛКА (Замість жовтого круга) */}
                             {isExplainer ? (
                                 <div style={{
                                     width: 0, 
                                     height: 0, 
                                     borderTop: '6px solid transparent',
                                     borderBottom: '6px solid transparent',
                                     borderLeft: '10px solid #4ecdc4', // Колір стрілки
                                     marginRight: '5px'
                                 }}></div>
                             ) : (
                                 // Звичайний статус (порожнє місце або корона хоста)
                                 <div style={{width: '15px', textAlign: 'center', fontSize: '1.1em'}}>
                                     {isHost ? '👑' : ''}
                                 </div>
                             )}
                             
                             <span style={{whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: '1.1em'}}>
                                {p.name}
                             </span>
                        </div>

                        {/* КНОПКИ АДМІНА */}
                        <div style={{display: 'flex', alignItems: 'center', gap: '10px'}}>
                            
                            {/* Якщо я хост - показуємо панель */}
                            {iAmHost && (
                                <div style={{display: 'flex', gap: '8px', marginLeft: '5px'}}>
                                    
                                    {/* ▶ PLAY (Призначити) */}
                                    {!isExplainer && (
                                        <button 
                                            onClick={() => handleSetExplainer(p.id)} 
                                            title="Призначити ведучим"
                                            style={{
                                                background: 'transparent', border: '1px solid #4ecdc4', borderRadius: '50%',
                                                width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                cursor: 'pointer', color: '#4ecdc4', fontSize: '0.7em', padding: 0, transition: '0.2s'
                                            }}
                                            onMouseEnter={(e) => { e.currentTarget.style.background = '#4ecdc4'; e.currentTarget.style.color = '#000'; }}
                                            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#4ecdc4'; }}
                                        >
                                            ▶
                                        </button>
                                    )}

                                    {/* ♕ КОРОНА (Передати права) */}
                                    {!isMe && (
                                        <button 
                                            onClick={() => handleTransferHost(p.id)} 
                                            title="Передати права хоста"
                                            style={{
                                                background: 'transparent', border: '1px solid #ffd700', borderRadius: '50%',
                                                width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                cursor: 'pointer', color: '#ffd700', fontSize: '0.8em', padding: 0, transition: '0.2s'
                                            }}
                                            onMouseEnter={(e) => { e.currentTarget.style.background = '#ffd700'; e.currentTarget.style.color = '#000'; }}
                                            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#ffd700'; }}
                                        >
                                            ♕
                                        </button>
                                    )}

                                    {/* ✕ КІК */}
                                    {!isMe && (
                                        <button 
                                            onClick={() => handleKick(p.id)} 
                                            title="Вигнати"
                                            style={{
                                                background: 'transparent', border: '1px solid #ff4d4d', borderRadius: '50%',
                                                width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                cursor: 'pointer', color: '#ff4d4d', fontSize: '0.8em', padding: 0, transition: '0.2s'
                                            }}
                                            onMouseEnter={(e) => { e.currentTarget.style.background = '#ff4d4d'; e.currentTarget.style.color = '#fff'; }}
                                            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#ff4d4d'; }}
                                        >
                                            ✕
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                )
            })}
        
          </div>
            {gameStatus === 'lobby' && !isLocked && (
              <button 
                  style={{...styles.joinBtn, backgroundColor: '#ff6b6b'}} 
                  onClick={() => joinTeam(1)}
              >
                  Вступити
              </button>
          )}</div>  

        {/* === ЦЕНТРАЛЬНА ЧАСТИНА (Ігрове поле) === */}
        <div style={{...styles.teamBox, flex: 2, borderColor: 'transparent', background: 'transparent'}}>
          
          {/* ЕКРАН 1: ЛОБІ */}
          {gameStatus === 'lobby' && (
            <>
              <p>Код кімнати:</p> <div style={styles.smallRoomCode}>{roomId}</div>
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

{/* ЕКРАН 2: ГРА (АБО ПАУЗА) */}
         {(gameStatus === 'game' || gameStatus === 'paused') && (
            <div style={styles.card}>
              
              {/* 1. ВЕРХНЯ ПАНЕЛЬ: ТАЙМЕР + ПАУЗА */}
              <div style={{
                  display: 'flex', 
                  justifyContent: 'center', 
                  alignItems: 'center', 
                  marginBottom: '20px',
                  position: 'relative', 
                  minHeight: '60px'
              }}>
                  {/* ТАЙМЕР */}
                  <div style={{
                      fontSize: '3.5em', 
                      fontWeight: 'bold', 
                      color: timeLeft <= 10 ? '#ff4d4d' : '#fff',
                      textShadow: '0 0 10px rgba(0,0,0,0.5)',
                      fontVariantNumeric: 'tabular-nums',
                      zIndex: 1
                  }}>
                      {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}
                  </div>
                  
                  {/* КНОПКА ПАУЗИ (Тільки вона) */}
                  {socket.id === hostId && (
                      <div style={{
                          position: 'absolute',
                          right: '0',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          zIndex: 2
                      }}>
                          <button 
                              onClick={handleTogglePause}
                              style={{
                                  background: 'transparent',
                                  border: `1px solid ${gameStatus === 'paused' ? '#4ecdc4' : '#666'}`,
                                  color: gameStatus === 'paused' ? '#4ecdc4' : '#888',
                                  borderRadius: '20px',
                                  padding: '5px 15px',
                                  cursor: 'pointer',
                                  fontSize: '0.8em',
                                  fontWeight: 'bold',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  transition: 'all 0.2s',
                                  whiteSpace: 'nowrap',
                                  minWidth: '80px'
                              }}
                          >
                              {gameStatus === 'paused' ? '▶ ГРАТИ' : '⏸ ПАУЗА'}
                          </button>
                      </div>
                  )}
              </div>

              {/* 2. ОСНОВНА ЧАСТИНА (ГРА АБО ПАУЗА) */}
              {gameStatus === 'paused' ? (
                  // --- ЕКРАН ПАУЗИ ---
                  <div style={{
                      padding: '40px 0', 
                      borderTop: '1px solid #444', 
                      borderBottom: '1px solid #444',
                      animation: 'fadeIn 0.5s'
                  }}>
                      <h1 style={{
                          fontSize: '3em', 
                          color: '#ff4d4d', 
                          margin: '0', 
                          letterSpacing: '8px', 
                          textTransform: 'uppercase'
                      }}>
                          PAUSE
                      </h1>
                      <p style={{color: '#666', marginTop: '10px'}}>Ведучий зупинив гру</p>
                  </div>
              ) : (
                  // --- ЕКРАН ГРИ ---
                  <>
                      {socket.id === activePlayerId ? (
                        <>
                            {/* ТИ ПОЯСНЮЄШ */}
                            <div style={{minHeight: '150px', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
                                <h1 style={{fontSize: '3.5em', color: '#ffd700', margin: '0', wordBreak: 'break-word', lineHeight: '1.1'}}>
                                    {currentWord}
                                </h1>
                            </div>
                            
                            <div style={{display: 'flex', gap: '15px', marginTop: '20px', justifyContent: 'center'}}>
                               <button style={{...styles.button, width: 'auto', flex: 1, backgroundColor: '#333', border: '1px solid #ff6b6b', color: '#ff6b6b'}} onClick={() => handleNextWord('skipped')}>
                                   ПРОПУСТИТИ
                               </button>
                               <button style={{...styles.button, width: 'auto', flex: 1, backgroundColor: '#4ecdc4', color: '#000'}} onClick={() => handleNextWord('guessed')}>
                                   ВГАДАВ!
                               </button>
                            </div>
                            <p style={{color: '#666', marginTop: '15px', fontSize: '0.9em'}}>Ти пояснюєш</p>
                        </>
                      ) : (
                        <>
                            {/* ТИ СЛУХАЄШ */}
                            <div style={{minHeight: '150px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'}}>
                                <h1 style={{fontSize: '4em', color: '#333', margin: '0'}}>???</h1>
                            </div>
                            <p style={{fontSize: '1.1em', color: '#aaa'}}>Зараз пояснюють інші.</p>
                        </>
                      )}
                  </>
              )}

              {/* 3. ЖИВА ІСТОРІЯ (Завжди знизу) */}
              {liveHistory.length > 0 && (
                  <div style={{
                      marginTop: '20px',
                      paddingTop: '15px',
                      borderTop: '1px solid #333',
                      textAlign: 'left',
                      maxHeight: '120px', 
                      overflowY: 'auto',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px'
                  }}>
                      <div style={{fontSize: '0.8em', textTransform: 'uppercase', color: '#555', textAlign: 'center', letterSpacing: '1px'}}>Історія раунду</div>
                      
                      {[...liveHistory].reverse().map((item, idx) => (
                          <div key={idx} style={{
                              display: 'flex', 
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              padding: '8px 12px',
                              borderRadius: '6px',
                              backgroundColor: 'rgba(255,255,255,0.03)',
                              borderLeft: item.status === 'guessed' ? '3px solid #4ecdc4' : '3px solid #ff6b6b'
                          }}>
                              <span style={{color: '#ccc', fontSize: '1.1em'}}>{item.word}</span>
                              {item.status === 'guessed' 
                                  ? <span style={{color: '#4ecdc4'}}>✔</span> 
                                  : <span style={{color: '#ff6b6b'}}>✕</span>
                              }
                          </div>
                      ))}
                  </div>
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

          {/* ЕКРАН 4: ПЕРЕМОГА 🏆 */}
          {gameStatus === 'victory' && (
              <div style={styles.card}>
                  <div style={{fontSize: '5em', marginBottom: '10px'}}>
                      {winner === 1 ? '🔴' : winner === 2 ? '🔵' : '🤝'}
                  </div>
                  
                  <h1 style={{fontSize: '2.5em', marginBottom: '10px', color: '#ffd700'}}>
                      {winner === 1 ? 'ПЕРЕМОГА ЧЕРВОНИХ!' : 
                       winner === 2 ? 'ПЕРЕМОГА СИНІХ!' : 
                       'НІЧИЯ!'}
                  </h1>

                  <h3 style={{color: '#fff', marginBottom: '30px'}}>
                      Рахунок: {score[1]} - {score[2]}
                  </h3>

                  {socket.id === hostId ? (
                      <button 
                          style={{...styles.joinBtn, backgroundColor: '#4ecdc4', fontSize: '1.2em', padding: '15px 30px'}} 
                          onClick={handleRestart}
                      >
                          🔄 НОВА ГРА
                      </button>
                  ) : (
                      <p style={{color: '#888'}}>Чекаємо, поки хост почне нову гру...</p>
                  )}
              </div>
          )}
        </div>

       {/* === ПРАВА КОЛОНКА (Сині) === */}
        <div style={{...styles.teamBox, borderColor: '#4ecdc4'}}>
           <h3 style={{color: '#4ecdc4'}}>🔵 Сині </h3>
           <h1 style={{fontSize: '4em', margin: '10px 0'}}>{score[2]}</h1>
           <div style={{textAlign: 'left', margin: '20px'}}>
            {teams.team2.map(p => { // <--- ТУТ team2
                const isMe = p.id === socket.id;             
                const isHost = p.id === hostId;
                const iAmHost = socket.id === hostId;

                // 👇 ВИПРАВЛЕНА ЛОГІКА
                const isExplainer = (gameStatus === 'game' || gameStatus === 'paused') 
                    ? p.id === activePlayerId 
                    : p.id === nextExplainerId;

                return (
                    <div key={p.id} style={{
                        padding:'12px 5px', 
                        borderBottom: '1px solid rgba(255,255,255,0.05)',
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'space-between', 
                        gap: '10px',
                        color: isExplainer ? '#4ecdc4' : (isMe ? '#fff' : 'rgba(255,255,255,0.6)'),
                        fontWeight: isMe ? 'bold' : 'normal',
                        transition: 'all 0.3s',
                        background: isExplainer ? 'linear-gradient(90deg, rgba(78, 205, 196, 0.1) 0%, transparent 100%)' : 'transparent'
                    }}>
                        {/* ІМ'Я + СТРІЛКА */}
                        <div style={{display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden'}}>
                             
                             {/* СТРІЛКА */}
                             {isExplainer ? (
                                 <div style={{
                                     width: 0, 
                                     height: 0, 
                                     borderTop: '6px solid transparent',
                                     borderBottom: '6px solid transparent',
                                     borderLeft: '10px solid #4ecdc4',
                                     marginRight: '5px'
                                 }}></div>
                             ) : (
                                 <div style={{width: '15px', textAlign: 'center', fontSize: '1.1em'}}>
                                     {isHost ? '👑' : ''}
                                 </div>
                             )}
                             
                             <span style={{whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: '1.1em'}}>
                                {p.name}
                             </span>
                        </div>

                        {/* КНОПКИ АДМІНА */}
                        <div style={{display: 'flex', alignItems: 'center', gap: '10px'}}>
                            
                            {iAmHost && (
                                <div style={{display: 'flex', gap: '8px', marginLeft: '5px'}}>
                                    {!isExplainer && (
                                        <button onClick={() => handleSetExplainer(p.id)} title="Призначити ведучим" style={{background: 'transparent', border: '1px solid #4ecdc4', borderRadius: '50%', width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#4ecdc4', fontSize: '0.7em', padding: 0, transition: '0.2s'}} onMouseEnter={(e) => { e.currentTarget.style.background = '#4ecdc4'; e.currentTarget.style.color = '#000'; }} onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#4ecdc4'; }}>
                                            ▶
                                        </button>
                                    )}
                                    {!isMe && (
                                        <button onClick={() => handleTransferHost(p.id)} title="Передати права хоста" style={{background: 'transparent', border: '1px solid #ffd700', borderRadius: '50%', width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#ffd700', fontSize: '0.8em', padding: 0, transition: '0.2s'}} onMouseEnter={(e) => { e.currentTarget.style.background = '#ffd700'; e.currentTarget.style.color = '#000'; }} onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#ffd700'; }}>
                                            ♕
                                        </button>
                                    )}
                                    {!isMe && (
                                        <button onClick={() => handleKick(p.id)} title="Вигнати" style={{background: 'transparent', border: '1px solid #ff4d4d', borderRadius: '50%', width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#ff4d4d', fontSize: '0.8em', padding: 0, transition: '0.2s'}} onMouseEnter={(e) => { e.currentTarget.style.background = '#ff4d4d'; e.currentTarget.style.color = '#fff'; }} onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#ff4d4d'; }}>
                                            ✕
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                )
            })}
          </div>
          {gameStatus === 'lobby' && !isLocked && (
               <button 
                   style={{...styles.joinBtn, backgroundColor: '#4ecdc4'}} 
                   onClick={() => joinTeam(2)}
               >
                   Вступити
               </button>
           )}</div>

      </div>

      {/* --- МІНІ-ПАНЕЛЬ НАЛАШТУВАНЬ (Right Bottom) --- */}
      {/* Показуємо ЗАВЖДИ, крім стартової сторінки */}
      {(gameStatus === 'lobby' || gameStatus === 'game' || gameStatus === 'paused' || gameStatus === 'review') && (
        <div style={{
            position: 'fixed',
            bottom: '20px',
            right: '20px',
            backgroundColor: 'rgba(20, 20, 20, 0.95)',
            padding: '15px',
            borderRadius: '8px',
            border: '1px solid #333',
            display: 'flex',
            flexDirection: 'column',
            gap: '15px',
            zIndex: 1000,
            backdropFilter: 'blur(5px)',
            minWidth: '120px',
            color: '#ddd'
        }}>
            {/* 1. ТАЙМЕР */}
            <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px'}}>
                <span style={{fontSize: '1em', color: '#888'}}>Time</span>
                {socket.id === hostId ? (
                   <input 
                      type="range" min="10" max="180" step="10" 
                      value={settings.roundTime}
                      onChange={(e) => handleSettingsChange('roundTime', e.target.value)}
                      style={{width: '60px', cursor: 'pointer', accentColor: '#fff'}}
                   />
                ) : <div style={{flex: 1}}></div>}
                <span style={{fontWeight: 'bold', minWidth: '25px', textAlign: 'right'}}>{settings.roundTime}</span>
            </div>

            {/* 2. ПЕРЕМОГА */}
            <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px'}}>
                <span style={{fontSize: '1em', color: '#888'}}>Win</span>
                {socket.id === hostId ? (
                   <input 
                      type="range" min="10" max="100" step="5" 
                      value={settings.winScore}
                      onChange={(e) => handleSettingsChange('winScore', e.target.value)}
                      style={{width: '60px', cursor: 'pointer', accentColor: '#fff'}}
                   />
                ) : <div style={{flex: 1}}></div>}
                <span style={{fontWeight: 'bold', minWidth: '25px', textAlign: 'right'}}>{settings.winScore}</span>
            </div>
            
            <div style={{borderTop: '1px solid #444', margin: '5px 0'}}></div>

            {/* 3. СКЛАДНІСТЬ */}
            <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px'}}>
                <span style={{fontSize: '1em', color: '#888'}}>Diff</span>
                {socket.id === hostId ? (
                   <select 
                      value={settings.difficulty || 'normal'}
                      onChange={(e) => handleSettingsChange('difficulty', e.target.value)}
                      style={{
                          flex: 1, padding: '5px', borderRadius: '5px', border: 'none',
                          backgroundColor: '#333', color: '#fff', cursor: 'pointer', outline: 'none', textAlign: 'right'
                      }}
                   >
                       <option value="easy">Easy</option>
                       <option value="normal">Norm</option>
                       <option value="hard">Hard</option>
                   </select>
                ) : (
                    <span style={{fontWeight: 'bold', color: '#ffd700', textTransform: 'capitalize'}}>
                        {settings.difficulty || 'normal'}
                    </span>
                )}
            </div>

            {/* 4. ЗАМОК ТА SHUFFLE (Тільки в Лобі) */}
            {gameStatus === 'lobby' && (
                <>
                    <div style={{borderTop: '1px solid #444', margin: '5px 0'}}></div>
                    <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between'}}>
                        <span style={{fontSize: '1em', color: '#888'}}>Lobby</span>
                        {socket.id === hostId ? (
                        <button onClick={handleToggleLock} style={{background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.4em', padding: '0 5px'}} title={isLocked ? "Відкрити" : "Закрити"}>
                            {isLocked ? '🔒' : '🔓'}
                        </button>
                        ) : <span style={{fontSize: '1.2em'}}>{isLocked ? '🔒' : '🔓'}</span>}
                        
                        {socket.id === hostId && (
                            <button onClick={handleShuffle} disabled={isLocked} style={{background: 'none', border: 'none', cursor: isLocked ? 'not-allowed' : 'pointer', fontSize: '1.4em', padding: '0 5px', opacity: isLocked ? 0.3 : 1}} title="Перемішати">
                                🔀
                            </button>
                        )}
                    </div>
                </>
            )}

            {/* 👇 5. КНОПКА РЕСТАРТУ (ТІЛЬКИ ДЛЯ ХОСТА) 👇 */}
            {socket.id === hostId && (
                <>
                    <div style={{borderTop: '1px solid #444', margin: '5px 0'}}></div>
                    <button 
                        onClick={() => {
                            if(window.confirm("🔴 УВАГА: Це повністю скине гру та рахунок. Продовжити?")) {
                                handleRestart();
                            }
                        }}
                        style={{
                            backgroundColor: '#ff4d4d',
                            color: 'white',
                            border: 'none',
                            borderRadius: '5px',
                            padding: '10px',
                            cursor: 'pointer',
                            fontWeight: 'bold',
                            fontSize: '0.9em',
                            width: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '5px'
                        }}
                    >
                        🔄 RESTART GAME
                    </button>
                </>
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