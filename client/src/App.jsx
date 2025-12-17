import { useState, useEffect } from 'react'
import { Routes, Route, useNavigate, useParams } from 'react-router-dom'
import io from 'socket.io-client'

const socket = io.connect("http://localhost:3001")

// --- СТИЛІ ---
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
    maxWidth: '400px',
    width: '90%'
  },
  title: {
    fontSize: '3em',
    fontWeight: 'bold',
    marginBottom: '10px',
    background: '-webkit-linear-gradient(45deg, #646cff, #a56eff)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent'
  },
  button: {
    backgroundColor: '#646cff',
    color: 'white',
    border: 'none',
    padding: '15px 30px',
    fontSize: '18px',
    fontWeight: 'bold',
    borderRadius: '8px',
    cursor: 'pointer',
    width: '100%',
    marginTop: '10px'
  },
  input: {
    padding: '15px',
    borderRadius: '8px',
    border: '1px solid #555',
    backgroundColor: '#333',
    color: 'white',
    fontSize: '16px',
    width: '100%',
    marginBottom: '20px',
    outline: 'none'
  },
  // --- СТИЛІ ДЛЯ ЛОББИ (3 колонки) ---
  gameLayout: {
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'space-between', // Розподіляємо по краях
    gap: '40px',
    width: '98%',
    maxWidth: '1400px',
    alignItems: 'flex-start'
  },
  teamBox: {
    backgroundColor: '#2a2a2a',
    padding: '20px',
    borderRadius: '15px',
    flex: 1,
    minHeight: '300px',
    textAlign: 'center',
    border: '2px solid #444'
  },
  joinBtn: {
    marginTop: '15px',
    padding: '10px 20px',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: 'bold',
    color: 'white',
    width: '100%'
  },
  smallRoomCode: {
    fontSize: '2em',
    fontWeight: 'bold',
    color: '#ffc107',
    margin: '10px 0',
    fontFamily: 'monospace'
  }
};

// --- СТОРІНКА 1: ЛЕНДІНГ ---
function StartPage() {
  const navigate = useNavigate();

  const createRoom = () => {
    socket.emit("create_room");
  };

  useEffect(() => {
    socket.on("room_created", (roomId) => {
      navigate(`/game/${roomId}`);
    });
  }, []);

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>Alias</h1>
        <p style={{ color: '#888', marginBottom: '30px' }}>Гра для вечірок</p>
        <button style={styles.button} onClick={createRoom}>Створити нову гру</button>
        <button style={{...styles.button, backgroundColor: 'transparent', border: '2px solid #444'}}>
          Приєднатися до гри
        </button>
      </div>
    </div>
  )
}

// --- СТОРІНКА 2: ГРА ---
function GamePage() {
  const { roomId } = useParams();
  
  // 1. СТАНИ
  const [teams, setTeams] = useState({ team1: [], team2: [] });
  const [nickname, setNickname] = useState("");
  const [isNameSet, setIsNameSet] = useState(false);
  const [gameStatus, setGameStatus] = useState('lobby'); // 'lobby' | 'game'

  // 2. ЕФЕКТИ
  useEffect(() => {
    // Перевірка імені в кеші
    const savedName = localStorage.getItem("alias_player_name");
    if (savedName) {
      setNickname(savedName);
      setIsNameSet(true);
    }
  }, []);

  useEffect(() => {
    // Підключення до кімнати
    if (isNameSet) {
        socket.emit("join_room", roomId);
    }

    // Слухаємо оновлення команд
    socket.on("update_teams", (updatedTeams) => {
      setTeams(updatedTeams);
      // Якщо ми підключилися до гри, яка вже йде - треба оновити статус
      if (updatedTeams.status === 'game') {
          setGameStatus('game');
      }
    });
    
    // Слухаємо старт гри
    socket.on("game_started", () => {
        setGameStatus('game');
    });

    socket.on("error", (msg) => {
        alert(msg);
        window.location.href = "/";
    });
    
    return () => {
      socket.off("update_teams");
      socket.off("game_started");
    };
  }, [roomId, isNameSet]);

  // 3. ФУНКЦІЇ
  const handleNameSubmit = () => {
    if (nickname.trim()) { 
      localStorage.setItem("alias_player_name", nickname);
      setIsNameSet(true);
      socket.emit("join_room", roomId);
    } else {
      alert("Введи ім'я!");
    }
  };

  const joinTeam = (teamId) => {
    socket.emit("join_team", { roomId, team: teamId, name: nickname });
  };

  const handleStartGame = () => {
    // Відправляємо серверу команду почати
    socket.emit("start_game", { roomId });
  };

  // 4. РЕНДЕР: ВВІД ІМЕНІ
  if (!isNameSet) {
    return (
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
  }

  // 5. РЕНДЕР: ОСНОВНИЙ ЕКРАН
  return (
    <div style={styles.container}>
      
      <h2 style={{marginBottom: '30px'}}>
        {gameStatus === 'lobby' ? 'Лобі гри' : '🔥 Йде гра!'}
      </h2>

      <div style={styles.gameLayout}>

        {/* ЛІВА КОЛОНКА */}
        <div style={{...styles.teamBox, borderColor: '#ff6b6b'}}>
          <h3 style={{color: '#ff6b6b'}}>🔴 Красные ({teams.team1.length})</h3>
          <div style={{textAlign: 'left', margin: '20px'}}>
            {teams.team1.map(p => <div key={p.id} style={{padding:'5px'}}>😎 {p.name}</div>)}
          </div>
          {gameStatus === 'lobby' && (
            <button style={{...styles.joinBtn, backgroundColor: '#ff6b6b'}} onClick={() => joinTeam(1)}>
              Вступить
            </button>
          )}
        </div>

        {/* ЦЕНТР (ЗМІНЮЄТЬСЯ) */}
        <div style={{...styles.teamBox, flex: 2, borderColor: 'transparent', background: 'transparent'}}>
          {gameStatus === 'lobby' ? (
            // ЛОБІ: КОД + КНОПКА СТАРТ
            <>
              <p>Код комнаты:</p>
              <div style={styles.smallRoomCode}>{roomId}</div>
              <p style={{fontSize: '0.9em', color: '#666'}}>Ти: <b style={{color:'white'}}>{nickname}</b></p>
              
              <button 
                style={{...styles.joinBtn, backgroundColor: '#ffd700', color: 'black', marginTop: '30px', fontSize: '20px'}} 
                onClick={handleStartGame}
              >
                ПОЧАТИ ГРУ 🚀
              </button>
            </>
          ) : (
            // ГРА: КАРТКА
            <div style={styles.card}>
              <h1 style={{fontSize: '3em', color: '#ffd700', margin: '20px 0'}}>СЛОВО</h1>
              <p style={{color: '#888'}}>Тут буде таймер...</p>
              <div style={{display: 'flex', gap: '10px', marginTop: '30px'}}>
                 <button style={{...styles.button, backgroundColor: '#ff6b6b'}}>Пропустити</button>
                 <button style={{...styles.button, backgroundColor: '#4ecdc4'}}>Вгадав</button>
              </div>
            </div>
          )}
        </div>

        {/* ПРАВА КОЛОНКА */}
        <div style={{...styles.teamBox, borderColor: '#4ecdc4'}}>
          <h3 style={{color: '#4ecdc4'}}>🔵 Синие ({teams.team2.length})</h3>
          <div style={{textAlign: 'left', margin: '20px'}}>
            {teams.team2.map(p => <div key={p.id} style={{padding:'5px'}}>🤠 {p.name}</div>)}
          </div>
          {gameStatus === 'lobby' && (
             <button style={{...styles.joinBtn, backgroundColor: '#4ecdc4'}} onClick={() => joinTeam(2)}>
               Вступить
             </button>
          )}
        </div>

      </div>
    </div>
  )
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<StartPage />} />
      <Route path="/game/:roomId" element={<GamePage />} />
    </Routes>
  )
}

export default App