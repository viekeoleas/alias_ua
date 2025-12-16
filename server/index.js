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

// --- НАШ СЛОВНИК ---
const words = ["Яблуко", "Сонце", "Комп'ютер", "Жираф", "Олівець", "Київ", "Футбол"];

io.on('connection', (socket) => {
    console.log(`Гравець підключився: ${socket.id}`);

    socket.on("join_room", (room) => {
        socket.join(room);
        console.log(`Гравець ${socket.id} зайшов у кімнату: ${room}`);
    });

    // --- НОВЕ: Команда "Почати гру" ---
    socket.on("start_game", (room) => {
        // 1. Вибираємо випадкове слово
        const randomWord = words[Math.floor(Math.random() * words.length)];
        
        // 2. Відправляємо подію "receive_word" ТІЛЬКИ в цю кімнату (.to(room))
        io.to(room).emit("receive_word", randomWord);
        
        console.log(`У кімнаті ${room} випало слово: ${randomWord}`);
    });

    socket.on('disconnect', () => {
        console.log('Гравець пішов');
    });
});

server.listen(3001, () => {
    console.log('СЕРВЕР ЗАПУЩЕНО на 3001');
});