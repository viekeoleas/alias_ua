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
  useEffect(() => {
    // Цей код виконується тільки коли ми знаємо ім'я (isNameSet = true)
    if (isNameSet) {
        // 1. Підключаємось до конкретної кімнати на сервері
        socket.emit("join_room", roomId);
        
        // --- АВТО-ВСТУП ПІСЛЯ F5 (Оновлення сторінки) ---
        // Якщо в пам'яті браузера збережено, що ми були в команді 1,
        // ми автоматично відправляємо запит на вступ назад у цю команду.
        const savedTeam = localStorage.getItem("alias_team_id");
        if (savedTeam) {
            // setTimeout потрібен, щоб сокет встиг "зайти" в кімнату (join_room)
            // перед тим, як проситися в команду.
            setTimeout(() => {
                socket.emit("join_team", { roomId, team: parseInt(savedTeam), name: nickname });
            }, 100);
        }
        // ---------------------------
    }
    
    // --- СЛУХАЧІ ПОДІЙ ВІД СЕРВЕРА ---
    
    // Оновлення списків команд (хтось зайшов/вийшов)
    socket.on("update_teams", (updatedTeams) => {
      setTeams(updatedTeams);
      setNextExplainerId(updatedTeams.nextExplainerId); // <--- ЗБЕРІГАЄМО
      
      if (updatedTeams.status === 'game') setGameStatus('game');
      if (updatedTeams.status === 'review') setGameStatus('review');
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

    // --- ПОЧАТОК REVIEW (Кінець раунду) ---
    // Сервер каже: "Час вийшов, ось історія слів, перевіряйте"
    socket.on("round_ended", (history) => {
        setReviewHistory(history);
        setGameStatus('review');
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
        socket.emit("join_room", roomId); 
    }
  };

  // Вступ до команди
  const joinTeam = (teamId) => {
      localStorage.setItem("alias_team_id", teamId); // Запам'ятовуємо команду (для F5)
      socket.emit("join_team", { roomId, team: teamId, name: nickname });
  };

  // Кнопка "Почати раунд"
  const handleStartGame = () => socket.emit("request_start", { roomId });
  
  // Кнопки "Вгадав" / "Пропустив"
  const handleNextWord = (action) => socket.emit("next_word", { roomId, action });

  // --- ЛОГІКА РЕДАГУВАННЯ СПИСКУ (REVIEW) ---
  // Це працює ТІЛЬКИ на клієнті. Ми змінюємо state `reviewHistory`.
  // На сервер нічого не летить, поки не натиснемо "Зарахувати".
  const toggleWordStatus = (index) => {
      // Копіюємо масив (React вимагає immutability)
      const newHistory = [...reviewHistory];
      const current = newHistory[index].status;
      
      // Логіка перемикання по колу:
      // Вгадав (+1) -> Пропустив (-1) -> Не зараховано (0) -> Вгадав (+1) ...
      if (current === 'guessed') newHistory[index].status = 'skipped';
      else if (current === 'skipped') newHistory[index].status = 'none'; 
      else newHistory[index].status = 'guessed';

      setReviewHistory(newHistory);
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
      <div style={styles.gameLayout}>
        
        {/* === ЛІВА КОЛОНКА (Червоні) === */}
        <div style={{...styles.teamBox, borderColor: '#ff6b6b'}}>
          <h3 style={{color: '#ff6b6b'}}>🔴 Красные</h3>
          <h1 style={{fontSize: '4em', margin: '10px 0'}}>{score[1]}</h1>
          {/* Список гравців команди 1 */}
          <div style={{textAlign: 'left', margin: '20px'}}>
            {teams.team1.map(p => (
                <div key={p.id} style={{padding:'5px', fontWeight: p.id === nextExplainerId ? 'bold' : 'normal'}}>
                    😎 {p.name} {p.id === nextExplainerId && ' 🎤'} {/* <--- СТРІЛОЧКА/МІКРОФОН */}
                </div>
            ))}
          </div>
          {/* Кнопка вступу (тільки в лобі) */}
          {gameStatus === 'lobby' && <button style={{...styles.joinBtn, backgroundColor: '#ff6b6b'}} onClick={() => joinTeam(1)}>Вступить</button>}
        </div>

        {/* === ЦЕНТРАЛЬНА ЧАСТИНА (Ігрове поле) === */}
        <div style={{...styles.teamBox, flex: 2, borderColor: 'transparent', background: 'transparent'}}>
          
          {/* ЕКРАН 1: ЛОБІ (Очікування) */}
          {gameStatus === 'lobby' && (
            <>
              <p>Код комнаты:</p> <div style={styles.smallRoomCode}>{roomId}</div>
              <button style={{...styles.joinBtn, backgroundColor: '#ffd700', color: 'black', marginTop: '30px', fontSize: '20px'}} onClick={handleStartGame}>ПОЧАТИ РАУНД 🚀</button>
            </>
          )}

         {gameStatus === 'game' && (
            <div style={styles.card}>
              <div style={{fontSize: '2em', fontWeight: 'bold', color: timeLeft <= 10 ? '#ff4d4d' : '#fff', marginBottom: '10px'}}>⏱ {timeLeft}</div>
              
              {/* ПЕРЕВІРКА РОЛІ */}
              {socket.id === activePlayerId ? (
                  // --- ТИ ПОЯСНЮЄШ (Бачиш все) ---
                  <>
                      <h1 style={{fontSize: '3em', color: '#ffd700', margin: '20px 0'}}>{currentWord}</h1>
                      <div style={{display: 'flex', gap: '10px', marginTop: '30px'}}>
                         <button style={{...styles.button, backgroundColor: '#ff6b6b'}} onClick={() => handleNextWord('skipped')}>Пропустити (-1)</button>
                         <button style={{...styles.button, backgroundColor: '#4ecdc4'}} onClick={() => handleNextWord('guessed')}>Вгадав (+1)</button>
                      </div>
                      <p style={{color: '#888', marginTop: '10px'}}>Ти пояснюєш! Швидше!</p>
                  </>
              ) : (
                  // --- ТИ ВГАДУЄШ АБО ДИВИШСЯ ---
                  <>
                      <h1 style={{fontSize: '3em', color: '#555', margin: '20px 0'}}>???</h1>
                      <p style={{fontSize: '1.2em'}}>Зараз пояснює гравець твоєї (або чужої) команди.</p>
                      <p style={{color: '#ffd700'}}>Слухай уважно!</p>
                  </>
              )}
              
            </div>
          )}
          {/* ЕКРАН 3: ПЕРЕВІРКА СЛІВ (Review) */}
          {gameStatus === 'review' && (
              <div style={styles.card}>
                  <h2>Перевірка слів 🧐</h2>
                  <h3 style={{color: '#ffd700'}}>Бали за раунд: {calculateRoundScore()}</h3>
                  <p style={{fontSize: '0.8em', color: '#888'}}>Натисни на статус, щоб змінити</p>
                  
                  <div style={{marginTop: '20px', maxHeight: '400px', overflowY: 'auto'}}>
                      {reviewHistory.map((item, index) => (
                          <div key={index} style={styles.wordRow}>
                              <span>{item.word}</span>
                              
                              <button 
                                onClick={() => toggleWordStatus(index)}
                                style={{
                                    ...styles.statusBtn,
                                    // Динамічний колір кнопки залежно від статусу
                                    backgroundColor: 
                                        item.status === 'guessed' ? '#4ecdc4' : 
                                        item.status === 'skipped' ? '#ff6b6b' : '#666',
                                    color: 'white'
                                }}
                              >
                                {/* Текст кнопки змінюється */}
                                {item.status === 'guessed' ? '+1' : item.status === 'skipped' ? '-1' : '0'}
                              </button>
                          </div>
                      ))}
                  </div>

                  <button 
                    style={{...styles.button, backgroundColor: '#ffd700', color: 'black', marginTop: '20px'}}
                    onClick={confirmResults}
                  >
                    ЗАРАХУВАТИ БАЛИ ✅
                  </button>
              </div>
          )}

        </div>

        {/* === ПРАВА КОЛОНКА (Сині) === */}
        <div style={{...styles.teamBox, borderColor: '#4ecdc4'}}>
           <h3 style={{color: '#4ecdc4'}}>🔵 Синие</h3>
           <h1 style={{fontSize: '4em', margin: '10px 0'}}>{score[2]}</h1>
           {/* Список гравців команди 2 */}
           <div style={{textAlign: 'left', margin: '20px'}}>
            {teams.team1.map(p => (
                <div key={p.id} style={{padding:'5px', fontWeight: p.id === nextExplainerId ? 'bold' : 'normal'}}>
                    😎 {p.name} {p.id === nextExplainerId && ' 🎤'} {/* <--- СТРІЛОЧКА/МІКРОФОН */}
                </div>
            ))}
          </div>
           {gameStatus === 'lobby' && <button style={{...styles.joinBtn, backgroundColor: '#4ecdc4'}} onClick={() => joinTeam(2)}>Вступить</button>}
        </div>
      </div>
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