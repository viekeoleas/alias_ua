// ================= НАЛАШТУВАННЯ СЕРВЕРА =================

// Підключаємо необхідні бібліотеки
const express = require('express'); // Фреймворк для веб-сервера
const http = require('http');       // Стандартний модуль Node.js для HTTP (потрібен для Socket.io)
const { Server } = require("socket.io"); // Бібліотека для веб-сокетів (real-time зв'язок)
const cors = require('cors');       // Дозволяє запити з інших доменів (наприклад, з твого React на localhost:3000)

const app = express();
app.use(cors()); // Дозволяємо всім стукатись на сервер

// Створюємо HTTP сервер на базі Express
const server = http.createServer(app);

// Налаштовуємо Socket.io
const io = new Server(server, {
    cors: { 
        origin: "*", // Дозволяємо підключення з будь-якого сайту/порту
        methods: ["GET", "POST"] 
    }
});

// ================= ГЛОБАЛЬНІ ЗМІННІ ТА ХЕЛПЕРИ =================

const ROUND_TIME = 60; // Тривалість раунду в секундах

// "База даних" у пам'яті. 
// Ключ - ID кімнати (напр. 'X7A1'), Значення - об'єкт з даними гри.
// УВАГА: При перезавантаженні сервера всі кімнати зникнуть.
const rooms = {};

// Генерує випадковий код кімнати з 4 символів (напр. "A1B2")
function generateRoomId() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 4; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

// Алгоритм перемішування масиву (Fisher-Yates shuffle)
// Використовується, щоб слова випадали у випадковому порядку
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

// --- ФУНКЦІЯ ОЧИЩЕННЯ + ВИЗНАЧЕННЯ НАСТУПНОГО ГРАВЦЯ ---
function getSafeRoom(room) {
    // 1. Прибираємо секретні поля
    const { deleteTimeout, timer, deck, ...safeData } = room;

    // 2. Визначаємо, хто має пояснювати наступним (поки ми в Лобі)
    let nextExplainerId = null;
    
    const currentTeamArray = room.currentTeam === 1 ? room.team1 : room.team2;
    // Беремо індекс, але перевіряємо, щоб він не вилетів за межі масиву
    // (на випадок, якщо гравці виходили/заходили)
    let idx = room.currentTeam === 1 ? room.team1Index : room.team2Index;
    
    if (currentTeamArray.length > 0) {
        // Захист від виходу за межі масиву (безпечний індекс)
        const safeIndex = idx % currentTeamArray.length; 
        const player = currentTeamArray[safeIndex];
        if (player) {
            nextExplainerId = player.id;
        }
    }

    // 3. Додаємо це ID до даних, що йдуть на клієнт
    return { ...safeData, nextExplainerId };
}

// ================= ОСНОВНА ЛОГІКА SOCKET.IO =================

// Ця функція спрацьовує КОЖНОГО разу, коли хтось відкриває сторінку і підключається
io.on('connection', (socket) => { 
    console.log(`User connected: ${socket.id}`); // socket.id - унікальний ID підключення (змінюється при оновленні сторінки)

    // --- 1. СТВОРЕННЯ КІМНАТИ ---
    socket.on("create_room", () => {
        let roomId = generateRoomId();
        // Перевірка на колізії: якщо такий ID вже є, генеруємо новий
        while (rooms[roomId]) {
            roomId = generateRoomId();
        }

        // Ініціалізація стану нової гри
        rooms[roomId] = {
            team1: [],          // Гравці команди 1
            team2: [], // Гравці команди 2
            spectators: []         ,
            score: { 1: 0, 2: 0 }, // Загальний рахунок гри
            roundScore: 0,      // Рахунок поточного раунду
            roundHistory: [],   // Історія слів за раунд (для екрану Review)
            currentTeam: 1,       
            team1Index: 0, // Хто зараз пояснює в команді 1 (індекс масиву)
            team2Index: 0, // Хто зараз пояснює в команді 2
            activePlayerId: null, // ID сокета, який зараз бачить кнопки   // Хто зараз ходить
            status: 'lobby',    // Статуси: 'lobby', 'game', 'review'
            deck: [],           // Колода слів для поточної гри
            currentWord: null,  // Слово, яке зараз на екрані
            timer: null,        // Технічна змінна для setInterval
            timeLeft: ROUND_TIME, // Час, що залишився
            deleteTimeout: null // Таймер для видалення кімнати, якщо всі вийшли
        };

        socket.join(roomId); // Підписуємо цей сокет на події цієї кімнати
        socket.emit("room_created", roomId); // Кажемо клієнту: "Готово, ось твій ID"
    });

  // 2. ВХІД У КІМНАТУ (БЕЗ РОЗМНОЖЕННЯ СПЕКТАТОРІВ)
    socket.on("join_room", ({ roomId, name }) => {
        const room = rooms[roomId];
        if (room) {
            if (room.deleteTimeout) {
                clearTimeout(room.deleteTimeout);
                room.deleteTimeout = null;
            }

            socket.join(roomId);
            
            const safeName = name ? name.trim() : "Анонім";
            
            // Перевіряємо, чи є гравець у командах
            // (Використовуємо find, щоб знайти саме за іменем, якщо ID змінився)
            const inTeam1 = room.team1.find(p => p.name === safeName);
            const inTeam2 = room.team2.find(p => p.name === safeName);

            // Якщо гравця немає в командах — працюємо зі списком глядачів
            if (!inTeam1 && !inTeam2) {
                // Шукаємо, чи є вже такий глядач за ІМЕНЕМ
                const existingSpec = room.spectators.find(p => p.name === safeName);
                
                if (existingSpec) {
                    // Якщо є — просто оновлюємо його ID (це той самий юзер після F5)
                    existingSpec.id = socket.id;
                } else {
                    // Якщо немає — додаємо нового
                    room.spectators.push({ id: socket.id, name: safeName });
                }
            }

            // Оновлюємо всіх
            io.to(roomId).emit("update_teams", getSafeRoom(room)); 
            
           const liveScore = { ...room.score };
            if (room.status === 'game') {
                // Додаємо зароблені за цей раунд бали до поточної команди
                liveScore[room.currentTeam] += room.roundScore;
            }
            socket.emit("update_score", liveScore);
            
            if (room.status === 'game') {
                 // Важливо: відправляємо слово, навіть якщо ID змінився (клієнт розбереться)
                 if (room.currentWord) socket.emit("game_started", { word: room.currentWord, explainerId: room.activePlayerId });
                 socket.emit("timer_update", room.timeLeft);
            }
            if (room.status === 'review') {
                socket.emit("round_ended", room.roundHistory);
            }
        }
    });
   // 3. СТАРТ РАУНДУ (З ВИБОРОМ ГРАВЦЯ)
    socket.on("request_start", ({roomId}) => {
        const room = rooms[roomId];
        if (room) {
            // Перевірка: чи є взагалі гравці в активній команді?
            const currentTeamArray = room.currentTeam === 1 ? room.team1 : room.team2;
            if (currentTeamArray.length === 0) return; // Не можна почати без гравців

            if (room.timer) clearInterval(room.timer);
            
            // --- ВИБІР ПОЯСНЮВАЧА ---
            // Беремо індекс для поточної команди
            let playerIndex = room.currentTeam === 1 ? room.team1Index : room.team2Index;
            
            // Захист: якщо гравців стало менше, ніж індекс (хтось вийшов), скидаємо на 0
            if (playerIndex >= currentTeamArray.length) {
                playerIndex = 0;
                if (room.currentTeam === 1) room.team1Index = 0;
                else room.team2Index = 0;
            }

            const explainer = currentTeamArray[playerIndex];
            room.activePlayerId = explainer.id; // <--- Запам'ятовуємо ID головного
            
            console.log(`Раунд почав: ${explainer.name} (Команда ${room.currentTeam})`);
            // -------------------------

            room.status = 'game';
            room.roundHistory = []; 
            room.roundScore = 0;    
            
            // (Тут твоя логіка слів...)
            const wordsList = ["Київ", "Яблуко", "Зеленський", "Код", "Машина", "Сонце", "Кава", "Кіт", "Інтернет", "Реактор", "Борщ", "Сало", "Мрія", "Дніпро"]; 
            room.deck = shuffleArray([...wordsList]); 
            
            const firstWord = room.deck.pop();
            room.currentWord = firstWord; 
            room.timeLeft = ROUND_TIME;

            // Відправляємо старт + ID того, хто пояснює
            io.to(roomId).emit("game_started", { word: firstWord, explainerId: room.activePlayerId });
            io.to(roomId).emit("timer_update", room.timeLeft);

            room.timer = setInterval(() => {
                room.timeLeft--; 
                io.to(roomId).emit("timer_update", room.timeLeft);

                if (room.timeLeft <= 0) {
                    clearInterval(room.timer);
                    room.status = 'review';
                    if (room.currentWord) {
                        room.roundHistory.push({ word: room.currentWord, status: 'none' });
                    }
                    io.to(roomId).emit("round_ended", room.roundHistory);
                }
            }, 1000);
        }
    });

    // --- 4. ОБРОБКА СЛІВ (Вгадав / Пропустив) ---
    socket.on("next_word", ({roomId, action}) => {
        const room = rooms[roomId];
        // Приймаємо команди тільки якщо йде гра
        if (room && room.status === 'game') {
            // Записуємо результат попереднього слова
            room.roundHistory.push({ word: room.currentWord, status: action });
            
            // Оновлюємо тимчасовий рахунок раунду
            if (action === 'guessed') room.roundScore++;
            if (action === 'skipped') room.roundScore--;

            // Рахуємо "живий" рахунок, щоб показувати динаміку, але ще не записуємо його "навічно"
            const liveScore = { ...room.score };
            liveScore[room.currentTeam] += room.roundScore;
            io.to(roomId).emit("update_score", liveScore);

            // Якщо слова ще є
            if (room.deck.length > 0) {
                const nextWord = room.deck.pop();
                room.currentWord = nextWord;
                io.to(roomId).emit("update_word", nextWord);
            } else {
                // Якщо слова закінчились раніше часу - кінець раунду
                clearInterval(room.timer);
                room.status = 'review';
                io.to(roomId).emit("round_ended", room.roundHistory);
            }
        }
    });

    // --- НОВОЕ: ЖИВОЕ РЕДАКТИРОВАНИЕ ---
    socket.on("change_word_status", ({roomId, index}) => {
        const room = rooms[roomId];
        if (room && room.status === 'review') {
            const item = room.roundHistory[index];
            if (!item) return;

            // Логика переключения (по кругу): guessed -> skipped -> none -> guessed
            if (item.status === 'guessed') item.status = 'skipped';
            else if (item.status === 'skipped') item.status = 'none';
            else item.status = 'guessed';

            // Отправляем обновленную историю ВСЕМ в комнате
            io.to(roomId).emit("review_update", room.roundHistory);
        }
    });

   // 5. ПІДТВЕРДЖЕННЯ (ЗМІНА ЧЕРГИ)
    socket.on("confirm_round_results", ({roomId, finalHistory}) => {
        const room = rooms[roomId];
        if (room) {
            // ... (твоя логіка підрахунку балів) ...
            let finalRoundPoints = 0;
            finalHistory.forEach(item => {
                if (item.status === 'guessed') finalRoundPoints += 1;
                if (item.status === 'skipped') finalRoundPoints -= 1;
            });
            room.score[room.currentTeam] += finalRoundPoints;

            // --- ЗСУВАЄМО ЧЕРГУ ГРАВЦІВ У КОМАНДІ, ЯКА ГРАЛА ---
            if (room.currentTeam === 1) {
                room.team1Index++; 
                // Якщо дійшли до кінця списку - починаємо з початку
                if (room.team1Index >= room.team1.length) room.team1Index = 0;
            } else {
                room.team2Index++;
                if (room.team2Index >= room.team2.length) room.team2Index = 0;
            }
            // ---------------------------------------------------

            // Міняємо команду
            room.currentTeam = room.currentTeam === 1 ? 2 : 1;
            room.status = 'lobby'; 
            io.to(roomId).emit("update_teams", getSafeRoom(room));
            io.to(roomId).emit("update_score", room.score);
            io.to(roomId).emit("results_confirmed");
        }
    });

   // 6. ПРИЄДНАННЯ ДО КОМАНДИ (З ВІДНОВЛЕННЯМ РОЛІ)
    socket.on("join_team", ({ roomId, team, name }) => {
        const room = rooms[roomId];
        if (room) {
            const safeName = name ? name.trim() : "";
            if (!safeName) return;

            // Видаляємо зі спектаторів (тепер надійно, за іменем)
            room.spectators = room.spectators.filter(p => p.name !== safeName);

            const targetTeam = Number(team);
            
            // Шукаємо індекси гравця в командах за іменем
            const idx1 = room.team1.findIndex(p => p.name === safeName);
            const idx2 = room.team2.findIndex(p => p.name === safeName);

            const newPlayer = { id: socket.id, name: safeName };

            // Функція для оновлення ID і відновлення прав ведучого
            const updatePlayerId = (playerObj) => {
                const oldId = playerObj.id; // Зберігаємо старий ID
                playerObj.id = socket.id;   // Ставимо новий

                // ЯКЩО ЦЕЙ ГРАВЕЦЬ БУВ АКТИВНИМ (ВЕДУЧИМ)
                if (room.activePlayerId === oldId) {
                    room.activePlayerId = socket.id; // Передаємо "мікрофон" новому сокету
                    // Повторно відправляємо подію старту гри саме цьому гравцю, щоб у нього з'явилися кнопки
                    if (room.status === 'game') {
                        socket.emit("game_started", { word: room.currentWord, explainerId: socket.id });
                    }
                }
                // ЯКЩО ВІН МАВ БУТИ НАСТУПНИМ
                if (room.nextExplainerId === oldId) {
                    room.nextExplainerId = socket.id;
                }
            };

            if (targetTeam === 1) {
                if (idx1 !== -1) {
                    // Гравець вже тут — оновлюємо ID
                    updatePlayerId(room.team1[idx1]);
                    // Переконуємось, що його немає в іншій команді
                    if (idx2 !== -1) room.team2.splice(idx2, 1);
                } else {
                    // Гравця немає — додаємо
                    if (idx2 !== -1) room.team2.splice(idx2, 1);
                    room.team1.push(newPlayer);
                }
            } else if (targetTeam === 2) {
                if (idx2 !== -1) {
                    updatePlayerId(room.team2[idx2]);
                    if (idx1 !== -1) room.team1.splice(idx1, 1);
                } else {
                    if (idx1 !== -1) room.team1.splice(idx1, 1);
                    room.team2.push(newPlayer);
                }
            }

            io.to(roomId).emit("update_teams", getSafeRoom(room));
        }
    });
    // --- 7. ВІДКЛЮЧЕННЯ (DISCONNECT) ---
    // Найскладніша частина через проблему "F5" (оновлення сторінки)
   // 7. ВІДКЛЮЧЕННЯ (DISCONNECT)
    socket.on('disconnect', () => {
        // Зберігаємо ID, щоб використати його всередині setTimeout
        // (хоча socket.id доступний через замикання, так надійніше)
        const disconnectedId = socket.id;

        setTimeout(() => {
            for (const roomId in rooms) {
                const room = rooms[roomId];
                if (!room) continue;

                // 1. --- НОВЕ: ВИДАЛЕННЯ СПЕКТАТОРА ---
                // Перевіряємо, чи був цей сокет у списку глядачів
                if (room.spectators) {
                    const isSpectator = room.spectators.find(p => p.id === disconnectedId);
                    
                    if (isSpectator) {
                        // Видаляємо його зі списку
                        room.spectators = room.spectators.filter(p => p.id !== disconnectedId);
                        
                        // Обов'язково повідомляємо клієнтів, щоб оновилась плашка зверху!
                        io.to(roomId).emit("update_teams", getSafeRoom(room));
                    }
                }
                // -------------------------------------

                // 2. --- ВИДАЛЕННЯ З КОМАНД (Твій старий код) ---
                const team1Ids = room.team1.map(p => p.id);
                const team2Ids = room.team2.map(p => p.id);
                const allPlayerIds = [...team1Ids, ...team2Ids];

                if (allPlayerIds.includes(disconnectedId)) {
                    room.team1 = room.team1.filter(p => p.id !== disconnectedId);
                    room.team2 = room.team2.filter(p => p.id !== disconnectedId);
                    // Оновлюємо списки для тих, хто залишився
                    io.to(roomId).emit("update_teams", getSafeRoom(room));
                }

                // 3. --- ВИДАЛЕННЯ ПОРОЖНЬОЇ КІМНАТИ ---
                // Тут можна додати перевірку: видаляти, тільки якщо немає ні гравців, НІ ГЛЯДАЧІВ.
                // Але поки залишимо як є (якщо немає гравців у командах — видаляємо).
                if (room.team1.length === 0 && room.team2.length === 0) {
                    if (room.timer) clearInterval(room.timer);
                    
                    if (!room.deleteTimeout) {
                        console.log(`⏳ Кімната ${roomId} порожня. Видалення через 30 сек...`);
                        room.deleteTimeout = setTimeout(() => {
                            // Перевіряємо ще раз перед видаленням
                            if (rooms[roomId] && rooms[roomId].team1.length === 0 && rooms[roomId].team2.length === 0) {
                                delete rooms[roomId];
                                console.log(`🗑️ Кімната ${roomId} остаточно видалена.`);
                            } else {
                                if(rooms[roomId]) rooms[roomId].deleteTimeout = null;
                            }
                        }, 30000);
                    }
                }
            }
        }, 5000); 
    });

});

// Запуск прослуховування порту
server.listen(3001, () => {
    console.log('SERVER STARTED ON 3001');
});