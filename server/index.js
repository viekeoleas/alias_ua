const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const cors = require('cors');

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

// --- ГОЛОВНА ЛОГІКА ---
io.on('connection', (socket) => { // <--- ВІДКРИВАЄТЬСЯ "КОРОБКА"
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
            status: 'lobby'
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
        }
    });

    // 3. ВСТУП У КОМАНДУ
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
    socket.on('start_game',({roomId}) => {
        const room = rooms[roomId];
        if(room){
            room.status = 'game';
            io.to(roomId).emit('game_started');
        }
    });


    socket.on('disconnect', () => {
        for (const roomId in rooms) {
            const room = rooms[roomId];
            const wasInTeam1 = room.team1.find(p => p.id === socket.id);
            const wasInTeam2 = room.team2.find(p => p.id === socket.id);
            if (wasInTeam1 || wasInTeam2) {
                // Видаляємо його
                room.team1 = room.team1.filter(p => p.id !== socket.id);
                room.team2 = room.team2.filter(p => p.id !== socket.id);
                
                // Сповіщаємо тих, хто залишився
                io.to(roomId).emit("update_teams", room);
            }
        }
        console.log('User disconnected');
    });

}); // <--- ОСЬ ТУТ ЗАКРИВАЄТЬСЯ "КОРОБКА" (В самому кінці!)

server.listen(3001, () => {
    console.log('SERVER STARTED ON 3001');
});