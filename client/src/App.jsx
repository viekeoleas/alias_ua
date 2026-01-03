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

discordChip: {
    position: 'fixed',
    top: '20px',
    right: '20px',       // <--- Замість left і transform ставимо right
    zIndex: 9999,
    backgroundColor: '#5865F2',
    color: 'white',
    padding: '5px 10px',
    borderRadius: '30px',
    textDecoration: 'none',
    fontWeight: 'bold',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    boxShadow: '0 5px 20px rgba(0,0,0,0.3)', // Трішки темніша тінь
    cursor: 'pointer',
    border: '1px solid rgba(255,255,255,0.1)',
    transition: 'transform 0.2s', // Важливо для плавності
    // transform: 'translateX(-50%)' <--- ЦЕЙ РЯДОК ТРЕБА БУЛО ПРИБРАТИ
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
// ... твои старые стили (container, card, title и т.д.) ...

  // 👇 НОВЫЕ СТИЛИ ДЛЯ МАКЕТА
  mainGrid: {
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-start', // Выравнивание по верху
    width: '100%',
    maxWidth: '1600px', // Ограничиваем ширину на больших экранах
    padding: '20px',
    gap: '20px',
    flexWrap: 'wrap', // Чтобы на мобильных падало в столбик
  },

sideColumn: {
      flex: '1',
      maxWidth: '320px', // 👇 ОБМЕЖИЛИ ШИРИНУ КОЛОНКИ (було minWidth, додали max)
      minWidth: '250px',
      display: 'flex',
      flexDirection: 'column',
      gap: '20px'
  },

  centerColumn: {
      flex: '0 0 700px', // 👇 ЗБІЛЬШИЛИ ШИРИНУ ЦЕНТРУ (було 500px, стало 700px)
      minWidth: '320px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'flex-start',
      order: 0 
  },
  // В teamBox можно убрать лишние flex параметры, так как теперь за это отвечает колонка
  teamBox: { 
    backgroundColor: '#2a2a2a', 
    padding: '20px', 
    borderRadius: '15px', 
    width: '100%', // Растягиваем на всю ширину колонки
    textAlign: 'center', 
    border: '2px solid #444',
    display: 'flex',        
    flexDirection: 'column', 
    justifyContent: 'space-between',
    position: 'relative',
    minHeight: '250px' // Минимальная высота карточки
  },


  teamBox: { 
    backgroundColor: '#2a2a2a', 
    padding: '20px', 
    borderRadius: '15px', 
    textAlign: 'center', 
    border: '2px solid #444',
    display: 'flex',        
    flexDirection: 'column', 
    justifyContent: 'space-between',
    position: 'relative' // Для позиціонування бейджика Active
  },
  teamBox: { backgroundColor: '#2a2a2a', padding: '20px', borderRadius: '15px', flex: 1, minHeight: '300px',minWidth: '300px',  textAlign: 'center', border: '2px solid #444' },
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
// --- КОМПОНЕНТ: КНОПКА DISCORD ---
const DiscordButton = () => (
    <a 
        href="https://discord.gg/GFUGZQg2" // <--- ВСТАВ СЮДИ СВОЄ ПОСИЛАННЯ
        target="_blank" 
        rel="noopener noreferrer"
        style={styles.discordChip}
        onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
        onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
    >
        {/* Іконка Discord (SVG) */}
        <svg width="24" height="24" viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg">
            <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189z"/>
        </svg>
        <span>Community</span>
    </a>
);
// --- КОМПОНЕНТ: СТАРТОВА СТОРІНКА ---
// --- КОМПОНЕНТ: СТАРТОВА СТОРІНКА ---
function StartPage() {
  const navigate = useNavigate(); 

  const createRoom = () => socket.emit("create_room");

  useEffect(() => { 
      socket.on("room_created", (roomId) => {
          navigate(`/game/${roomId}`)
      }); 
  }, []);

  // 👇 ОСТАВЬ ТОЛЬКО ОДИН RETURN
  return (
    <div style={styles.container}>
      
      {/* 1. Вставляем кнопку Дискорда СЮДА */}
      <DiscordButton />

      <div style={styles.card}>
        <h1 style={styles.title}>Alias</h1>
        {/* 2. Оставляем твою кнопку создания игры */}
        <button style={styles.button} onClick={createRoom}>Створити нову гру</button>
      </div>
    </div>
  )
}


// --- КОМПОНЕНТ: СТОРІНКА ГРИ (Основна логіка) ---
function GamePage() {
  const { roomId } = useParams(); // Витягуємо ID кімнати з URL (напр. /game/X7A1)
  
  // 1. СТАНИ (React State) - це "пам'ять" компонента
  const [teams, setTeams] = useState({ teams: [] }); // Списки гравців
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
      if (updatedTeams.activePlayerId) {
          setActivePlayerId(updatedTeams.activePlayerId);
      }
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
    socket.on("update_score", (scoreArray) => {
        setTeams(prev => {
            if (!prev.teams) return prev;
            // Створюємо копію масиву команд
            const newTeamsList = prev.teams.map((team, index) => ({
                ...team,
                score: scoreArray[index] // Оновлюємо рахунок конкретної команди
            }));
            return { ...prev, teams: newTeamsList };
        });
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
    const joinTeam = (index) => {
    localStorage.setItem("alias_saved_team", index);
    localStorage.setItem("alias_saved_room", roomId); 
    socket.emit("join_team", { roomId, teamIndex: index, name: nickname }); // <-- teamIndex
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
            <button style={styles.button} onClick={handleNameSubmit}>Увійти в гру</button>
        </div>
    </div>
  );
// --- ЛОГІКА ДЛЯ 3-Х КОЛОНОК (Вставити перед return) ---
  
  // 1. Розділяємо команди: парні (0, 2) - зліва, непарні (1, 3) - справа
  const leftTeams = teams.teams ? teams.teams.filter((_, i) => i % 2 === 0) : [];
  const rightTeams = teams.teams ? teams.teams.filter((_, i) => i % 2 !== 0) : [];

  // 2. Функція для рендеру однієї картки команди (щоб не писати це двічі)
  const renderTeamCard = (team) => {
      // Знаходимо реальний індекс команди (для joinTeam)
      const realIndex = teams.teams.findIndex(t => t.id === team.id);
      const isActiveTeam = realIndex === teams.currentTeamIndex;

      return (
        <div key={team.id} style={{
            ...styles.teamBox, 
            borderColor: team.color,
            opacity: (gameStatus === 'game' && !isActiveTeam) ? 0.6 : 1
        }}>    
            <h3 style={{color: team.color, margin: '0 0 10px 0'}}>{team.name}</h3>
            <h1 style={{fontSize: '4em', margin: '0 0 20px 0', lineHeight: 1}}>{team.score}</h1>
            
            <div style={{textAlign: 'left', marginBottom: '20px', flex: 1}}>
                {team.players.map(p => {
                    const isMe = p.id === socket.id;             
                    const isHost = p.id === hostId;
                    const iAmHost = socket.id === hostId;
                    const isRoundActive = gameStatus === 'game' || gameStatus === 'paused';
                    const isExplainer = isRoundActive ? p.id === activePlayerId : p.id === nextExplainerId;

                    return (
                        <div key={p.id} style={{
                            padding:'10px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            color: isExplainer ? team.color : (isMe ? '#fff' : 'rgba(255,255,255,0.6)'),
                            background: isExplainer ? `linear-gradient(90deg, ${team.color}22 0%, transparent 100%)` : 'transparent'
                        }}>
                            <div style={{display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden'}}>
                                {isExplainer && <span style={{fontSize: '0.8em'}}>▶</span>}
                                {p.id === hostId && <span>👑</span>}
                                <span style={{fontWeight: isMe ? 'bold' : 'normal', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '120px'}}>{p.name}</span>
                            </div>

                            {iAmHost && (
                                <div style={{display: 'flex', gap: '5px'}}>
                                    {!isRoundActive && !isExplainer && (
                                        <button onClick={() => handleSetExplainer(p.id)} title="Ведучий" style={{background: 'none', border: '1px solid #4ecdc4', borderRadius: '50%', width: '20px', height: '20px', color: '#4ecdc4', fontSize: '0.6em', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>▶</button>
                                    )}
                                    {!isRoundActive && !isMe && (
                                        <button onClick={() => handleTransferHost(p.id)} title="Хост" style={{background: 'none', border: '1px solid #ffd700', borderRadius: '50%', width: '20px', height: '20px', color: '#ffd700', fontSize: '0.7em', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>♕</button>
                                    )}
                                    {!isMe && (
                                        <button onClick={() => handleKick(p.id)} title="Кік" style={{background: 'none', border: '1px solid #ff4d4d', borderRadius: '50%', width: '20px', height: '20px', color: '#ff4d4d', fontSize: '0.7em', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>✕</button>
                                    )}
                                </div>
                            )}
                        </div>
                    )
                })}
            </div>

            {/* КНОПКА СТАРТУ */}
            {gameStatus === 'lobby' && isActiveTeam && team.players.length > 0 && (
                <div style={{marginTop: 'auto'}}>
                    <div style={{fontSize: '0.9em', color: '#888', marginBottom: '5px'}}>
                        Наступний: <b style={{color: '#fff'}}>{
                            team.players.find(p => p.id === nextExplainerId)?.name || "..."
                        }</b>
                    </div>
                    {(socket.id === hostId || socket.id === nextExplainerId) ? (
                        <button onClick={handleStartGame} style={{backgroundColor: '#ffd700', color: 'black', border: 'none', padding: '12px', fontSize: '1.1em', fontWeight: 'bold', borderRadius: '30px', cursor: 'pointer', width: '100%', boxShadow: '0 0 15px rgba(255, 215, 0, 0.4)', animation: 'pulse 2s infinite'}}>▶ ПОЧАТИ</button>
                    ) : (
                        <div style={{padding: '10px', background: 'rgba(255,255,255,0.1)', borderRadius: '8px', fontSize: '0.9em'}}>Чекаємо старту... ⏳</div>
                    )}
                </div>
            )}

            {gameStatus === 'lobby' && !isLocked && (
                <button style={{...styles.joinBtn, backgroundColor: team.color, marginTop: '15px'}} onClick={() => joinTeam(realIndex)}>Вступити</button>
            )}
        </div>
      );
  };
  /*основний рендер */
  return (
    <div style={styles.container}>
      <DiscordButton />
      
      {/* 1. ПЛАШКА СПЕКТАТОРІВ */}
      <div 
          onClick={joinSpectators}
          title={!isLocked ? "Натисніть, щоб стати глядачем" : "Заблоковано"}
          style={{
            marginBottom: '10px', color: '#666', fontSize: '0.9em', display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', cursor: isLocked ? 'not-allowed' : 'pointer', padding: '5px', borderRadius: '5px', transition: 'background 0.2s', border: '1px solid transparent', zIndex: 10
          }}
          onMouseEnter={(e) => !isLocked && (e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
      >
          <span>👀 Spectators:</span>
          {teams.spectators && teams.spectators.length > 0 ? (
              teams.spectators.map(s => (
                  <span key={s.id} style={{color: s.id === socket.id ? '#fff' : '#888', fontWeight: s.id === socket.id ? 'bold' : 'normal'}}>
                      {s.name}
                  </span>
              ))
          ) : (
              <span>(click to join)</span>
          )}
      </div>

      {/* 2. ГОЛОВНИЙ ГРІД (ЗАВЖДИ 3 КОЛОНКИ) */}
      <div style={styles.mainGrid}>
          
          {/* ЛІВА КОЛОНКА */}
          <div style={styles.sideColumn}>
              {leftTeams.map(team => renderTeamCard(team))}
          </div>

          {/* ЦЕНТРАЛЬНА КОЛОНКА (ЗМІНЮЄТЬСЯ В ЗАЛЕЖНОСТІ ВІД ЕТАПУ) */}
          <div style={styles.centerColumn}>
              
              {/* ВАРІАНТ А: ЛОББІ */}
              {gameStatus === 'lobby' && (
                  <div style={{marginTop: '40px', textAlign: 'center', opacity: 0.3}}>
                      <h1 style={{fontSize: '6em', margin: 0, letterSpacing: '10px', color: '#444'}}>ALIAS</h1>
                      <p style={{fontSize: '1.2em'}}>Чекаємо гравців...</p>
                  </div>
              )}

              {/* ВАРІАНТ Б: ГРА або ПАУЗА */}
              {(gameStatus === 'game' || gameStatus === 'paused') && (
                <div style={{...styles.card, width: '100%', maxWidth: '100%', padding: '30px', minHeight: '400px', display: 'flex', flexDirection: 'column', justifyContent: 'center'}}>
                      {/* ТАЙМЕР */}
                      <div style={{display: 'flex', justifyContent: 'center', alignItems: 'center', marginBottom: '20px', position: 'relative', minHeight: '60px'}}>
                          <div style={{fontSize: '5em', fontWeight: 'bold', color: timeLeft <= 10 ? '#ff4d4d' : '#fff', textShadow: '0 0 10px rgba(0,0,0,0.5)', fontVariantNumeric: 'tabular-nums', zIndex: 1}}>
                              {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}
                          </div>
                          {socket.id === hostId && (
                              <div style={{position: 'absolute', right: '0', top: '50%', transform: 'translateY(-50%)', zIndex: 2}}>
                                  <button onClick={handleTogglePause} style={{background: 'transparent', border: `1px solid ${gameStatus === 'paused' ? '#4ecdc4' : '#666'}`, color: gameStatus === 'paused' ? '#4ecdc4' : '#888', borderRadius: '20px', padding: '5px 15px', cursor: 'pointer', fontSize: '0.8em', fontWeight: 'bold'}}>
                                      {gameStatus === 'paused' ? '▶' : '⏸'}
                                  </button>
                              </div>
                          )}
                      </div>

                      {/* СЛОВО */}
                      {gameStatus === 'paused' ? (
                          <div style={{padding: '20px 0', borderTop: '1px solid #444', borderBottom: '1px solid #444'}}>
                              <h1 style={{fontSize: '3em', color: '#ff4d4d', margin: '0', letterSpacing: '8px'}}>PAUSE</h1>
                          </div>
                      ) : (
                          <>
                              {socket.id === activePlayerId ? (
                                <>
                                    <div style={{flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
                                        <h1 style={{fontSize: '4.5em', color: '#ffd700', margin: '0', lineHeight: '1.1'}}>{currentWord}</h1>
                                    </div>
                                    <div style={{display: 'flex', gap: '15px', marginTop: '30px', justifyContent: 'center', width: '100%'}}>
                                       <button style={{...styles.button, width: 'auto', flex: 1, backgroundColor: '#333', border: '1px solid #ff6b6b', color: '#ff6b6b', padding: '20px', fontSize: '1.2em'}} onClick={() => handleNextWord('skipped')}>ПРОПУСТИТИ</button>
                                       <button style={{...styles.button, width: 'auto', flex: 1, backgroundColor: '#4ecdc4', color: '#000', padding: '20px', fontSize: '1.2em'}} onClick={() => handleNextWord('guessed')}>ВГАДАВ!</button>
                                    </div>
                                </>
                              ) : (
                                <>
                                    <div style={{flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'}}>
                                        <h1 style={{fontSize: '6em', color: '#333', margin: '0'}}>???</h1>
                                    </div>
                                    <p style={{fontSize: '1.2em', color: '#aaa'}}>Зараз пояснюють інші...</p>
                                </>
                              )}
                          </>
                      )}
                      
                       {/* ЖИВА ІСТОРІЯ (Знизу картки) */}
                       {liveHistory.length > 0 && (
                          <div style={{marginTop: '20px', paddingTop: '15px', borderTop: '1px solid #333', textAlign: 'left', maxHeight: '100px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '5px'}}>
                              {[...liveHistory].reverse().map((item, idx) => (
                                  <div key={idx} style={{display: 'flex', justifyContent: 'space-between', padding: '5px 10px', background: 'rgba(255,255,255,0.03)', borderLeft: item.status === 'guessed' ? '3px solid #4ecdc4' : '3px solid #ff6b6b'}}>
                                      <span style={{color: '#ccc'}}>{item.word}</span>
                                      <span>{item.status === 'guessed' ? '✔' : '✕'}</span>
                                  </div>
                              ))}
                          </div>
                       )}
                </div>
              )}

              {/* ВАРІАНТ В: ПЕРЕВІРКА СЛІВ (REVIEW) */}
              {gameStatus === 'review' && (
                  <div style={{...styles.card, width: '100%', maxWidth: '100%', padding: '30px', height: '100%', display: 'flex', flexDirection: 'column'}}>
                      <h2 style={{margin: '0 0 10px 0'}}>Перевірка слів 🧐</h2>
                      <h3 style={{color: '#ffd700', fontSize: '2.5em', margin: '10px 0'}}>Бали: {calculateRoundScore()}</h3>
                      
                      <div style={{flex: 1, overflowY: 'auto', border: '1px solid #444', borderRadius: '10px', padding: '10px', background: 'rgba(0,0,0,0.2)', marginBottom: '20px'}}>
                          {reviewHistory.map((item, index) => (
                              <div key={index} style={{...styles.wordRow, background: index % 2 === 0 ? 'rgba(255,255,255,0.03)' : 'transparent'}}>
                                  <span style={{textAlign: 'left', flex: 1, fontSize: '1.3em'}}>{item.word}</span>
                                  <button onClick={() => toggleWordStatus(index)} style={{...styles.statusBtn, padding: '10px', fontSize: '1.1em', backgroundColor: item.status === 'guessed' ? '#4ecdc4' : item.status === 'skipped' ? '#ff6b6b' : '#666', color: 'white'}}>
                                    {item.status === 'guessed' ? '+1' : item.status === 'skipped' ? '-1' : '0'}
                                  </button>
                              </div>
                          ))}
                      </div>
                      <button style={{...styles.button, backgroundColor: '#ffd700', color: 'black', padding: '20px', fontSize: '1.3em'}} onClick={confirmResults}>ЗАРАХУВАТИ БАЛИ ✅</button>
                  </div>
              )}

              {/* ВАРІАНТ Г: ПЕРЕМОГА */}
              {gameStatus === 'victory' && (
                  <div style={{...styles.card, width: '100%', maxWidth: '100%', padding: '50px'}}>
                      <div style={{fontSize: '7em', marginBottom: '20px'}}>🏆</div>
                      <h1 style={{fontSize: '2.5em', marginBottom: '20px', color: '#ffd700'}}>
                         ПЕРЕМОГА КОМАНДИ<br/>
                         <span style={{fontSize: '1.5em', color: '#fff'}}>{winner !== null && teams.teams[winner] ? teams.teams[winner].name : ''}</span>!
                      </h1>
                      {socket.id === hostId && (
                          <button style={{...styles.joinBtn, backgroundColor: '#4ecdc4', fontSize: '1.5em', padding: '20px 40px'}} onClick={handleRestart}>🔄 НОВА ГРА</button>
                      )}
                  </div>
              )}

          </div>

          {/* ПРАВА КОЛОНКА */}
          <div style={styles.sideColumn}>
              {rightTeams.map(team => renderTeamCard(team))}
          </div>

      </div>

      {/* ПАНЕЛЬ НАЛАШТУВАНЬ (ПРАВА НИЖНЯ) */}
      {(gameStatus === 'lobby' || gameStatus === 'game' || gameStatus === 'paused' || gameStatus === 'review') && (
        <div style={{
            position: 'fixed', bottom: '20px', right: '20px', backgroundColor: 'rgba(20, 20, 20, 0.95)', padding: '15px', borderRadius: '8px', border: '1px solid #333', display: 'flex', flexDirection: 'column', gap: '15px', zIndex: 1000, backdropFilter: 'blur(5px)', minWidth: '120px', color: '#ddd'
        }}>
            {/* Твої старі налаштування (Teams, Time, Win, Diff) залишаються тут */}
            <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px'}}>
                <span style={{fontSize: '1em', color: '#888'}}>Teams</span>
                {socket.id === hostId ? (
                   <select 
                      value={settings.teamsCount || 2}
                      onChange={(e) => handleSettingsChange('teamsCount', e.target.value)}
                      style={{flex: 1, padding: '5px', borderRadius: '5px', border: 'none', backgroundColor: '#333', color: '#fff', cursor: 'pointer', outline: 'none', textAlign: 'right'}}
                      disabled={gameStatus !== 'lobby'}
                   >
                       <option value="1">1</option>
                       <option value="2">2</option>
                       <option value="3">3</option>
                       <option value="4">4</option>
                   </select>
                ) : (
                    <span style={{fontWeight: 'bold', color: '#fff'}}>{settings.teamsCount || 2}</span>
                )}
            </div>
            
             <div style={{borderTop: '1px solid #444', margin: '5px 0'}}></div>

            <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px'}}>
                <span style={{fontSize: '1em', color: '#888'}}>Time</span>
                {socket.id === hostId ? <input type="range" min="10" max="180" step="10" value={settings.roundTime} onChange={(e) => handleSettingsChange('roundTime', e.target.value)} style={{width: '60px', cursor: 'pointer', accentColor: '#fff'}} /> : <div style={{flex: 1}}></div>}
                <span style={{fontWeight: 'bold', minWidth: '25px', textAlign: 'right'}}>{settings.roundTime}</span>
            </div>
            <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px'}}>
                <span style={{fontSize: '1em', color: '#888'}}>Win</span>
                {socket.id === hostId ? <input type="range" min="10" max="100" step="5" value={settings.winScore} onChange={(e) => handleSettingsChange('winScore', e.target.value)} style={{width: '60px', cursor: 'pointer', accentColor: '#fff'}} /> : <div style={{flex: 1}}></div>}
                <span style={{fontWeight: 'bold', minWidth: '25px', textAlign: 'right'}}>{settings.winScore}</span>
            </div>
            
            <div style={{borderTop: '1px solid #444', margin: '5px 0'}}></div>

            <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px'}}>
                <span style={{fontSize: '1em', color: '#888'}}>Diff</span>
                {socket.id === hostId ? (
                   <select value={settings.difficulty || 'normal'} onChange={(e) => handleSettingsChange('difficulty', e.target.value)} style={{flex: 1, padding: '5px', borderRadius: '5px', border: 'none', backgroundColor: '#333', color: '#fff', cursor: 'pointer', outline: 'none', textAlign: 'right'}}>
                       <option value="easy">Easy</option>
                       <option value="normal">Norm</option>
                       <option value="hard">Hard</option>
                   </select>
                ) : <span style={{fontWeight: 'bold', color: '#ffd700', textTransform: 'capitalize'}}>{settings.difficulty || 'normal'}</span>}
            </div>

            {gameStatus === 'lobby' && (
                <>
                    <div style={{borderTop: '1px solid #444', margin: '5px 0'}}></div>
                    <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between'}}>
                        <span style={{fontSize: '1em', color: '#888'}}>Lobby</span>
                        {socket.id === hostId ? (
                        <button onClick={handleToggleLock} style={{background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.4em', padding: '0 5px'}} title={isLocked ? "Відкрити" : "Закрити"}>{isLocked ? '🔒' : '🔓'}</button>
                        ) : <span style={{fontSize: '1.2em'}}>{isLocked ? '🔒' : '🔓'}</span>}
                        {socket.id === hostId && (
                            <button onClick={handleShuffle} disabled={isLocked} style={{background: 'none', border: 'none', cursor: isLocked ? 'not-allowed' : 'pointer', fontSize: '1.4em', padding: '0 5px', opacity: isLocked ? 0.3 : 1}} title="Перемішати">🔀</button>
                        )}
                    </div>
                </>
            )}

            {socket.id === hostId && (
                <>
                    <div style={{borderTop: '1px solid #444', margin: '5px 0'}}></div>
                    <button onClick={() => { if(window.confirm("🔴 УВАГА: Це повністю скине гру та рахунок. Продовжити?")) handleRestart(); }} style={{backgroundColor: '#ff4d4d', color: 'white', border: 'none', borderRadius: '5px', padding: '10px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.9em', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px'}}>
                        🔄 RESTART
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