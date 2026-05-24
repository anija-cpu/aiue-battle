const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

const rooms = {};

io.on("connection", (socket) => {
    console.log("connected:", socket.id);

    // =====================
    // ルーム作成
    // =====================
    socket.on("createRoom", (roomId, playerName) => {
        if (!roomId) return;
        if (!rooms[roomId]) {
            rooms[roomId] = {
                players: [],
                playerNames: {},
                answers: {},
                hits: {},
                started: false,
                theme: null,
                themeSelected: false,
                turnOrder: [],
                currentTurnIndex: 0,
                eliminated: [],
                rematchVotes: []
            };
        }
        socket.join(roomId);
        socket.roomId = roomId;
        rooms[roomId].players.push(socket.id);
        rooms[roomId].playerNames[socket.id] = playerName || "プレイヤー1";
        socket.emit("roomCreated", roomId);
        io.to(roomId).emit("roomInfo", {
            players: rooms[roomId].players,
            playerNames: rooms[roomId].playerNames
        });
    });

    // =====================
    // ルーム参加
    // =====================
    socket.on("joinRoom", (roomId, playerName) => {
        const room = rooms[roomId];
        if (!room) { socket.emit("errorMessage", "部屋が存在しません"); return; }
        if (room.players.length >= 8) { socket.emit("errorMessage", "部屋が満員です"); return; }
        if (room.started) { socket.emit("errorMessage", "ゲームはすでに開始されています"); return; }
        socket.join(roomId);
        socket.roomId = roomId;
        room.players.push(socket.id);
        room.playerNames[socket.id] = playerName || "プレイヤー";
        socket.emit("joinedRoom", roomId);
        io.to(roomId).emit("roomInfo", {
            players: room.players,
            playerNames: room.playerNames
        });
    });

    // =====================
    // 観戦参加
    // =====================
    socket.on("watchRoom", (roomId, playerName) => {
        const room = rooms[roomId];
        if (!room) { socket.emit("errorMessage", "部屋が存在しません"); return; }
        socket.join(roomId);
        socket.roomId = roomId;
        socket.isSpectator = true;
        socket.emit("joinedAsSpectator", {
            roomId,
            playerNames: room.playerNames,
            players: room.players,
            started: room.started,
            theme: room.theme
        });
    });

    // =====================
    // ゲーム開始（部屋主が押す）
    // =====================
    socket.on("startGame", () => {
        const room = rooms[socket.roomId];
        if (!room) return;
        if (room.players[0] !== socket.id) return; // 部屋主のみ
        if (room.players.length < 2) { socket.emit("errorMessage", "2人以上必要です"); return; }
        if (room.started) return;

        // ターン順をランダムに決定
        const shuffled = [...room.players].sort(() => Math.random() - 0.5);
        room.turnOrder = shuffled;
        room.currentTurnIndex = 0;
        room.themeSelected = false;

        io.to(socket.roomId).emit("ready", {
            turnOrder: room.turnOrder,
            playerNames: room.playerNames
        });
    });

    // =====================
    // お題選択
    // =====================
    socket.on("selectTheme", (theme) => {
        const room = rooms[socket.roomId];
        if (!room) return;
        if (room.themeSelected) return;
        room.themeSelected = true;
        room.theme = theme;
        io.to(socket.roomId).emit("themeDecided", { theme });
    });

    // =====================
    // 単語登録
    // =====================
    socket.on("setAnswer", (answerArray) => {
        const room = rooms[socket.roomId];
        if (!room) return;
        if (!Array.isArray(answerArray) || answerArray.length !== 7) return;

        room.answers[socket.id] = answerArray;
        room.hits[socket.id] = Array(7).fill(false);
        socket.emit("answerSaved");

        // 全員揃ったらゲーム開始
        const allSet = room.players.every(id => room.answers[id]);
        if (allSet) {
            room.started = true;
            room.eliminated = [];
            const firstTurn = room.turnOrder[0];

            room.players.forEach(id => {
                io.to(id).emit("gameStart", {
                    firstTurn,
                    turnOrder: room.turnOrder,
                    playerNames: room.playerNames,
                    players: room.players,
                    opponentLengths: getOpponentLengths(room, id),
                    theme: room.theme
                });
            });

            // 観戦者へ
            sendToSpectators(socket.roomId, room, "spectatorGameStart", {
                turnOrder: room.turnOrder,
                playerNames: room.playerNames,
                players: room.players,
                lengths: getLengths(room),
                theme: room.theme
            });
        }
    });

    // =====================
    // 攻撃
    // =====================
    socket.on("attack", (data) => {
        const room = rooms[socket.roomId];
        if (!room || !room.started) return;

        const attacker = socket.id;
        const currentTurn = room.turnOrder[room.currentTurnIndex];
        if (attacker !== currentTurn) return;

        const kana = data.kana;
        let hitAny = false;
        let hitSelf = false;
        let hitSelfIndexes = [];
        const hitResults = {}; // { playerId: [indexes] }

        // 全プレイヤーに対してヒット判定
        room.players.forEach(id => {
            if (room.eliminated.includes(id)) return;
            const answer = room.answers[id];
            const indexes = [];
            answer.forEach((k, i) => {
                if (k === kana) {
                    room.hits[id][i] = true;
                    indexes.push(i);
                }
            });
            if (indexes.length > 0) {
                hitResults[id] = indexes;
                if (id === attacker) {
                    hitSelf = true;
                    hitSelfIndexes = indexes;
                } else {
                    hitAny = true;
                }
            }
        });

        // 脱落判定
        const newlyEliminated = [];
        room.players.forEach(id => {
            if (room.eliminated.includes(id)) return;
            if (id === attacker) return; // 攻撃者は脱落しない
            const answer = room.answers[id];
            const allOpen = answer.every((k, i) => k === "×" || room.hits[id][i]);
            if (allOpen) {
                room.eliminated.push(id);
                newlyEliminated.push(id);
            }
        });

        const turnChanged = hitSelf || !hitAny;

        // 次のターンを計算
        if (turnChanged) {
            advanceTurn(room);
        }

        const nextTurn = room.turnOrder[room.currentTurnIndex];

        // 攻撃者に結果送信
        socket.emit("attackResult", {
            kana,
            hitAny,
            hitSelf,
            hitSelfIndexes,
            hitResults,
            turnChanged,
            nextTurn,
            newlyEliminated,
            eliminatedNames: newlyEliminated.map(id => room.playerNames[id])
        });

        // 他プレイヤーに送信
        room.players.forEach(id => {
            if (id === attacker) return;
            io.to(id).emit("attacked", {
                kana,
                attacker,
                hitAny,
                hitSelf,
                hitSelfIndexes,
                hitResults,
                turnChanged,
                nextTurn,
                newlyEliminated,
                eliminatedNames: newlyEliminated.map(id => room.playerNames[id])
            });
        });

        // 観戦者へ
        sendToSpectators(socket.roomId, room, "spectatorAttack", {
            kana,
            attacker,
            players: room.players,
            hitAny,
            hitSelf,
            hitResults,
            turnChanged,
            nextTurn,
            newlyEliminated,
            playerNames: room.playerNames
        });

        // 勝者判定（残り1人）
        const alive = room.players.filter(id => !room.eliminated.includes(id));
        if (alive.length === 1) {
            const winner = alive[0];
            room.started = false;
            io.to(socket.roomId).emit("gameEnd", {
                winner,
                winnerName: room.playerNames[winner]
            });
        }
    });

    // =====================
    // 再戦
    // =====================
    socket.on("rematch", () => {
        const room = rooms[socket.roomId];
        if (!room) return;
        room.rematchVotes = room.rematchVotes || [];
        if (room.rematchVotes.includes(socket.id)) return;
        room.rematchVotes.push(socket.id);
        io.to(socket.roomId).emit("rematchVoteUpdate", {
            votes: room.rematchVotes.length,
            total: room.players.length
        });
    if (room.rematchVotes.length === room.players.length) {
        room.answers = {};
        room.hits = {};
        room.started = false;
        room.rematchVotes = [];
        room.themeSelected = false;
        room.theme = null;
        room.eliminated = [];
        room.turnOrder = [...room.players].sort(() => Math.random() - 0.5);  // 再シャッフル
        room.currentTurnIndex = 0;
        io.to(socket.roomId).emit("rematchReady");
        io.to(socket.roomId).emit("ready", {
            turnOrder: room.turnOrder,
            playerNames: room.playerNames
    });
}
    });

    // =====================
    // 切断
    // =====================
    socket.on("disconnect", () => {
        const roomId = socket.roomId;
        const room = rooms[roomId];
        if (!room) return;
        room.players = room.players.filter(id => id !== socket.id);
        delete room.answers[socket.id];
        delete room.hits[socket.id];
        room.turnOrder = room.turnOrder.filter(id => id !== socket.id);
        io.to(roomId).emit("playerLeft", { playerNames: room.playerNames });
        if (room.players.length === 0) delete rooms[roomId];
    });
});

// =====================
// ヘルパー関数
// =====================
function advanceTurn(room) {
    const alive = room.players.filter(id => !room.eliminated.includes(id));
    if (alive.length === 0) return;
    let next = (room.currentTurnIndex + 1) % room.turnOrder.length;
    while (room.eliminated.includes(room.turnOrder[next])) {
        next = (next + 1) % room.turnOrder.length;
    }
    room.currentTurnIndex = next;
}

function getOpponentLengths(room, myId) {
    const result = {};
    room.players.forEach(id => {
        if (id !== myId) result[id] = room.answers[id].length;
    });
    return result;
}

function getLengths(room) {
    const result = {};
    room.players.forEach(id => {
        result[id] = room.answers[id] ? room.answers[id].length : 7;
    });
    return result;
}

function sendToSpectators(roomId, room, event, data) {
    const sockets = io.sockets.adapter.rooms.get(roomId);
    if (!sockets) return;
    [...sockets].filter(id => !room.players.includes(id)).forEach(id => {
        io.to(id).emit(event, data);
    });
}

server.listen(3000, () => {
    console.log("server running on port 3000");
});