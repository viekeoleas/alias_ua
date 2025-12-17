const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const cors = require('cors');
const words = require('./words.json'); // <--- Імпортуємо слова

const app = express();
app.use(cors());
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

// --- ХРАНИЛИЩЕ ДАННИХ ---
const rooms = {};

// Генератор ID кімнати
function generateRoomId() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 4; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

// --- ГОЛОВНА ЛОГІКА ---
io.on('connection', (socket) => { 
    console.log(`User connected: ${socket.id}`);

    // 1. СТВОРЕННЯ
    socket.on("create_room", () => {
        let roomId = generateRoomId();
        while (rooms[roomId]) {
            roomId = generateRoomId();
        }

        rooms[roomId] = {
            team1: [],
            team2: [],
            status: 'lobby',
            deck: [],      // Додав ініціалізацію пустих полів
            currentWord: null
        };

        socket.join(roomId);
        socket.emit("room_created", roomId);
        console.log(`Кімната створена: ${roomId}`);
    });

    // 2. ВХІД У КІМНАТУ
    socket.on("join_room", (roomId) => {
        if (rooms[roomId]) {
            socket.join(roomId);
            socket.emit("update_teams", rooms[roomId]);
            
            // Якщо гравець перепідключився під час гри — треба показати йому поточне слово!
            if (rooms[roomId].status === 'game' && rooms[roomId].currentWord) {
                 socket.emit("game_started", rooms[roomId].currentWord);
                 // Або окрему подію update_word, але game_started теж спрацює
            }
        }
    });

    // 3. СТАРТ ГРИ (ЦЕ ПРАВИЛЬНА ВЕРСІЯ)
    socket.on("request_start", ({roomId}) => {
        console.log(`Отримано запит старту для кімнати: ${roomId}`);
        const room = rooms[roomId];
        
        if (room) {
            room.status = 'game';
            
            // 1. Створюємо копію слів і перемішуємо їх
            // (Використовуємо JSON файл)
            room.deck = shuffleArray([...words]); 
            
            // 2. Беремо перше слово
            const firstWord = room.deck.pop();
            room.currentWord = firstWord; 

            console.log(`Кімната ${roomId} почала гру. Слово: ${firstWord}`);
            
            // 3. Відправляємо сигнал старту І саме слово
            io.to(roomId).emit("game_started", firstWord);
        }
    });

    // 4. ВСТУП У КОМАНДУ
    socket.on("join_team", ({ roomId, team, name }) => {
        const room = rooms[roomId];
        
        if (room) {
            // Чистимо старі записи гравця
            room.team1 = room.team1.filter(player => player.id !== socket.id);
            room.team2 = room.team2.filter(player => player.id !== socket.id);

            // Додаємо в нову
            const newPlayer = { id: socket.id, name: name };
            if (team === 1) room.team1.push(newPlayer);
            if (team === 2) room.team2.push(newPlayer);

            // Оновлюємо всіх
            io.to(roomId).emit("update_teams", room);
        }
    });

    // --- ТУТ БУВ ДУБЛІКАТ request_start, Я ЙОГО ВИДАЛИВ ---

    // 5. НАСТУПНЕ СЛОВО
    socket.on("next_word", ({roomId}) => {
        const room = rooms[roomId];
        
        // 1. Перевіряємо, чи йде гра і чи є слова
        if (room && room.status === 'game' && room.deck.length > 0) {
            
            // 2. Дістаємо слово
            const nextWord = room.deck.pop();
            room.currentWord = nextWord;

            console.log(`Наступне слово у кімнаті ${roomId}: ${nextWord}`);

            // 3. Відправляємо нове слово ВСІМ
            io.to(roomId).emit("update_word", nextWord);
        
        } else if (room && room.deck.length === 0) {
            // Якщо слів більше немає
            io.to(roomId).emit("game_over");
        }
    });

   socket.on('disconnect', () => {
        for (const roomId in rooms) {
            const room = rooms[roomId];
            
            // Якщо кімната вже порожня або не існує - пропускаємо
            if (!room) continue;

            const wasInTeam1 = room.team1.find(p => p.id === socket.id);
            const wasInTeam2 = room.team2.find(p => p.id === socket.id);
            
            // Якщо гравець був у цій кімнаті
            if (wasInTeam1 || wasInTeam2) {
                // Видаляємо гравця
                room.team1 = room.team1.filter(p => p.id !== socket.id);
                room.team2 = room.team2.filter(p => p.id !== socket.id);
                
                // Сповіщаємо тих, хто залишився (якщо такі є)
                io.to(roomId).emit("update_teams", room);

                // --- ОПТИМІЗАЦІЯ (GC - Garbage Collection) ---
                // Перевіряємо, чи залишився хоч хтось живий
                const totalPlayers = room.team1.length + room.team2.length;
                
                if (totalPlayers === 0) {
                    console.log(`🗑️ Кімната ${roomId} порожня. Видаляємо з пам'яті.`);
                    delete rooms[roomId]; // <--- ЗВІЛЬНЯЄМО ПАМ'ЯТЬ
                }
                // --------------------------------------------
            }
        }
        console.log('User disconnected');
    });

});

server.listen(3001, () => {
    console.log('SERVER STARTED ON 3001');
});