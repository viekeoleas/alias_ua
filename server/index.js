// ================= НАЛАШТУВАННЯ СЕРВЕРА =================

// Підключаємо необхідні бібліотеки
const express = require('express'); // Фреймворк для веб-сервера
const http = require('http');       // Стандартний модуль Node.js для HTTP (потрібен для Socket.io)
const { Server } = require("socket.io"); // Бібліотека для веб-сокетів (real-time зв'язок)
const cors = require('cors');       // Дозволяє запити з інших доменів (наприклад, з твого React на localhost:3000)
const { WORD_PACKS } = require('./words');

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
    const { deleteTimeout, timer, deck, ...safeData } = room;
    // ... (твоя стара логіка currentTeamArray) ...
    
    // (Код про nextExplainerId залишається той самий)
    let nextExplainerId = null;
    const currentTeamArray = room.currentTeam === 1 ? room.team1 : room.team2;
    let idx = room.currentTeam === 1 ? room.team1Index : room.team2Index;
    
    if (currentTeamArray.length > 0) {
        const safeIndex = idx % currentTeamArray.length; 
        const player = currentTeamArray[safeIndex];
        if (player) nextExplainerId = player.id;
    }

    return { ...safeData, nextExplainerId }; // Тепер сюди автоматично потраплять hostId і settings
}

// ================= ОСНОВНА ЛОГІКА SOCKET.IO =================

// Ця функція спрацьовує КОЖНОГО разу, коли хтось відкриває сторінку і підключається
io.on('connection', (socket) => { 
    console.log(`User connected: ${socket.id}`); // socket.id - унікальний ID підключення (змінюється при оновленні сторінки)

    // 1. СТВОРЕННЯ КІМНАТИ
    // 1. СТВОРЕННЯ КІМНАТИ
    socket.on("create_room", () => {
        let roomId = generateRoomId();
        while (rooms[roomId]) {
            roomId = generateRoomId();
        }

        rooms[roomId] = {
            hostId: socket.id, // <--- 👑 ЗАПАМ'ЯТОВУЄМО ХОСТА
            isLocked: false,
            settings: {        // <--- ⚙️ НАЛАШТУВАННЯ
                roundTime: 60,
                winScore: 30,
                difficulty: 'normal'
            },
            team1: [],
            team2: [],
            spectators: [],
            score: { 1: 0, 2: 0 },
            roundScore: 0,
            roundHistory: [],
            currentTeam: 1,
            team1Index: 0,
            team2Index: 0,
            activePlayerId: null,
            status: 'lobby',
            deck: [],
            currentWord: null,
            timer: null,
            timeLeft: 60, // Початкове значення
            deleteTimeout: null
        };

        socket.join(roomId);
        socket.emit("room_created", roomId);
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
            socket.emit("update_live_history", room.roundHistory);
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
   // --- 7. ПОЧАТОК РАУНДУ (ВИПРАВЛЕНО) ---
    socket.on("request_start", ({ roomId }) => {
        const room = rooms[roomId];
        
        if (room) {
            // 1. 👇 ОБЧИСЛЮЄМО, ХТО ЗАРАЗ МАЄ БУТИ ВЕДУЧИМ 👇
            const currentTeamArray = room.currentTeam === 1 ? room.team1 : room.team2;
            if (currentTeamArray.length === 0) return; // Нікого немає

            let playerIndex = room.currentTeam === 1 ? room.team1Index : room.team2Index;
            // Страховка від виходу за межі масиву
            if (playerIndex >= currentTeamArray.length) playerIndex = 0;

            const targetPlayer = currentTeamArray[playerIndex];

            // 2. 👇 ПЕРЕВІРКА ПРАВ 👇
            // Дозволяємо почати, якщо ти ХОСТ або ти ТОЙ САМИЙ ГРАВЕЦЬ
            if (socket.id === room.hostId || socket.id === targetPlayer.id) {
                
                if (room.timer) clearInterval(room.timer);

                // Призначаємо активного гравця
                room.activePlayerId = targetPlayer.id;
                
                // Статус
                room.status = 'game';
                room.isLocked = true;
                room.roundHistory = []; 
                room.roundScore = 0;    
                
                // Логіка колоди (без змін)
                if (!room.deck || room.deck.length === 0) {
                     try {
                        const difficulty = (room.settings && room.settings.difficulty) ? room.settings.difficulty : 'normal';
                        // @ts-ignore
                        const pack = (WORD_PACKS && WORD_PACKS[difficulty]) ? WORD_PACKS[difficulty] : ["Error"];
                        room.deck = shuffleArray([...pack]);
                    } catch (e) { room.deck = ["Error"]; }
                }
                
                const firstWord = room.deck.pop();
                room.currentWord = firstWord; 
                room.timeLeft = room.settings.roundTime; 

                // Оновлюємо всіх
                io.to(roomId).emit("update_teams", getSafeRoom(room));
                io.to(roomId).emit("game_started", { word: firstWord, explainerId: room.activePlayerId });
                io.to(roomId).emit("timer_update", room.timeLeft);
                // Очищаємо живу історію для всіх
                io.to(roomId).emit("update_live_history", []);

                // Таймер
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
        }
    });

// --- ЗМІНА НАЛАШТУВАНЬ ---
    socket.on("update_settings", ({ roomId, key, value }) => {
        const room = rooms[roomId];
        
        // Перевіряємо: кімната існує І запит від хоста
        if (room && socket.id === room.hostId) {
            
            // 1. Оновлюємо саме те налаштування, яке прийшло
            room.settings[key] = value;

            // 2. СПЕЦІАЛЬНА ЛОГІКА: Якщо змінили складність
            if (key === 'difficulty') {
                room.deck = []; // ❗ Очищаємо колоду, щоб наступного разу завантажився новий пак слів
                console.log(`Room ${roomId}: Difficulty changed to ${value}, deck cleared.`);
            }

            // 3. СПЕЦІАЛЬНА ЛОГІКА: Якщо змінили час раунду в лобі
            if (key === 'roundTime' && room.status === 'lobby') {
                room.timeLeft = value;
                io.to(roomId).emit("timer_update", room.timeLeft);
            }

            // 4. Відправляємо оновлення всім
            io.to(roomId).emit("update_teams", getSafeRoom(room));
        }
    });
    // --- 4. ОБРОБКА СЛІВ (Вгадав / Пропустив) ---
    socket.on("next_word", ({roomId, action}) => {
        const room = rooms[roomId];
        if (room && room.status === 'game') {
            room.roundHistory.push({ word: room.currentWord, status: action });
            
            if (action === 'guessed') room.roundScore++;
            if (action === 'skipped') room.roundScore--;

            const liveScore = { ...room.score };
            liveScore[room.currentTeam] += room.roundScore;
            io.to(roomId).emit("update_score", liveScore);
            
            // 👇 НОВЕ: ВІДПРАВЛЯЄМО ЖИВУ ІСТОРІЮ ВСІМ 👇
            io.to(roomId).emit("update_live_history", room.roundHistory);
            // 👆 ---------------------------------------

            if (room.deck.length > 0) {
                const nextWord = room.deck.pop();
                room.currentWord = nextWord;
                io.to(roomId).emit("update_word", nextWord);
            } else {
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

   // 6. ПРИЄДНАННЯ ДО КОМАНДИ (З ВІДНОВЛЕННЯМ РОЛІ ПІСЛЯ F5)
    socket.on("join_team", ({ roomId, team, name }) => {
        const room = rooms[roomId];
        if (room) {
            const safeName = name ? name.trim() : "";
            if (!safeName) return;

            // 1. 👇 ПЕРЕВІРЯЄМО, ЧИ ГРАВЕЦЬ ВЖЕ Є В КОМАНДАХ (За іменем)
            // Це ключовий момент для F5. Ми шукаємо себе в списках.
            const inTeam1 = room.team1.find(p => p.name === safeName);
            const inTeam2 = room.team2.find(p => p.name === safeName);
            const isReconnecting = inTeam1 || inTeam2;

            // 2. 👇 ПЕРЕВІРКА ЗАМКА 🔒
            // Логіка: Якщо кімната закрита І це НЕ старий гравець -> Блокуємо.
            // Якщо це реконнект (isReconnecting === true), то код піде далі.
            if (room.isLocked && !isReconnecting) {
                socket.emit("error_message", "Команди заблокированы хостом 🔒");
                return; 
            }

            // Видаляємо зі спектаторів
            room.spectators = room.spectators.filter(p => p.name !== safeName);

            const targetTeam = Number(team);
            const newPlayer = { id: socket.id, name: safeName };

            // Функція для оновлення ID і відновлення прав ведучого
            const updatePlayerId = (playerObj) => {
                const oldId = playerObj.id;
                playerObj.id = socket.id; // Оновлюємо старий ID на новий

                // ЯКЩО ЦЕ БУВ ХОСТ — ПЕРЕДАЄМО ПРАВА
                if (room.hostId === oldId) {
                    room.hostId = socket.id;
                }
                
                // ЯКЩО ЦЕЙ ГРАВЕЦЬ БУВ АКТИВНИМ (ВЕДУЧИМ)
                // Це критично для F5 під час пояснення!
                if (room.activePlayerId === oldId) {
                    room.activePlayerId = socket.id; // Передаємо "мікрофон"
                    
                    // 👇 ВІДНОВЛЮЄМО ЕКРАН ГРИ 👇
                    if (room.status === 'game') {
                        // Відправляємо слово і права ведучого знову
                        socket.emit("game_started", { word: room.currentWord, explainerId: socket.id });
                        // Відновлюємо список історії, щоб він бачив, що вже відгадав
                        socket.emit("update_live_history", room.roundHistory);
                    }
                }
                
                // ЯКЩО ВІН МАВ БУТИ НАСТУПНИМ
                if (room.nextExplainerId === oldId) {
                    room.nextExplainerId = socket.id;
                }
            };

            // Логіка додавання/оновлення у списках
            if (targetTeam === 1) {
                if (inTeam1) {
                    // Гравець вже тут — просто оновлюємо ID (Re-connect)
                    updatePlayerId(inTeam1); 
                } else {
                    // Новий вхід
                    if (inTeam2) room.team2 = room.team2.filter(p => p.name !== safeName); // Видаляємо з іншої
                    room.team1.push(newPlayer);
                }
            } else if (targetTeam === 2) {
                if (inTeam2) {
                    // Гравець вже тут — просто оновлюємо ID (Re-connect)
                    updatePlayerId(inTeam2);
                } else {
                    // Новий вхід
                    if (inTeam1) room.team1 = room.team1.filter(p => p.name !== safeName);
                    room.team2.push(newPlayer);
                }
            }

            io.to(roomId).emit("update_teams", getSafeRoom(room));
        }
    });
// --- ПЕРЕХІД У ГЛЯДАЧІ ---
    socket.on("join_spectators", ({ roomId, name }) => {
        const room = rooms[roomId];
        if (room) {
            // 1. Перевірка замка
            if (room.isLocked) {
                socket.emit("error_message", "Лобі заблоковано хостом 🔒");
                return;
            }

            // 2. Видаляємо з команд
            room.team1 = room.team1.filter(p => p.id !== socket.id);
            room.team2 = room.team2.filter(p => p.id !== socket.id);
            
            // 3. Додаємо в глядачі (якщо ще не там)
            if (!room.spectators.find(p => p.id === socket.id)) {
                room.spectators.push({ id: socket.id, name });
            }

            // 4. Якщо пішов активний гравець або ведучий - скидаємо
            if (room.activePlayerId === socket.id) room.activePlayerId = null;
            if (room.nextExplainerId === socket.id) room.nextExplainerId = null;

            io.to(roomId).emit("update_teams", getSafeRoom(room));
        }
    });

   // --- ПІДТВЕРДЖЕННЯ РЕЗУЛЬТАТІВ ТА ЗМІНА ЧЕРГИ ---
    socket.on("confirm_results", ({ roomId }) => {
        const room = rooms[roomId];
       if (room && (socket.id === room.hostId || socket.id === room.activePlayerId)) {
            
            // 1. Рахуємо бали
            const roundPoints = room.roundHistory.reduce((acc, item) => {
                if (item.status === 'guessed') return acc + 1;
                if (item.status === 'skipped') return acc - 1;
                return acc;
            }, 0);
            room.score[room.currentTeam] += roundPoints;

            // 2. 👇 РОЗУМНА ЗМІНА ГРАВЦЯ В СЕРЕДИНІ КОМАНДИ 👇
            // Спочатку зсуваємо індекс у тій команді, яка щойно грала
            if (room.currentTeam === 1) {
                if (room.team1.length > 0) {
                    room.team1Index = (room.team1Index + 1) % room.team1.length;
                }
            } else {
                if (room.team2.length > 0) {
                    room.team2Index = (room.team2Index + 1) % room.team2.length;
                }
            }

            // 3. 👇 РОЗУМНА ЗМІНА КОМАНДИ 👇
            // Чи є живі люди в командах?
            const team1HasPlayers = room.team1.length > 0;
            const team2HasPlayers = room.team2.length > 0;

            if (room.currentTeam === 1) {
                // Якщо ми були 1, то йдемо до 2, ТІЛЬКИ якщо там хтось є
                if (team2HasPlayers) {
                    room.currentTeam = 2;
                } else {
                    // Якщо в 2 нікого немає, залишаємось у 1 (граємо самі з собою по черзі)
                    console.log(`Room ${roomId}: Team 2 is empty, staying on Team 1`);
                }
            } else {
                // Якщо ми були 2, йдемо до 1 (якщо там хтось є)
                if (team1HasPlayers) {
                    room.currentTeam = 1;
                } else {
                    console.log(`Room ${roomId}: Team 1 is empty, staying on Team 2`);
                }
            }

            // 4. Перевірка перемоги
            const target = room.settings.winScore;
            if (room.score[1] >= target || room.score[2] >= target) {
                room.status = 'victory';
                if (room.score[1] > room.score[2]) room.winner = 1;
                else if (room.score[2] > room.score[1]) room.winner = 2;
                else room.winner = 'draw';
            } else {
                room.status = 'lobby';
            }

            // Очищення
            room.roundHistory = [];
            room.roundScore = 0;
            room.timer = null;
            room.activePlayerId = null; // Скидаємо активного, бо зараз лобі

            io.to(roomId).emit("update_teams", getSafeRoom(room));
        }
    });

    // --- РЕСТАРТ ГРИ (Нова гра) ---
    socket.on("restart_game", ({ roomId }) => {
        const room = rooms[roomId];
        if (room && socket.id === room.hostId) {
            if (room.timer) clearInterval(room.timer);
            room.score = { 1: 0, 2: 0 }; // Скидаємо рахунок
            room.status = 'lobby';       // Повертаємо в лобі
            room.currentTeam = 1;        // Починають знову перші (або рандом, як хочеш)
            room.winner = null;
            
            // 👇 МИ ПРИБРАЛИ ПЕРЕМІШУВАННЯ КОЛОДИ 👇
            // room.deck = ... (цього тут не треба)
            // Тепер гра продовжиться тими словами, які залишилися в колоді
            
            // Скидаємо ролі, щоб не було глюків
            room.activePlayerId = null;
            room.nextExplainerId = null;

            io.to(roomId).emit("update_teams", getSafeRoom(room));
        }
    });

  // --- ПЕРЕМІШУВАННЯ ГРАВЦІВ (SHUFFLE) ---
    socket.on("shuffle_teams", ({ roomId }) => {
        const room = rooms[roomId];
        
        // Перевіряємо: Хост + Замок ВІДКРИТИЙ
        if (room && socket.id === room.hostId && !room.isLocked) {
            
            // 1. Збираємо всіх активних гравців
            const allPlayers = [...room.team1, ...room.team2];
            
            // Якщо гравців менше 2, немає сенсу мішати
            if (allPlayers.length < 2) return;

            // 2. Перемішуємо масив
            const shuffled = shuffleArray(allPlayers);
            
            // 3. Ділимо навпіл
            const half = Math.ceil(shuffled.length / 2);
            room.team1 = shuffled.slice(0, half);
            room.team2 = shuffled.slice(half);
            
            // 4. Скидаємо ролі ведучих (черга обнуляється)
            room.team1Index = 0;
            room.team2Index = 0;
            room.activePlayerId = null;
            room.nextExplainerId = null; // Ніхто не пояснює, треба чекати старту

            // 5. Відправляємо всім оновлені списки
            io.to(roomId).emit("update_teams", getSafeRoom(room));
        }
    });
    // --- 👑 АДМІНСЬКІ ФУНКЦІЇ (ВІДНОВЛЕНО) ---

    // 1. ПЕРЕДАЧА ХОСТА
    socket.on("transfer_host", ({ roomId, targetId }) => {
        const room = rooms[roomId];
        // Проверяем, что это делает текущий хост
        if (room && socket.id === room.hostId) {
            room.hostId = targetId;
            io.to(roomId).emit("update_teams", getSafeRoom(room));
        }
    });

    // 2. КІК ГРАВЦЯ
    socket.on("kick_player", ({ roomId, targetId }) => {
        const room = rooms[roomId];
        if (room && socket.id === room.hostId) {
            // Сообщаем игроку, что его выгнали (чтобы клиент среагировал)
            io.to(targetId).emit("kicked");
            
            // Удаляем отовсюду
            if (room.spectators) room.spectators = room.spectators.filter(p => p.id !== targetId);
            room.team1 = room.team1.filter(p => p.id !== targetId);
            room.team2 = room.team2.filter(p => p.id !== targetId);
            
            // Если кикнули того, кто сейчас объясняет — сбрасываем роль
            if (room.activePlayerId === targetId) room.activePlayerId = null;

            // Обновляем всех оставшихся
            io.to(roomId).emit("update_teams", getSafeRoom(room));
        }
    });

    // 3. БЛОКУВАННЯ КОМАНД (ЗАМОЧОК)
    socket.on("toggle_lock", ({ roomId }) => {
        const room = rooms[roomId];
        if (room && socket.id === room.hostId) {
            room.isLocked = !room.isLocked; // Переключаем true/false
            
            console.log(`Room ${roomId} locked: ${room.isLocked}`); // Лог для проверки
            io.to(roomId).emit("update_teams", getSafeRoom(room));
        }
    });
// --- ⏸️ ПАУЗА ГРИ ---
    socket.on("toggle_pause", ({ roomId }) => {
        const room = rooms[roomId];
        if (room && socket.id === room.hostId) {
            
            if (room.status === 'game') {
                // СТАВИМО НА ПАУЗУ
                if (room.timer) clearInterval(room.timer); // Зупиняємо годинник
                room.status = 'paused';
                io.to(roomId).emit("update_teams", getSafeRoom(room));
                
            } else if (room.status === 'paused') {
                // ЗНІМАЄМО З ПАУЗИ
                room.status = 'game';
                io.to(roomId).emit("update_teams", getSafeRoom(room));

                // Запускаємо таймер знову
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