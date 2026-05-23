const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// publicフォルダ公開
app.use(express.static("public"));

// =====================
// ルーム管理
// =====================
const rooms = {};

/*
rooms構造

rooms[roomId] = {
    players: [socketId1, socketId2],
    answers: {
        socketId: ["あ","い","う"...]
    },
    hits: {
        socketId: [true,false,...]
    },
    started: false
}
*/

// =====================
// 接続
// =====================
io.on("connection", (socket) => {

    console.log("connected:", socket.id);

    // =====================
    // ルーム作成
    // =====================
    socket.on("createRoom", (roomId) => {

        if (!roomId) return;

        // 同名部屋が無ければ作成
        if (!rooms[roomId]) {

            rooms[roomId] = {
                players: [],
                answers: {},
                hits: {},
                started: false
            };
        }

        socket.join(roomId);

        socket.roomId = roomId;

        rooms[roomId].players.push(socket.id);

        socket.emit("roomCreated", roomId);

        console.log("room created:", roomId);
    });

    // =====================
    // ルーム参加
    // =====================
    socket.on("joinRoom", (roomId) => {

        const room = rooms[roomId];

        if (!room) {
            socket.emit("errorMessage", "部屋が存在しません");
            return;
        }

        if (room.players.length >= 2) {
            socket.emit("errorMessage", "部屋が満員です");
            return;
        }

        socket.join(roomId);

        socket.roomId = roomId;

        room.players.push(socket.id);

        socket.emit("joinedRoom", roomId);

        io.to(roomId).emit("playerJoined");

        console.log("joined:", roomId);

        // 2人揃った
        if (room.players.length === 2) {
            io.to(roomId).emit("ready");
        }
    });

    // =====================
    // 単語登録
    // =====================
    socket.on("setAnswer", (answerArray) => {

        const room = rooms[socket.roomId];

        if (!room) return;

        if (!Array.isArray(answerArray)) {
            console.log("answer invalid");
            return;
        }

        if (answerArray.length !== 7) {
            console.log("answer length invalid");
            return;
        }

        room.answers[socket.id] = answerArray;

        room.hits[socket.id] = Array(7).fill(false);

        socket.emit("answerSaved");

        console.log("answer saved:", socket.id, answerArray);

        // 両者入力完了
        const p1 = room.players[0];
        const p2 = room.players[1];

        if (
            room.players.length === 2 &&
            room.answers[p1] &&
            room.answers[p2]
        ) {

            room.started = true;

// 変更後
const firstTurn = room.players[Math.floor(Math.random() * 2)];
const player1 = room.players[0];
const player2 = room.players[1];
io.to(player1).emit("gameStart", { firstTurn, opponentLength: room.answers[player2].length });
io.to(player2).emit("gameStart", { firstTurn, opponentLength: room.answers[player1].length });
        }
    });

    // =====================
    // 攻撃
    // =====================
socket.on("attack", (data) => {

    console.log("attack:", data);

    const room = rooms[socket.roomId];

    if (!room) { console.log("room not found"); return; }
    if (!room.started) { console.log("game not started"); return; }

    const attacker = socket.id;
    const defender = room.players.find(id => id !== attacker);

    if (!defender) { console.log("defender not found"); return; }

    const defenderAnswer = room.answers[defender];
    const attackerAnswer = room.answers[attacker];

    if (!Array.isArray(defenderAnswer)) { console.log("defender answer invalid"); return; }

    if (!room.hits[defender]) room.hits[defender] = Array(7).fill(false);
    if (!room.hits[attacker]) room.hits[attacker] = Array(7).fill(false);

    // 相手へのヒット判定
    let hitDefender = false;
    let hitDefenderIndexes = [];
    defenderAnswer.forEach((kana, index) => {
        if (kana === data.kana) {
            hitDefender = true;
            room.hits[defender][index] = true;
            hitDefenderIndexes.push(index);
        }
    });

    // 自爆判定
    let hitSelf = false;
    let hitSelfIndexes = [];
    attackerAnswer.forEach((kana, index) => {
        if (kana === data.kana) {
            hitSelf = true;
            room.hits[attacker][index] = true;
            hitSelfIndexes.push(index);
        }
    });

    // ターン交代判定（自爆したら必ず交代）
    const turnChanged = hitSelf || !hitDefender;

    // 攻撃者へ
    socket.emit("attackResult", {
        kana: data.kana,
        hit: hitDefender,
        hitIndexes: hitDefenderIndexes,
        hitSelf,
        hitSelfIndexes,
        turnChanged
    });

    // 被弾者へ
    io.to(defender).emit("attacked", {
        kana: data.kana,
        hit: hitDefender,
        hitIndexes: hitDefenderIndexes,
        hitSelf,
        hitSelfIndexes,
        turnChanged
    });

    console.log("attack result:", data.kana, "defender:", hitDefender, "self:", hitSelf);

    // 勝利判定（相手）
    const defenderAnswer2 = room.answers[defender];
    const winAttacker = room.hits[defender].every((opened, i) => {
        return defenderAnswer2[i] === "×" || opened === true;
    });

    // 勝利判定（自爆で自滅）
    const attackerAnswer2 = room.answers[attacker];
    const winDefender = room.hits[attacker].every((opened, i) => {
        return attackerAnswer2[i] === "×" || opened === true;
    });

    if (winAttacker || winDefender) {
        io.to(socket.roomId).emit("gameEnd", {
            winner: winAttacker ? attacker : defender
        });
        room.started = false;
        console.log("game end");
    }
});

// =====================
// 再戦
// =====================
socket.on("rematch", () => {

    const room = rooms[socket.roomId];

    if (!room) return;

    room.rematchVotes = room.rematchVotes || [];
    room.rematchVotes.push(socket.id);

    // 両者が再戦を希望
    if (room.rematchVotes.length === 2) {

        room.answers = {};
        room.hits = {};
        room.started = false;
        room.rematchVotes = [];

        io.to(socket.roomId).emit("rematchReady");
    } else {
        socket.emit("waitingRematch");
    }
});

    // =====================
    // 切断
    // =====================
    socket.on("disconnect", () => {

        console.log("disconnect:", socket.id);

        const roomId = socket.roomId;

        const room = rooms[roomId];

        if (!room) return;

        room.players = room.players.filter(
            id => id !== socket.id
        );

        delete room.answers[socket.id];
        delete room.hits[socket.id];

        io.to(roomId).emit("playerLeft");

        // 誰もいなくなったら削除
        if (room.players.length === 0) {
            delete rooms[roomId];
        }
    });
});

// =====================
// 起動
// =====================
server.listen(3000, () => {
    console.log("server running on port 3000");
});