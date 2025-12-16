import { useState, useEffect } from 'react'
import io from 'socket.io-client'

const socket = io.connect("http://localhost:3001")

function App() {
  const [room, setRoom] = useState("");
  const [showGame, setShowGame] = useState(false);
  
  // НОВЕ: Тут ми будемо зберігати слово, яке прийде від сервера
  const [word, setWord] = useState(""); 

  const joinRoom = () => {
    if (room !== "") {
      socket.emit("join_room", room);
      setShowGame(true);
    }
  };

  // НОВЕ: Функція запуску гри
  const startGame = () => {
    socket.emit("start_game", room);
  };

  useEffect(() => {
    // Слухаємо команду від сервера "Отримай слово"
    socket.on("receive_word", (data) => {
      setWord(data); // Записуємо слово в пам'ять, щоб React його намалював
    });
  }, [socket]);

  return (
    <div style={{
      height: '100vh', width: '100vw', display: 'flex', flexDirection: 'column',
      justifyContent: 'center', alignItems: 'center', backgroundColor: '#242424',
      color: 'white', fontFamily: 'Arial, sans-serif'
    }}>
      
      {!showGame ? (
        // ЕКРАН ВХОДУ
        <div style={{ textAlign: 'center' }}>
          <h1>Alias Game 🎲</h1>
          <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
            <input 
              placeholder="Номер кімнати..." 
              style={{ padding: '10px', fontSize: '16px', borderRadius: '5px' }}
              onChange={(event) => setRoom(event.target.value)}
            />
            <button onClick={joinRoom} style={{ padding: '10px 20px', fontSize: '16px', cursor: 'pointer' }}>
              Зайти
            </button>
          </div>
        </div>
      ) : (
        // ЕКРАН ГРИ
        <div style={{ textAlign: 'center' }}>
          <h2>Кімната: {room}</h2>
          
          {/* Тут умова: Якщо слова ще немає (word == "") -> показуємо кнопку "Почати".
              Якщо слово вже є -> показуємо саме Слово великим шрифтом.
          */}
          
          {word === "" ? (
            <button 
              onClick={startGame}
              style={{ padding: '20px 40px', fontSize: '24px', backgroundColor: '#4CAF50', color: 'white', border: 'none', borderRadius: '10px', cursor: 'pointer' }}
            >
              ПОЧАТИ ГРУ 🚀
            </button>
          ) : (
            <div style={{ marginTop: '20px' }}>
                <p style={{ fontSize: '20px', color: '#888' }}>Твоє слово:</p>
                <h1 style={{ fontSize: '60px', margin: '10px 0', color: '#ffd700' }}>
                    {word}
                </h1>
                <button 
                    onClick={startGame} // Тиснемо ще раз -> отримуємо нове слово
                    style={{ marginTop: '30px', padding: '10px 20px', cursor: 'pointer' }}
                >
                    Наступне слово
                </button>
            </div>
          )}

        </div>
      )}
    </div>
  )
}

export default App